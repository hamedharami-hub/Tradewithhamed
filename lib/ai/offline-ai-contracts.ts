import type { CandidateDirection, StrategyCandidate } from '@/lib/contracts/strategy';

export type OfflineRuntimeState = 'IDLE' | 'LOADING' | 'GENERATING' | 'UNLOADING' | 'DELETING' | 'ERROR';

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

export interface StructuredCandidateAdvisory {
  modelId: string;
  modelRevision: string;
  source: 'DETERMINISTIC' | 'WEBLLM_WEBGPU' | 'ONLINE_API' | 'HYBRID_COMPARE';
  verdict: AdvisoryVerdict;
  confidence: number;
  rationaleFa: string;
  riskFlags: string[];
  evidenceIds: string[];
  latencyMs: number;
  advisoryOnly: true;
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
