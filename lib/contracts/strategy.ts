import { SymbolId, Timeframe } from './market';
import { TradingStyleType, MarketRegimeType } from './regimes';

export type CandidateDirection = 'BUY' | 'SELL';

export type CandidateStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'EXPIRED'
  | 'CANCELLED_PRE_FLIGHT'
  | 'INVALIDATED';

export interface RuleProvenance {
  ruleVersion: string;
  parameterHash: string;
  resolvedParameters: Record<string, number>;
  signalCandleTimestamp: number;
  evidenceAvailableAtTimestamp: number;
  lifecycle: 'FORMED' | 'CONFIRMED' | 'FIRST_TOUCH' | 'MITIGATED' | 'INVALIDATED' | 'EXPIRED';
}

export interface StrategyCandidate {
  id: string;
  strategyName: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  direction: CandidateDirection;
  createdAtTimestamp: number;
  expiresAtTimestamp: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
  style?: TradingStyleType;
  regimeAtCreation?: MarketRegimeType;
  regimeScore?: number;
  ruleProvenance?: RuleProvenance;
  evidenceIds: {
    sweepId?: string;
    fvgId?: string;
    contextSwingId?: string;
    bosId?: string;
  };
  rationale: string;
  status: CandidateStatus;
}
