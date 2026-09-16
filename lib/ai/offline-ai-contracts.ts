import type { CandidateDirection, StrategyCandidate } from '@/lib/contracts/strategy';

export type OfflineRuntimeState = 'IDLE' | 'LOADING' | 'GENERATING' | 'UNLOADING' | 'DELETING' | 'ERROR';

export type OfflineModelAvailabilityState =
  | 'ONLINE_REQUIRED_FOR_DOWNLOAD'
  | 'DOWNLOADING'
  | 'CACHED'
  | 'LOADABLE'
  | 'READY'
  | 'OFFLINE_VERIFIED'
  | 'ERROR';

export interface OfflineModelAvailability {
  state: OfflineModelAvailabilityState;
  modelId: string;
  modelRevision: string;
  cached: boolean;
  resident: boolean;
  offlineVerified: boolean;
  reason: string;
}

export function deriveOfflineModelAvailability(input: {
  modelId: string;
  modelRevision: string;
  isBuiltIn: boolean;
  supported: boolean;
  cached: boolean;
  resident: boolean;
  offlineVerified: boolean;
  operation: OfflineRuntimeState;
  hasError?: boolean;
}): OfflineModelAvailability {
  const base = { modelId: input.modelId, modelRevision: input.modelRevision, cached: input.cached, resident: input.resident, offlineVerified: input.offlineVerified };
  if (input.hasError) return { ...base, state: 'ERROR', reason: 'RUNTIME_ERROR' };
  if (input.cached && !input.supported) return { ...base, state: 'CACHED', reason: 'ARTIFACT_CACHED_RUNTIME_UNAVAILABLE' };
  if (!input.supported) return { ...base, state: 'ERROR', reason: 'RUNTIME_OR_MODEL_UNSUPPORTED' };
  if (input.operation === 'LOADING' && !input.cached) return { ...base, state: 'DOWNLOADING', reason: 'MODEL_DOWNLOAD_OR_PREPARATION_IN_PROGRESS' };
  if (input.offlineVerified) return { ...base, state: 'OFFLINE_VERIFIED', reason: 'REVISION_VERIFIED_WITH_BROWSER_OFFLINE' };
  if (input.resident || input.isBuiltIn) return { ...base, state: 'READY', reason: input.isBuiltIn ? 'BUILT_IN_READY' : 'MODEL_RESIDENT' };
  if (input.cached) return { ...base, state: 'LOADABLE', reason: 'ARTIFACT_CACHED_NOT_RESIDENT' };
  return { ...base, state: 'ONLINE_REQUIRED_FOR_DOWNLOAD', reason: 'INITIAL_MODEL_DOWNLOAD_REQUIRES_NETWORK' };
}

export interface DeterministicMarketEvidence {
  symbol: string;
  currentPrice: number;
  sweepDetected?: boolean;
  fvgDetected?: boolean;
  contextConfirmed?: boolean;
  riskRewardRatio?: number;
  spreadPips?: number;
  maxAllowedSpreadPips?: number;
  isHighImpactNewsUpcoming?: boolean;
  direction?: CandidateDirection;
  entryPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}

export type AdvisoryVerdict = 'TRADE' | 'NO_TRADE' | 'REVIEW_REQUIRED';

export type AIRuntimeId = 'WEBLLM_WEBGPU' | 'LITERT_LM_WEB' | 'CORE_DETERMINISTIC' | 'CHROME_BUILTIN' | 'ONLINE_API';
export type AIProviderId = 'webllm' | 'litert-web' | 'deterministic' | 'chrome-builtin' | 'online-api';

export interface AIInferenceProvenance {
  provider: AIProviderId;
  runtime: AIRuntimeId;
  requestedModelId: string;
  executedModelId: string | null;
  inferenceExecuted: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

export interface StructuredCandidateAdvisory {
  modelId: string;
  modelRevision: string;
  source: 'DETERMINISTIC' | 'WEBLLM_WEBGPU' | 'LITERT_LM_WEB' | 'ONLINE_API' | 'HYBRID_COMPARE';
  verdict: AdvisoryVerdict;
  confidence: number;
  rationaleFa: string;
  riskFlags: string[];
  evidenceIds: string[];
  latencyMs: number;
  advisoryOnly: true;
  provenance: AIInferenceProvenance;
}

export function createInferenceProvenance(input: Partial<AIInferenceProvenance> & Pick<AIInferenceProvenance, 'provider' | 'runtime' | 'requestedModelId'>): AIInferenceProvenance {
  return {
    provider: input.provider,
    runtime: input.runtime,
    requestedModelId: input.requestedModelId,
    executedModelId: input.executedModelId ?? null,
    inferenceExecuted: input.inferenceExecuted ?? false,
    fallbackUsed: input.fallbackUsed ?? false,
    fallbackReason: input.fallbackReason ?? null,
  };
}

export interface OfflineVerificationRecord {
  verifiedAt: number;
  modelRevision: string;
  browserOnlineAtVerification: false;
}

export interface AIModelRuntimeStatus {
  state: OfflineRuntimeState;
  residentModelId: string | null;
  selectedModelId: string;
  activeOperationId: number | null;
  lastError?: string;
}

export function evidenceFromCandidate(candidate: StrategyCandidate): DeterministicMarketEvidence {
  return {
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
  };
}
