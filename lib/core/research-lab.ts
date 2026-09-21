// lib/core/research-lab.ts
// آزمایشگاه جامع محاسبات و اجرای استراتژی‌های کمی در محیط شبیه‌سازی
// مجهز به تراز چندتایم‌فریمی ضد نگاه‌به‌آینده، محاسبات ریسک‌فری، سیو سود پله‌ای و آمار تفکیکی

import { Candle, SymbolId, SYMBOL_SPECS, Timeframe } from '../contracts/market';
import { TradingStyleType } from '../contracts/regimes';
import {
  EventDrivenExecutionEngine,
  SimulationClock,
  InMemoryEventStore,
} from './event-driven-engine';
import {
  OrderIntentPayload,
  PositionLedgerEntry,
  EndOfDataPolicy,
} from './ports';
import { MultiStyleEngine } from './multi-style-engine';
import {
  AccountConfiguration,
  DateRangeFilterConfig,
  SessionTimezoneConfig,
  StrategyParameters,
  CommonStrategyParameters,
  HigherTimeframeSource,
} from '../contracts/strategy-parameters';
import { SessionTimezoneEngine } from './session-timezone';
import { SeededRNG } from './seeded-rng';
import { AdvancedExecutionStressConfig } from '../contracts/research-run';
import { aggregateCandles, validateTimeframeCombination } from './timeframe-aggregator';
import { MtfAlignmentCursor } from './mtf-alignment';
import { checkStyleTimeframeCompatibility } from '../contracts/parameter-registry';
import { DatasetPassport } from '../contracts/dataset-contract';
import { DatasetQualityEngine } from './dataset-quality';

function timeframeToMs(timeframe: Timeframe): number {
  const durations: Record<Timeframe, number> = {
    '1M': 60_000,
    '5M': 5 * 60_000,
    '15M': 15 * 60_000,
    '1H': 60 * 60_000,
    '4H': 4 * 60 * 60_000,
    D1: 24 * 60 * 60_000,
    W1: 7 * 24 * 60 * 60_000,
  };
  return durations[timeframe] || 300_000;
}

export interface ResearchDiagnostics {
  candidatesCount: number;
  candidatesBeforeMtfFilter?: number;
  candidatesApprovedByMtf?: number;
  candidatesRejectedByMtf?: number;
  candidatesRejectedBySession?: number;
  candidatesRejectedByDirection?: number;
  candidatesRejectedByCooldown?: number;
  candidatesRejectedByVolatility?: number;
  candidatesRejectedByStructure?: number;
  candidatesRejectedByMomentum?: number;
  invalidStops?: number;
  duplicateOrdersRejected?: number;
  ordersSubmitted: number;
  ordersFilled: number;
  marketOrdersSubmitted?: number;
  marketOrdersFilled?: number;
  limitOrdersSubmitted?: number;
  limitOrdersFilled?: number;
  stopOrdersSubmitted?: number;
  stopOrdersFilled?: number;
  ordersExpired: number;
  ordersCancelledAtEnd: number;
  positionsClosedAtEnd: number;
  positionsOpenAtEnd: number;
  rejectedDueToRiskCount: number;
  breakevenActivatedCount?: number;
  breakevenExitCount?: number;
  breakevenSavedLossCount?: number;
  partialTakeProfitCount?: number;
  gapEntryCount?: number;
  gapExitCount?: number;
  ambiguousExitCount?: number;
  higherTimeframeSource?: string;
  higherTimeframeCandlesUsed?: number;
  alignmentFailures?: number;
  nonRecommendedConfiguration?: boolean;
  zeroTradeRationale?: string;
  selectedDateRange?: {
    earliestCandle: number;
    latestCandle: number;
    totalAvailableCandles: number;
    selectedStart: number;
    selectedEnd: number;
    evaluationCandles: number;
    warmupCandles: number;
  };
  selectedSessions?: string[];
  selectedWeekdays?: number[];
  timezone?: string;
  initialCapital?: number;
  finalBalance?: number;
  finalEquity?: number;
  returnPercent?: number;
  candidatesInsideSession?: number;
  candidatesRejectedOutsideSession?: number;
  ordersRejectedByDailyLoss?: number;
  ordersRejectedByDrawdownLimit?: number;
  ordersRejectedByLotRules?: number;
  rejectedByOpenPositionLimit?: number;
  rejectedByPendingOrderLimit?: number;
  rejectedByCombinedExposureLimit?: number;
  tradesBySession?: Record<string, number>;
  profitBySession?: Record<string, number>;
  tradesByWeekday?: Record<string, number>;
  profitByWeekday?: Record<string, number>;
  accountCurrency?: string;
  maxConcurrentPositions?: number;
  rejectedOrdersBreakdown?: { reason: string; count: number }[];
  datasetPassport?: DatasetPassport;
  timingDataPreparationMs?: number;
  timingAggregationMs?: number;
  timingIndicatorsMs?: number;
  timingBacktestMs?: number;
  timingMetricsMs?: number;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakEvenTrades: number;
  winRatePercent: number;
  profitFactor: number;
  payoffRatio: number;
  expectancyR: number; // امید ریاضی بر حسب واحد ریسک R
  netProfit: number;
  netProfitPercent: number;
  grossProfit?: number;
  grossLoss?: number;
  totalSpreadCostDollar?: number;
  totalSlippageCostDollar?: number;
  frictionCostDollar?: number;
  frictionToGrossProfitRatio?: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  recoveryFactor: number;
  totalCommissions: number;
  avgMaePips: number;
  avgMfePips: number;
  equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[];
  ambiguousTradesCount: number; // تعداد معاملاتی که ابهام Intrabar داشتند
  datasetPassport?: DatasetPassport;
  diagnostics?: ResearchDiagnostics;
}

export interface WalkForwardWindow {
  windowIndex: number;
  trainStartTime: number;
  trainEndTime: number;
  valStartTime: number;
  valEndTime: number;
  trainMetrics: PerformanceMetrics;
  validationMetrics: PerformanceMetrics;
  efficiencyRatio: number;
}

export interface StressTestScenarioResult {
  scenarioName: string;
  description: string;
  spreadMultiplier: number;
  additionalSlippagePips: number;
  netProfit: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  expectancyR: number;
  status: 'ROBUST' | 'DEGRADED' | 'FAILED';
  metrics?: PerformanceMetrics;
  passedRiskGate?: boolean;
}

