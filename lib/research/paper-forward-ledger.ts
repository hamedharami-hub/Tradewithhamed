import { SYMBOL_SPECS, type Candle, type SymbolId, type Timeframe } from '@/lib/contracts/market';
import type { StrategyCandidate } from '@/lib/contracts/strategy';

export type PaperCloseReason = 'SL' | 'TP' | 'EXPIRED';

export interface PaperForwardLedgerConfig {
  symbol: SymbolId;
  timeframe: Timeframe;
  initialCash?: number;
  volumeLots?: number;
  commissionPerLotRoundTrip?: number;
  maxConcurrentPositions?: number;
}

export interface LocalPaperTrade {
  paperTradeId: string;
  candidateId: string;
  environment: 'PAPER_LIVE';
  brokerWrites: false;
  symbol: SymbolId;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  expiresAtTimestamp: number;
  openedTimestamp: number;
  closedTimestamp?: number;
  exitPrice?: number;
  closeReason?: PaperCloseReason;
  grossPnl?: number;
  realizedPnl?: number;
  commissionPaid: number;
  isOpen: boolean;
}

export interface PaperLedgerEvent {
  status: 'PAPER_TRADE_OPENED' | 'PAPER_TRADE_CLOSED' | 'PAPER_TRADE_EXPIRED' | 'PAPER_TRADE_SKIPPED';
  brokerWrites: false;
  paperTrade: LocalPaperTrade;
  reason?: string;
}

export interface PaperLedgerSummary {
  symbol: SymbolId;
  timeframe: Timeframe;
  brokerWrites: false;
  initialCash: number;
  endEquity: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  netPnl: number;
  totalCommission: number;
  maxDrawdownPercent: number;
  openPositions: number;
}

function pipSize(symbol: SymbolId): number {
  if (symbol === 'XAUUSD') return 0.1;
  if (symbol === 'USDJPY') return 0.01;
  if (symbol === 'BTCUSD') return 1;
  return 0.0001;
}

