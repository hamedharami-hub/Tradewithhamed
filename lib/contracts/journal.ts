import { SymbolId } from './market';
import { CandidateDirection } from './strategy';

export type TradeDirection = CandidateDirection;

export type PositionStatus = 'PENDING_ENTRY' | 'OPEN' | 'CLOSED_PROFIT' | 'CLOSED_LOSS' | 'CLOSED_MANUAL';

export type ExitReason = 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'EXPIRED' | 'RECONCILED_CLOSED';

export interface TradePosition {
  positionId: string;
  intentId: string;
  correlationId: string;
  causationId: string;
  brokerOrderId?: string;
  symbol: SymbolId;
  direction: TradeDirection;
  volumeLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  status: PositionStatus;
  openedAt: number;
  closedAt?: number;
  exitPrice?: number;
  exitReason?: ExitReason;
  realizedGrossPnL?: number;
  brokerCommission: number;
  realizedNetPnL?: number;
  realizedRMultiple?: number;
  plannedRiskAmount: number;
}

export interface JournalAuditEvent {
  eventId: string;
  timestamp: number;
  eventType:
    | 'INTENT_CREATED'
    | 'USER_EXPLICIT_CONFIRMED'
    | 'SUBMITTING_OUTBOX_REGISTERED'
    | 'BROKER_ACKNOWLEDGED'
    | 'ORDER_FILLED'
    | 'POSITION_SL_TRIGGERED'
    | 'POSITION_TP_TRIGGERED'
    | 'POSITION_MANUAL_CLOSED'
    | 'UNKNOWN_RECONCILE_ENTERED'
    | 'RECONCILIATION_COMPLETED';
  intentId: string;
  correlationId: string;
  causationId: string;
  details: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  metadata?: Record<string, unknown>;
}

export interface StrategyPerformanceStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRatePercent: number;
  profitFactor: number;
  totalNetProfit: number;
  totalGrossProfit: number;
  totalLoss: number;
  totalCommissions: number;
  averageWinAmount: number;
  averageLossAmount: number;
  averageRMultiple: number;
  expectancyDollar: number;
  expectancyR: number;
  maxDrawdownDollar: number;
  maxDrawdownPercent: number;
  bySymbol: Record<
    SymbolId,
    {
      tradesCount: number;
      winRatePercent: number;
      netProfit: number;
      profitFactor: number;
    }
  >;
}