export interface MonteCarloSimulationResult {
  iterations: number;
  medianMaxDrawdownPercent: number;
  percentile95DrawdownPercent?: number;
  percentile95MaxDrawdownPercent?: number;
  riskOfRuinPercent: number;
  medianProfit: number;
  worstCaseProfit?: number;
  bestCaseProfit?: number;
  samplePaths?: { pathIndex: number; points: number[] }[];
}

export class ResearchLab {
  // ۱. اجرای بک‌تست رویدادمحور مجهز به پکیج ۳
  public static runBacktest(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    options: {
      initialCash?: number;
      accountConfig?: AccountConfiguration;
      dateRangeConfig?: DateRangeFilterConfig;
      sessionConfig?: SessionTimezoneConfig;
      commissionPerLot?: number;
      defaultSpreadPips?: number;
      additionalSlippagePips?: number;
      useAIReview?: boolean;
      style?: TradingStyleType | 'ALL';
      timeframe?: Timeframe;
      lookbackCandles?: number;
      riskPercent?: number;
      strategyParameters?: Partial<Omit<StrategyParameters, 'common'>> & { common?: Partial<CommonStrategyParameters> };
      endOfDataPolicy?: EndOfDataPolicy;
      onProgress?: (processed: number, total: number) => void;
      stressConfig?: AdvancedExecutionStressConfig;
      randomSeed?: number;
      htfCandles?: Candle[];
      htfTimeframe?: Timeframe;
      htfSource?: HigherTimeframeSource;
    } = {}
  ): {
    metrics: PerformanceMetrics;
    trades: PositionLedgerEntry[];
  } {
    const t0 = performance.now();

    if (!candles || candles.length === 0) {
      throw new Error('دیتاست کندل خالی است.');
    }

    const initialCash = options.accountConfig?.initialCapital ?? options.initialCash ?? 10000;
    const style = options.style ?? 'ALL';
    const timeframe = options.timeframe ?? '15M';
    const lookbackCandles = Math.max(210, Math.min(options.lookbackCandles ?? 240, 1000));
    const safeRiskPercent = Math.max(0.1, Math.min(options.riskPercent ?? 0.25, 2.0));
    const endOfDataPolicy = options.endOfDataPolicy || 'CLOSE_AT_LAST_CLOSE';
    const strategyParameters = options.strategyParameters;
    const additionalSlippagePips = options.additionalSlippagePips ?? 0;

    // پالایش و اعتبارسنجی کیفیت داده و تولید شناسنامه دیتاست
    const { acceptedCandles, passport: datasetPassport } = DatasetQualityEngine.inspectAndValidate(
      candles,
      symbol,
      timeframe,
      {
        minimumCandles: 14,
        minimumWarmupBars: lookbackCandles,
        dropIncompleteTrailingBar: true,
      }
    );

    if (acceptedCandles.length < 14) {
      throw new Error(`تعداد کندل‌های معتبر دیتاست (${acceptedCandles.length}) پس از پالایش کمتر از حداقل مورد نیاز (۱۴ کندل) است.`);
    }

    // استفاده از کندل‌های پالایش‌شده در تمام محاسبات بعدی
    const sanitizedCandles = acceptedCandles;

    // بررسی سازگاری سبک و تایم‌فریم
    let nonRecommendedConfiguration = false;
    if (style !== 'ALL') {
      const compat = checkStyleTimeframeCompatibility(style, timeframe);
      if (compat.isNotRecommended) {
        nonRecommendedConfiguration = true;
      }
    }

    // پارامترهای حساب و حدود ریسک
    const minLot = options.accountConfig?.minLot ?? 0.01;
    const lotStep = options.accountConfig?.lotStep ?? 0.01;
    const maxLot = options.accountConfig?.maxLot ?? 100.0;
    const maxConcurrent = options.accountConfig?.maxConcurrentPositions ?? strategyParameters?.common?.maxConcurrentPositions ?? 5;
    const maxOpenPositions = options.accountConfig?.maxOpenPositions ?? strategyParameters?.common?.maxOpenPositions ?? maxConcurrent;
    const maxPendingOrders = options.accountConfig?.maxPendingOrders ?? strategyParameters?.common?.maxPendingOrders ?? 5;
    const maxCombinedExposure = options.accountConfig?.maxCombinedExposure ?? strategyParameters?.common?.maxCombinedExposure ?? (maxOpenPositions + maxPendingOrders);

    const maxDailyLossPercent = options.accountConfig?.maxDailyLossPercent;
    const maxTotalDrawdownPercent = options.accountConfig?.maxTotalDrawdownPercent;
    const userTz = options.sessionConfig?.timezone || 'UTC';
    const brokerOffset = options.sessionConfig?.brokerOffsetMinutes || 0;

    // ─── پیکربندی چندتایم‌فریمی (MTF) ─────────────────────────────────────────
    const tPrepStart = performance.now();
    const mtfConfig = strategyParameters?.common?.mtfConfig;
    const isMtfFilterActive =
      Boolean(strategyParameters?.common?.higherTimeframeFilter) ||
      (mtfConfig !== undefined && mtfConfig.higherTimeframeFilterMode !== 'OFF');

    let htfCandlesToUse: Candle[] = [];
    let htfTimeframe: Timeframe = options.htfTimeframe || mtfConfig?.confirmationTimeframe || '1H';
    let reportedHtfSource: HigherTimeframeSource = options.htfSource || mtfConfig?.higherTimeframeSource || 'AUTO';
    let alignmentFailures = 0;

    let tAggDuration = 0;

    if (isMtfFilterActive) {
      // اعتبارسنجی زوج تایم‌فریم
      const validation = validateTimeframeCombination(timeframe, htfTimeframe);
      if (!validation.isValid) {
        throw new Error(validation.errorMessageFa);
      }

      if (options.htfCandles && options.htfCandles.length > 0 && reportedHtfSource !== 'AGGREGATED_FROM_EXECUTION') {
        htfCandlesToUse = options.htfCandles;
        reportedHtfSource = 'NATIVE_DATASET';
      } else {
        // تجمیع قطعی از روی کندل‌های بسته تایم‌فریم اجرا
        const tAgg0 = performance.now();
        htfCandlesToUse = aggregateCandles(sanitizedCandles, htfTimeframe, false);
        tAggDuration = performance.now() - tAgg0;
        reportedHtfSource = 'AGGREGATED_FROM_EXECUTION';
      }
    }

    const mtfCursor = isMtfFilterActive && htfCandlesToUse.length > 0
      ? new MtfAlignmentCursor(htfCandlesToUse, htfTimeframe, reportedHtfSource)
      : null;

    const tPrepDuration = performance.now() - tPrepStart;

    // مدیریت بازه تاریخی و وارم‌آپ (Date Range & Warmup)
    const earliestCandle = sanitizedCandles[0].timestamp;
    const latestCandle = sanitizedCandles[sanitizedCandles.length - 1].timestamp;
    const totalAvailableCandles = sanitizedCandles.length;

    let selectedStart = earliestCandle;
    let selectedEnd = latestCandle;
    const rangeMode = options.dateRangeConfig?.mode || 'FULL';

    switch (rangeMode) {
      case 'FIRST_25':
        selectedEnd = sanitizedCandles[Math.max(0, Math.floor(sanitizedCandles.length * 0.25) - 1)].timestamp;
        break;
      case 'MIDDLE_50':
        selectedStart = sanitizedCandles[Math.floor(sanitizedCandles.length * 0.25)].timestamp;
        selectedEnd = sanitizedCandles[Math.max(0, Math.floor(sanitizedCandles.length * 0.75) - 1)].timestamp;
        break;
      case 'LAST_25':
        selectedStart = sanitizedCandles[Math.floor(sanitizedCandles.length * 0.75)].timestamp;
        break;
      case 'ROLLING_3M':
        selectedStart = Math.max(earliestCandle, latestCandle - 90 * 24 * 60 * 60_000);
        break;
      case 'ROLLING_6M':
        selectedStart = Math.max(earliestCandle, latestCandle - 180 * 24 * 60 * 60_000);
        break;
      case 'ROLLING_12M':
        selectedStart = Math.max(earliestCandle, latestCandle - 365 * 24 * 60 * 60_000);
        break;
      case 'CUSTOM':
        if (options.dateRangeConfig?.customStartDate) {
          selectedStart = new Date(options.dateRangeConfig.customStartDate).getTime();
        }
        if (options.dateRangeConfig?.customEndDate) {
          selectedEnd = new Date(options.dateRangeConfig.customEndDate + 'T23:59:59.999Z').getTime();
        }
        break;
      case 'FULL':
      default:
        selectedStart = earliestCandle;
        selectedEnd = latestCandle;
        break;
    }

    let evaluationStartIndex = sanitizedCandles.findIndex(c => c.timestamp >= selectedStart);
    if (evaluationStartIndex === -1) {
      throw new Error('هیچ کندلی در بازهٔ تاریخی انتخاب‌شده یافت نشد.');
    }

    let evaluationEndIndex = -1;
    for (let j = sanitizedCandles.length - 1; j >= 0; j--) {
      if (sanitizedCandles[j].timestamp <= selectedEnd) {
        evaluationEndIndex = j;
        break;
      }
    }

    if (evaluationEndIndex < evaluationStartIndex || (evaluationEndIndex - evaluationStartIndex + 1) < 14) {
      throw new Error('تعداد کندل‌های بازهٔ انتخابی برای استراتژی کافی نیست (حداقل ۱۴ کندل نیاز است).');
    }

    const evaluationCandlesCount = evaluationEndIndex - evaluationStartIndex + 1;
    const warmupCandlesCount = evaluationStartIndex;

    // ایجاد موتور رویدادمحور با تمام قابلیت‌های پکیج ۳ و پکیج C
    const frictionParams = strategyParameters?.executionFriction;
    const dynamicSpreadEnabled = frictionParams?.spreadModelType === 'DYNAMIC_SESSION' || frictionParams?.spreadModelType === 'NEWS_VOLATILITY';
    const baseSlippage = frictionParams?.baseSlippagePips ?? 0.2;
    const volMult = frictionParams?.volatilityMultiplier ?? 0.1;
    const frictionExtraSlippage = frictionParams?.additionalSlippagePips ?? 0;
    const skippedFills = options.stressConfig?.randomSkippedFillsPercent ?? frictionParams?.randomSkippedFillsPercent ?? 0;

    const engine = new EventDrivenExecutionEngine({
      environment: 'BACKTEST',
      accountNamespace: 'BACKTEST-RUN',
      initialCash,
      commissionPerLot: options.commissionPerLot ?? SYMBOL_SPECS[symbol].commissionPerLot,
      defaultSpreadPips: (options.stressConfig?.spreadMultiplier ?? 1)
        * (options.defaultSpreadPips ?? SYMBOL_SPECS[symbol].typicalSpreadPips),
      useDynamicSpread: dynamicSpreadEnabled,
      ambiguityPolicy: frictionParams?.intrabarAmbiguityPolicy || 'PESSIMISTIC',
      endOfDataPolicy,
      enableBreakeven: strategyParameters?.common?.enableBreakeven ?? true,
      breakevenTriggerR: strategyParameters?.common?.breakevenTriggerR ?? 1.0,
      breakevenOffsetPips: strategyParameters?.common?.breakevenOffsetPips ?? 0.5,
      includeEntryCostsInBreakeven: strategyParameters?.common?.includeEntryCostsInBreakeven ?? true,
      enablePartialTp: strategyParameters?.common?.enablePartialTakeProfit ?? false,
      partialTakeProfitTriggerR: strategyParameters?.common?.partialTakeProfitTriggerR ?? 1.2,
      partialClosePercent: strategyParameters?.common?.partialClosePercent ?? 50,
      moveStopAfterPartial: strategyParameters?.common?.moveStopAfterPartial ?? true,
      postPartialStopMode: strategyParameters?.common?.postPartialStopMode ?? 'BREAKEVEN',
      maxOpenPositions,
      maxPendingOrders,
      maxCombinedExposure,
      slippageModel: {
        modelType: frictionParams?.slippageModelType ?? 'VOLATILITY_SCALED',
        baseSlippagePips: baseSlippage,
        volatilityMultiplier: volMult,
        additionalSlippagePips: additionalSlippagePips
          + frictionExtraSlippage
          + (options.stressConfig?.slippageAdditionPips ?? 0),
      },
      randomSkippedFillsPercent: skippedFills,
      gapShockMultiplier: options.stressConfig?.gapShockMultiplier ?? 1,
      randomSeed: options.randomSeed ?? 1337,
    });

    const equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[] = [];
    const progressInterval = Math.max(1, Math.floor(evaluationCandlesCount / 20));

    let candidatesCount = 0;
    let candidatesBeforeMtfFilter = 0;
    let candidatesApprovedByMtf = 0;
    let candidatesRejectedByMtf = 0;
    let candidatesInsideSession = 0;
    let candidatesRejectedOutsideSession = 0;
    let ordersRejectedByDailyLoss = 0;
    let ordersRejectedByDrawdownLimit = 0;
    let ordersRejectedByLotRules = 0;
    let rejectedDueToRiskCount = 0;
    let candidatesRejectedByCooldown = 0;
    let candidatesRejectedByDirection = 0;
    let invalidStops = 0;

    let isDailyLossLocked = false;
    let isDrawdownLocked = false;
    let currentDayKey = '';
    let dayStartingEquity = initialCash;
    let lastClosedPositionTimestamp = 0;
    const lastClosedBySymbol: Record<string, number> = {};
    const lastClosedByStrategy: Record<string, number> = {};
    const lastClosedByDirection: Record<string, number> = {};

    const tBacktestStart = performance.now();

    // ─── حلقه اصلی ارزیابی و شبیه‌سازی ──────────────────────────────────────
    for (let i = evaluationStartIndex; i <= evaluationEndIndex; i++) {
      const currentCandle = sanitizedCandles[i];

      // ۱. پردازش اجرای کندل در موتور
      engine.processCandle(currentCandle, symbol);

      // ۲. به‌روزرسانی زمان آخرین معامله بسته شده برای محاسبه دقیق Cooldown (طبق بخش M و حوزه cooldownScope)
      const currentClosedPositions = engine.getLedger().positions.filter(p => !p.isOpen);
      if (currentClosedPositions.length > 0) {
        for (const pos of currentClosedPositions) {
          const closeTs = pos.closedTimestamp || 0;
          if (closeTs > 0) {
            if (closeTs > lastClosedPositionTimestamp) {
              lastClosedPositionTimestamp = closeTs;
            }
            if (!lastClosedBySymbol[pos.symbol] || closeTs > lastClosedBySymbol[pos.symbol]) {
              lastClosedBySymbol[pos.symbol] = closeTs;
            }
            const stratKey = pos.intentId?.split('-')[1] || pos.symbol;
            if (!lastClosedByStrategy[stratKey] || closeTs > lastClosedByStrategy[stratKey]) {
              lastClosedByStrategy[stratKey] = closeTs;
            }
            if (!lastClosedByDirection[pos.direction] || closeTs > lastClosedByDirection[pos.direction]) {
              lastClosedByDirection[pos.direction] = closeTs;
            }
          }
        }
      }

      // ۳. بررسی مرز روز جدید برای محاسبه سقف زیان روزانه
      const candleDayKey = SessionTimezoneEngine.getDayKey(currentCandle.timestamp, userTz, brokerOffset);
      if (candleDayKey !== currentDayKey) {
        currentDayKey = candleDayKey;
        dayStartingEquity = engine.getLedger().equity;
        isDailyLossLocked = false;
      } else if (maxDailyLossPercent && maxDailyLossPercent > 0) {
        const dailyLoss = dayStartingEquity - engine.getLedger().equity;
        if (dailyLoss > 0 && (dailyLoss / dayStartingEquity) * 100 >= maxDailyLossPercent) {
          isDailyLossLocked = true;
        }
      }

      // ۴. بررسی سقف افت کل (Drawdown Limit)
      if (maxTotalDrawdownPercent && maxTotalDrawdownPercent > 0) {
        if (engine.getLedger().maxDrawdownPercent >= maxTotalDrawdownPercent) {
          isDrawdownLocked = true;
        }
      }

      // ۵. بررسی فیلتر سشن و زمان ورود
      const sessionCheck = SessionTimezoneEngine.isEntryAllowed(currentCandle.timestamp, options.sessionConfig);

      // ۶. استخراج کندل تاییدیه HTF بدون نگاه به آینده
      let alignedHtfCandles: Candle[] | undefined = undefined;
      if (mtfCursor) {
        const alignRes = mtfCursor.getClosedCandle(currentCandle.timestamp);
        if (alignRes.alignmentStatus === 'AVAILABLE' && alignRes.candle) {
          // برای شاخص‌های HTF، تمام کندل‌های HTF تا این کندل بسته شده مجازند
          const idx = htfCandlesToUse.findIndex(c => c.timestamp === alignRes.candle!.timestamp);
          if (idx !== -1) {
            alignedHtfCandles = htfCandlesToUse.slice(0, idx + 1);
          }
        } else {
          alignmentFailures++;
        }
      }

      const lookbackStart = Math.max(0, i - lookbackCandles + 1);
      const slice = sanitizedCandles.slice(lookbackStart, i + 1);

      // ۷. ارزیابی استراتژی‌ها و فیلتر MTF
      const evalRes = MultiStyleEngine.evaluate(
        slice,
        symbol,
        style,
        timeframe,
        strategyParameters as StrategyParameters,
        alignedHtfCandles,
        htfTimeframe
      );

      candidatesBeforeMtfFilter += evalRes.allCandidates.length + evalRes.rejectedByMtfCount;
      candidatesRejectedByMtf += evalRes.rejectedByMtfCount;
      const candidate = evalRes.candidate;

      if (candidate) {
        candidatesCount++;
        candidatesApprovedByMtf++;

        if (!sessionCheck.allowed) {
          candidatesRejectedOutsideSession++;
          continue;
        } else {
          candidatesInsideSession++;
        }

        if (isDrawdownLocked) {
          ordersRejectedByDrawdownLimit++;
          continue;
        }

        if (isDailyLossLocked) {
          ordersRejectedByDailyLoss++;
          continue;
        }

        // فیلتر جهت معامله (directionMode)
        const directionMode = strategyParameters?.common?.directionMode || 'BOTH';
        if (directionMode === 'LONG_ONLY' && candidate.direction === 'SELL') {
          candidatesRejectedByDirection++;
          continue;
        }
        if (directionMode === 'SHORT_ONLY' && candidate.direction === 'BUY') {
          candidatesRejectedByDirection++;
          continue;
        }

        // بررسی بار خنک‌سازی (Cooldown Bars) بر مبنای حوزه انتخابی (cooldownScope)
        const cooldownBars = strategyParameters?.common?.cooldownBars ?? 0;
        const cooldownScope = strategyParameters?.common?.cooldownScope || 'PER_SYMBOL';
        if (cooldownBars > 0) {
          let relevantLastCloseTs = 0;
          if (cooldownScope === 'PER_SYMBOL') {
            relevantLastCloseTs = lastClosedBySymbol[candidate.symbol] || 0;
          } else if (cooldownScope === 'PER_STRATEGY') {
            const candStratKey = candidate.id.split('-')[0] || candidate.strategyName;
            relevantLastCloseTs = lastClosedByStrategy[candStratKey] || 0;
          } else if (cooldownScope === 'PER_DIRECTION') {
            relevantLastCloseTs = lastClosedByDirection[candidate.direction] || 0;
          }

          if (relevantLastCloseTs > 0) {
            const tfMs = timeframeToMs(timeframe);
            const elapsedBarsSinceLastClose = Math.floor((currentCandle.timestamp - relevantLastCloseTs) / tfMs);
            if (elapsedBarsSinceLastClose < cooldownBars) {
              candidatesRejectedByCooldown++;
              continue;
            }
          }
        }

        // بررسی سقف پوزیشن‌های باز همزمان (maxOpenPositions)
        const currentOpenPositions = engine.getLedger().positions.filter(p => p.isOpen).length;
        if (currentOpenPositions >= maxOpenPositions) {
          continue;
        }

        // محاسبه حجم بر اساس ریسک و سرمایه
        const dollarRisk = engine.getLedger().equity * (safeRiskPercent / 100);
        const priceDistance = Math.abs(candidate.entryPrice - candidate.stopLossPrice);
        const contractSize = SYMBOL_SPECS[symbol].contractSize;

        if (priceDistance <= 0) {
          invalidStops++;
          continue;
        }

        const rawVolume = dollarRisk / (priceDistance * contractSize);
        const stepMultiplier = Math.round(rawVolume / lotStep);
        let volumeLots = Number((stepMultiplier * lotStep).toFixed(4));

        if (volumeLots > maxLot) {
          ordersRejectedByLotRules++;
          continue;
        }

        if (volumeLots < minLot) {
          const minLotRiskDollar = minLot * priceDistance * contractSize;
          if (minLotRiskDollar > dollarRisk * 1.05) {
            ordersRejectedByLotRules++;
            rejectedDueToRiskCount++;
            continue;
          }
          volumeLots = minLot;
        }

        const orderType =
          strategyParameters?.common?.orderType ||
          (style === 'SCALP_M1_M5' ? 'MARKET' : 'LIMIT');
        const expiryBars =
          strategyParameters?.common?.expiryBars || (style === 'SCALP_M1_M5' ? 3 : 6);
        const expiryTimestamp =
          currentCandle.timestamp + expiryBars * timeframeToMs(timeframe);

        const intent: OrderIntentPayload = {
          intentId: `INT-${candidate.id}-${currentCandle.timestamp}`,
          environment: 'BACKTEST',
          accountNamespace: 'BACKTEST-RUN',
          candidateId: candidate.id,
          symbol: candidate.symbol,
          orderType,
          direction: candidate.direction,
          volumeLots,
          entryPrice: candidate.entryPrice,
          stopLossPrice: candidate.stopLossPrice,
          takeProfitPrice: candidate.takeProfitPrice,
          expiryTimestamp,
          reasonCode: candidate.strategyName,
          createdTimestamp: currentCandle.timestamp,
          idempotencyKey: `${candidate.id}-${currentCandle.timestamp}`,
        };

        engine.submitOrder(intent);
      }

      // ثبت نقاط نمودار دارایی هر ۵ کندل یکبار
      if (i % 5 === 0 || i === evaluationEndIndex) {
        const ledger = engine.getLedger();
        equityCurve.push({
          timestamp: currentCandle.timestamp,
          equity: ledger.equity,
          drawdownPercent: ledger.maxDrawdownPercent,
        });
      }

      // گزارش پیشرفت
      if (options.onProgress && (i % progressInterval === 0 || i === evaluationEndIndex)) {
        const processed = i - evaluationStartIndex + 1;
        options.onProgress(Math.max(1, processed), evaluationCandlesCount);
      }
    }

    const tBacktestDuration = performance.now() - tBacktestStart;

    // د. مدیریت پایان دیتاست (End of Data Policy)
    const lastCandle = sanitizedCandles[evaluationEndIndex];
    const endOfDataResult = lastCandle
      ? engine.finalizeEndOfData(lastCandle, symbol, endOfDataPolicy)
      : { events: [], closedPositionsCount: 0, cancelledOrdersCount: 0, openPositionsCount: 0 };

    const finalLedger = engine.getLedger();

    // ثبت قطعی آخرین نقطه منحنی دارایی
    equityCurve.push({
      timestamp: lastCandle ? lastCandle.timestamp : 0,
      equity: finalLedger.equity,
      drawdownPercent: finalLedger.maxDrawdownPercent,
    });

    const tMetricsStart = performance.now();
    const metrics = this.calculateMetrics(finalLedger.positions, initialCash, equityCurve);

    // تفکیک سشن‌ها و روزهای هفته
    const tradesBySession: Record<string, number> = {};
    const profitBySession: Record<string, number> = {};
    const tradesByWeekday: Record<string, number> = {
      Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0,
    };
    const profitByWeekday: Record<string, number> = {
      Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0,
    };

    const closedTrades = finalLedger.positions.filter(p => !p.isOpen);
    const weekdayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (const pos of closedTrades) {
      const sess = SessionTimezoneEngine.getCurrentActiveSessionName(pos.openedTimestamp);
      tradesBySession[sess] = (tradesBySession[sess] || 0) + 1;
      profitBySession[sess] = Number(((profitBySession[sess] || 0) + pos.realizedPnl).toFixed(2));

      const localOpened = SessionTimezoneEngine.getLocalTime(pos.openedTimestamp, userTz, brokerOffset);
      const wd = weekdayNames[localOpened.dayOfWeek] || 'Unknown';
      tradesByWeekday[wd] = (tradesByWeekday[wd] || 0) + 1;
      profitByWeekday[wd] = Number(((profitByWeekday[wd] || 0) + pos.realizedPnl).toFixed(2));
    }

    // توضیح منطقی در صورت عدم وجود معامله بسته
    let zeroTradeRationale: string | undefined;
    if (metrics.totalTrades === 0) {
      if (candidatesCount === 0) {
        if (candidatesRejectedByMtf > 0) {
          zeroTradeRationale = `تعداد ${candidatesRejectedByMtf} کاندیدا شناسایی شد اما تمام آن‌ها به دلیل مغایرت با فیلتر چندتایم‌فریمی (${mtfConfig?.higherTimeframeFilterMode || 'MTF'}) رد شدند.`;
        } else {
          zeroTradeRationale = 'با تنظیمات و فیلترهای جاری استراتژی، هیچ کاندیدای واجد شرایطی تشکیل نشد.';
        }
      } else if (candidatesRejectedOutsideSession > 0 && candidatesInsideSession === 0) {
        zeroTradeRationale = `تعداد ${candidatesRejectedOutsideSession} کاندیدا شناسایی شد اما تمام آن‌ها به دلیل خارج بودن از سشن (${options.sessionConfig?.session || 'ALL'}) رد شدند.`;
      } else if (engine.diagnostics.rejectedByPendingOrderLimit > 0 && engine.diagnostics.limitOrdersSubmitted === 0) {
        zeroTradeRationale = 'سقف سفارش‌های معلق مانع از ثبت سفارش جدید شد.';
      } else if (engine.diagnostics.limitOrdersSubmitted > 0 && engine.diagnostics.limitOrdersFilled === 0) {
        zeroTradeRationale = `تعداد ${engine.diagnostics.limitOrdersSubmitted} سفارش ثبت شد اما همگی منقضی شدند (${engine.diagnostics.ordersExpired} انقضا).`;
      } else {
        zeroTradeRationale = 'بک‌تست کامل شد اما هیچ معامله نهایی بسته‌شده‌ای حاصل نشد.';
      }
    }

    const tMetricsDuration = performance.now() - tMetricsStart;

    metrics.diagnostics = {
      candidatesCount,
      candidatesBeforeMtfFilter,
      candidatesApprovedByMtf,
      candidatesRejectedByMtf,
      candidatesRejectedBySession: candidatesRejectedOutsideSession,
      candidatesRejectedByDirection,
      candidatesRejectedByCooldown,
      invalidStops,
      duplicateOrdersRejected: engine.diagnostics.duplicateOrdersRejected,
      ordersSubmitted: engine.diagnostics.marketOrdersSubmitted + engine.diagnostics.limitOrdersSubmitted + engine.diagnostics.stopOrdersSubmitted,
      ordersFilled: engine.diagnostics.marketOrdersFilled + engine.diagnostics.limitOrdersFilled + engine.diagnostics.stopOrdersFilled,
      marketOrdersSubmitted: engine.diagnostics.marketOrdersSubmitted,
      marketOrdersFilled: engine.diagnostics.marketOrdersFilled,
      limitOrdersSubmitted: engine.diagnostics.limitOrdersSubmitted,
      limitOrdersFilled: engine.diagnostics.limitOrdersFilled,
      stopOrdersSubmitted: engine.diagnostics.stopOrdersSubmitted,
      stopOrdersFilled: engine.diagnostics.stopOrdersFilled,
      ordersExpired: engine.diagnostics.ordersExpired,
      ordersCancelledAtEnd: endOfDataResult.cancelledOrdersCount,
      positionsClosedAtEnd: endOfDataResult.closedPositionsCount,
      positionsOpenAtEnd: endOfDataResult.openPositionsCount,
      rejectedDueToRiskCount,
      breakevenActivatedCount: engine.diagnostics.breakevenActivatedCount,
      breakevenExitCount: engine.diagnostics.breakevenExitCount,
      breakevenSavedLossCount: engine.diagnostics.breakevenSavedLossCount,
      partialTakeProfitCount: engine.diagnostics.partialTakeProfitCount,
      gapEntryCount: engine.diagnostics.gapEntryCount,
      gapExitCount: engine.diagnostics.gapExitCount,
      ambiguousExitCount: engine.diagnostics.ambiguousExitCount,
      higherTimeframeSource: reportedHtfSource,
      higherTimeframeCandlesUsed: htfCandlesToUse.length,
      alignmentFailures,
      nonRecommendedConfiguration,
      zeroTradeRationale,
      selectedDateRange: {
        earliestCandle,
        latestCandle,
        totalAvailableCandles,
        selectedStart,
        selectedEnd,
        evaluationCandles: evaluationCandlesCount,
        warmupCandles: warmupCandlesCount,
      },
      selectedSessions: options.sessionConfig?.session ? [options.sessionConfig.session] : ['ALL'],
      selectedWeekdays: options.sessionConfig?.selectedWeekdays || [1, 2, 3, 4, 5],
      timezone: userTz,
      initialCapital: initialCash,
      finalBalance: finalLedger.cashBalance,
      finalEquity: finalLedger.equity,
      returnPercent: Number((((finalLedger.equity - initialCash) / initialCash) * 100).toFixed(2)),
      candidatesInsideSession,
      candidatesRejectedOutsideSession,
      ordersRejectedByDailyLoss,
      ordersRejectedByDrawdownLimit,
      ordersRejectedByLotRules,
      rejectedByOpenPositionLimit: engine.diagnostics.rejectedByOpenPositionLimit,
      rejectedByPendingOrderLimit: engine.diagnostics.rejectedByPendingOrderLimit,
      rejectedByCombinedExposureLimit: engine.diagnostics.rejectedByCombinedExposureLimit,
      tradesBySession,
      profitBySession,
      tradesByWeekday,
      profitByWeekday,
      accountCurrency: options.accountConfig?.accountCurrency || 'USD',
      maxConcurrentPositions: maxConcurrent,
      datasetPassport,
      rejectedOrdersBreakdown: [
        { reason: 'daily_loss_limit_reached', count: ordersRejectedByDailyLoss },
        { reason: 'max_drawdown_reached', count: ordersRejectedByDrawdownLimit },
        { reason: 'lot_rules_rejected', count: ordersRejectedByLotRules },
        { reason: 'outside_session', count: candidatesRejectedOutsideSession },
        { reason: 'unsafe_risk_min_lot', count: rejectedDueToRiskCount },
        { reason: 'mtf_filter_rejected', count: candidatesRejectedByMtf },
        { reason: 'open_position_limit_reached', count: engine.diagnostics.rejectedByOpenPositionLimit },
        { reason: 'pending_order_limit_reached', count: engine.diagnostics.rejectedByPendingOrderLimit },
        { reason: 'combined_exposure_limit_reached', count: engine.diagnostics.rejectedByCombinedExposureLimit },
        { reason: 'cooldown_active', count: candidatesRejectedByCooldown },
      ],
      timingDataPreparationMs: Number(tPrepDuration.toFixed(1)),
      timingAggregationMs: Number(tAggDuration.toFixed(1)),
      timingIndicatorsMs: 0,
      timingBacktestMs: Number(tBacktestDuration.toFixed(1)),
      timingMetricsMs: Number(tMetricsDuration.toFixed(1)),
    };

    metrics.datasetPassport = datasetPassport;

    return {
      metrics,
      trades: finalLedger.positions,
    };
  }

