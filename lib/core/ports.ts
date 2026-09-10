// lib/core/ports.ts
// قراردادها و پورت‌های هسته محاسباتی مشترک رویدادمحور بر اساس سند نسخه ۴.۰ (بخش ۲۰ و ۲۱)

import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { RiskPreviewResult } from '../contracts/risk';

export type TradingEnvironment =
  | 'BACKTEST'
  | 'PAPER_REPLAY'
  | 'PAPER_LIVE'
  | 'BROKER_DEMO'
  | 'BROKER_LIVE';

export type IntrabarAmbiguityPolicy = 'PESSIMISTIC' | 'OPTIMISTIC' | 'SENSITIVITY' | 'BAR_POLARITY';

export interface OrderIntentPayload {
  intentId: string;
  environment: TradingEnvironment;
  accountNamespace: string;
  candidateId: string;
  symbol: SymbolId;
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  maxSlippagePips?: number;
  expiryTimestamp?: number;
  reasonCode: string;
  createdTimestamp: number;
  idempotencyKey: string;
}

export interface ExecutionEventPayload {
  eventId: string;
  intentId: string;
  environment: TradingEnvironment;
  timestamp: number;
  status: 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED' | 'EXPIRED';
  fillPrice?: number;
  filledVolume?: number;
  slippagePips?: number;
  commissionPaid: number;
  ambiguityFlag?: boolean;
  notes?: string;
}

export interface PositionLedgerEntry {
  positionId: string;
  intentId: string;
  environment: TradingEnvironment;
  symbol: SymbolId;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  initialVolumeLots?: number;
  isPartialClosed?: boolean;
  partialRealizedPnl?: number;
  entryPrice: number;
  currentPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  commissionPaid: number;
  financingSwap: number;
  isOpen: boolean;
  openedTimestamp: number;
  closedTimestamp?: number;
  closeReason?: 'SL' | 'TP' | 'MANUAL' | 'EXPIRED' | 'MARGIN_CALL';
  maePips: number; // Maximum Adverse Excursion
  mfePips: number; // Maximum Favorable Excursion
}

export interface PortfolioLedgerState {
  environment: TradingEnvironment;
  accountNamespace: string;
  initialCash: number;
  cashBalance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPercent: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalCommissions: number;
  totalSwap: number;
  positions: PositionLedgerEntry[];
  peakEquity: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
}

// ۱. پورت ساعت رویدادمحور (Clock Port)
export interface IClockPort {
  now(): number;
  setTime(timestamp: number): void;
  advanceTo(timestamp: number): void;
}

// ۲. پورت داده‌های بازار (Market Data Port)
export interface IMarketDataPort {
  getLatestQuote(symbol: SymbolId): { bid: number; ask: number; timestamp: number } | null;
  getCandleHistory(symbol: SymbolId, limit?: number): Candle[];
  feedCandle(candle: Candle, symbol: SymbolId): void;
}

// ۳. پورت مدیریت ریسک (Risk Port)
export interface IRiskPort {
  validateOrder(
    intent: OrderIntentPayload,
    ledger: PortfolioLedgerState
  ): { isValid: boolean; reasonCodes: string[]; profile?: RiskPreviewResult };
}

// ۴. پورت ممیزی هوش مصنوعی (Review Port)
export interface IReviewPort {
  evaluateCandidate(candidate: StrategyCandidate): Promise<{
    decision: 'APPROVE' | 'REJECT' | 'ABSTAIN';
    confidence: number;
    uncertainties: string[];
    evidenceIds: string[];
  }>;
}

// ۵. پورت اجرای شبیه‌ساز سفارش (Execution Port)
export interface IExecutionPort {
  submitOrder(intent: OrderIntentPayload): ExecutionEventPayload;
  cancelOrder(intentId: string): boolean;
  processMarketTick(quote: { symbol: SymbolId; bid: number; ask: number; timestamp: number }): ExecutionEventPayload[];
  processCandle(candle: Candle, symbol: SymbolId): ExecutionEventPayload[];
}

// ۶. پورت ذخیره تغییرناپذیر رویدادها (EventStore Port)
export interface IEventStorePort {
  recordEvent(event: ExecutionEventPayload): void;
  getEventsByIntent(intentId: string): ExecutionEventPayload[];
  getAllEvents(): ExecutionEventPayload[];
  clear(environment?: TradingEnvironment): void;
}
