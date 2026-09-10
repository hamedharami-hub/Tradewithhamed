// lib/core/event-driven-engine.ts
// موتور شبیه‌ساز رویدادمحور و حسابداری پرتفوی بدون وابستگی به فریم‌ورک کلاینت

import { Candle, SYMBOL_SPECS, SymbolId } from '../contracts/market';
import {
  TradingEnvironment,
  IntrabarAmbiguityPolicy,
  OrderIntentPayload,
  ExecutionEventPayload,
  PositionLedgerEntry,
  PortfolioLedgerState,
  IClockPort,
  IExecutionPort,
  IEventStorePort,
} from './ports';
import {
  getDynamicSpreadPips,
  isRolloverBlackout,
  resolveIntraBarExit,
} from './market-microstructure';
import { EconomicCalendarEngine } from './economic-calendar';

// ساعت مجازی رویدادمحور با جلوگیری از دسترسی به زمان آینده
export class VirtualClock implements IClockPort {
  private currentTimestamp: number;

  constructor(initialTimestamp = 0) {
    this.currentTimestamp = initialTimestamp;
  }

  public now(): number {
    return this.currentTimestamp;
  }

  public setTime(timestamp: number): void {
    this.currentTimestamp = timestamp;
  }

  public advanceTo(timestamp: number): void {
    if (timestamp > this.currentTimestamp) {
      this.currentTimestamp = timestamp;
    }
  }
}

// ذخیره‌ساز رویدادهای اجرا
export class InMemoryEventStore implements IEventStorePort {
  private events: ExecutionEventPayload[] = [];

  public recordEvent(event: ExecutionEventPayload): void {
    this.events.push(event);
  }

  public getEventsByIntent(intentId: string): ExecutionEventPayload[] {
    return this.events.filter(e => e.intentId === intentId);
  }

  public getAllEvents(): ExecutionEventPayload[] {
    return [...this.events];
  }

  public clear(environment?: TradingEnvironment): void {
    if (environment) {
      this.events = this.events.filter(e => e.environment !== environment);
    } else {
      this.events = [];
    }
  }
}

export interface EngineConfig {
  environment: TradingEnvironment;
  accountNamespace: string;
  initialCash: number;
  commissionPerLot: number;
  defaultSpreadPips: number;
  useDynamicSpread?: boolean;
  useRolloverBlackout?: boolean;
  useNewsBlackout?: boolean;
  enablePartialTp?: boolean;
  ambiguityPolicy: IntrabarAmbiguityPolicy;
  slippageModel: {
    baseSlippagePips: number;
    volatilityMultiplier: number;
  };
}

export class EventDrivenExecutionEngine implements IExecutionPort {
  private clock: IClockPort;
  private eventStore: IEventStorePort;
  private config: EngineConfig;
  private ledger: PortfolioLedgerState;
  private pendingOrders: OrderIntentPayload[] = [];
  private orderAgeMap: Map<string, number> = new Map(); // شمارش کندل‌های سپری شده برای انقضا
  private eventSequence = 0;

  constructor(
    config: Partial<EngineConfig> = {},
    clock?: IClockPort,
    eventStore?: IEventStorePort
  ) {
    this.config = {
      environment: config.environment || 'BACKTEST',
      accountNamespace: config.accountNamespace || 'DEFAULT_PAPER',
      initialCash: config.initialCash ?? 10000,
      commissionPerLot: config.commissionPerLot ?? 6.0,
      defaultSpreadPips: config.defaultSpreadPips ?? 1.5,
      useDynamicSpread: config.useDynamicSpread ?? false,
      useRolloverBlackout: config.useRolloverBlackout ?? false,
      useNewsBlackout: config.useNewsBlackout ?? false,
      enablePartialTp: config.enablePartialTp ?? false,
      ambiguityPolicy: config.ambiguityPolicy || 'PESSIMISTIC',
      slippageModel: config.slippageModel || {
        baseSlippagePips: 0.2,
        volatilityMultiplier: 0.1,
      },
    };

    this.clock = clock || new VirtualClock(0);
    this.eventStore = eventStore || new InMemoryEventStore();

    this.ledger = {
      environment: this.config.environment,
      accountNamespace: this.config.accountNamespace,
      initialCash: this.config.initialCash,
      cashBalance: this.config.initialCash,
      equity: this.config.initialCash,
      usedMargin: 0,
      freeMargin: this.config.initialCash,
      marginLevelPercent: 100,
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 0,
      totalCommissions: 0,
      totalSwap: 0,
      positions: [],
      peakEquity: this.config.initialCash,
      maxDrawdownAmount: 0,
      maxDrawdownPercent: 0,
    };
  }