  // ۲. محاسبه آماری متریک‌ها
  public static calculateMetrics(
    positions: PositionLedgerEntry[],
    initialCash: number,
    equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[]
  ): PerformanceMetrics {
    const closed = positions.filter(p => !p.isOpen);
    const totalTrades = closed.length;

    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        breakEvenTrades: 0,
        winRatePercent: 0,
        profitFactor: 0,
        payoffRatio: 0,
        expectancyR: 0,
        netProfit: 0,
        netProfitPercent: 0,
        maxDrawdownAmount: 0,
        maxDrawdownPercent: 0,
        recoveryFactor: 0,
        totalCommissions: 0,
        avgMaePips: 0,
        avgMfePips: 0,
        equityCurve,
        ambiguousTradesCount: 0,
      };
    }

    let winningTrades = 0;
    let losingTrades = 0;
    let breakEvenTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalCommissions = 0;
    let totalSpreadCostDollar = 0;
    let totalSlippageCostDollar = 0;
    let totalMae = 0;
    let totalMfe = 0;
    let ambiguousTradesCount = 0;

    for (const pos of closed) {
      totalCommissions += pos.commissionPaid;
      totalSpreadCostDollar += pos.spreadCostDollar || 0;
      totalSlippageCostDollar += pos.slippageCostDollar || 0;
      totalMae += pos.maePips;
      totalMfe += pos.mfePips;

      if (pos.realizedPnl > 0.001) {
        winningTrades++;
        grossProfit += pos.realizedPnl;
      } else if (pos.realizedPnl < -0.001) {
        losingTrades++;
        grossLoss += Math.abs(pos.realizedPnl);
      } else {
        breakEvenTrades++;
      }
    }

    const netProfit = Number((grossProfit - grossLoss).toFixed(2));
    const netProfitPercent = Number(((netProfit / initialCash) * 100).toFixed(2));
    const winRatePercent = Number(((winningTrades / totalTrades) * 100).toFixed(1));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.99 : 0;
    const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 1;
    const payoffRatio = Number((avgWin / avgLoss).toFixed(2));
    const expectancyR = Number(((winRatePercent / 100) * payoffRatio - (1 - winRatePercent / 100)).toFixed(2));

    const frictionCostDollar = Number((totalCommissions + totalSpreadCostDollar + totalSlippageCostDollar).toFixed(2));
    const frictionToGrossProfitRatio = grossProfit > 0 ? Number((frictionCostDollar / grossProfit).toFixed(3)) : 0;

    let maxDdAmount = 0;
    let maxDdPercent = 0;
    for (const pt of equityCurve) {
      if (pt.drawdownPercent > maxDdPercent) maxDdPercent = pt.drawdownPercent;
    }

    const recoveryFactor = maxDdAmount > 0 ? Number((netProfit / maxDdAmount).toFixed(2)) : 0;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      breakEvenTrades,
      winRatePercent,
      profitFactor,
      payoffRatio,
      expectancyR,
      netProfit,
      netProfitPercent,
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      totalSpreadCostDollar: Number(totalSpreadCostDollar.toFixed(2)),
      totalSlippageCostDollar: Number(totalSlippageCostDollar.toFixed(2)),
      frictionCostDollar,
      frictionToGrossProfitRatio,
      maxDrawdownAmount: Number(maxDdAmount.toFixed(2)),
      maxDrawdownPercent: Number(maxDdPercent.toFixed(2)),
      recoveryFactor,
      totalCommissions: Number(totalCommissions.toFixed(2)),
      avgMaePips: Number((totalMae / totalTrades).toFixed(1)),
      avgMfePips: Number((totalMfe / totalTrades).toFixed(1)),
      equityCurve,
      ambiguousTradesCount,
    };
  }

  // ۳. شبیه‌سازی مونت‌کارلو قطعی
  public static runMonteCarlo(
    trades: PositionLedgerEntry[],
    initialCash = 10000,
    iterations = 500,
    seed?: number
  ): MonteCarloSimulationResult {
    const closed = trades.filter(t => !t.isOpen);
    if (closed.length === 0) {
      return {
        iterations,
        medianMaxDrawdownPercent: 0,
        percentile95MaxDrawdownPercent: 0,
        riskOfRuinPercent: 0,
        medianProfit: 0,
        worstCaseProfit: 0,
        bestCaseProfit: 0,
        samplePaths: [],
      };
    }

    const profits = closed.map(t => t.realizedPnl);
    const rng = seed !== undefined ? new SeededRNG(seed) : null;
    const getRandom = () => (rng ? rng.next() : Math.random());

    const maxDrawdowns: number[] = [];
    const finalProfits: number[] = [];
    let ruinsCount = 0;
    const samplePaths: { pathIndex: number; points: number[] }[] = [];

    for (let iter = 0; iter < iterations; iter++) {
      let equity = initialCash;
      let peak = initialCash;
      let maxDd = 0;
      const path: number[] = [initialCash];

      for (let step = 0; step < profits.length; step++) {
        const randomIndex = Math.floor(getRandom() * profits.length);
        equity += profits[randomIndex];
        path.push(equity);

        if (equity > peak) peak = equity;
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDd) maxDd = dd;

        if (equity <= initialCash * 0.5) {
          ruinsCount++;
          break;
        }
      }

      maxDrawdowns.push(maxDd);
      finalProfits.push(equity - initialCash);

      if (iter < 5) {
        samplePaths.push({ pathIndex: iter, points: path });
      }
    }

    maxDrawdowns.sort((a, b) => a - b);
    finalProfits.sort((a, b) => a - b);

    const medianMaxDrawdownPercent = Number((maxDrawdowns[Math.floor(iterations * 0.5)] || 0).toFixed(1));
    const percentile95MaxDrawdownPercent = Number((maxDrawdowns[Math.floor(iterations * 0.95)] || 0).toFixed(1));
    const riskOfRuinPercent = Number(((ruinsCount / iterations) * 100).toFixed(1));
    const medianProfit = Number((finalProfits[Math.floor(iterations * 0.5)] || 0).toFixed(2));
    const worstCaseProfit = Number((finalProfits[0] || 0).toFixed(2));
    const bestCaseProfit = Number((finalProfits[iterations - 1] || 0).toFixed(2));

    return {
      iterations,
      medianMaxDrawdownPercent,
      percentile95DrawdownPercent: percentile95MaxDrawdownPercent,
      percentile95MaxDrawdownPercent,
      riskOfRuinPercent,
      medianProfit,
      worstCaseProfit,
      bestCaseProfit,
      samplePaths,
    };
  }

  // ۴. آزمایش پیش‌روچندپنجره‌ای (Walk-Forward Optimization)
  public static runWalkForward(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    windowsCount = 3,
    options: {
      initialCash?: number;
      commissionPerLot?: number;
      defaultSpreadPips?: number;
      additionalSlippagePips?: number;
      style?: TradingStyleType | 'ALL';
      timeframe?: Timeframe;
      riskPercent?: number;
      strategyParameters?: StrategyParameters;
      endOfDataPolicy?: EndOfDataPolicy;
    } = {}
  ): WalkForwardWindow[] {
    if (candles.length < 60) return [];

    const totalCandles = candles.length;
    const windows: WalkForwardWindow[] = [];

    for (let w = 0; w < windowsCount; w++) {
      const trainStart = 0;
      const trainEnd = Math.floor(totalCandles * ((w + 1) / (windowsCount + 1)));
      const valStart = trainEnd;
      const valEnd = Math.min(totalCandles, Math.floor(totalCandles * ((w + 2) / (windowsCount + 1))));

      if (valEnd <= valStart) continue;

      const trainSlice = candles.slice(trainStart, trainEnd);
      const valSlice = candles.slice(valStart, valEnd);

      const trainRun = this.runBacktest(trainSlice, symbol, options);
      const valRun = this.runBacktest(valSlice, symbol, options);

      const trainProfit = Math.max(1, trainRun.metrics.netProfit);
      const valProfit = valRun.metrics.netProfit;
      const efficiencyRatio = Number((valProfit / trainProfit).toFixed(2));

      windows.push({
        windowIndex: w + 1,
        trainStartTime: trainSlice[0].timestamp,
        trainEndTime: trainSlice[trainSlice.length - 1].timestamp,
        valStartTime: valSlice[0].timestamp,
        valEndTime: valSlice[valSlice.length - 1].timestamp,
        trainMetrics: trainRun.metrics,
        validationMetrics: valRun.metrics,
        efficiencyRatio,
      });
    }

    return windows;
  }

  // ۵. تست تنش و تاب‌آوری (Stress Testing)
  public static runStressTests(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    options: {
      initialCash?: number;
      style?: TradingStyleType | 'ALL';
      timeframe?: Timeframe;
      riskPercent?: number;
      strategyParameters?: StrategyParameters;
    } = {}
  ): StressTestScenarioResult[] {
    const spec = SYMBOL_SPECS[symbol];
    const baseSpread = spec.typicalSpreadPips;
    const comm = spec.commissionPerLot;

    const baseRun = this.runBacktest(candles, symbol, {
      ...options,
      defaultSpreadPips: baseSpread,
      commissionPerLot: comm,
      additionalSlippagePips: 0,
    });

    const scenarios: StressTestScenarioResult[] = [
      {
        scenarioName: 'سناریوی مبنا (Baseline)',
        description: `اسپرد استاندارد ${baseSpread} پیپ و کارمزد ${comm} دلار برای نماد ${symbol}`,
        spreadMultiplier: 1.0,
        additionalSlippagePips: 0,
        netProfit: baseRun.metrics.netProfit,
        maxDrawdownPercent: baseRun.metrics.maxDrawdownPercent,
        profitFactor: baseRun.metrics.profitFactor,
        expectancyR: baseRun.metrics.expectancyR,
        status: 'ROBUST',
        metrics: baseRun.metrics,
        passedRiskGate: true,
      },
    ];

    // تنش ۱: افزایش اسپرد به ۲ برابر (زمان اخبار اقتصادی)
    const wideSpread = Number((baseSpread * 2).toFixed(1));
    const wideSpreadRun = this.runBacktest(candles, symbol, {
      ...options,
      defaultSpreadPips: wideSpread,
      commissionPerLot: comm,
      additionalSlippagePips: 0.5,
    });
    scenarios.push({
      scenarioName: 'اسپرد فشرده اخبار (+100% Spread)',
      description: `اسپرد ${wideSpread} پیپ و لغزش ۰.۵ پیپ به علت کاهش نقدینگی`,
      spreadMultiplier: 2.0,
      additionalSlippagePips: 0.5,
      netProfit: wideSpreadRun.metrics.netProfit,
      maxDrawdownPercent: wideSpreadRun.metrics.maxDrawdownPercent,
      profitFactor: wideSpreadRun.metrics.profitFactor,
      expectancyR: wideSpreadRun.metrics.expectancyR,
      status: wideSpreadRun.metrics.netProfit >= 0 ? 'ROBUST' : 'DEGRADED',
      metrics: wideSpreadRun.metrics,
      passedRiskGate: wideSpreadRun.metrics.netProfit >= 0,
    });

    // تنش ۲: لغزش شدید قیمت (Slippage Stress)
    const shockSlippage = symbol === 'XAUUSD' ? 1.0 : 1.5;
    const slippageRun = this.runBacktest(candles, symbol, {
      ...options,
      defaultSpreadPips: Number((baseSpread * 1.5).toFixed(1)),
      commissionPerLot: Number((comm * 1.5).toFixed(2)),
      additionalSlippagePips: shockSlippage,
    });
    scenarios.push({
      scenarioName: 'لغزش و گپ اجرایی شدید',
      description: `افزایش لغزش ${shockSlippage} پیپ روی تمامی اوردرها و ۵۰٪ کارمزد اضافی`,
      spreadMultiplier: 1.5,
      additionalSlippagePips: shockSlippage,
      netProfit: slippageRun.metrics.netProfit,
      maxDrawdownPercent: slippageRun.metrics.maxDrawdownPercent,
      profitFactor: slippageRun.metrics.profitFactor,
      expectancyR: slippageRun.metrics.expectancyR,
      status:
        slippageRun.metrics.profitFactor > 1.1
          ? 'ROBUST'
          : slippageRun.metrics.profitFactor >= 0.9
          ? 'DEGRADED'
          : 'FAILED',
      metrics: slippageRun.metrics,
      passedRiskGate: slippageRun.metrics.profitFactor >= 0.9,
    });

    return scenarios;
  }
}
