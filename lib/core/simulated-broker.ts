import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { SimulatedOrder, SimulatedPosition } from '../contracts/orders';
import { PostTradeAnalyticsEngine } from './post-trade-analytics';

export interface BrokerState {
  accountBalance: number;
  accountEquity: number;
  orders: SimulatedOrder[];
  positions: SimulatedPosition[];
}

export class SimulatedBroker {
  private balance: number;
  private equity: number;
  private orders: SimulatedOrder[] = [];
  private positions: SimulatedPosition[] = [];

  private enablePartialTp: boolean = true;

  constructor(initialBalance = 10000, enablePartialTp = true) {
    this.balance = initialBalance;
    this.equity = initialBalance;
    this.enablePartialTp = enablePartialTp;
  }

  public setEnablePartialTp(enabled: boolean): void {
    this.enablePartialTp = enabled;
  }

  public calculatePnlDollars(symbol: SymbolId, volumeLots: number, priceDiff: number, currentPrice: number): number {
    const contractSize = symbol === 'XAUUSD' ? 100 : symbol === 'BTCUSD' ? 1 : 100000;
    const grossQuotePnl = volumeLots * priceDiff * contractSize;
    return symbol === 'USDJPY' ? grossQuotePnl / Math.max(currentPrice, 0.0001) : grossQuotePnl;
  }

  public getState(): BrokerState {
    return {
      accountBalance: this.balance,
      accountEquity: this.equity,
      orders: [...this.orders],
      positions: [...this.positions],
    };
  }

