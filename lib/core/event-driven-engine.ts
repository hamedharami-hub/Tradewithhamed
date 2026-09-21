// lib/core/event-driven-engine.ts
// موتور رویدادمحور اجرای بک‌تست و شبیه‌سازی بازار بر اساس سند نسخه ۴.۰
// پشتیبانی کامل از Market, Limit, Stop orders، رفع ابهام Intrabar، Breakeven پویا، Partial TP و کنترل عدم تکرار

import { Candle, SymbolId, SYMBOL_SPECS } from '../contracts/market';
import { EconomicCalendarEngine } from './economic-calendar';
import {
  IExecutionPort,
  IClockPort,
  IEventStorePort,
  OrderIntentPayload,
  ExecutionEventPayload,
  PositionLedgerEntry,
  PortfolioLedgerState,
  TradingEnvironment,
  IntrabarAmbiguityPolicy,
  EndOfDataPolicy,
} from './ports';
import { resolveIntraBarExit } from './market-microstructure';

export class SimulationClock implements IClockPort {
  private currentTimestamp = 0;

  public now(): number {
    return this.currentTimestamp;
  }

  public setTime(timestamp: number): void {
    this.currentTimestamp = timestamp;
  }

  public advanceTo(timestamp: number): void {
    if (timestamp < this.currentTimestamp) {
      return;
    }
    this.currentTimestamp = timestamp;
  }
}

export class InMemoryEventStore implements IEventStorePort {
  private events: ExecutionEventPayload[] = [];

  public recordEvent(event: ExecutionEventPayload): void {
    this.events.push({ ...event });
  }

