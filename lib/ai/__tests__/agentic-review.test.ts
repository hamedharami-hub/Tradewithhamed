import { DEFAULT_MULTI_AGENT_CONFIG, AGENT_ROLES_INFO } from '@/lib/contracts/multi-agent-system';
import { buildAgentPrompt, evidencePacketFromCandidate, judgeAgentReviews } from '../agentic-review-contracts';
import { reviewCandidateWithFourAgents } from '../agentic-reviewer';
import type { StrategyCandidate } from '@/lib/contracts/strategy';

export interface AgenticReviewTestResult { name: string; passed: boolean; details: string }

const candidate: StrategyCandidate = {
  id: 'AGENTIC-TEST-1', strategyName: 'S0_SWEEP_FVG', symbol: 'EURUSD', timeframe: '5M', direction: 'BUY',
  createdAtTimestamp: 1_800_000_000_000, expiresAtTimestamp: 1_800_003_600_000,
  entryPrice: 1.1, stopLossPrice: 1.098, takeProfitPrice: 1.104, riskRewardRatio: 2,
  style: 'SMC_INTRADAY', evidenceIds: { sweepId: 'SWEEP-1', fvgId: 'FVG-1', contextSwingId: 'SWING-1' },
  rationale: 'test candidate', status: 'PENDING_CONFIRMATION',
};

export async function runAgenticReviewTests(): Promise<AgenticReviewTestResult[]> {
  const results: AgenticReviewTestResult[] = [];
  results.push({ name: 'Four roles include the executive Judge', passed: AGENT_ROLES_INFO.JUDGE.role === 'JUDGE' && DEFAULT_MULTI_AGENT_CONFIG.judgeEngineId.length > 0, details: AGENT_ROLES_INFO.JUDGE.nameFa });
  const packet = evidencePacketFromCandidate(candidate, 'S0_SWEEP_FVG');
  const prompts = (['SCANNER', 'ANALYST', 'CRITIC', 'JUDGE'] as const).map(role => buildAgentPrompt(role, packet));
  results.push({ name: 'Role prompts are distinct and versioned', passed: prompts.every(prompt => prompt.promptVersion === 'agent-prompts-v1') && new Set(prompts.map(prompt => prompt.systemPrompt)).size === 4, details: prompts.map(prompt => prompt.role).join(',') });
  const judged = judgeAgentReviews({ analyst: { modelId: 'a', modelRevision: '1', source: 'DETERMINISTIC', verdict: 'TRADE', confidence: 0.8, rationaleFa: 'ok', riskFlags: [], evidenceIds: [], latencyMs: 0, advisoryOnly: true }, critic: { modelId: 'c', modelRevision: '1', source: 'DETERMINISTIC', verdict: 'NO_TRADE', confidence: 0.9, rationaleFa: 'bad', riskFlags: ['CONTRADICTION'], evidenceIds: [], latencyMs: 0, advisoryOnly: true }, candidate });
  results.push({ name: 'Judge vetoes critic disagreement', passed: !judged.approved && judged.reasonCodes.includes('CRITIC_REJECTED'), details: judged.summaryFa });
  const review = await reviewCandidateWithFourAgents(candidate);
  results.push({ name: 'Agentic pipeline approves valid advisory-only candidate', passed: review.advisoryOnly && review.finalDecision === 'PAPER_TRADE' && review.judge.approved, details: `${review.finalDecision}; judge=${review.judge.approved}` });
  return results;
}