  public createOrderFromCandidate(candidate: StrategyCandidate, volumeLots: number): SimulatedOrder {
    const order: SimulatedOrder = {
      id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      candidateId: candidate.id,
      symbol: candidate.symbol,
      type: 'LIMIT',
      direction: candidate.direction,
      volumeLots,
      requestedPrice: candidate.entryPrice,
      stopLoss: candidate.stopLossPrice,
      takeProfit: candidate.takeProfitPrice,
      status: 'PENDING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.orders.push(order);
    return order;
  }

  public onNewCandle(candle: Candle, symbol: SymbolId): void {
    // ۱. بررسی فعال شدن سفارش‌های معلق با برخورد قیمت
    const pendingOrders = this.orders.filter(o => o.symbol === symbol && o.status === 'PENDING');
    for (const order of pendingOrders) {
      const hit =
        order.direction === 'BUY'
          ? candle.low <= order.requestedPrice
          : candle.high >= order.requestedPrice;

      if (hit) {
        order.status = 'FILLED';
        order.updatedAt = candle.timestamp;

        // باز کردن پوزیشن
        this.positions.push({
          id: `POS-${order.id}`,
          orderId: order.id,
          symbol: order.symbol,
          direction: order.direction,
          volumeLots: order.volumeLots,
          entryPrice: order.requestedPrice,
          currentPrice: order.requestedPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          unrealizedPnl: 0,
          realizedPnl: 0,
          commissionPaid: order.volumeLots * 6.0,
          isOpen: true,
          openedAt: candle.timestamp,
        });
      }
    }

    // ۲. به‌روزرسانی پوزیشن‌های باز و بررسی برخورد با حد ضرر یا سود
    const openPositions = this.positions.filter(p => p.symbol === symbol && p.isOpen);

    for (const pos of openPositions) {
      pos.currentPrice = candle.close;
      pos.highestPriceDuringTrade = Math.max(pos.highestPriceDuringTrade ?? pos.entryPrice, candle.high);
      pos.lowestPriceDuringTrade = Math.min(pos.lowestPriceDuringTrade ?? pos.entryPrice, candle.low);

      // بررسی حد ضرر
      const slHit =
        pos.direction === 'BUY'
          ? candle.low <= pos.stopLoss
          : candle.high >= pos.stopLoss;

      if (slHit) {
        pos.isOpen = false;
        pos.closedAt = candle.timestamp;
        pos.closeReason = 'SL';
        const lossDiff =
          pos.direction === 'BUY'
            ? pos.stopLoss - pos.entryPrice
            : pos.entryPrice - pos.stopLoss;
        const sliceCommission = Number((pos.volumeLots * 6.0).toFixed(2));
        const grossLossDollars = this.calculatePnlDollars(pos.symbol, pos.volumeLots, lossDiff, pos.stopLoss);
        const slicePnl = Number((grossLossDollars - sliceCommission).toFixed(2));
        pos.realizedPnl = Number((pos.realizedPnl + slicePnl).toFixed(2));
        pos.unrealizedPnl = 0;
        this.balance = Number((this.balance + slicePnl).toFixed(2));

        const metrics = PostTradeAnalyticsEngine.calculateExcursionMetrics({
          symbol: pos.symbol,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: pos.stopLoss,
          highestPriceDuringTrade: pos.highestPriceDuringTrade ?? pos.entryPrice,
          lowestPriceDuringTrade: pos.lowestPriceDuringTrade ?? pos.entryPrice,
          volumeLots: pos.initialVolumeLots || pos.volumeLots,
        });
        pos.maePips = metrics.maePips;
        pos.mfePips = metrics.mfePips;
        pos.exitEfficiencyPercent = metrics.exitEfficiencyPercent;
        continue;
      }

      // بررسی خروج پله‌ای ۵۰٪ در ۱.۲R و انتقال خودکار حد ضرر به نقطه ورود (Breakeven)
      const riskDistance = Math.abs(pos.entryPrice - pos.stopLoss);
      const isBuy = pos.direction === 'BUY';
      const partialTarget = isBuy ? pos.entryPrice + 1.2 * riskDistance : pos.entryPrice - 1.2 * riskDistance;
      const canPartialClose = this.enablePartialTp && (!pos.partialCloseCount || pos.partialCloseCount === 0) && riskDistance > 0 && pos.volumeLots >= 0.02;

      if (canPartialClose) {
        const hitPartial = isBuy ? candle.high >= partialTarget : candle.low <= partialTarget;
        if (hitPartial) {
          const closedLots = Number((pos.volumeLots * 0.5).toFixed(2));
          if (closedLots >= 0.01) {
            const priceDiffAtTarget = isBuy ? partialTarget - pos.entryPrice : pos.entryPrice - partialTarget;
            const sliceCommission = Number((closedLots * 6.0).toFixed(2));
            const grossTargetDollars = this.calculatePnlDollars(pos.symbol, closedLots, priceDiffAtTarget, partialTarget);
            const partialRealized = Number((grossTargetDollars - sliceCommission).toFixed(2));
            pos.volumeLots = Number((pos.volumeLots - closedLots).toFixed(2));
            pos.realizedPnl = Number((pos.realizedPnl + partialRealized).toFixed(2));
            pos.partialCloseCount = (pos.partialCloseCount || 0) + 1;
            pos.isBreakevenActive = true;
            pos.stopLoss = pos.entryPrice;
            this.balance = Number((this.balance + partialRealized).toFixed(2));

            if (pos.volumeLots <= 0) {
              pos.isOpen = false;
              pos.closedAt = candle.timestamp;
              pos.closeReason = 'TP';
              pos.unrealizedPnl = 0;
              const metrics = PostTradeAnalyticsEngine.calculateExcursionMetrics({
                symbol: pos.symbol,
                direction: pos.direction,
                entryPrice: pos.entryPrice,
                exitPrice: partialTarget,
                highestPriceDuringTrade: pos.highestPriceDuringTrade ?? pos.entryPrice,
                lowestPriceDuringTrade: pos.lowestPriceDuringTrade ?? pos.entryPrice,
                volumeLots: pos.initialVolumeLots || closedLots,
              });
              pos.maePips = metrics.maePips;
              pos.mfePips = metrics.mfePips;
              pos.exitEfficiencyPercent = metrics.exitEfficiencyPercent;
              continue;
            }
          }
        }
      }

      // بررسی حد سود
      const tpHit =
        pos.direction === 'BUY'
          ? candle.high >= pos.takeProfit
          : candle.low <= pos.takeProfit;

      if (tpHit) {
        pos.isOpen = false;
        pos.closedAt = candle.timestamp;
        pos.closeReason = 'TP';
        const winDiff =
          pos.direction === 'BUY'
            ? pos.takeProfit - pos.entryPrice
            : pos.entryPrice - pos.takeProfit;
        const sliceCommission = Number((pos.volumeLots * 6.0).toFixed(2));
        const grossWinDollars = this.calculatePnlDollars(pos.symbol, pos.volumeLots, winDiff, pos.takeProfit);
        const slicePnl = Number((grossWinDollars - sliceCommission).toFixed(2));
        pos.realizedPnl = Number((pos.realizedPnl + slicePnl).toFixed(2));
        pos.unrealizedPnl = 0;
        this.balance = Number((this.balance + slicePnl).toFixed(2));

        const metrics = PostTradeAnalyticsEngine.calculateExcursionMetrics({
          symbol: pos.symbol,
          direction: pos.direction,
          entryPrice: pos.entryPrice,
          exitPrice: pos.takeProfit,
          highestPriceDuringTrade: pos.highestPriceDuringTrade ?? pos.entryPrice,
          lowestPriceDuringTrade: pos.lowestPriceDuringTrade ?? pos.entryPrice,
          volumeLots: pos.initialVolumeLots || pos.volumeLots,
        });
        pos.maePips = metrics.maePips;
        pos.mfePips = metrics.mfePips;
        pos.exitEfficiencyPercent = metrics.exitEfficiencyPercent;
        continue;
      }

      // اگر پوزیشن همچنان باز است، سود/زیان شناور را محاسبه کن
      const priceDiff =
        pos.direction === 'BUY'
          ? candle.close - pos.entryPrice
          : pos.entryPrice - candle.close;

      const remainingCommission = Number((pos.volumeLots * 6.0).toFixed(2));
      const grossFloatDollars = this.calculatePnlDollars(pos.symbol, pos.volumeLots, priceDiff, candle.close);
      pos.unrealizedPnl = Number((grossFloatDollars - remainingCommission).toFixed(2));
    }

    // محاسبه دقیق و یکپارچه اکوئیتی تنها از روی پوزیشن‌هایی که حقیقتاً باز هستند
    const stillOpen = this.positions.filter(p => p.isOpen);
    const totalUnrealized = stillOpen.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    this.equity = Number((this.balance + totalUnrealized).toFixed(2));
  }

  /**
   * ثبت آنی سفارش مارکت براکت و بازگشایی فوری پوزیشن (Instant Execution)
   */
  public createMarketBracketOrder(
    symbol: SymbolId,
    direction: SimulatedOrder['direction'],
    volumeLots: number,
    currentPrice: number,
    stopLoss: number,
    takeProfit: number,
    meta?: { mood?: string; propFirmId?: string }
  ): { order: SimulatedOrder; position: SimulatedPosition } {
    const now = Date.now();
    const order: SimulatedOrder = {
      id: `MKT-ORD-${now}`,
      candidateId: `INSTANT-${now}`,
      symbol,
      type: 'MARKET',
      direction,
      volumeLots,
      requestedPrice: currentPrice,
      stopLoss,
      takeProfit,
      status: 'FILLED',
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push(order);

    const position: SimulatedPosition = {
      id: `POS-${order.id}`,
      orderId: order.id,
      symbol,
      direction,
      volumeLots,
      initialVolumeLots: volumeLots,
      entryPrice: currentPrice,
      currentPrice,
      stopLoss,
      takeProfit,
      unrealizedPnl: 0,
      realizedPnl: 0,
      commissionPaid: volumeLots * 6.0,
      isOpen: true,
      openedAt: now,
      partialCloseCount: 0,
      isBreakevenActive: false,
      highestPriceDuringTrade: currentPrice,
      lowestPriceDuringTrade: currentPrice,
      psychologyMood: meta?.mood,
      propFirmId: meta?.propFirmId,
    };
    this.positions.push(position);

    return { order, position };
  }

  /**
   * اعمال خروج پله‌ای و انتقال به Breakeven روی یک پوزیشن باز
   */
  public applyPartialClose(
    positionId: string,
    closeRatio = 0.5,
    moveSlToBreakeven = true
  ): { success: boolean; realizedPnl: number; remainingLots: number } {
    const pos = this.positions.find(p => p.id === positionId && p.isOpen);
    if (!pos) return { success: false, realizedPnl: 0, remainingLots: 0 };

    if (!this.enablePartialTp || pos.volumeLots < 0.02) {
      return { success: false, realizedPnl: 0, remainingLots: pos.volumeLots };
    }

    const closedVolume = Number((pos.volumeLots * closeRatio).toFixed(2));
    if (closedVolume < 0.01) {
      return { success: false, realizedPnl: 0, remainingLots: pos.volumeLots };
    }

    const priceDiff =
      pos.direction === 'BUY'
        ? pos.currentPrice - pos.entryPrice
        : pos.entryPrice - pos.currentPrice;

    const sliceCommission = Number((closedVolume * 6.0).toFixed(2));
    const grossPartialDollars = this.calculatePnlDollars(pos.symbol, closedVolume, priceDiff, pos.currentPrice);
    const partialPnl = Number((grossPartialDollars - sliceCommission).toFixed(2));
    pos.volumeLots = Number((pos.volumeLots - closedVolume).toFixed(2));
    pos.realizedPnl = Number((pos.realizedPnl + partialPnl).toFixed(2));
    this.balance = Number((this.balance + partialPnl).toFixed(2));

    pos.partialCloseCount = (pos.partialCloseCount || 0) + 1;

    if (moveSlToBreakeven) {
      pos.stopLoss = pos.entryPrice;
      pos.isBreakevenActive = true;
    }

    if (pos.volumeLots <= 0) {
      pos.isOpen = false;
      pos.closedAt = Date.now();
      pos.closeReason = 'TP';
      pos.unrealizedPnl = 0;
    } else {
      // به‌روزرسانی سود شناور با حجم باقی‌مانده پس از بستن پله‌ای همراه با کسر کارمزد باقیمانده
      const remainingCommission = Number((pos.volumeLots * 6.0).toFixed(2));
      const remainingGrossDollars = this.calculatePnlDollars(pos.symbol, pos.volumeLots, priceDiff, pos.currentPrice);
      pos.unrealizedPnl = Number((remainingGrossDollars - remainingCommission).toFixed(2));
    }

    const stillOpen = this.positions.filter(p => p.isOpen);
    const totalUnrealized = stillOpen.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    this.equity = Number((this.balance + totalUnrealized).toFixed(2));

    return {
      success: true,
      realizedPnl: partialPnl,
      remainingLots: pos.volumeLots,
    };
  }

  /**
   * بستن یک پوزیشن معین و تسویه آنی PnL نقدشده در بالانس و اکوئیتی
   */
  public closePosition(
    positionId: string,
    exitPrice?: number,
    closeReason: 'MANUAL' | 'TP' | 'SL' = 'MANUAL'
  ): { success: boolean; closedPosition?: SimulatedPosition; netRealizedPnl: number } {
    const pos = this.positions.find(p => p.id === positionId && p.isOpen);
    if (!pos) return { success: false, netRealizedPnl: 0 };

    const now = Date.now();
    const finalPrice = exitPrice ?? pos.currentPrice;
    pos.isOpen = false;
    pos.closedAt = now;
    pos.closeReason = closeReason;
    pos.currentPrice = finalPrice;

    const priceDiff =
      pos.direction === 'BUY'
        ? finalPrice - pos.entryPrice
        : pos.entryPrice - finalPrice;
    const sliceCommission = Number((pos.volumeLots * 6.0).toFixed(2));
    const grossDollars = this.calculatePnlDollars(pos.symbol, pos.volumeLots, priceDiff, finalPrice);
    const pnl = Number((grossDollars - sliceCommission).toFixed(2));
    pos.realizedPnl = Number((pos.realizedPnl + pnl).toFixed(2));
    pos.unrealizedPnl = 0;
    this.balance = Number((this.balance + pnl).toFixed(2));

    const metrics = PostTradeAnalyticsEngine.calculateExcursionMetrics({
      symbol: pos.symbol,
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice: finalPrice,
      highestPriceDuringTrade: pos.highestPriceDuringTrade ?? pos.entryPrice,
      lowestPriceDuringTrade: pos.lowestPriceDuringTrade ?? pos.entryPrice,
      volumeLots: pos.initialVolumeLots || pos.volumeLots,
    });
    pos.maePips = metrics.maePips;
    pos.mfePips = metrics.mfePips;
    pos.exitEfficiencyPercent = metrics.exitEfficiencyPercent;

    const stillOpen = this.positions.filter(p => p.isOpen);
    if (stillOpen.length === 0) {
      this.equity = this.balance;
    } else {
      const totalUnrealized = stillOpen.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      this.equity = Number((this.balance + totalUnrealized).toFixed(2));
    }

    return {
      success: true,
      closedPosition: pos,
      netRealizedPnl: pnl,
    };
  }

  /**
   * اجرای بستن اضطراری سراسری (Panic Kill-Switch): بستن آنی تمام پوزیشن‌ها و لغو تمام سفارش‌ها
   */
  public panicCloseAll(): {
    closedPositionsCount: number;
    cancelledOrdersCount: number;
    netRealizedPnl: number;
  } {
    let closedPositionsCount = 0;
    let netRealizedPnl = 0;
    const now = Date.now();

    // بستن تمام پوزیشن‌های باز
    for (const pos of this.positions.filter(p => p.isOpen)) {
      pos.isOpen = false;
      pos.closedAt = now;
      pos.closeReason = 'PANIC_KILL_SWITCH';

      const priceDiff =
        pos.direction === 'BUY'
          ? pos.currentPrice - pos.entryPrice
          : pos.entryPrice - pos.currentPrice;

      const sliceCommission = Number((pos.volumeLots * 6.0).toFixed(2));
      const grossDollars = this.calculatePnlDollars(pos.symbol, pos.volumeLots, priceDiff, pos.currentPrice);
      const pnl = Number((grossDollars - sliceCommission).toFixed(2));
      pos.realizedPnl = Number((pos.realizedPnl + pnl).toFixed(2));
      pos.unrealizedPnl = 0;
      this.balance = Number((this.balance + pnl).toFixed(2));
      netRealizedPnl += pnl;
      closedPositionsCount++;
    }

    // لغو کلیه سفارش‌های در انتظار
    let cancelledOrdersCount = 0;
    for (const order of this.orders.filter(o => o.status === 'PENDING')) {
      order.status = 'CANCELLED';
      order.updatedAt = now;
      cancelledOrdersCount++;
    }

    this.equity = this.balance;

    return {
      closedPositionsCount,
      cancelledOrdersCount,
      netRealizedPnl: Number(netRealizedPnl.toFixed(2)),
    };
  }
}