  public getEvents(intentId?: string): ExecutionEventPayload[] {
    if (intentId) {
      return this.events.filter(e => e.intentId === intentId);
    }
    return [...this.events];
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

export interface EngineExecutionDiagnostics {
  duplicateOrdersRejected: number;
  marketOrdersSubmitted: number;
  marketOrdersFilled: number;
  limitOrdersSubmitted: number;
  limitOrdersFilled: number;
  stopOrdersSubmitted: number;
  stopOrdersFilled: number;
  ordersExpired: number;
  breakevenActivatedCount: number;
  breakevenExitCount: number;
  breakevenSavedLossCount: number;
  partialTakeProfitCount: number;
  gapEntryCount: number;
  gapExitCount: number;
  ambiguousExitCount: number;
  rejectedByOpenPositionLimit: number;
  rejectedByPendingOrderLimit: number;
  rejectedByCombinedExposureLimit: number;
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
  enableBreakeven?: boolean;
  breakevenTriggerR?: number; // default 1.0 R
  breakevenOffsetPips?: number; // default 0.5 pips
  includeEntryCostsInBreakeven?: boolean; // default true
  enablePartialTp?: boolean;
  partialTakeProfitTriggerR?: number; // default 1.2 R
  partialClosePercent?: number; // default 50%
  moveStopAfterPartial?: boolean;
  postPartialStopMode?: 'UNCHANGED' | 'BREAKEVEN' | 'LOCK_PROFIT';
  maxOpenPositions?: number;
  maxPendingOrders?: number;
  maxCombinedExposure?: number;
  ambiguityPolicy: IntrabarAmbiguityPolicy;
  endOfDataPolicy?: EndOfDataPolicy;
  randomSkippedFillsPercent?: number;
  randomSeed?: number;
  gapShockMultiplier?: number;
  slippageModel: {
    baseSlippagePips: number;
    volatilityMultiplier: number;
    additionalSlippagePips?: number;
  };
}

export class EventDrivenExecutionEngine implements IExecutionPort {
  private clock: IClockPort;
  private eventStore: IEventStorePort;
  private config: EngineConfig;
  private ledger: PortfolioLedgerState;
  private pendingOrders: OrderIntentPayload[] = [];
  private orderAgeMap: Map<string, number> = new Map();
  private eventSequence = 0;
  private rng?: import('./seeded-rng').SeededRNG;
  private submittedIdempotencyKeys: Set<string> = new Set();

  public diagnostics: EngineExecutionDiagnostics = {
    duplicateOrdersRejected: 0,
    marketOrdersSubmitted: 0,
    marketOrdersFilled: 0,
    limitOrdersSubmitted: 0,
    limitOrdersFilled: 0,
    stopOrdersSubmitted: 0,
    stopOrdersFilled: 0,
    ordersExpired: 0,
    breakevenActivatedCount: 0,
    breakevenExitCount: 0,
    breakevenSavedLossCount: 0,
    partialTakeProfitCount: 0,
    gapEntryCount: 0,
    gapExitCount: 0,
    ambiguousExitCount: 0,
    rejectedByOpenPositionLimit: 0,
    rejectedByPendingOrderLimit: 0,
    rejectedByCombinedExposureLimit: 0,
  };

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
      enableBreakeven: config.enableBreakeven ?? false,
      breakevenTriggerR: config.breakevenTriggerR ?? 1.0,
      breakevenOffsetPips: config.breakevenOffsetPips ?? 0,
      includeEntryCostsInBreakeven: config.includeEntryCostsInBreakeven ?? false,
      enablePartialTp: config.enablePartialTp ?? false,
      partialTakeProfitTriggerR: config.partialTakeProfitTriggerR ?? 1.2,
      partialClosePercent: config.partialClosePercent ?? 50,
      moveStopAfterPartial: config.moveStopAfterPartial ?? true,
      postPartialStopMode: config.postPartialStopMode ?? 'BREAKEVEN',
      maxOpenPositions: config.maxOpenPositions,
      maxPendingOrders: config.maxPendingOrders,
      maxCombinedExposure: config.maxCombinedExposure,
      ambiguityPolicy: config.ambiguityPolicy || 'PESSIMISTIC',
      endOfDataPolicy: config.endOfDataPolicy || 'CLOSE_AT_LAST_CLOSE',
      randomSkippedFillsPercent: config.randomSkippedFillsPercent ?? 0,
      randomSeed: config.randomSeed ?? 1337,
      gapShockMultiplier: config.gapShockMultiplier ?? 1.0,
      slippageModel: {
        baseSlippagePips: config.slippageModel?.baseSlippagePips ?? 0.2,
        volatilityMultiplier: config.slippageModel?.volatilityMultiplier ?? 0.1,
        additionalSlippagePips: config.slippageModel?.additionalSlippagePips ?? 0,
      },
    };

    if (
      (this.config.randomSkippedFillsPercent && this.config.randomSkippedFillsPercent > 0) ||
      this.config.randomSeed !== undefined
    ) {
      const { SeededRNG } = require('./seeded-rng');
      this.rng = new SeededRNG(this.config.randomSeed ?? 1337);
    }

    this.clock = clock || new SimulationClock();
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

  public getEventStore(): IEventStorePort {
    return this.eventStore;
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
    // ۱. اعتبارسنجی تکرارناپذیری (Idempotency Guard)
    if (intent.idempotencyKey) {
      if (this.submittedIdempotencyKeys.has(intent.idempotencyKey)) {
        this.diagnostics.duplicateOrdersRejected++;
        const dupEvent: ExecutionEventPayload = {
          eventId: this.nextEventId('REJ'),
          intentId: intent.intentId,
          environment: this.config.environment,
          timestamp: this.clock.now(),
          status: 'REJECTED',
          commissionPaid: 0,
          notes: `سفارش تکراری با کلید یکتا ${intent.idempotencyKey} رد شد.`,
        };
        this.eventStore.recordEvent(dupEvent);
        return dupEvent;
      }
      this.submittedIdempotencyKeys.add(intent.idempotencyKey);
    }

    // ۲. اعتبارسنجی حجم و سرمایه
    if (intent.volumeLots <= 0 || this.ledger.equity <= 0) {
      const rejectEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('REJ'),
        intentId: intent.intentId,
        environment: this.config.environment,
        timestamp: this.clock.now(),
        status: 'REJECTED',
        commissionPaid: 0,
        notes: intent.volumeLots <= 0 ? 'حجم سفارش نامعتبر است.' : 'سرمایه قابل‌ریسک پایان یافته است.',
      };
      this.eventStore.recordEvent(rejectEvent);
      return rejectEvent;
    }

    // ۳. بررسی سقف سفارش‌های معلق (maxPendingOrders)
    if (this.config.maxPendingOrders && this.pendingOrders.length >= this.config.maxPendingOrders) {
      this.diagnostics.rejectedByPendingOrderLimit++;
      const rejectEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('REJ'),
        intentId: intent.intentId,
        environment: this.config.environment,
        timestamp: this.clock.now(),
        status: 'REJECTED',
        commissionPaid: 0,
        notes: `سقف سفارش‌های معلق (${this.config.maxPendingOrders}) تکمیل است.`,
      };
      this.eventStore.recordEvent(rejectEvent);
      return rejectEvent;
    }

