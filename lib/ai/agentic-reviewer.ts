import type { MultiAgentConfiguration } from '@/lib/contracts/multi-agent-system';
import { AGENT_ENGINE_OPTIONS, DEFAULT_MULTI_AGENT_CONFIG } from '@/lib/contracts/multi-agent-system';
import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { modelIdForAgentEngine } from './webllm-agent-adapter';
import { buildAgentPrompt, evidencePacketFromCandidate, judgeAgentReviews, type AgentEvidencePacket, type AgenticReviewResult, type AgentPromptProfile } from './agentic-review-contracts';
import { createInferenceProvenance, type StructuredCandidateAdvisory } from './offline-ai-contracts';
import { aiRuntimeRouter } from './runtime-router';

function engineType(engineId: string): 'DETERMINISTIC' | 'NEURAL_WEBGPU' {
  return AGENT_ENGINE_OPTIONS.find(engine => engine.id === engineId)?.type || 'DETERMINISTIC';
}

function requiredEvidencePresent(candidate: StrategyCandidate): boolean {
  if (candidate.style === 'MEAN_REVERSION') return Boolean(candidate.ruleProvenance) && candidate.riskRewardRatio >= 2;
  if (candidate.style === 'TREND_BREAKOUT') return Boolean(candidate.evidenceIds.contextSwingId) && candidate.riskRewardRatio >= 2;
  if (candidate.style === 'SWING_MACRO') return Boolean(candidate.evidenceIds.contextSwingId) && candidate.riskRewardRatio >= 2;
  if (candidate.style === 'SCALP_M1_M5') return Boolean(candidate.evidenceIds.sweepId) && candidate.riskRewardRatio >= 1.5;
  return Boolean(candidate.evidenceIds.sweepId) && Boolean(candidate.evidenceIds.fvgId);
}

async function deterministicReview(modelId: string, packet: AgentEvidencePacket): Promise<StructuredCandidateAdvisory> {
  // SMC has a specialised deterministic advisory; the other executable rules
  // carry different evidence (for example a Donchian channel or a z-score) and
  // must not be falsely rejected merely because they do not contain an FVG.
  if (packet.candidate.style && packet.candidate.style !== 'SMC_INTRADAY') {
    const flags: string[] = [];
    const candidate = packet.candidate;
    if (!Number.isFinite(candidate.entryPrice) || candidate.entryPrice <= 0) flags.push('INVALID_MARKET_PRICE');
    if (candidate.riskRewardRatio < 2) flags.push('RISK_REWARD_INSUFFICIENT');
    if (!requiredEvidencePresent(candidate)) flags.push('STYLE_EVIDENCE_INCOMPLETE');
    if (packet.dataQuality.missingFields.length > 0 || !packet.dataQuality.noLookahead || !packet.dataQuality.isClosedCandle) flags.push('DATA_QUALITY_INCOMPLETE');
    const evidenceIds = Object.values(candidate.evidenceIds).filter((value): value is string => Boolean(value));
    if (candidate.ruleProvenance) evidenceIds.push(`RULE-${candidate.ruleProvenance.ruleVersion}`);
    return {
      modelId,
      modelRevision: 'deterministic-style-gate-v1',
      source: 'DETERMINISTIC',
      verdict: flags.length === 0 ? 'TRADE' : 'NO_TRADE',
      confidence: flags.length === 0 ? 0.7 : 0,
      rationaleFa: flags.length === 0 ? 'قواعد اختصاصی سبک، شواهد ثبت‌شده و محدودیت‌های بدون نگاه به آینده برقرارند؛ نتیجه صرفاً advisory است.' : `عدم تأیید سبک: ${flags.join('، ')}.`,
      riskFlags: flags,
      evidenceIds,
      latencyMs: 0,
      advisoryOnly: true,
      provenance: createInferenceProvenance({ provider: 'deterministic', runtime: 'CORE_DETERMINISTIC', requestedModelId: modelId, executedModelId: modelId }),
    };
  }
  const response = await aiRuntimeRouter.generate({ modelId: 's0-deterministic', evidence: {
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
  } });
  return {
    ...response.advisory,
    modelId,
    evidenceIds: Object.values(packet.candidate.evidenceIds).filter((value): value is string => Boolean(value)),
    provenance: { ...response.advisory.provenance, requestedModelId: modelId, executedModelId: 's0-deterministic' },
  };
}

