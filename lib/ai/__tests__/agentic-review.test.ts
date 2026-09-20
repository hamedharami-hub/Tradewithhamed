import { DEFAULT_MULTI_AGENT_CONFIG, AGENT_ROLES_INFO } from '@/lib/contracts/multi-agent-system';
import { buildAgentPrompt, evidencePacketFromCandidate, judgeAgentReviews } from '../agentic-review-contracts';
import { reviewCandidateWithFourAgents } from '../agentic-reviewer';
import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { createInferenceProvenance } from '../offline-ai-contracts';

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
  const judged = judgeAgentReviews({
    analyst: { modelId: 'a', modelRevision: '1', source: 'DETERMINISTIC', verdict: 'TRADE', confidence: 0.8, rationaleFa: 'ok', riskFlags: [], evidenceIds: [], latencyMs: 0, advisoryOnly: true, provenance: createInferenceProvenance({ provider: 'deterministic', runtime: 'CORE_DETERMINISTIC', requestedModelId: 'a', executedModelId: 'a' }) },
    critic: { modelId: 'c', modelRevision: '1', source: 'DETERMINISTIC', verdict: 'NO_TRADE', confidence: 0.9, rationaleFa: 'bad', riskFlags: ['CONTRADICTION'], evidenceIds: [], latencyMs: 0, advisoryOnly: true, provenance: createInferenceProvenance({ provider: 'deterministic', runtime: 'CORE_DETERMINISTIC', requestedModelId: 'c', executedModelId: 'c' }) },
    candidate,
  });
  results.push({ name: 'Judge vetoes critic disagreement', passed: !judged.approved && judged.reasonCodes.includes('CRITIC_REJECTED'), details: judged.summaryFa });
  const review = await reviewCandidateWithFourAgents(candidate);
  results.push({ name: 'Agentic pipeline approves valid advisory-only candidate', passed: review.advisoryOnly && review.finalDecision === 'PAPER_TRADE' && review.judge.approved, details: `${review.finalDecision}; judge=${review.judge.approved}` });
  results.push({
    name: 'Every council role reports truthful execution provenance',
    passed: review.scanner.advisory.provenance.provider === 'deterministic'
      && !review.scanner.advisory.provenance.inferenceExecuted
      && review.analyst.provenance.provider === 'deterministic'
      && review.critic.provenance.provider === 'deterministic'
      && review.judge.provenance.provider === 'deterministic'
      && review.executionSummary.neuralRolesRequested === 0,
    details: JSON.stringify(review.executionSummary),
  });
  const unavailableNeuralReview = await reviewCandidateWithFourAgents(candidate, {
    ...DEFAULT_MULTI_AGENT_CONFIG,
    scannerEngineId: 'smollm2-360m-scanner',
    analystEngineId: 'phi-4-mini-analyst',
  });
  results.push({
    name: 'Requested neural roles remain review-required when inference did not execute',
    passed: unavailableNeuralReview.executionSummary.neuralRolesRequested === 2
      && unavailableNeuralReview.executionSummary.neuralRolesExecuted === 0
      && unavailableNeuralReview.finalDecision === 'REVIEW_REQUIRED'
      && !unavailableNeuralReview.scanner.advisory.provenance.inferenceExecuted
      && !unavailableNeuralReview.analyst.provenance.inferenceExecuted,
    details: JSON.stringify(unavailableNeuralReview.executionSummary),
  });
  const unknownEvidenceJudge = judgeAgentReviews({
    analyst: { modelId: 'a', modelRevision: '1', source: 'WEBLLM_WEBGPU', verdict: 'TRADE', confidence: 0.9, rationaleFa: 'ok', riskFlags: [], evidenceIds: ['HALLUCINATED-ID'], latencyMs: 1, advisoryOnly: true, provenance: createInferenceProvenance({ provider: 'webllm', runtime: 'WEBLLM_WEBGPU', requestedModelId: 'a', executedModelId: 'a', inferenceExecuted: true }) },
    critic: { modelId: 'c', modelRevision: '1', source: 'DETERMINISTIC', verdict: 'TRADE', confidence: 0.9, rationaleFa: 'ok', riskFlags: [], evidenceIds: ['SWEEP-1'], latencyMs: 0, advisoryOnly: true, provenance: createInferenceProvenance({ provider: 'deterministic', runtime: 'CORE_DETERMINISTIC', requestedModelId: 'c', executedModelId: 'c' }) },
    candidate,
  });
  results.push({ name: 'Judge rejects model-invented evidence IDs', passed: !unknownEvidenceJudge.approved && unknownEvidenceJudge.reasonCodes.includes('UNKNOWN_EVIDENCE_ID'), details: unknownEvidenceJudge.summaryFa });
  const breakoutReview = await reviewCandidateWithFourAgents({
    ...candidate,
    id: 'AGENTIC-TREND-1',
    strategyName: 'TREND_BREAKOUT_55_EMA200_V1',
    style: 'TREND_BREAKOUT',
    evidenceIds: { contextSwingId: 'DONCHIAN55-HIGH-1' },
    ruleProvenance: { ruleVersion: 'research-rules-v1', parameterHash: 'fnv1a-test', resolvedParameters: {}, signalCandleTimestamp: candidate.createdAtTimestamp, evidenceAvailableAtTimestamp: candidate.createdAtTimestamp, lifecycle: 'CONFIRMED' },
  });
  results.push({ name: 'Four-agent gate evaluates breakout evidence without requiring an FVG', passed: breakoutReview.finalDecision === 'PAPER_TRADE' && breakoutReview.scanner.approved, details: `${breakoutReview.finalDecision}; scanner=${breakoutReview.scanner.approved}` });
  return results;
}
