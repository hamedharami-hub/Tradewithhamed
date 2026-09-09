import type { MultiAgentConfiguration } from '@/lib/contracts/multi-agent-system';
import { AGENT_ENGINE_OPTIONS, DEFAULT_MULTI_AGENT_CONFIG } from '@/lib/contracts/multi-agent-system';
import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { modelIdForAgentEngine } from './webllm-agent-adapter';
import { BrowserOfflineAIManager } from './browser-offline-ai';
import { buildAgentPrompt, evidencePacketFromCandidate, judgeAgentReviews, type AgentEvidencePacket, type AgenticReviewResult } from './agentic-review-contracts';
import type { StructuredCandidateAdvisory } from './offline-ai-contracts';

function engineType(engineId: string): 'DETERMINISTIC' | 'NEURAL_WEBGPU' {
  return AGENT_ENGINE_OPTIONS.find(engine => engine.id === engineId)?.type || 'DETERMINISTIC';
}

function deterministicReview(modelId: string, packet: AgentEvidencePacket): StructuredCandidateAdvisory {
  return BrowserOfflineAIManager.buildDeterministicAdvisory(modelId, {
    symbol: packet.candidate.symbol,
    currentPrice: packet.candidate.entryPrice,
    sweepDetected: Boolean(packet.candidate.evidenceIds.sweepId),
    fvgDetected: Boolean(packet.candidate.evidenceIds.fvgId),
    contextConfirmed: Boolean(packet.candidate.evidenceIds.contextSwingId || packet.candidate.evidenceIds.bosId),
    riskRewardRatio: packet.candidate.riskRewardRatio,
    direction: packet.candidate.direction,
    entryPrice: packet.candidate.entryPrice,
    stopLossPrice: packet.candidate.stopLossPrice,
    takeProfitPrice: packet.candidate.takeProfitPrice,
  });
}

async function reviewRole(role: 'ANALYST' | 'CRITIC', engineId: string, candidate: StrategyCandidate, packet: AgentEvidencePacket): Promise<StructuredCandidateAdvisory> {
  const prompt = buildAgentPrompt(role, packet);
  if (engineType(engineId) === 'DETERMINISTIC') return deterministicReview(engineId, packet);
  const mapped = modelIdForAgentEngine(engineId);
  if (!mapped) return { modelId: 'unmapped', modelRevision: 'none', source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0, rationaleFa: 'موتور AI نگاشت نشده است.', riskFlags: ['UNMAPPED_AGENT_MODEL'], evidenceIds: [], latencyMs: 0, advisoryOnly: true };
  if (BrowserOfflineAIManager.getResidentModelId() !== mapped) return { modelId: mapped, modelRevision: 'not-resident', source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0, rationaleFa: 'مدل آفلاین برای این نقش در حافظه GPU مقیم نیست.', riskFlags: ['MODEL_NOT_RESIDENT'], evidenceIds: [], latencyMs: 0, advisoryOnly: true };
  return BrowserOfflineAIManager.evaluateCandidateAdvisory(mapped, {
    symbol: candidate.symbol,
    currentPrice: candidate.entryPrice,
    sweepDetected: Boolean(candidate.evidenceIds.sweepId),
    fvgDetected: Boolean(candidate.evidenceIds.fvgId),
    contextConfirmed: Boolean(candidate.evidenceIds.contextSwingId || candidate.evidenceIds.bosId),
    riskRewardRatio: candidate.riskRewardRatio,
    direction: candidate.direction,
    entryPrice: candidate.entryPrice,
    stopLossPrice: candidate.stopLossPrice,
    takeProfitPrice: candidate.takeProfitPrice,
  }, prompt.systemPrompt, prompt.userPrompt);
}

export async function reviewCandidateWithFourAgents(candidate: StrategyCandidate, config: MultiAgentConfiguration = DEFAULT_MULTI_AGENT_CONFIG, context: AgentEvidencePacket['marketContext'] = {}): Promise<AgenticReviewResult> {
  const packet = evidencePacketFromCandidate(candidate, config.activeTradingStyle, context);
  const scannerApproved = Boolean(candidate.evidenceIds.sweepId) && (config.activeTradingStyle !== 'S0_SWEEP_FVG' || Boolean(candidate.evidenceIds.fvgId));
  const analyst = await reviewRole('ANALYST', config.analystEngineId, candidate, packet);
  const critic = await reviewRole('CRITIC', config.criticEngineId, candidate, packet);
  const judge = judgeAgentReviews({ analyst, critic, candidate });
  if (!scannerApproved) judge.reasonCodes.push('SCANNER_EVIDENCE_INCOMPLETE');
  const finalDecision = !scannerApproved ? 'NO_TRADE' : judge.approved ? 'PAPER_TRADE' : (analyst.verdict === 'REVIEW_REQUIRED' || critic.verdict === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'NO_TRADE');
  return {
    candidateId: candidate.id,
    config: { scannerEngineId: config.scannerEngineId, analystEngineId: config.analystEngineId, criticEngineId: config.criticEngineId, judgeEngineId: config.judgeEngineId },
    scanner: { approved: scannerApproved, reasons: scannerApproved ? ['STRUCTURAL_EVIDENCE_PRESENT'] : ['SCANNER_EVIDENCE_INCOMPLETE'] },
    analyst,
    critic,
    judge: { ...judge, approved: scannerApproved && judge.approved },
    finalDecision,
    advisoryOnly: true,
    promptVersion: 'agent-prompts-v1',
    reviewedAt: Date.now(),
  };
}