export interface AgenticReviewOptions {
  sequentialCachedNeuralModels?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function reviewRole(role: 'SCANNER' | 'ANALYST' | 'CRITIC', engineId: string, candidate: StrategyCandidate, packet: AgentEvidencePacket, profile: AgentPromptProfile, options: AgenticReviewOptions): Promise<StructuredCandidateAdvisory> {
  const prompt = buildAgentPrompt(role, packet, profile);
  if (engineType(engineId) === 'DETERMINISTIC') return deterministicReview(engineId, packet);
  const mapped = modelIdForAgentEngine(engineId);
  if (!mapped) return {
    modelId: 'unmapped', modelRevision: 'none', source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0,
    rationaleFa: 'موتور AI نگاشت نشده است.', riskFlags: ['UNMAPPED_AGENT_MODEL'], evidenceIds: [], latencyMs: 0, advisoryOnly: true,
    provenance: createInferenceProvenance({ provider: 'webllm', runtime: 'WEBLLM_WEBGPU', requestedModelId: 'unmapped', fallbackReason: 'UNMAPPED_AGENT_MODEL' }),
  };
  if (options.sequentialCachedNeuralModels !== false) await aiRuntimeRouter.loadCachedModel(mapped);
  return (await aiRuntimeRouter.generate({ modelId: mapped, evidence: {
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
  }, systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, signal: options.signal, timeoutMs: options.timeoutMs })).advisory;
}

export async function reviewCandidateWithFourAgents(candidate: StrategyCandidate, config: MultiAgentConfiguration = DEFAULT_MULTI_AGENT_CONFIG, context: AgentEvidencePacket['marketContext'] = {}, promptProfile: AgentPromptProfile = 'BASELINE_EVIDENCE_V1', options: AgenticReviewOptions = {}): Promise<AgenticReviewResult> {
  const packet = evidencePacketFromCandidate(candidate, config.activeTradingStyle, context);
  const deterministicScannerApproved = requiredEvidencePresent(candidate);
  const scannerAdvisory = await reviewRole('SCANNER', config.scannerEngineId, candidate, packet, promptProfile, options);
  const scannerApproved = deterministicScannerApproved && scannerAdvisory.verdict === 'TRADE' && scannerAdvisory.riskFlags.length === 0;
  const analyst = await reviewRole('ANALYST', config.analystEngineId, candidate, packet, promptProfile, options);
  const critic = await reviewRole('CRITIC', config.criticEngineId, candidate, packet, promptProfile, options);
  const judge = judgeAgentReviews({ analyst, critic, candidate });
  if (!deterministicScannerApproved) judge.reasonCodes.push('SCANNER_EVIDENCE_INCOMPLETE');
  if (deterministicScannerApproved && !scannerApproved) judge.reasonCodes.push(scannerAdvisory.verdict === 'REVIEW_REQUIRED' ? 'SCANNER_REVIEW_REQUIRED' : 'SCANNER_NOT_APPROVED');
  const neuralRoles = [
    ['SCANNER', config.scannerEngineId, scannerAdvisory] as const,
    ['ANALYST', config.analystEngineId, analyst] as const,
    ['CRITIC', config.criticEngineId, critic] as const,
  ].filter(([, engineId]) => engineType(engineId) === 'NEURAL_WEBGPU');
  const finalDecision = !deterministicScannerApproved ? 'NO_TRADE' : scannerAdvisory.verdict === 'REVIEW_REQUIRED' || analyst.verdict === 'REVIEW_REQUIRED' || critic.verdict === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : scannerApproved && judge.approved ? 'PAPER_TRADE' : 'NO_TRADE';
  return {
    candidateId: candidate.id,
    config: { scannerEngineId: config.scannerEngineId, analystEngineId: config.analystEngineId, criticEngineId: config.criticEngineId, judgeEngineId: config.judgeEngineId },
    scanner: { approved: scannerApproved, reasons: scannerApproved ? ['STRUCTURAL_EVIDENCE_PRESENT'] : judge.reasonCodes.filter(code => code.startsWith('SCANNER_')), advisory: scannerAdvisory },
    analyst,
    critic,
    judge: { ...judge, approved: scannerApproved && judge.approved },
    executionSummary: {
      neuralRolesRequested: neuralRoles.length,
      neuralRolesExecuted: neuralRoles.filter(([, , advisory]) => advisory.provenance.inferenceExecuted).length,
      fallbackRoles: neuralRoles.filter(([, , advisory]) => advisory.provenance.fallbackUsed).map(([role]) => role),
    },
    finalDecision,
    advisoryOnly: true,
    promptVersion: promptProfile,
    reviewedAt: Date.now(),
  };
}
