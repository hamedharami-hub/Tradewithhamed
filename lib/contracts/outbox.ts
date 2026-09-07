import { SymbolId } from './market';
import { CandidateDirection } from './strategy';

export type OrderIntentStatus =
  | 'NOT_SUBMITTED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'REJECTED_PRE_FLIGHT'
  | 'EXPIRED_BEFORE_SUBMISSION';

export interface LocalOrderIntent {
  intentId: string;
  candidateId: string;
  symbol: SymbolId;
  direction: CandidateDirection;
  volumeLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  plannedRiskAmount: number;
  plannedRiskPercent: number;
  netRiskRewardRatio: number;
  status: OrderIntentStatus;
  createdAt: number;
  userConfirmedAt: number;
  accountType: 'DEMO';
  isDemoConfirmed: true;
  evidenceChain: {
    sweepId?: string;
    fvgId?: string;
    bosId?: string;
    analystDecision?: 'TRADE' | 'NO_TRADE';
    criticValidation?: 'VALID' | 'INVALID';
  };
  invalidationConditions: string[];
  brokerOrderId?: string | null;
  auditHash: string;
}

export interface ShadowAnalysisCheckResult {
  canCreateIntent: boolean;
  reasonCode?:
    | 'INSUFFICIENT_WARMUP'
    | 'STALE_MARKET_DATA'
    | 'CANDIDATE_EXPIRED'
    | 'PRICE_CHASE_VIOLATION'
    | 'AI_CRITIC_REJECTED'
    | 'AI_TIMEOUT_FAIL_SAFE'
    | 'RISK_GATE_FAILED'
    | 'MISSING_SYMBOL_METADATA';
  explanation: string;
}