function spreadPips(symbol: SymbolId): number {
  return SYMBOL_SPECS[symbol].typicalSpreadPips;
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

/**
 * A local-only, closed-candle ledger. It has no gateway or execution imports.
 * Candidates are filled only on the next closed bar's open, preventing use of
 * the signal candle's future range. When SL and TP both occur in one bar, the
 * pessimistic stop-loss result is used.
 */
export class PaperForwardLedger {
  private readonly initialCash: number;
  private readonly volumeLots: number;
  private readonly commissionPerLotRoundTrip: number;
  private readonly maxConcurrentPositions: number;
  private readonly pending = new Map<string, StrategyCandidate>();
  private readonly positions: LocalPaperTrade[] = [];
  private equity: number;
  private peakEquity: number;
  private maxDrawdownPercent = 0;

  public constructor(private readonly config: PaperForwardLedgerConfig) {
    this.initialCash = config.initialCash ?? 10_000;
    this.volumeLots = config.volumeLots ?? 0.01;
    this.commissionPerLotRoundTrip = config.commissionPerLotRoundTrip ?? SYMBOL_SPECS[config.symbol].commissionPerLot;
    this.maxConcurrentPositions = config.maxConcurrentPositions ?? 1;
    this.equity = this.initialCash;
    this.peakEquity = this.initialCash;
  }

  public approve(candidate: StrategyCandidate): void {
    if (candidate.symbol !== this.config.symbol || candidate.timeframe !== this.config.timeframe) {
      throw new Error('PAPER_LEDGER_CANDIDATE_SCOPE_MISMATCH');
    }
    this.pending.set(candidate.id, candidate);
  }

  public processClosedCandle(candle: Candle): PaperLedgerEvent[] {
    if (!candle.isClosed || !Number.isFinite(candle.timestamp)) {
      throw new Error('PAPER_LEDGER_REQUIRES_CLOSED_CANDLE');
    }
    const events: PaperLedgerEvent[] = [];
    for (const position of this.positions.filter(item => item.isOpen)) {
      const close = this.resolveClose(position, candle);
      if (close) events.push(this.close(position, close.price, candle.timestamp, close.reason));
    }

    for (const candidate of [...this.pending.values()]) {
      if (candidate.createdAtTimestamp >= candle.timestamp) continue;
      this.pending.delete(candidate.id);
      if (candidate.expiresAtTimestamp < candle.timestamp) {
        events.push({
          status: 'PAPER_TRADE_EXPIRED',
          brokerWrites: false,
          paperTrade: this.skippedTrade(candidate, candle.timestamp),
          reason: 'CANDIDATE_EXPIRED_BEFORE_NEXT_CLOSED_BAR',
        });
        continue;
      }
      if (this.positions.filter(item => item.isOpen).length >= this.maxConcurrentPositions) {
        events.push({
          status: 'PAPER_TRADE_SKIPPED',
          brokerWrites: false,
          paperTrade: this.skippedTrade(candidate, candle.timestamp),
          reason: 'MAX_CONCURRENT_LOCAL_PAPER_POSITIONS',
        });
        continue;
      }
      const position = this.open(candidate, candle);
      this.positions.push(position);
      events.push({ status: 'PAPER_TRADE_OPENED', brokerWrites: false, paperTrade: { ...position } });
      const sameBarClose = this.resolveClose(position, candle);
      if (sameBarClose) events.push(this.close(position, sameBarClose.price, candle.timestamp, sameBarClose.reason));
    }
    return events;
  }

  public getTrades(): LocalPaperTrade[] {
    return this.positions.map(item => ({ ...item }));
  }

  public getSummary(): PaperLedgerSummary {
    const closed = this.positions.filter(item => !item.isOpen && item.realizedPnl !== undefined);
    const winningTrades = closed.filter(item => (item.realizedPnl || 0) > 0).length;
    const losingTrades = closed.filter(item => (item.realizedPnl || 0) <= 0).length;
    return {
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      brokerWrites: false,
      initialCash: this.initialCash,
      endEquity: round(this.equity),
      totalTrades: closed.length,
      winningTrades,
      losingTrades,
      winRatePercent: closed.length ? round((winningTrades / closed.length) * 100, 1) : 0,
      netPnl: round(closed.reduce((sum, item) => sum + (item.realizedPnl || 0), 0)),
      totalCommission: round(closed.reduce((sum, item) => sum + item.commissionPaid, 0)),
      maxDrawdownPercent: round(this.maxDrawdownPercent, 2),
      openPositions: this.positions.filter(item => item.isOpen).length,
    };
  }

  private open(candidate: StrategyCandidate, candle: Candle): LocalPaperTrade {
    const spread = spreadPips(this.config.symbol) * pipSize(this.config.symbol);
    const entryPrice = candidate.direction === 'BUY' ? candle.open + spread / 2 : candle.open - spread / 2;
    return {
      paperTradeId: `PAPER-${candidate.id}`,
      candidateId: candidate.id,
      environment: 'PAPER_LIVE',
      brokerWrites: false,
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      direction: candidate.direction,
      volumeLots: this.volumeLots,
      entryPrice,
      stopLossPrice: candidate.stopLossPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      expiresAtTimestamp: candidate.expiresAtTimestamp,
      openedTimestamp: candle.timestamp,
      commissionPaid: 0,
      isOpen: true,
    };
  }

  private skippedTrade(candidate: StrategyCandidate, timestamp: number): LocalPaperTrade {
    return {
      paperTradeId: `PAPER-${candidate.id}`,
      candidateId: candidate.id,
      environment: 'PAPER_LIVE',
      brokerWrites: false,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      direction: candidate.direction,
      volumeLots: this.volumeLots,
      entryPrice: candidate.entryPrice,
      stopLossPrice: candidate.stopLossPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      expiresAtTimestamp: candidate.expiresAtTimestamp,
      openedTimestamp: timestamp,
      closedTimestamp: timestamp,
      exitPrice: candidate.entryPrice,
      closeReason: 'EXPIRED',
      grossPnl: 0,
      realizedPnl: 0,
      commissionPaid: 0,
      isOpen: false,
    };
  }

  private resolveClose(position: LocalPaperTrade, candle: Candle): { price: number; reason: PaperCloseReason } | null {
    const stopHit = position.direction === 'BUY' ? candle.low <= position.stopLossPrice : candle.high >= position.stopLossPrice;
    const targetHit = position.direction === 'BUY' ? candle.high >= position.takeProfitPrice : candle.low <= position.takeProfitPrice;
    if (stopHit) return { price: position.stopLossPrice, reason: 'SL' };
    if (targetHit) return { price: position.takeProfitPrice, reason: 'TP' };
    if (candle.timestamp >= position.expiresAtTimestamp) return { price: candle.close, reason: 'EXPIRED' };
    return null;
  }

  private close(position: LocalPaperTrade, exitPrice: number, timestamp: number, reason: PaperCloseReason): PaperLedgerEvent {
    const direction = position.direction === 'BUY' ? 1 : -1;
    const contractSize = SYMBOL_SPECS[position.symbol].contractSize;
    const grossPnl = (exitPrice - position.entryPrice) * direction * contractSize * position.volumeLots;
    const commission = this.commissionPerLotRoundTrip * position.volumeLots;
    position.exitPrice = exitPrice;
    position.closedTimestamp = timestamp;
    position.closeReason = reason;
    position.grossPnl = round(grossPnl);
    position.commissionPaid = round(commission);
    position.realizedPnl = round(grossPnl - commission);
    position.isOpen = false;
    this.equity += position.realizedPnl;
    this.peakEquity = Math.max(this.peakEquity, this.equity);
    const drawdown = this.peakEquity === 0 ? 0 : ((this.peakEquity - this.equity) / this.peakEquity) * 100;
    this.maxDrawdownPercent = Math.max(this.maxDrawdownPercent, drawdown);
    return {
      status: 'PAPER_TRADE_CLOSED',
      brokerWrites: false,
      paperTrade: { ...position },
    };
  }
}