    // ۴. بررسی سقف اکسپوژر ترکیبی (maxCombinedExposure)
    const openCount = this.ledger.positions.filter(p => p.isOpen).length;
    if (this.config.maxCombinedExposure && (openCount + this.pendingOrders.length) >= this.config.maxCombinedExposure) {
      this.diagnostics.rejectedByCombinedExposureLimit++;
      const rejectEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('REJ'),
        intentId: intent.intentId,
        environment: this.config.environment,
        timestamp: this.clock.now(),
        status: 'REJECTED',
        commissionPaid: 0,
        notes: `سقف اکسپوژر ترکیبی معاملات (${this.config.maxCombinedExposure}) تکمیل است.`,
      };
      this.eventStore.recordEvent(rejectEvent);
      return rejectEvent;
    }

    // ۵. ثبت سفارش در صف معلق
    this.pendingOrders.push(intent);
    this.orderAgeMap.set(intent.intentId, 0);

    if (intent.orderType === 'MARKET') this.diagnostics.marketOrdersSubmitted++;
    else if (intent.orderType === 'LIMIT') this.diagnostics.limitOrdersSubmitted++;
    else if (intent.orderType === 'STOP') this.diagnostics.stopOrdersSubmitted++;

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

    const remainingPending: OrderIntentPayload[] = [];
    for (const order of this.pendingOrders) {
      if (order.symbol !== quote.symbol) {
        remainingPending.push(order);
        continue;
      }

      let fillPrice: number | null = null;
      let slippagePips = 0;

      if (order.orderType === 'MARKET') {
        const basePrice = order.direction === 'BUY' ? quote.ask : quote.bid;
        slippagePips = this.config.slippageModel.baseSlippagePips;
        const adverseSlippage = slippagePips * SYMBOL_SPECS[order.symbol].pipSize;
        fillPrice = order.direction === 'BUY' ? basePrice + adverseSlippage : basePrice - adverseSlippage;
      } else if (order.orderType === 'LIMIT') {
        if (order.direction === 'BUY' && quote.ask <= order.entryPrice) {
          fillPrice = order.entryPrice;
        } else if (order.direction === 'SELL' && quote.bid >= order.entryPrice) {
          fillPrice = order.entryPrice;
        }
      } else if (order.orderType === 'STOP') {
        if (order.direction === 'BUY' && quote.ask >= order.entryPrice) {
          fillPrice = order.entryPrice;
        } else if (order.direction === 'SELL' && quote.bid <= order.entryPrice) {
          fillPrice = order.entryPrice;
        }
      }

      if (fillPrice !== null) {
        const commission = order.volumeLots * this.config.commissionPerLot;
        const fillEvent: ExecutionEventPayload = {
          eventId: this.nextEventId('FIL'),
          intentId: order.intentId,
          environment: this.config.environment,
          timestamp: quote.timestamp,
          status: 'FILLED',
          fillPrice,
          filledVolume: order.volumeLots,
          slippagePips,
          commissionPaid: commission,
          notes: `سفارش در تیک زنده بازار تکمیل شد.`,
        };
        this.eventStore.recordEvent(fillEvent);
        events.push(fillEvent);

        this.openPosition(order, fillPrice, commission);
        this.orderAgeMap.delete(order.intentId);
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

    // اسپرد بر اساس رژیم نوسان یا ثابت
    let effectiveSpreadPips = this.config.defaultSpreadPips;
    if (this.config.useDynamicSpread) {
      const candleRangePips = (candle.high - candle.low) / pipVal;
      const volatilityMarkup = Math.min(2.5, Math.max(0, (candleRangePips - 10) * 0.05));
      effectiveSpreadPips = Number((this.config.defaultSpreadPips + volatilityMarkup).toFixed(1));
    }
    const spreadPoints = effectiveSpreadPips * pipVal;

    // فیلتر رول‌اور (۲۱:۰۰ تا ۲۲:۳۰ UTC)
    const dateUtc = new Date(candle.timestamp);
    const utcHours = dateUtc.getUTCHours();
    const utcMinutes = dateUtc.getUTCMinutes();
    const inRollover =
      this.config.useRolloverBlackout &&
      (utcHours === 21 || (utcHours === 22 && utcMinutes < 30));

    const inNewsBlackout =
      this.config.useNewsBlackout &&
      EconomicCalendarEngine.isNewsBlackout(candle.timestamp, symbol).inBlackout;

    // ۱. بررسی انقضا و اجرای سفارش‌های معلق (Market, Limit, Stop)
    const activePending: OrderIntentPayload[] = [];
    for (const order of this.pendingOrders) {
      const age = (this.orderAgeMap.get(order.intentId) || 0) + 1;
      this.orderAgeMap.set(order.intentId, age);

      if (order.expiryTimestamp && candle.timestamp >= order.expiryTimestamp) {
        this.diagnostics.ordersExpired++;
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

      if (inRollover || inNewsBlackout) {
        activePending.push(order);
        continue;
      }

      let fillPrice: number | null = null;
      let appliedSlippagePips: number | undefined;

      // الف. سفارش لیمیت (LIMIT)
      if (order.orderType === 'LIMIT') {
        const canFillBuy = order.direction === 'BUY' && candle.low <= order.entryPrice;
        const canFillSell = order.direction === 'SELL' && candle.high >= order.entryPrice;

        if (canFillBuy || canFillSell) {
          if (
            this.config.randomSkippedFillsPercent &&
            this.config.randomSkippedFillsPercent > 0 &&
            this.rng
          ) {
            if (this.rng.next() * 100 < this.config.randomSkippedFillsPercent) {
              activePending.push(order);
              continue;
            }
          }

          // بهبود قیمت در صورت بازگشایی کندل با گپ بهتر
          if (order.direction === 'BUY' && candle.open < order.entryPrice) {
            fillPrice = candle.open;
            this.diagnostics.gapEntryCount++;
          } else if (order.direction === 'SELL' && candle.open > order.entryPrice) {
            fillPrice = candle.open;
            this.diagnostics.gapEntryCount++;
          } else {
            fillPrice = order.entryPrice;
          }
          this.diagnostics.limitOrdersFilled++;
        }
      }
      // ب. سفارش بازار (MARKET) - اجرا در بازگشایی کندل بعد با اسپرد و اسلیپیج
      else if (order.orderType === 'MARKET') {
        const gapShock = this.config.gapShockMultiplier ?? 1.0;
        const totalSlippagePips =
          (this.config.slippageModel.baseSlippagePips +
          (this.config.slippageModel.additionalSlippagePips || 0)) * gapShock;
        appliedSlippagePips = totalSlippagePips;
        const adverseEntrySlippage = totalSlippagePips * pipVal;
        fillPrice = order.direction === 'BUY'
          ? candle.open + spreadPoints * 0.5 * gapShock + adverseEntrySlippage
          : candle.open - spreadPoints * 0.5 * gapShock - adverseEntrySlippage;
        this.diagnostics.marketOrdersFilled++;
      }
      // ج. سفارش استاپ (STOP) - ورود در شکست سقف/کف
      else if (order.orderType === 'STOP') {
        const canTriggerBuy = order.direction === 'BUY' && candle.high >= order.entryPrice;
        const canTriggerSell = order.direction === 'SELL' && candle.low <= order.entryPrice;

        if (canTriggerBuy || canTriggerSell) {
          const gapShock = this.config.gapShockMultiplier ?? 1.0;
          const totalSlippagePips =
            (this.config.slippageModel.baseSlippagePips +
            (this.config.slippageModel.additionalSlippagePips || 0)) * gapShock;
          appliedSlippagePips = totalSlippagePips;
          const adverseEntrySlippage = totalSlippagePips * pipVal;

          if (order.direction === 'BUY') {
            if (candle.open > order.entryPrice) {
              fillPrice = candle.open + spreadPoints * 0.5 * gapShock + adverseEntrySlippage;
              this.diagnostics.gapEntryCount++;
            } else {
              fillPrice = order.entryPrice + spreadPoints * 0.5 * gapShock + adverseEntrySlippage;
            }
          } else {
            if (candle.open < order.entryPrice) {
              fillPrice = candle.open - spreadPoints * 0.5 * gapShock - adverseEntrySlippage;
              this.diagnostics.gapEntryCount++;
            } else {
              fillPrice = order.entryPrice - spreadPoints * 0.5 * gapShock - adverseEntrySlippage;
            }
          }
          this.diagnostics.stopOrdersFilled++;
        }
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
          slippagePips: appliedSlippagePips,
          commissionPaid: commission,
          notes: `سفارش ${order.orderType} در قیمت ${fillPrice.toFixed(5)} تکمیل شد (اسپرد: ${effectiveSpreadPips} پیپ).`,
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

    // ۲. بررسی پوزیشن‌های باز، Breakeven، Partial TP و خروج با SL/TP
    const openPositions = this.ledger.positions.filter(p => p.symbol === symbol && p.isOpen);
    for (const pos of openPositions) {
      this.evaluatePositionExitOnCandle(pos, candle, symbol, spreadPoints, events);
    }

    // ۳. به‌روزرسانی ارزش کل دارایی
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
    const contractSize = SYMBOL_SPECS[symbol].contractSize;
    const isBuy = pos.direction === 'BUY';
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;

    // محاسبه اکستریم‌های معامله جهت ثبت MAE و MFE
    if (isBuy) {
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

    const riskDistance = Math.abs(pos.entryPrice - pos.stopLossPrice);

    // ۱. بررسی Breakeven (ریسک‌فری خودکار)
    if (this.config.enableBreakeven && !pos.breakevenActivated && riskDistance > 0) {
      const triggerR = this.config.breakevenTriggerR ?? 1.0;
      const currentFavorableDistance = isBuy ? candle.high - pos.entryPrice : pos.entryPrice - candle.low;

      if (currentFavorableDistance >= triggerR * riskDistance) {
        let beOffsetPrice = (this.config.breakevenOffsetPips ?? 0) * pipVal;

        // در صورت فعال بودن، هزینه کمیسیون و اسپرد در قیمت بهینه‌شده منظور می‌شود
        if (this.config.includeEntryCostsInBreakeven) {
          const roundTripCommissionPips = (this.config.commissionPerLot / (contractSize * pipVal));
          const costPips = this.config.defaultSpreadPips + roundTripCommissionPips;
          beOffsetPrice += costPips * pipVal;
        }

        const candidateBePrice = isBuy ? pos.entryPrice + beOffsetPrice : pos.entryPrice - beOffsetPrice;
        // اطمینان از اینکه حد ضرر جدید معامله را بدتر نکند
        const canMoveToBE = isBuy ? candidateBePrice > pos.stopLossPrice : candidateBePrice < pos.stopLossPrice;

        if (canMoveToBE) {
          pos.stopLossPrice = beOffsetPrice === 0 ? pos.entryPrice : Number(candidateBePrice.toFixed(precision));
          pos.breakevenActivated = true;
          pos.breakevenActivatedTimestamp = candle.timestamp;
          this.diagnostics.breakevenActivatedCount++;
        }
      }
    }

    // ۲. بررسی خروج پله‌ای (Partial Take Profit)
    if (this.config.enablePartialTp && !pos.isPartialClosed && riskDistance > 0 && pos.volumeLots >= 0.02) {
      const triggerR = this.config.partialTakeProfitTriggerR ?? 1.2;
      const partialTarget = isBuy ? pos.entryPrice + triggerR * riskDistance : pos.entryPrice - triggerR * riskDistance;
      const hitPartial = isBuy ? candle.high >= partialTarget : candle.low <= partialTarget;

      if (hitPartial) {
        const percent = (this.config.partialClosePercent ?? 50) / 100;
        const originalLots = pos.initialVolumeLots || pos.volumeLots;
        const closedLots = Number((originalLots * percent).toFixed(2));
        const remainingLots = Number((pos.volumeLots - closedLots).toFixed(2));

        if (closedLots >= 0.01 && remainingLots >= 0.01) {
          const priceDiffAtTarget = isBuy ? partialTarget - pos.entryPrice : pos.entryPrice - partialTarget;
          const partialPnl = this.pnlInAccountCurrency(symbol, closedLots, priceDiffAtTarget, partialTarget);

          pos.partialClosedVolume = closedLots;
          pos.remainingVolume = remainingLots;
          pos.volumeLots = remainingLots;
          pos.isPartialClosed = true;
          pos.partialExitPrice = partialTarget;
          pos.partialRealizedPnl = Number(partialPnl.toFixed(2));

          // عدم دریافت مجدد کمیسیون ورود (یکبار برای کل حجم پرداخت شده است)
          this.ledger.cashBalance = Number((this.ledger.cashBalance + partialPnl).toFixed(2));
          this.ledger.totalRealizedPnl = Number((this.ledger.totalRealizedPnl + partialPnl).toFixed(2));
          this.diagnostics.partialTakeProfitCount++;

          // جابجایی حد ضرر پس از خروج پله‌ای
          if (this.config.moveStopAfterPartial) {
            const stopMode = this.config.postPartialStopMode || 'BREAKEVEN';
            if (stopMode === 'BREAKEVEN') {
              pos.stopLossPrice = pos.entryPrice;
              pos.breakevenActivated = true;
              pos.breakevenActivatedTimestamp = candle.timestamp;
            } else if (stopMode === 'LOCK_PROFIT') {
              // قفل کردن ۰.۳R سود
              const lockedPrice = isBuy ? pos.entryPrice + 0.3 * riskDistance : pos.entryPrice - 0.3 * riskDistance;
              pos.stopLossPrice = Number(lockedPrice.toFixed(precision));
            }
          }
        }
      }
    }

    // ۳. بررسی برخورد با حد سود و ضرر با مدل رفع ابهام
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

    if (isAmbiguous) {
      this.diagnostics.ambiguousExitCount++;
    }

    if (slHit || tpHit) {
      pos.isOpen = false;
      pos.closedTimestamp = candle.timestamp;

      const finalReason = intraRes.firstExit || (slHit ? 'SL' : 'TP');
      pos.closeReason = finalReason;
      const triggerPrice = finalReason === 'SL' ? pos.stopLossPrice : pos.takeProfitPrice;

      // بررسی بازگشایی با گپ فراتر از حد ضرر یا سود
      let exitPrice = triggerPrice;
      const isGapSl = (isBuy && candle.open < pos.stopLossPrice) || (!isBuy && candle.open > pos.stopLossPrice);
      const isGapTp = (isBuy && candle.open > pos.takeProfitPrice) || (!isBuy && candle.open < pos.takeProfitPrice);

      if (finalReason === 'SL' && isGapSl) {
        exitPrice = candle.open;
        this.diagnostics.gapExitCount++;
      } else if (finalReason === 'TP' && isGapTp) {
        exitPrice = candle.open;
        this.diagnostics.gapExitCount++;
      }

      const totalSlippagePips =
        this.config.slippageModel.baseSlippagePips +
        (this.config.slippageModel.additionalSlippagePips || 0);
      const adverseExitSlippage = (totalSlippagePips + this.config.defaultSpreadPips * 0.5) * pipVal;

      const finalFillPrice = pos.direction === 'BUY'
        ? exitPrice - adverseExitSlippage
        : exitPrice + adverseExitSlippage;

      pos.exitPrice = finalFillPrice;

      const priceDiff =
        pos.direction === 'BUY' ? finalFillPrice - pos.entryPrice : pos.entryPrice - finalFillPrice;

      // کمیسیون یکبار در ورود دریافت شده است
      const exitCommission = 0;
      pos.commissionPaid = Number((pos.commissionPaid + exitCommission).toFixed(2));
      const remainingRealizedPnl = this.pnlInAccountCurrency(symbol, pos.volumeLots, priceDiff, finalFillPrice);
      pos.finalRealizedPnl = Number(remainingRealizedPnl.toFixed(2));

      // سود کل تحقق‌یافته شامل بخش پله‌ای و بخش نهایی منهای کمیسیون کل است
      const totalTradePnl = (pos.partialRealizedPnl || 0) + remainingRealizedPnl - pos.commissionPaid;
      pos.realizedPnl = Number(totalTradePnl.toFixed(2));
      pos.unrealizedPnl = 0;

      this.ledger.cashBalance = Number((this.ledger.cashBalance + remainingRealizedPnl - exitCommission).toFixed(2));
      this.ledger.totalRealizedPnl = Number((this.ledger.totalRealizedPnl + remainingRealizedPnl).toFixed(2));

      if (pos.breakevenActivated) {
        this.diagnostics.breakevenExitCount++;
        if (pos.realizedPnl >= -0.05) {
          this.diagnostics.breakevenSavedLossCount++;
        }
      }

      const closeEvent: ExecutionEventPayload = {
        eventId: this.nextEventId('CLS'),
        intentId: pos.intentId,
        environment: this.config.environment,
        timestamp: candle.timestamp,
        status: 'FILLED',
        fillPrice: finalFillPrice,
        filledVolume: pos.volumeLots,
        commissionPaid: exitCommission,
        ambiguityFlag: isAmbiguous,
        notes: isAmbiguous
          ? `برخورد همزمان با سیاست ${this.config.ambiguityPolicy} به نفع ${finalReason} (${intraRes.rationale}) حل شد.`
          : `پوزیشن با برخورد به ${finalReason} در قیمت ${finalFillPrice.toFixed(5)} بسته شد.`,
      };
      this.eventStore.recordEvent(closeEvent);
      events.push(closeEvent);
    } else {
      // به‌روزرسانی قیمت و سود شناور پوزیشن باز
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
      initialVolumeLots: order.volumeLots,
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

  public finalizeEndOfData(
    lastCandle: Candle,
    symbol: SymbolId,
    policy: EndOfDataPolicy = 'CLOSE_AT_LAST_CLOSE'
  ): {
    events: ExecutionEventPayload[];
    closedPositionsCount: number;
    cancelledOrdersCount: number;
    openPositionsCount: number;
  } {
    const events: ExecutionEventPayload[] = [];
    let closedCount = 0;
    let cancelledCount = 0;

    for (const order of this.pendingOrders) {
      cancelledCount++;
      const cancelEvt: ExecutionEventPayload = {
        eventId: this.nextEventId('EOD_CNC'),
        intentId: order.intentId,
        environment: this.config.environment,
        timestamp: lastCandle.timestamp,
        status: 'CANCELLED_END_OF_DATA',
        commissionPaid: 0,
        notes: 'سفارش معلق در پایان داده‌های تاریخی به طور خودکار لغو شد.',
      };
      this.eventStore.recordEvent(cancelEvt);
      events.push(cancelEvt);
    }
    this.pendingOrders = [];

    const openPositions = this.ledger.positions.filter(p => p.isOpen);

    if (policy === 'CLOSE_AT_LAST_CLOSE') {
      const closePrice = lastCandle.close;
      for (const pos of openPositions) {
        pos.isOpen = false;
        pos.closedTimestamp = lastCandle.timestamp;
        pos.closeReason = 'END_OF_DATA';

        const priceDiff =
          pos.direction === 'BUY' ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
        const realizedPnl = this.pnlInAccountCurrency(symbol, pos.volumeLots, priceDiff, closePrice);
        pos.realizedPnl = Number((realizedPnl - pos.commissionPaid).toFixed(2));
        pos.unrealizedPnl = 0;

        this.ledger.cashBalance = Number((this.ledger.cashBalance + realizedPnl).toFixed(2));
        this.ledger.totalRealizedPnl = Number((this.ledger.totalRealizedPnl + pos.realizedPnl).toFixed(2));
        closedCount++;

        const closeEvt: ExecutionEventPayload = {
          eventId: this.nextEventId('EOD_CLS'),
          intentId: pos.intentId,
          environment: this.config.environment,
          timestamp: lastCandle.timestamp,
          status: 'FILLED',
          fillPrice: closePrice,
          filledVolume: pos.volumeLots,
          commissionPaid: 0,
          notes: 'پوزیشن در آخرین قیمت بسته شدن دیتاست (End of Data) تسویه شد.',
        };
        this.eventStore.recordEvent(closeEvt);
        events.push(closeEvt);
      }
    }

    this.updateLedgerTotals();

    const remainingOpen = this.ledger.positions.filter(p => p.isOpen).length;

    return {
      events,
      closedPositionsCount: closedCount,
      cancelledOrdersCount: cancelledCount,
      openPositionsCount: remainingOpen,
    };
  }
}