  public getLedger(): PortfolioLedgerState {
    return {
      ...this.ledger,
      positions: [...this.ledger.positions],
    };
  }

  public getClock(): IClockPort {
    return this.clock;
  }

  private nextEventId(kind: string): string {
    this.eventSequence += 1;
    return `EVT-${kind}-${this.config.environment}-${this.eventSequence.toString().padStart(8, '0')}`;
  }

  private pnlInAccountCurrency(symbol: SymbolId, volumeLots: number, priceDiff: number, conversionPrice: number): number {
    const contractSize = SYMBOL_SPECS[symbol].contractSize;
    const quotePnl = volumeLots * priceDiff * contractSize;
    return symbol === 'USDJPY' ? quotePnl / Math.max(conversionPrice, 0.000001) : quotePnl;
  }

  public submitOrder(intent: OrderIntentPayload): ExecutionEventPayload {
    // اعتبارسنجی اولیه
    if (intent.volumeLots <= 0 || this.ledger.equity <= 0) {
      const rejectEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('REJ'),
        intentId: intent.intentId,
        environment: this.config.environment,
        timestamp: this.clock.now(),
        status: 'REJECTED',
        commissionPaid: 0,
        notes: intent.volumeLots <= 0 ? 'حجم سفارش نامعتبر است (باید بیشتر از صفر باشد).' : 'به علت پایان سرمایهٔ قابل‌ریسک، سفارش جدید رد شد.',
      };
      this.eventStore.recordEvent(rejectEvent);
      return rejectEvent;
    }

    // سفارش‌های Market در اولین تیک یا کندل واجد شرایط بعدی اجرا می‌شوند
    this.pendingOrders.push(intent);
    this.orderAgeMap.set(intent.intentId, 0);

