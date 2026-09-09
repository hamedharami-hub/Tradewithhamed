import { SYMBOL_SPECS, SymbolId, Candle } from '@/lib/contracts/market';

export interface PaperTradeAdvisorMetadata {
  provider: string;
  modelId?: string;
  confidence: number;
  latencyMs: number;
  decision?: string;
  rationale?: string;
}

export interface PaperTrade {
  id: string;
  symbol: SymbolId;
  direction: 'BUY' | 'SELL';
  volumeLots: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryTime: number;
  barsHeld: number;
  maxHoldingBars: number;
  status: 'OPEN' | 'CLOSED';
  closePrice?: number;
  closeTime?: number;
  closeReason?: 'TP' | 'SL' | 'EXPIRED' | 'MANUAL';
  pnl?: number;
  pnlPips?: number;
  commission: number;
  advisorMetadata?: PaperTradeAdvisorMetadata;
  readonly brokerWrites: false;
}

export interface PaperLedgerMetrics {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  netPnl: number;
  maxDrawdownUsd: number;
  maxDrawdownPercent: number;
  currentBalance: number;
  currentEquity: number;
  readonly brokerWrites: false;
}

export interface PaperEquityPoint {
  timestamp: number;
  balance: number;
  equity: number;
}

export class Stage8PaperLedger {
  public readonly brokerWrites = false as const;
  private balance: number;
  private peakEquity: number;
  private maxDrawdownUsd = 0;
  private maxDrawdownPercent = 0;
  private readonly openPositions = new Map<string, PaperTrade>();
  private readonly closedTrades: PaperTrade[] = [];
  private readonly equityHistory: PaperEquityPoint[] = [];

  constructor(public readonly initialBalance = 10000) {
    this.balance = initialBalance;
    this.peakEquity = initialBalance;
    this.equityHistory.push({
      timestamp: Date.now(),
      balance: initialBalance,
      equity: initialBalance,
    });
  }

  public openPosition(params: {
    symbol: SymbolId;
    direction: 'BUY' | 'SELL';
    volumeLots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    entryTime: number;
    maxHoldingBars?: number;
    advisorMetadata?: PaperTradeAdvisorMetadata;
  }): PaperTrade {
    const spec = SYMBOL_SPECS[params.symbol];
    const commission = (spec?.commissionPerLot || 6) * params.volumeLots;
    const id = `pt_${params.symbol}_${params.entryTime}_${Math.random().toString(36).slice(2, 7)}`;

    const trade: PaperTrade = {
      id,
      symbol: params.symbol,
      direction: params.direction,
      volumeLots: params.volumeLots,
      entryPrice: params.entryPrice,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      entryTime: params.entryTime,
      barsHeld: 0,
      maxHoldingBars: params.maxHoldingBars || 48,
      status: 'OPEN',
      commission,
      advisorMetadata: params.advisorMetadata,
      brokerWrites: false,
    };

    this.openPositions.set(id, trade);
    return trade;
  }