    const pendingEvent: ExecutionEventPayload = {
      eventId: this.nextEventId('PND'),
      intentId: intent.intentId,
      environment: this.config.environment,
      timestamp: this.clock.now(),
      status: 'PENDING',
      commissionPaid: 0,
      notes: `سفارش معلق ${intent.orderType} با موفقیت در صف شبیه‌ساز ثبت شد.`,
    };
    this.eventStore.recordEvent(pendingEvent);
    return pendingEvent;
  }

  public cancelOrder(intentId: string): boolean {
    const idx = this.pendingOrders.findIndex(o => o.intentId === intentId);
    if (idx !== -1) {
      this.pendingOrders.splice(idx, 1);
      this.orderAgeMap.delete(intentId);

      const cancelEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('CNC'),
        intentId,
        environment: this.config.environment,
        timestamp: this.clock.now(),
        status: 'CANCELLED',
        commissionPaid: 0,
        notes: 'سفارش معلق توسط کاربر یا سیستم لغو شد.',
      };
      this.eventStore.recordEvent(cancelEvent);
      return true;
    }
    return false;
  }

  public processMarketTick(quote: {
    symbol: SymbolId;
    bid: number;
    ask: number;
    timestamp: number;
  }): ExecutionEventPayload[] {
    this.clock.advanceTo(quote.timestamp);
    const events: ExecutionEventPayload[] = [];

    // پردازش سفارش‌های معلق با توجه به Ask/Bid
    const remainingPending: OrderIntentPayload[] = [];
    for (const order of this.pendingOrders) {
      if (order.symbol !== quote.symbol) {
        remainingPending.push(order);
        continue;
      }

      let fillPrice: number | null = null;
      let slippagePips = 0;

      if (order.orderType === 'MARKET') {
        // خرید از Ask و فروش از Bid (عدم محاسبه مجدد دوبرابری اسپرد)
        slippagePips = this.config.slippageModel.baseSlippagePips;
        const pipVal = SYMBOL_SPECS[order.symbol].pipSize;
        fillPrice =
          order.direction === 'BUY'
            ? quote.ask + slippagePips * pipVal
            : quote.bid - slippagePips * pipVal;
      } else if (order.orderType === 'LIMIT') {
        if (order.direction === 'BUY' && quote.ask <= order.entryPrice) {
          fillPrice = order.entryPrice;
        } else if (order.direction === 'SELL' && quote.bid >= order.entryPrice) {
          fillPrice = order.entryPrice;
        }
      }

      if (fillPrice !== null) {
        const commission = order.volumeLots * this.config.commissionPerLot;
        const fillEvent: ExecutionEventPayload = {
          eventId: this.nextEventId('FIL'),
          intentId: order.intentId,
          environment: this.config.environment,
          timestamp: this.clock.now(),
          status: 'FILLED',
          fillPrice,
          filledVolume: order.volumeLots,
          slippagePips,
          commissionPaid: commission,
          notes: `سفارش در قیمت ${fillPrice} تکمیل شد.`,
        };
        this.eventStore.recordEvent(fillEvent);
        events.push(fillEvent);

        this.openPosition(order, fillPrice, commission);
      } else {
        remainingPending.push(order);
      }
    }

    this.pendingOrders = remainingPending;
    this.updateOpenPositions(quote.bid, quote.ask, quote.symbol);
    return events;
  }

  public processCandle(candle: Candle, symbol: SymbolId): ExecutionEventPayload[] {
    this.clock.advanceTo(candle.timestamp);
    const events: ExecutionEventPayload[] = [];
    const pipVal = SYMBOL_SPECS[symbol].pipSize;
    const newsMultiplier = this.config.useNewsBlackout
      ? EconomicCalendarEngine.getNewsSpreadMultiplier(candle.timestamp, symbol)
      : 1.0;
    const effectiveSpreadPips =
      (this.config.useDynamicSpread
        ? getDynamicSpreadPips(symbol, candle.timestamp, this.config.defaultSpreadPips)
        : this.config.defaultSpreadPips) * newsMultiplier;
    const spreadPoints = effectiveSpreadPips * pipVal;
    const inRollover = this.config.useRolloverBlackout && isRolloverBlackout(candle.timestamp);
    const inNewsBlackout =
      this.config.useNewsBlackout &&
      EconomicCalendarEngine.isNewsBlackout(candle.timestamp, symbol).inBlackout;

    // ۱. بررسی انقضای سفارش‌های معلق (Setup Expiry - مثلاً حداکثر ۳ الی ۶ کندل)
    const activePending: OrderIntentPayload[] = [];
    for (const order of this.pendingOrders) {
      const age = (this.orderAgeMap.get(order.intentId) || 0) + 1;
      this.orderAgeMap.set(order.intentId, age);

      if (order.expiryTimestamp && candle.timestamp >= order.expiryTimestamp) {
        const expireEvt: ExecutionEventPayload = {
          eventId: this.nextEventId('EXP'),
          intentId: order.intentId,
          environment: this.config.environment,
          timestamp: candle.timestamp,
          status: 'EXPIRED',
          commissionPaid: 0,
          notes: 'سفارش به علت پایان مهلت زمانی منقضی شد.',
        };
        this.eventStore.recordEvent(expireEvt);
        events.push(expireEvt);
        this.orderAgeMap.delete(order.intentId);
        continue;
      }

      // در زمان رول‌اور (۲۱:۰۰ تا ۲۲:۳۰ UTC) یا بلک‌اوت اخبار پرریسک، اجرای سفارش‌ها مسدود می‌شود تا از جهش اسپرد در امان بماند
      if (inRollover || inNewsBlackout) {
        activePending.push(order);
        continue;
      }

      // بررسی پر شدن سفارش در بازه قیمتی کندل بسته
      let fillPrice: number | null = null;
      if (order.orderType === 'LIMIT') {
        const canFillBuy = order.direction === 'BUY' && candle.low <= order.entryPrice;
        const canFillSell = order.direction === 'SELL' && candle.high >= order.entryPrice;

        if (canFillBuy || canFillSell) {
          fillPrice = order.entryPrice;
        }
      } else if (order.orderType === 'MARKET') {
        const adverseEntrySlippage = this.config.slippageModel.baseSlippagePips * pipVal;
        fillPrice = order.direction === 'BUY'
          ? candle.open + spreadPoints * 0.5 + adverseEntrySlippage
          : candle.open - spreadPoints * 0.5 - adverseEntrySlippage;
      }

      if (fillPrice !== null) {
        const commission = order.volumeLots * this.config.commissionPerLot;
        const fillEvent: ExecutionEventPayload = {
          eventId: this.nextEventId('FIL'),
          intentId: order.intentId,
          environment: this.config.environment,
          timestamp: candle.timestamp,
          status: 'FILLED',
          fillPrice,
          filledVolume: order.volumeLots,
          commissionPaid: commission,
          notes: `سفارش در کندل تکمیل شد (اسپرد: ${effectiveSpreadPips} پیپ).`,
        };
        this.eventStore.recordEvent(fillEvent);
        events.push(fillEvent);

        this.openPosition(order, fillPrice, commission);
        this.orderAgeMap.delete(order.intentId);
      } else {
        activePending.push(order);
      }
    }
    this.pendingOrders = activePending;

    // ۲. بررسی پوزیشن‌های باز و خروج با SL یا TP (با رسیدگی به ابهام Intrabar)
    const openPositions = this.ledger.positions.filter(p => p.symbol === symbol && p.isOpen);
    for (const pos of openPositions) {
      this.evaluatePositionExitOnCandle(pos, candle, symbol, spreadPoints, events);
    }

    // ۳. به‌روزرسانی ارزش کل پرتفوی، افت سرمایه و سودهای محقق‌نشده
    this.updateLedgerTotals();
    return events;
  }

  private evaluatePositionExitOnCandle(
    pos: PositionLedgerEntry,
    candle: Candle,
    symbol: SymbolId,
    spreadPoints: number,
    events: ExecutionEventPayload[]
  ): void {
    const pipVal = SYMBOL_SPECS[symbol].pipSize;
    // محاسبه اکستریم‌های معامله جهت ثبت MAE و MFE
    if (pos.direction === 'BUY') {
      const adversePips = Math.max(0, (pos.entryPrice - candle.low) / pipVal);
      const favorablePips = Math.max(0, (candle.high - pos.entryPrice) / pipVal);
      pos.maePips = Math.max(pos.maePips, adversePips);
      pos.mfePips = Math.max(pos.mfePips, favorablePips);
    } else {
      const adversePips = Math.max(0, (candle.high - pos.entryPrice) / pipVal);
      const favorablePips = Math.max(0, (pos.entryPrice - candle.low) / pipVal);
      pos.maePips = Math.max(pos.maePips, adversePips);
      pos.mfePips = Math.max(pos.mfePips, favorablePips);
    }

    // الف. خروج پله‌ای ۵۰٪ در ۱.۲R و انتقال خودکار حد ضرر به نقطه ورود (Breakeven)
    const isBuy = pos.direction === 'BUY';
    const riskDistance = Math.abs(pos.entryPrice - pos.stopLossPrice);
    const partialTarget = isBuy ? pos.entryPrice + 1.2 * riskDistance : pos.entryPrice - 1.2 * riskDistance;
    const canPartialClose = this.config.enablePartialTp && !pos.isPartialClosed && riskDistance > 0 && pos.volumeLots >= 0.02;

    if (canPartialClose) {
      const hitPartial = isBuy ? candle.high >= partialTarget : candle.low <= partialTarget;
      if (hitPartial) {
        const closedLots = Number((pos.volumeLots * 0.5).toFixed(2));
        if (closedLots >= 0.01) {
          const priceDiffAtTarget = isBuy ? partialTarget - pos.entryPrice : pos.entryPrice - partialTarget;
          const partialPnl = this.pnlInAccountCurrency(symbol, closedLots, priceDiffAtTarget, partialTarget);
          pos.volumeLots = Number((pos.volumeLots - closedLots).toFixed(2));
          pos.isPartialClosed = true;
          pos.partialRealizedPnl = Number(partialPnl.toFixed(2));
          pos.stopLossPrice = pos.entryPrice; // انتقال به Breakeven
          this.ledger.cashBalance = Number((this.ledger.cashBalance + partialPnl).toFixed(2));
          this.ledger.totalRealizedPnl = Number((this.ledger.totalRealizedPnl + partialPnl).toFixed(2));
        }
      }
    }

    // ب. بررسی برخورد با حد سود و ضرر با مدل رفع ابهام
    const resolutionPolicy =
      this.config.ambiguityPolicy === 'BAR_POLARITY'
        ? 'BAR_POLARITY'
        : this.config.ambiguityPolicy === 'OPTIMISTIC'
        ? 'OPTIMISTIC'
        : 'PESSIMISTIC';

    const intraRes = resolveIntraBarExit(
      candle,
      pos.direction,
      pos.stopLossPrice,
      pos.takeProfitPrice,
      resolutionPolicy
    );

    const slHit = intraRes.slHit;
    const tpHit = intraRes.tpHit;
    const isAmbiguous = intraRes.isAmbiguous;

    if (slHit || tpHit) {
      pos.isOpen = false;
      pos.closedTimestamp = candle.timestamp;

      const finalReason = intraRes.firstExit || (slHit ? 'SL' : 'TP');
      pos.closeReason = finalReason;
      const triggerPrice = finalReason === 'SL' ? pos.stopLossPrice : pos.takeProfitPrice;
      const adverseExitSlippage = (this.config.slippageModel.baseSlippagePips + this.config.defaultSpreadPips * 0.5) * pipVal;
      const exitPrice = pos.direction === 'BUY'
        ? triggerPrice - adverseExitSlippage
        : triggerPrice + adverseExitSlippage;
      const priceDiff =
        pos.direction === 'BUY' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
      // commissionPerLot is a round-trip amount debited at entry; never charge it again on exit.
      const exitCommission = 0;
      pos.commissionPaid = Number((pos.commissionPaid + exitCommission).toFixed(2));
      const realizedPnl = this.pnlInAccountCurrency(symbol, pos.volumeLots, priceDiff, exitPrice);
      pos.realizedPnl = Number((realizedPnl - pos.commissionPaid).toFixed(2));
      pos.unrealizedPnl = 0;
      this.ledger.cashBalance = Number((this.ledger.cashBalance + realizedPnl - exitCommission).toFixed(2));
      this.ledger.totalCommissions = Number((this.ledger.totalCommissions + exitCommission).toFixed(2));
      this.ledger.totalRealizedPnl = Number((this.ledger.totalRealizedPnl + pos.realizedPnl).toFixed(2));

      const closeEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('CLS'),
        intentId: pos.intentId,
        environment: this.config.environment,
        timestamp: candle.timestamp,
        status: 'FILLED',
        fillPrice: exitPrice,
        filledVolume: pos.volumeLots,
        commissionPaid: exitCommission,
        ambiguityFlag: isAmbiguous,
        notes: isAmbiguous
          ? `برخورد همزمان SL و TP با سیاست ${this.config.ambiguityPolicy} به نفع ${finalReason} (${intraRes.rationale}) حل شد.`
          : `پوزیشن با برخورد به ${finalReason} در قیمت ${exitPrice} بسته شد.`,
      };
      this.eventStore.recordEvent(closeEvent);
      events.push(closeEvent);
    } else {
      // به‌روزرسانی قیمت و سود شناور
      pos.currentPrice = candle.close;
      const priceDiff =
        pos.direction === 'BUY' ? candle.close - pos.entryPrice : pos.entryPrice - candle.close;
      pos.unrealizedPnl = Number(this.pnlInAccountCurrency(symbol, pos.volumeLots, priceDiff, candle.close).toFixed(2));
    }
  }

  private openPosition(order: OrderIntentPayload, fillPrice: number, commission: number): void {
    const position: PositionLedgerEntry = {
      positionId: `POS-${order.intentId}`,
      intentId: order.intentId,
      environment: this.config.environment,
      symbol: order.symbol,
      direction: order.direction,
      volumeLots: order.volumeLots,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      stopLossPrice: order.stopLossPrice,
      takeProfitPrice: order.takeProfitPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      commissionPaid: commission,
      financingSwap: 0,
      isOpen: true,
      openedTimestamp: this.clock.now(),
      maePips: 0,
      mfePips: 0,
    };

    this.ledger.positions.push(position);
    this.ledger.cashBalance = Number((this.ledger.cashBalance - commission).toFixed(2));
    this.ledger.totalCommissions = Number((this.ledger.totalCommissions + commission).toFixed(2));
  }

  private updateOpenPositions(bid: number, ask: number, symbol: SymbolId): void {
    for (const pos of this.ledger.positions) {
      if (!pos.isOpen || pos.symbol !== symbol) continue;
      const closePrice = pos.direction === 'BUY' ? bid : ask;
      pos.currentPrice = closePrice;
      const priceDiff =
        pos.direction === 'BUY' ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
      pos.unrealizedPnl = Number(this.pnlInAccountCurrency(symbol, pos.volumeLots, priceDiff, closePrice).toFixed(2));
    }
    this.updateLedgerTotals();
  }

  private updateLedgerTotals(): void {
    let totalUnrealized = 0;
    let marginUsed = 0;

    for (const pos of this.ledger.positions) {
      if (pos.isOpen) {
        totalUnrealized += pos.unrealizedPnl;
        // مارجین تقریبی ۱:۱۰۰
        const notional = pos.entryPrice * SYMBOL_SPECS[pos.symbol].contractSize;
        marginUsed += (pos.volumeLots * notional) / 100;
      }
    }

    this.ledger.totalUnrealizedPnl = Number(totalUnrealized.toFixed(2));
    this.ledger.usedMargin = Number(marginUsed.toFixed(2));
    this.ledger.equity = Number((this.ledger.cashBalance + totalUnrealized).toFixed(2));
    this.ledger.freeMargin = Math.max(0, Number((this.ledger.equity - marginUsed).toFixed(2)));
    this.ledger.marginLevelPercent =
      marginUsed > 0 ? Number(((this.ledger.equity / marginUsed) * 100).toFixed(1)) : 100;

    // محاسبه دراودان
    if (this.ledger.equity > this.ledger.peakEquity) {
      this.ledger.peakEquity = this.ledger.equity;
    } else {
      const ddAmount = this.ledger.peakEquity - this.ledger.equity;
      const ddPercent = (ddAmount / this.ledger.peakEquity) * 100;
      if (ddAmount > this.ledger.maxDrawdownAmount) {
        this.ledger.maxDrawdownAmount = Number(ddAmount.toFixed(2));
        this.ledger.maxDrawdownPercent = Number(ddPercent.toFixed(2));
      }
    }
  }

  public resetLedger(initialBalance?: number): void {
    const cash = initialBalance ?? this.config.initialCash;
    this.ledger = {
      environment: this.config.environment,
      accountNamespace: this.config.accountNamespace,
      initialCash: cash,
      cashBalance: cash,
      equity: cash,
      usedMargin: 0,
      freeMargin: cash,
      marginLevelPercent: 100,
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 0,
      totalCommissions: 0,
      totalSwap: 0,
      positions: [],
      peakEquity: cash,
      maxDrawdownAmount: 0,
      maxDrawdownPercent: 0,
    };
    this.pendingOrders = [];
    this.orderAgeMap.clear();
    this.eventSequence = 0;
  }
}