  public onBarUpdate(symbol: SymbolId, candle: Candle): PaperTrade[] {
    const closedInThisBar: PaperTrade[] = [];
    const spec = SYMBOL_SPECS[symbol];
    const contractSize = spec?.contractSize || 100000;
    const pipSize = spec?.pipSize || 0.0001;

    for (const trade of this.openPositions.values()) {
      if (trade.symbol !== symbol) continue;

      trade.barsHeld += 1;
      let closePrice: number | null = null;
      let closeReason: 'TP' | 'SL' | 'EXPIRED' | null = null;

      if (trade.direction === 'BUY') {
        if (candle.low <= trade.stopLoss) {
          closePrice = Math.min(trade.stopLoss, candle.open);
          closeReason = 'SL';
        } else if (candle.high >= trade.takeProfit) {
          closePrice = Math.max(trade.takeProfit, candle.open);
          closeReason = 'TP';
        } else if (trade.barsHeld >= trade.maxHoldingBars) {
          closePrice = candle.close;
          closeReason = 'EXPIRED';
        }
      } else {
        // SELL
        if (candle.high >= trade.stopLoss) {
          closePrice = Math.max(trade.stopLoss, candle.open);
          closeReason = 'SL';
        } else if (candle.low <= trade.takeProfit) {
          closePrice = Math.min(trade.takeProfit, candle.open);
          closeReason = 'TP';
        } else if (trade.barsHeld >= trade.maxHoldingBars) {
          closePrice = candle.close;
          closeReason = 'EXPIRED';
        }
      }

      if (closePrice !== null && closeReason !== null) {
        const priceDiff = trade.direction === 'BUY' ? closePrice - trade.entryPrice : trade.entryPrice - closePrice;
        const grossPnl = priceDiff * contractSize * trade.volumeLots;
        const netPnl = Number((grossPnl - trade.commission).toFixed(2));
        const pnlPips = Number((priceDiff / pipSize).toFixed(1));

        trade.status = 'CLOSED';
        trade.closePrice = closePrice;
        trade.closeTime = candle.timestamp;
        trade.closeReason = closeReason;
        trade.pnl = netPnl;
        trade.pnlPips = pnlPips;

        this.balance = Number((this.balance + netPnl).toFixed(2));
        this.openPositions.delete(trade.id);
        this.closedTrades.push(trade);
        closedInThisBar.push(trade);
      }
    }

    // Update equity and drawdowns
    const currentEquity = this.calculateEquity(candle.close);
    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }
    const currentDdUsd = this.peakEquity - currentEquity;
    const currentDdPct = this.peakEquity > 0 ? (currentDdUsd / this.peakEquity) * 100 : 0;
    if (currentDdUsd > this.maxDrawdownUsd) this.maxDrawdownUsd = Number(currentDdUsd.toFixed(2));
    if (currentDdPct > this.maxDrawdownPercent) this.maxDrawdownPercent = Number(currentDdPct.toFixed(2));

    this.equityHistory.push({
      timestamp: candle.timestamp,
      balance: this.balance,
      equity: currentEquity,
    });

    return closedInThisBar;
  }

  public getOpenPositions(): PaperTrade[] {
    return Array.from(this.openPositions.values());
  }

  public getClosedTrades(): PaperTrade[] {
    return [...this.closedTrades];
  }

  public getEquityCurve(): PaperEquityPoint[] {
    return [...this.equityHistory];
  }

  public getMetrics(): PaperLedgerMetrics {
    let grossProfit = 0;
    let grossLoss = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const t of this.closedTrades) {
      const pnl = t.pnl || 0;
      if (pnl > 0) {
        grossProfit += pnl;
        winCount += 1;
      } else {
        grossLoss += Math.abs(pnl);
        lossCount += 1;
      }
    }

    const totalTrades = this.closedTrades.length;
    const winRate = totalTrades > 0 ? Number((winCount / totalTrades).toFixed(4)) : 0;
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? 999 : 0;
    const netPnl = Number((grossProfit - grossLoss).toFixed(2));

    return {
      totalTrades,
      openTrades: this.openPositions.size,
      closedTrades: totalTrades,
      winCount,
      lossCount,
      winRate,
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      profitFactor,
      netPnl,
      maxDrawdownUsd: this.maxDrawdownUsd,
      maxDrawdownPercent: this.maxDrawdownPercent,
      currentBalance: this.balance,
      currentEquity: this.calculateEquity(),
      brokerWrites: false,
    };
  }

  private calculateEquity(lastPrice?: number): number {
    let unrealizedPnl = 0;
    for (const trade of this.openPositions.values()) {
      if (!lastPrice) continue;
      const spec = SYMBOL_SPECS[trade.symbol];
      const contractSize = spec?.contractSize || 100000;
      const priceDiff = trade.direction === 'BUY' ? lastPrice - trade.entryPrice : trade.entryPrice - lastPrice;
      unrealizedPnl += priceDiff * contractSize * trade.volumeLots;
    }
    return Number((this.balance + unrealizedPnl).toFixed(2));
  }
}
