// lib/core/rule-registry.ts
// رجیستری رسمی تعاریف قوانین و مفسرهای قطعی (Package 4A.1 Rules Registry)
// اجرای امن بدون eval، دریافت کامل RuleEvaluationContext، کنترل قابلیت‌های داده، و وارم‌آپ پارامتری

import type {
  RuleDefinition,
  RuleInstance,
  RuleEvaluationResult,
  RuleEvaluationContext,
  DataCapability,
} from '../contracts/strategy-definition';
import { getCandleCloseTimestamp, SYMBOL_SPECS, roundSymbolPrice } from '../contracts/market';
import { SmcPrimitives } from './smc-primitives';
import { TechnicalPrimitives } from './technical-primitives';
import { computeDeterministicFingerprint } from './strategy-definition-serializer';
import { calculateWilderATR } from './atr';

export type RuleEvaluatorFn = (
  instance: RuleInstance,
  context: RuleEvaluationContext
) => RuleEvaluationResult;

export interface RuleInventoryReport {
  registeredActive: string[];
  deferred: Array<{ ruleId: string; reasonFa: string }>;
}

export class RuleRegistry {
  private static definitions = new Map<string, RuleDefinition>();
  private static evaluators = new Map<string, RuleEvaluatorFn>();

  public static registerRule(def: RuleDefinition, evaluator: RuleEvaluatorFn): void {
    const key = `${def.ruleId}@${def.ruleVersion}`;
    this.definitions.set(key, def);
    this.evaluators.set(key, evaluator);
  }

  public static getDefinition(ruleId: string, ruleVersion: string): RuleDefinition | undefined {
    return this.definitions.get(`${ruleId}@${ruleVersion}`);
  }

  public static getEvaluator(ruleId: string, ruleVersion: string): RuleEvaluatorFn | undefined {
    return this.evaluators.get(`${ruleId}@${ruleVersion}`);
  }

  public static getAllDefinitions(): RuleDefinition[] {
    return Array.from(this.definitions.values());
  }

  public static getRuleInventory(): RuleInventoryReport {
    const registered = Array.from(this.definitions.values()).map(d => `${d.ruleId}@${d.ruleVersion}`);
    return {
      registeredActive: registered,
      deferred: [
        {
          ruleId: 'SMC_MITIGATION',
          reasonFa: 'نیازمند موتور ردگیری چرخه حیات سطوح به صورت تیک به تیک در Package 4B',
        },
        {
          ruleId: 'SMC_INVALIDATION',
          reasonFa: 'وابسته به مدل ابطال ساختار ماژولار در Package 4B',
        },
        {
          ruleId: 'TECH_ICHIMOKU_TENKAN_KIJUN',
          reasonFa: 'موکول‌شده به پکیج تحلیل سیستم‌های ابر کومو در Package 4B',
        },
        {
          ruleId: 'TECH_ICHIMOKU_KIJUN_PULLBACK',
          reasonFa: 'موکول‌شده به استراتژی‌های ترکیبی ایچیموکو در Package 4B',
        },
      ],
    };
  }

  /**
   * ارزیابی یک RuleInstance با دریافت کامل RuleEvaluationContext
   */
  public static evaluateInstance(
    instance: RuleInstance,
    context: RuleEvaluationContext
  ): RuleEvaluationResult {
    const key = `${instance.ruleId}@${instance.ruleVersion}`;
    const def = this.definitions.get(key);
    const evaluator = this.evaluators.get(key);
    const currentCandle = context.candles[context.currentIndex];
    const timestamp = currentCandle?.timestamp || 0;
    const closeTime = currentCandle ? getCandleCloseTimestamp(currentCandle, context.timeframe) : timestamp;

    if (!def || !evaluator) {
      return {
        ruleId: instance.ruleId,
        ruleVersion: instance.ruleVersion,
        instanceId: instance.instanceId,
        category: 'TRIGGER',
        status: 'NOT_AVAILABLE',
        eventTime: timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: context.evaluatedAt,
        inputFingerprint: '',
        parameterHash: '',
        evidenceRefs: {},
        actualValues: {},
        thresholdValues: {},
        reasonCodes: ['RULE_NOT_REGISTERED'],
        diagnosticMessageFa: `قاعده ${instance.ruleId} نسخه ${instance.ruleVersion} در رجیستری یافت نشد.`,
      };
    }

    // ۱. بررسی تطابق قابلیت‌های داده موردنیاز (Data Capabilities)
    // الزام Package 4A.1: اگر حجم واقعی درخواست شود، حجم دیتاست باید صریحاً REAL_SOURCE_VOLUME باشد نه SYNTHETIC یا MISSING
    const missingCaps: string[] = [];
    for (const cap of def.requiredCapabilities) {
      if (!context.availableCapabilities.includes(cap)) {
        missingCaps.push(cap);
      } else if (cap === 'REAL_SOURCE_VOLUME' && context.volumeType !== 'REAL_SOURCE_VOLUME') {
        missingCaps.push(`REAL_SOURCE_VOLUME (دیتاست دارای نوع ${context.volumeType || 'MISSING'} است)`);
      } else if (cap === 'TICK_VOLUME' && context.volumeType !== 'TICK_VOLUME' && context.volumeType !== 'REAL_SOURCE_VOLUME') {
        missingCaps.push(`TICK_VOLUME (نوع حجم ${context.volumeType || 'MISSING'} نامعتبر است)`);
      }
    }

    if (missingCaps.length > 0) {
      return {
        ruleId: def.ruleId,
        ruleVersion: def.ruleVersion,
        instanceId: instance.instanceId,
        category: def.category,
        status: 'NOT_AVAILABLE',
        eventTime: timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: context.evaluatedAt,
        inputFingerprint: '',
        parameterHash: computeDeterministicFingerprint(instance.parameters),
        evidenceRefs: {},
        actualValues: { missingCapabilities: missingCaps, volumeType: context.volumeType },
        thresholdValues: { requiredCapabilities: def.requiredCapabilities },
        reasonCodes: ['DATA_CAPABILITY_MISSING'],
        diagnosticMessageFa: `داده جاری فاقد قابلیت‌های لازم برای این قاعده است: ${missingCaps.join(', ')}`,
      };
    }

    // ۲. بررسی نیازمندی‌های وارم‌آپ کندل بر مبنای محاسبه دقیق پارامتری (Package 4A.1)
    const requiredWarmup = def.computeWarmupBars
      ? def.computeWarmupBars(instance.parameters)
      : def.warmupRequirements;

    const availableBars = context.currentIndex + 1; // ایندکس ۰ یعنی ۱ کندل موجود است
    if (availableBars < requiredWarmup) {
      return {
        ruleId: def.ruleId,
        ruleVersion: def.ruleVersion,
        instanceId: instance.instanceId,
        category: def.category,
        status: 'NOT_AVAILABLE',
        eventTime: timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: context.evaluatedAt,
        inputFingerprint: '',
        parameterHash: computeDeterministicFingerprint(instance.parameters),
        evidenceRefs: {},
        actualValues: { availableBars },
        thresholdValues: { requiredBars: requiredWarmup },
        reasonCodes: ['WARMUP_INSUFFICIENT'],
        diagnosticMessageFa: `تعداد کندل‌های وارم‌آپ کافی نیست (${availableBars} موجود است، به ${requiredWarmup} کندل نیاز است)`,
      };
    }

    return evaluator(instance, context);
  }
}

// ============================================================================
// ثبت تعاریف رسمی قوانین در رجیستری (Package 4A.1 Active Rule Suite)
// ============================================================================

// ۱. سوییپ نقدینگی (SMC_LIQUIDITY_SWEEP)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_LIQUIDITY_SWEEP',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'سوییپ نقدینگی سطوح کلیدی (Liquidity Sweep)',
    nameEn: 'SMC Liquidity Sweep',
    descriptionFa: 'شناسایی نفوذ شدو فراتر از سقف یا کف سووینگ تاییدشده و بسته شدن کلوز داخل سطح.',
    parameterSchema: {
      minPenetrationPips: { type: 'number', default: 0.5, min: 0.1, max: 10, descriptionFa: 'حداقل عمق نفوذ پیپ' },
      reclaimMode: { type: 'enum', default: 'CLOSE_RECLAIM', options: ['CLOSE_RECLAIM', 'WICK_REJECTION'], descriptionFa: 'نوع بازپس‌گیری سطح' },
    },
    defaultParameters: { minPenetrationPips: 0.5, reclaimMode: 'CLOSE_RECLAIM' },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    computeWarmupBars: () => 15,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-sweep',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), 2, 2, ctx.timeframe);
    const p = instance.parameters as { minPenetrationPips?: number; reclaimMode?: 'CLOSE_RECLAIM' | 'WICK_REJECTION' };
    const res = SmcPrimitives.evaluateLiquiditySweep(c, ctx.currentIndex, swings, ctx.symbol, p.reclaimMode || 'CLOSE_RECLAIM', p.minPenetrationPips || 0.5);

    // انطباق جهت: برای BUY سوییپ کف (LOW_SWEEP)، برای SELL سوییپ سقف (HIGH_SWEEP) الزامی است
    const directionMatched = ctx.direction === 'BUY' ? res.type === 'LOW_SWEEP' : res.type === 'HIGH_SWEEP';
    const passed = res.detected && directionMatched;

    return {
      ruleId: 'SMC_LIQUIDITY_SWEEP',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && res.evidenceId ? { sweepId: res.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { detected: res.detected, penetrationPips: res.penetrationPips, sweepType: res.type, direction: ctx.direction },
      thresholdValues: { minPenetrationPips: p.minPenetrationPips || 0.5, reclaimMode: p.reclaimMode || 'CLOSE_RECLAIM' },
      reasonCodes: passed ? ['LIQUIDITY_SWEEP_CONFIRMED'] : ['NO_LIQUIDITY_SWEEP_MATCH'],
      diagnosticMessageFa: passed ? `سوییپ نقدینگی ${res.type} متناسب با جهت ${ctx.direction} تایید شد.` : 'سوییپ نقدینگی معتبری هماهنگ با جهت معامله مشاهده نشد.',
    };
  }
);

// ۲. شکست ساختار (SMC_BOS)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_BOS',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'شکست ساختار بازار (Break of Structure - BOS)',
    nameEn: 'SMC Break of Structure',
    descriptionFa: 'شکست سقف یا کف سووینگ تاییدشده با کلوز کندل یا نفوذ شدو.',
    parameterSchema: {
      breakMode: { type: 'enum', default: 'CLOSE_BREAK', options: ['CLOSE_BREAK', 'WICK_BREAK'], descriptionFa: 'حالت شکست' },
      bufferPips: { type: 'number', default: 0, min: 0, max: 5, descriptionFa: 'بافر نفوذ پیپ' },
    },
    defaultParameters: { breakMode: 'CLOSE_BREAK', bufferPips: 0 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: () => 20,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-bos',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), 2, 2, ctx.timeframe);
    const p = instance.parameters as { breakMode?: 'CLOSE_BREAK' | 'WICK_BREAK'; bufferPips?: number };
    const res = SmcPrimitives.evaluateBos(c, ctx.currentIndex, swings, ctx.symbol, p.breakMode || 'CLOSE_BREAK', p.bufferPips || 0);

    const directionMatched = ctx.direction === 'BUY' ? res.type === 'BULLISH' : res.type === 'BEARISH';
    const passed = res.detected && directionMatched;

    return {
      ruleId: 'SMC_BOS',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && res.evidenceId ? { bosId: res.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { detected: res.detected, breakType: res.breakType, direction: res.type, requestedDirection: ctx.direction },
      thresholdValues: { breakMode: p.breakMode || 'CLOSE_BREAK', bufferPips: p.bufferPips || 0 },
      reasonCodes: passed ? ['BOS_CONFIRMED'] : ['NO_BOS_MATCH'],
      diagnosticMessageFa: passed ? `شکست ساختار ${res.type} متناسب با جهت ${ctx.direction} رخ داد.` : 'شکست ساختاری معتبری رخ نداد.',
    };
  }
);

// ۳. شکاف ارزش منصفانه (SMC_FVG)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_FVG',
    ruleVersion: '1.0.0',
    category: 'SETUP',
    nameFa: 'شکاف ارزش منصفانه ۳ کندلی (Fair Value Gap)',
    nameEn: 'SMC Fair Value Gap',
    descriptionFa: 'تشکیل گپ قیمتی ۳ کندلی بین سقف کندل اول و کف کندل سوم.',
    parameterSchema: {
      measurementMode: { type: 'enum', default: 'WICK_TO_WICK', options: ['WICK_TO_WICK', 'BODY_TO_BODY'], descriptionFa: 'نحوه محاسبه گپ' },
      minGapPips: { type: 'number', default: 0, min: 0, max: 10, descriptionFa: 'حداقل اندازه گپ پیپ' },
    },
    defaultParameters: { measurementMode: 'WICK_TO_WICK', minGapPips: 0 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 3,
    computeWarmupBars: () => 3,
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-fvg',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { measurementMode?: 'WICK_TO_WICK' | 'BODY_TO_BODY'; minGapPips?: number };
    const res = SmcPrimitives.detectFvg(ctx.candles, ctx.currentIndex, p.measurementMode || 'WICK_TO_WICK', p.minGapPips || 0, ctx.symbol);

    const directionMatched = res !== null && (ctx.direction === 'BUY' ? res.type === 'BULLISH' : res.type === 'BEARISH');
    const passed = directionMatched;

    return {
      ruleId: 'SMC_FVG',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'SETUP',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: res ? res.formedAtTimestamp : c.timestamp,
      observedAt: closeTime,
      availableAt: res ? res.availableAt : closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && res ? { fvgId: res.id } : {}) as Record<string, string | number>,
      actualValues: res ? { type: res.type, midpoint: res.midpoint, top: res.top, bottom: res.bottom, direction: ctx.direction } : { detected: false },
      thresholdValues: { minGapPips: p.minGapPips || 0, measurementMode: p.measurementMode || 'WICK_TO_WICK' },
      reasonCodes: passed ? ['FVG_FORMED'] : ['NO_FVG_MATCH'],
      diagnosticMessageFa: passed ? `تشکیل FVG ${res?.type} هماهنگ با جهت ${ctx.direction}.` : 'گپ ارزش منصفانه هماهنگ با جهت تشکیل نشد.',
    };
  }
);

// ۴. وضعیت روند EMA (TECH_EMA_POSITION)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_EMA_POSITION',
    ruleVersion: '1.0.0',
    category: 'CONTEXT',
    nameFa: 'فیلتر جایگاه روند میانگین متحرک نمایی (EMA)',
    nameEn: 'EMA Trend Position',
    descriptionFa: 'بررسی قرارگیری کلوز کندل در بالای EMA (صعودی) یا پایین آن (نزولی).',
    parameterSchema: {
      period: { type: 'number', default: 50, min: 5, max: 500, descriptionFa: 'دوره زمانی EMA' },
      requiredPosition: { type: 'enum', default: 'ABOVE', options: ['ABOVE', 'BELOW'], descriptionFa: 'جایگاه الزامی' },
    },
    defaultParameters: { period: 50, requiredPosition: 'ABOVE' },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 50,
    computeWarmupBars: (params) => Math.max(10, ((params as { period?: number })?.period || 50) + 1),
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-ema-pos',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { period?: number; requiredPosition?: 'ABOVE' | 'BELOW' };
    const period = p.period || 50;
    const closes = ctx.candles.slice(0, ctx.currentIndex + 1).map(x => x.close);
    const emas = TechnicalPrimitives.calculateEma(closes, period);
    const pos = TechnicalPrimitives.evaluateEmaPosition(c, emas, ctx.currentIndex);

    // همگام‌سازی جهت: اگر جهت معامله BUY است، پیش‌فرض موقعیت ABOVE است و برای SELL موقعیت BELOW
    const targetPosition = p.requiredPosition || (ctx.direction === 'BUY' ? 'ABOVE' : 'BELOW');
    const passed = pos.position === targetPosition;

    return {
      ruleId: 'TECH_EMA_POSITION',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'CONTEXT',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { currentPosition: pos.position, emaValue: pos.emaValue, distancePercent: pos.distancePercent, direction: ctx.direction },
      thresholdValues: { requiredPosition: targetPosition, period },
      reasonCodes: passed ? ['EMA_POSITION_MATCHED'] : ['EMA_POSITION_MISMATCHED'],
      diagnosticMessageFa: passed ? `قیمت در موقعیت مطلوب ${pos.position} نسبت به EMA${period} برای جهت ${ctx.direction} قرار دارد.` : `قیمت مخالف جهت مطلوب (${pos.position}) است.`,
    };
  }
);

// ۵. شکست کانال دانچیان (TECH_DONCHIAN_BREAKOUT)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_DONCHIAN_BREAKOUT',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'شکست سقف یا کف کانال دانچیان (Donchian)',
    nameEn: 'Donchian Breakout',
    descriptionFa: 'شکست کلوز بالاتر از بالاترین سقف یا پایین‌تر از پایین‌ترین کف در N کندل گذشته.',
    parameterSchema: {
      period: { type: 'number', default: 20, min: 5, max: 200, descriptionFa: 'طول دوره کانال' },
      requiredBreakout: { type: 'enum', default: 'UP', options: ['UP', 'DOWN'], descriptionFa: 'جهت شکست' },
    },
    defaultParameters: { period: 20, requiredBreakout: 'UP' },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: (params) => ((params as { period?: number })?.period || 20) + 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-donchian',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { period?: number; requiredBreakout?: 'UP' | 'DOWN' };
    const period = p.period || 20;
    const res = TechnicalPrimitives.evaluateDonchianBreakout(ctx.candles, ctx.currentIndex, period);

    const targetBreakout = p.requiredBreakout || (ctx.direction === 'BUY' ? 'UP' : 'DOWN');
    const passed = res.breakout === targetBreakout;

    return {
      ruleId: 'TECH_DONCHIAN_BREAKOUT',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { breakout: res.breakout, channelHigh: res.channelHigh, channelLow: res.channelLow, direction: ctx.direction },
      thresholdValues: { requiredBreakout: targetBreakout, period },
      reasonCodes: passed ? ['DONCHIAN_BREAKOUT_CONFIRMED'] : ['NO_DONCHIAN_BREAKOUT'],
      diagnosticMessageFa: passed ? `شکست معتبر کانال دانچیان در جهت ${res.breakout} هماهنگ با ${ctx.direction} ثبت شد.` : 'شکست کانال دانچیان رخ نداد.',
    };
  }
);

// ۶. انحراف آماری Z-Score برای بازگشت به میانگین (TECH_ZSCORE)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_ZSCORE',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'انحراف آماری بازگشت به میانگین (Z-Score)',
    nameEn: 'Z-Score Mean Reversion',
    descriptionFa: 'بررسی عبور Z-Score از آستانه مثبت/منفی بدون نگاه به آینده بر مبنای N کندل قبلی.',
    parameterSchema: {
      lookback: { type: 'number', default: 20, min: 5, max: 200, descriptionFa: 'تعداد کندل‌های مبنا' },
      threshold: { type: 'number', default: 2.0, min: 1.0, max: 4.0, descriptionFa: 'آستانه انحراف معیار' },
    },
    defaultParameters: { lookback: 20, threshold: 2.0 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: (params) => ((params as { lookback?: number })?.lookback || 20) + 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-zscore',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { lookback?: number; threshold?: number };
    const lookback = p.lookback || 20;
    const threshold = p.threshold || 2.0;

    const priorCloses = ctx.candles.slice(Math.max(0, ctx.currentIndex - lookback), ctx.currentIndex).map(item => item.close);
    const mean = priorCloses.reduce((sum, v) => sum + v, 0) / priorCloses.length;
    const variance = priorCloses.reduce((sum, v) => sum + (v - mean) ** 2, 0) / priorCloses.length;
    const std = Math.sqrt(variance);
    const zScore = std > 0 ? (c.close - mean) / std : 0;

    // BUY: قیمت افت شدید کرده (zScore <= -threshold)؛ SELL: قیمت رشد غیرعادی داشته (zScore >= threshold)
    const passed = ctx.direction === 'BUY' ? zScore <= -threshold : zScore >= threshold;

    return {
      ruleId: 'TECH_ZSCORE',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { zScore: Number(zScore.toFixed(2)), mean: Number(mean.toFixed(5)), std: Number(std.toFixed(5)), direction: ctx.direction },
      thresholdValues: { threshold, direction: ctx.direction },
      reasonCodes: passed ? ['ZSCORE_TRIGGER_MET'] : ['ZSCORE_CONDITION_NOT_MET'],
      diagnosticMessageFa: passed ? `Z-Score برابر ${zScore.toFixed(2)} با آستانه ${threshold} در جهت ${ctx.direction} تطابق دارد.` : `Z-Score خارج از شرایط مطلوب ${ctx.direction} است.`,
    };
  }
);

// ۷. شیب و فیلتر جهت EMA (TECH_EMA_SLOPE)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_EMA_SLOPE',
    ruleVersion: '1.0.0',
    category: 'CONTEXT',
    nameFa: 'فیلتر جهت شیب EMA (EMA Slope)',
    nameEn: 'EMA Slope Filter',
    descriptionFa: 'بررسی غیرمنفی بودن شیب EMA برای خرید یا غیرمثبت بودن برای فروش.',
    parameterSchema: {
      period: { type: 'number', default: 200, min: 10, max: 500, descriptionFa: 'دوره EMA' },
      requiredDirection: { type: 'enum', default: 'RISING', options: ['RISING', 'FALLING'], descriptionFa: 'جهت موردنیاز' },
    },
    defaultParameters: { period: 200, requiredDirection: 'RISING' },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 200,
    computeWarmupBars: (params) => ((params as { period?: number })?.period || 200) + 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-ema-slope',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { period?: number; requiredDirection?: 'RISING' | 'FALLING' };
    const period = p.period || 200;
    const required = p.requiredDirection || (ctx.direction === 'BUY' ? 'RISING' : 'FALLING');

    const closes = ctx.candles.slice(0, ctx.currentIndex + 1).map(x => x.close);
    const emas = TechnicalPrimitives.calculateEma(closes, period);
    const currentEma = emas[emas.length - 1];
    const prevEma = emas[Math.max(0, emas.length - 2)];

    const isRising = currentEma >= prevEma;
    const isFalling = currentEma <= prevEma;
    const passed = required === 'RISING' ? isRising : isFalling;

    return {
      ruleId: 'TECH_EMA_SLOPE',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'CONTEXT',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { currentEma: Number(currentEma?.toFixed(5)), prevEma: Number(prevEma?.toFixed(5)), direction: ctx.direction },
      thresholdValues: { requiredDirection: required, period },
      reasonCodes: passed ? ['EMA_SLOPE_ALIGNED'] : ['EMA_SLOPE_MISALIGNED'],
      diagnosticMessageFa: passed ? `شیب EMA${period} با جهت ${required} همگام است.` : `شیب EMA${period} مخالف جهت ${required} است.`,
    };
  }
);

// ۸. بازگشت به تعادل FVG (SMC_FVG_MIDPOINT)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_FVG_MIDPOINT',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'لمس میانه گپ ارزش منصفانه (FVG Equilibrium Retest)',
    nameEn: 'FVG Equilibrium Retest',
    descriptionFa: 'بررسی بازگشت و لمس سطح ۵۰٪ گپ ارزش منصفانه تشکیل‌شده قبلی توسط کندل جاری.',
    parameterSchema: {
      lookbackBars: { type: 'number', default: 12, min: 2, max: 50, descriptionFa: 'حداکثر سقف کندل‌های گذشته' },
    },
    defaultParameters: { lookbackBars: 12 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    computeWarmupBars: (params) => Math.max(15, ((params as { lookbackBars?: number })?.lookbackBars || 12) + 5),
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-fvg-midpoint',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { lookbackBars?: number };
    const lookback = p.lookbackBars || 12;

    let matchedFvg: { id: string; midpoint: number; lower: number; upper: number } | null = null;
    const lastFormationIndex = ctx.currentIndex - 1;

    for (let i = lastFormationIndex; i >= Math.max(2, ctx.currentIndex - lookback); i--) {
      const left = ctx.candles[i - 2];
      const formed = ctx.candles[i];
      const fvgDir = formed.low > left.high ? 'BUY' : formed.high < left.low ? 'SELL' : null;
      if (!fvgDir || fvgDir !== ctx.direction) continue;

      const lower = fvgDir === 'BUY' ? left.high : formed.high;
      const upper = fvgDir === 'BUY' ? formed.low : left.low;
      const midpoint = (lower + upper) / 2;

      const touched = c.low <= midpoint && c.high >= midpoint;
      const closedAligned = ctx.direction === 'BUY' ? c.close >= midpoint : c.close <= midpoint;

      if (touched && closedAligned) {
        matchedFvg = {
          id: `FVG-${fvgDir}-${formed.timestamp}-${lower.toFixed(2)}-${upper.toFixed(2)}`,
          midpoint,
          lower,
          upper,
        };
        break;
      }
    }

    const passed = matchedFvg !== null;

    return {
      ruleId: 'SMC_FVG_MIDPOINT',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && matchedFvg ? { fvgId: matchedFvg.id } : {}) as Record<string, string | number>,
      actualValues: matchedFvg ? { midpoint: matchedFvg.midpoint, lower: matchedFvg.lower, upper: matchedFvg.upper, direction: ctx.direction } : {},
      thresholdValues: { direction: ctx.direction, lookbackBars: lookback },
      reasonCodes: passed ? ['FVG_EQUILIBRIUM_TOUCHED'] : ['NO_FVG_EQUILIBRIUM_TOUCH'],
      diagnosticMessageFa: passed ? `سطح ۵۰٪ FVG در نقطه ${matchedFvg?.midpoint} برای ${ctx.direction} بازآزمایی شد.` : 'بازآزمایی معتبری در میانه FVG مشاهده نشد.',
    };
  }
);

// ۹. قاعده ورود مارکت در بازشدن کندل بعد (EXEC_MARKET_NEXT_OPEN)
RuleRegistry.registerRule(
  {
    ruleId: 'EXEC_MARKET_NEXT_OPEN',
    ruleVersion: '1.0.0',
    category: 'ENTRY',
    nameFa: 'ورود مارکت در بازشدن کندل بعد (Market Execution Next Open)',
    nameEn: 'Market Next Open Execution',
    descriptionFa: 'ثبت سفارش مارکت برای بازشدن کندل بعدی بدون استفاده از داده قیمت‌های آینده.',
    parameterSchema: {},
    defaultParameters: {},
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 1,
    computeWarmupBars: () => 1,
    availabilityPolicy: 'NEXT_BAR_OPEN',
    evaluatorId: 'eval-exec-market',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);

    return {
      ruleId: 'EXEC_MARKET_NEXT_OPEN',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'ENTRY',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: '',
      evidenceRefs: {},
      actualValues: { orderType: 'MARKET_NEXT_OPEN', estimatedEntryPrice: c.close, eligibleFromTimestamp: closeTime },
      thresholdValues: {},
      reasonCodes: ['MARKET_ENTRY_VALID'],
      diagnosticMessageFa: `سفارش مارکت در اولین لحظه بازشدن کندل بعد (${closeTime}) مجاز است.`,
    };
  }
);

// ۱۰. قاعده مدیریت ریسک ATR (RISK_ATR)
RuleRegistry.registerRule(
  {
    ruleId: 'RISK_ATR',
    ruleVersion: '1.0.0',
    category: 'RISK',
    nameFa: 'محاسبه حد ضرر و تارگت بر مبنای مضرب ATR (Wilder ATR Risk)',
    nameEn: 'ATR Multiple Risk',
    descriptionFa: 'محاسبه فاصله حد ضرر و حد سود بر مبنای ATR بدون فالبک ساختگی.',
    parameterSchema: {
      atrPeriod: { type: 'number', default: 14, min: 2, max: 100, descriptionFa: 'دوره ATR' },
      stopLossAtrBuffer: { type: 'number', default: 0.2, min: 0.05, max: 10, descriptionFa: 'مضرب بافر استاپ' },
      targetRiskReward: { type: 'number', default: 2.0, min: 0.5, max: 20, descriptionFa: 'نسبت سود به زیان' },
      expiryBars: { type: 'number', default: 12, min: 1, max: 100, descriptionFa: 'تعداد کندل انقضا' },
    },
    defaultParameters: { atrPeriod: 14, stopLossAtrBuffer: 0.2, targetRiskReward: 2.0, expiryBars: 12 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    computeWarmupBars: (params) => ((params as { atrPeriod?: number })?.atrPeriod || 14) + 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-risk-atr',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { atrPeriod?: number; stopLossAtrBuffer?: number; targetRiskReward?: number; expiryBars?: number };
    const atrPeriod = p.atrPeriod || 14;
    const buffer = p.stopLossAtrBuffer ?? 0.2;
    const rr = p.targetRiskReward ?? 2.0;

    const atrs = calculateWilderATR(ctx.candles.slice(0, ctx.currentIndex + 1), atrPeriod);
    const currentAtr = atrs[atrs.length - 1];

    if (!currentAtr || currentAtr <= 0) {
      return {
        ruleId: 'RISK_ATR',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'RISK',
        status: 'NOT_AVAILABLE',
        eventTime: c.timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: ctx.evaluatedAt,
        inputFingerprint: '',
        parameterHash: computeDeterministicFingerprint(p),
        evidenceRefs: {},
        actualValues: { atr: currentAtr },
        thresholdValues: { atrPeriod },
        reasonCodes: ['WARMUP_INSUFFICIENT'],
        diagnosticMessageFa: 'داده کافی برای محاسبه ATR واقعی موجود نیست و فالبک ساختگی مجاز نیست.',
      };
    }

    const entryPrice = c.close;
    const stopLossPrice = ctx.direction === 'BUY'
      ? c.low - currentAtr * buffer
      : c.high + currentAtr * buffer;

    const riskDistance = ctx.direction === 'BUY' ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;
    const passed = riskDistance > 0;
    const takeProfitPrice = ctx.direction === 'BUY'
      ? entryPrice + riskDistance * rr
      : entryPrice - riskDistance * rr;

    return {
      ruleId: 'RISK_ATR',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'RISK',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: {
        atr: currentAtr,
        entryPrice: roundSymbolPrice(entryPrice, ctx.symbol),
        stopLossPrice: roundSymbolPrice(stopLossPrice, ctx.symbol),
        takeProfitPrice: roundSymbolPrice(takeProfitPrice, ctx.symbol),
        riskDistance,
        riskRewardRatio: rr,
      },
      thresholdValues: { targetRiskReward: rr, stopLossAtrBuffer: buffer },
      reasonCodes: passed ? ['RISK_ATR_CALCULATED'] : ['INVALID_RISK_DISTANCE'],
      diagnosticMessageFa: passed ? `حد ضرر ${stopLossPrice.toFixed(4)} و حد سود ${takeProfitPrice.toFixed(4)} با ATR محاسبه شد.` : 'فاصله ریسک نامعتبر است.',
    };
  }
);

// ۱۱. قاعده خروج نسبت ریوارد به ریسک (EXIT_RISK_REWARD)
RuleRegistry.registerRule(
  {
    ruleId: 'EXIT_RISK_REWARD',
    ruleVersion: '1.0.0',
    category: 'EXIT',
    nameFa: 'خروج بر مبنای تارگت حد سود و حد ضرر',
    nameEn: 'Risk Reward Exit',
    descriptionFa: 'بررسی خروج پوزیشن در تارگت TP یا استاپ SL.',
    parameterSchema: {},
    defaultParameters: {},
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 1,
    computeWarmupBars: () => 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-exit-rr',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);

    return {
      ruleId: 'EXIT_RISK_REWARD',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'EXIT',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: '',
      evidenceRefs: {},
      actualValues: {},
      thresholdValues: {},
      reasonCodes: ['EXIT_RR_ACTIVE'],
      diagnosticMessageFa: 'پایش خروج بر مبنای سطوح TP و SL در جریان است.',
    };
  }
);

// ۱۲. شناسایی سووینگ تاییدشده فرکتالی (SMC_CONFIRMED_SWING_FRACTAL)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_CONFIRMED_SWING_FRACTAL',
    ruleVersion: '1.0.0',
    category: 'SETUP',
    nameFa: 'شناسایی سووینگ تاییدشده فرکتالی (Fractal Pivot Swings)',
    nameEn: 'Confirmed Fractal Swing',
    descriptionFa: 'شناسایی وجود سقف یا کف سووینگ تاییدشده فرکتالی با رعایت دقیق دوره تایید (rightBars).',
    parameterSchema: {
      leftBars: { type: 'number', default: 2, min: 1, max: 10, descriptionFa: 'کندل‌های چپ' },
      rightBars: { type: 'number', default: 2, min: 1, max: 10, descriptionFa: 'کندل‌های تایید راست' },
    },
    defaultParameters: { leftBars: 2, rightBars: 2 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 10,
    computeWarmupBars: (params) => {
      const p = params as { leftBars?: number; rightBars?: number };
      return (p.leftBars || 2) + (p.rightBars || 2) + 2;
    },
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-swing-fractal',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { leftBars?: number; rightBars?: number };
    const left = p.leftBars || 2;
    const right = p.rightBars || 2;
    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), left, right, ctx.timeframe);
    const targetType = ctx.direction === 'BUY' ? 'LOW' : 'HIGH';
    const matched = swings.filter(s => s.type === targetType).at(-1);

    const passed = matched !== undefined;

    return {
      ruleId: 'SMC_CONFIRMED_SWING_FRACTAL',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'SETUP',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: matched ? matched.timestamp : c.timestamp,
      observedAt: closeTime,
      availableAt: matched ? matched.availableAt : closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && matched ? { contextSwingId: matched.id } : {}) as Record<string, string | number>,
      actualValues: matched ? { swingPrice: matched.price, swingType: matched.type, confirmedAtIndex: matched.candleIndex } : {},
      thresholdValues: { targetType },
      reasonCodes: passed ? ['CONFIRMED_SWING_FOUND'] : ['NO_CONFIRMED_SWING'],
      diagnosticMessageFa: passed ? `سووینگ ${targetType} تاییدشده در قیمت ${matched?.price} یافت شد.` : 'سووینگ تاییدشده‌ای یافت نشد.',
    };
  }
);

// ۱۳. شناسایی سووینگ نوسانی ATR (SMC_CONFIRMED_SWING_ATR)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_CONFIRMED_SWING_ATR',
    ruleVersion: '1.0.0',
    category: 'SETUP',
    nameFa: 'شناسایی سووینگ بر مبنای بازگشت ATR (ATR Reversal Swings)',
    nameEn: 'Confirmed ATR Swing',
    descriptionFa: 'شناسایی اکسترمم‌های قیمتی که حداقل به اندازه N برابر ATR بازگشت داشته‌اند.',
    parameterSchema: {
      atrPeriod: { type: 'number', default: 14, min: 5, max: 50, descriptionFa: 'دوره ATR' },
      reversalMultiplier: { type: 'number', default: 2.0, min: 0.5, max: 10, descriptionFa: 'مضرب بازگشت' },
    },
    defaultParameters: { atrPeriod: 14, reversalMultiplier: 2.0 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 25,
    computeWarmupBars: (params) => ((params as { atrPeriod?: number })?.atrPeriod || 14) + 10,
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-swing-atr',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { atrPeriod?: number; reversalMultiplier?: number };
    const swings = SmcPrimitives.detectAtrReversalSwings(
      ctx.candles.slice(0, ctx.currentIndex + 1),
      p.atrPeriod || 14,
      p.reversalMultiplier || 2.0,
      ctx.timeframe
    );
    const targetType = ctx.direction === 'BUY' ? 'LOW' : 'HIGH';
    const matched = swings.filter(s => s.type === targetType).at(-1);
    const passed = matched !== undefined;

    return {
      ruleId: 'SMC_CONFIRMED_SWING_ATR',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'SETUP',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: matched ? matched.timestamp : c.timestamp,
      observedAt: closeTime,
      availableAt: matched ? matched.availableAt : closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && matched ? { contextSwingId: matched.id } : {}) as Record<string, string | number>,
      actualValues: matched ? { swingPrice: matched.price, swingType: matched.type } : {},
      thresholdValues: { targetType },
      reasonCodes: passed ? ['CONFIRMED_ATR_SWING_FOUND'] : ['NO_CONFIRMED_ATR_SWING'],
      diagnosticMessageFa: passed ? `سووینگ ATR ${targetType} در سطح ${matched?.price} شناسایی شد.` : 'سووینگ ATR یافت نشد.',
    };
  }
);

// ۱۴. تغییر ماهیت ساختار بازار (SMC_CHOCH_MSS)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_CHOCH_MSS',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'تغییر ماهیت ساختار بازار (Change of Character / MSS)',
    nameEn: 'Change of Character / MSS',
    descriptionFa: 'شکست اولین سووینگ مخالف که نشان‌دهنده چرخش بالقوه روند بازار است.',
    parameterSchema: {},
    defaultParameters: {},
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: () => 20,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-choch',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), 2, 2, ctx.timeframe);
    const priorTrend: 'BULLISH' | 'BEARISH' = ctx.direction === 'BUY' ? 'BEARISH' : 'BULLISH';
    const res = SmcPrimitives.evaluateChoch(c, ctx.currentIndex, swings, priorTrend);

    const directionMatched = ctx.direction === 'BUY' ? res.type === 'BULLISH_CHOCH' : res.type === 'BEARISH_CHOCH';
    const passed = res.detected && directionMatched;

    return {
      ruleId: 'SMC_CHOCH_MSS',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: '',
      evidenceRefs: (passed && res.evidenceId ? { bosId: res.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { detected: res.detected, chochType: res.type, direction: ctx.direction },
      thresholdValues: { direction: ctx.direction },
      reasonCodes: passed ? ['CHOCH_CONFIRMED'] : ['NO_CHOCH_MATCH'],
      diagnosticMessageFa: passed ? `تغییر ساختار ${res.type} متناسب با جهت ${ctx.direction} تایید شد.` : 'تغییر ساختار CHoCH رخ نداد.',
    };
  }
);

// ۱۵. شتاب و بدنه پرقدرت کندل (SMC_DISPLACEMENT)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_DISPLACEMENT',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'حرکت پرقدرت و انبساطی (Displacement)',
    nameEn: 'Candle Displacement',
    descriptionFa: 'شناسایی کندل با بدنه بزرگ به نسبت دامنه کل و میانگین نوسان ATR.',
    parameterSchema: {
      minBodyToAtrRatio: { type: 'number', default: 1.2, min: 0.5, max: 5.0, descriptionFa: 'حداقل نسبت بدنه به ATR' },
      minBodyToRangeRatio: { type: 'number', default: 0.65, min: 0.4, max: 0.95, descriptionFa: 'حداقل نسبت بدنه به رنج' },
    },
    defaultParameters: { minBodyToAtrRatio: 1.2, minBodyToRangeRatio: 0.65 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    computeWarmupBars: () => 15,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-displacement',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { minBodyToAtrRatio?: number; minBodyToRangeRatio?: number };
    const atrs = calculateWilderATR(ctx.candles.slice(0, ctx.currentIndex + 1), 14);
    const currentAtr = atrs[atrs.length - 1] || 0.001;

    const res = SmcPrimitives.evaluateDisplacement(
      c,
      ctx.currentIndex,
      currentAtr,
      p.minBodyToAtrRatio || 1.2,
      p.minBodyToRangeRatio || 0.65
    );

    const directionMatched = ctx.direction === 'BUY' ? res.type === 'BULLISH_DISPLACEMENT' : res.type === 'BEARISH_DISPLACEMENT';
    const passed = res.detected && directionMatched;

    return {
      ruleId: 'SMC_DISPLACEMENT',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && res.evidenceId ? { displacementId: res.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { detected: res.detected, bodyToAtr: res.bodyToAtrRatio, bodyToRange: res.bodyToRangeRatio, direction: ctx.direction },
      thresholdValues: { minBodyToAtrRatio: p.minBodyToAtrRatio || 1.2 },
      reasonCodes: passed ? ['DISPLACEMENT_CONFIRMED'] : ['NO_DISPLACEMENT'],
      diagnosticMessageFa: passed ? `حرکت انبساطی ${res.type} هماهنگ با ${ctx.direction} تایید شد.` : 'کندل شتاب معتبری ثبت نشد.',
    };
  }
);

// ۱۶. ناحیه اردر بلاک (SMC_ORDER_BLOCK)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_ORDER_BLOCK',
    ruleVersion: '1.0.0',
    category: 'SETUP',
    nameFa: 'ناحیه بلاک سفارشات (Order Block)',
    nameEn: 'SMC Order Block Zone',
    descriptionFa: 'شناسایی آخرین کندل مخالف پیش از حرکت پرشتاب شکست ساختار.',
    parameterSchema: {
      lookbackBars: { type: 'number', default: 20, min: 5, max: 100, descriptionFa: 'کندل‌های جستجو' },
    },
    defaultParameters: { lookbackBars: 20 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: (params) => ((params as { lookbackBars?: number })?.lookbackBars || 20) + 2,
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-order-block',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { lookbackBars?: number };
    const lookback = p.lookbackBars || 20;

    // استخراج اردر بلاک بر اساس آخرین کندل مخالف
    const startIdx = Math.max(0, ctx.currentIndex - lookback);
    const slice = ctx.candles.slice(startIdx, ctx.currentIndex);
    const obDirection = ctx.direction === 'BUY' ? 'BULLISH_OB' : 'BEARISH_OB';
    // برای BUY اردر بلاک صعودی آخرین کندل نزولی است، برای SELL آخرین کندل صعودی
    const targetCandle = [...slice].reverse().find(bar => ctx.direction === 'BUY' ? bar.close < bar.open : bar.close > bar.open);

    const passed = targetCandle !== undefined;
    const obTop = targetCandle ? (targetCandle.high) : 0;
    const obBottom = targetCandle ? (targetCandle.low) : 0;

    return {
      ruleId: 'SMC_ORDER_BLOCK',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'SETUP',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: targetCandle ? targetCandle.timestamp : c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${ctx.symbol}:${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: (passed && targetCandle ? { obId: `OB-${obDirection}-${targetCandle.timestamp}` } : {}) as Record<string, string | number>,
      actualValues: targetCandle ? { top: obTop, bottom: obBottom, obType: obDirection } : {},
      thresholdValues: { direction: ctx.direction },
      reasonCodes: passed ? ['ORDER_BLOCK_FOUND'] : ['NO_ORDER_BLOCK'],
      diagnosticMessageFa: passed ? `اردر بلاک ${obDirection} در محدوده ${obBottom} تا ${obTop} شناسایی شد.` : 'اردر بلاک معتبری یافت نشد.',
    };
  }
);

// ۱۷. فیلتر پرمیوم و دیسکانت (SMC_PREMIUM_DISCOUNT)
RuleRegistry.registerRule(
  {
    ruleId: 'SMC_PREMIUM_DISCOUNT',
    ruleVersion: '1.0.0',
    category: 'CONTEXT',
    nameFa: 'فیلتر ارزش منصفانه پرمیوم و دیسکانت (Premium & Discount)',
    nameEn: 'Premium vs Discount Zone',
    descriptionFa: 'تضمین خرید فقط در ناحیه ارزان (Discount زیر ۵۰٪) و فروش در ناحیه گران (Premium بالای ۵۰٪).',
    parameterSchema: {
      rangeLookback: { type: 'number', default: 30, min: 10, max: 200, descriptionFa: 'طول رنج مرجع' },
    },
    defaultParameters: { rangeLookback: 30 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 30,
    computeWarmupBars: (params) => ((params as { rangeLookback?: number })?.rangeLookback || 30) + 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-prem-disc',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { rangeLookback?: number };
    const lookback = p.rangeLookback || 30;

    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), 2, 2, ctx.timeframe);
    const pd = SmcPrimitives.calculatePremiumDiscount(c.close, swings, c.timestamp);

    const passed = pd !== null && (ctx.direction === 'BUY' ? pd.currentZone === 'DISCOUNT' : pd.currentZone === 'PREMIUM');

    return {
      ruleId: 'SMC_PREMIUM_DISCOUNT',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'CONTEXT',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}:${ctx.currentIndex}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: {
        currentPrice: c.close,
        zone: pd ? pd.currentZone : 'UNKNOWN',
        equilibrium: pd ? pd.equilibrium : 0,
        percentile: pd ? pd.percentile : 0,
      },
      thresholdValues: { requiredZone: ctx.direction === 'BUY' ? 'DISCOUNT' : 'PREMIUM' },
      reasonCodes: passed ? ['ZONE_ALIGNED'] : (pd ? ['ZONE_MISALIGNED'] : ['NO_SWINGS_DETECTED']),
      diagnosticMessageFa: passed
        ? `قیمت در ناحیه مطلوب ${pd?.currentZone} برای ${ctx.direction} قرار دارد.`
        : `قیمت در ناحیه مطلوب نیست (${pd ? pd.currentZone : 'بدون داده سووینگ'}).`,
    };
  }
);

// ۱۸. حداقل نوسان‌پذیری ATR (TECH_ATR_VOLATILITY)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_ATR_VOLATILITY',
    ruleVersion: '1.0.0',
    category: 'CONTEXT',
    nameFa: 'فیلتر حداقل نوسان‌پذیری ATR',
    nameEn: 'Minimum ATR Volatility',
    descriptionFa: 'جلوگیری از معامله در شرایط رکود شدید با بررسی حداقل مقدار واقعی ATR.',
    parameterSchema: {
      period: { type: 'number', default: 14, min: 2, max: 100, descriptionFa: 'دوره ATR' },
      minAtr: { type: 'number', default: 0.0002, min: 0.00001, max: 10.0, descriptionFa: 'حداقل ATR مجاز' },
    },
    defaultParameters: { period: 14, minAtr: 0.0002 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    computeWarmupBars: (params) => ((params as { period?: number })?.period || 14) + 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-atr-vol',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { period?: number; minAtr?: number };
    const period = p.period || 14;
    const minAtr = p.minAtr || 0.0002;
    const atrs = calculateWilderATR(ctx.candles.slice(0, ctx.currentIndex + 1), period);
    const curAtr = atrs[atrs.length - 1];

    if (!curAtr || curAtr <= 0) {
      return {
        ruleId: 'TECH_ATR_VOLATILITY',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'CONTEXT',
        status: 'NOT_AVAILABLE',
        eventTime: c.timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: ctx.evaluatedAt,
        inputFingerprint: '',
        parameterHash: computeDeterministicFingerprint(p),
        evidenceRefs: {},
        actualValues: {},
        thresholdValues: { minAtr },
        reasonCodes: ['WARMUP_INSUFFICIENT'],
        diagnosticMessageFa: 'داده کافی برای محاسبه ATR موجود نیست.',
      };
    }

    const passed = curAtr >= minAtr;

    return {
      ruleId: 'TECH_ATR_VOLATILITY',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'CONTEXT',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { atr: curAtr },
      thresholdValues: { minAtr },
      reasonCodes: passed ? ['VOLATILITY_SUFFICIENT'] : ['VOLATILITY_TOO_LOW'],
      diagnosticMessageFa: passed ? `مقدار نوسان ATR (${curAtr.toFixed(5)}) کافی است.` : `نوسان بازار کمتر از حداقل مجاز (${minAtr}) است.`,
    };
  }
);

// ۱۹. آستانه اشباع RSI (TECH_RSI_THRESHOLD)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_RSI_THRESHOLD',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'آستانه اشباع خرید/فروش RSI',
    nameEn: 'RSI Threshold',
    descriptionFa: 'بررسی قرارگیری RSI در ناحیه اشباع فروش (برای خرید) یا اشباع خرید (برای فروش).',
    parameterSchema: {
      period: { type: 'number', default: 14, min: 2, max: 100, descriptionFa: 'دوره RSI' },
      oversold: { type: 'number', default: 30, min: 5, max: 45, descriptionFa: 'سطح اشباع فروش' },
      overbought: { type: 'number', default: 70, min: 55, max: 95, descriptionFa: 'سطح اشباع خرید' },
    },
    defaultParameters: { period: 14, oversold: 30, overbought: 70 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: (params) => ((params as { period?: number })?.period || 14) + 5,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-rsi',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { period?: number; oversold?: number; overbought?: number };
    const period = p.period || 14;
    const rsiValues = TechnicalPrimitives.calculateRsi(ctx.candles.slice(0, ctx.currentIndex + 1), period);
    const currentRsi = rsiValues[rsiValues.length - 1];

    if (currentRsi === undefined) {
      return {
        ruleId: 'TECH_RSI_THRESHOLD',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'TRIGGER',
        status: 'NOT_AVAILABLE',
        eventTime: c.timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: ctx.evaluatedAt,
        inputFingerprint: '',
        parameterHash: computeDeterministicFingerprint(p),
        evidenceRefs: {},
        actualValues: {},
        thresholdValues: {},
        reasonCodes: ['WARMUP_INSUFFICIENT'],
        diagnosticMessageFa: 'داده کافی برای محاسبه RSI موجود نیست.',
      };
    }

    const passed = ctx.direction === 'BUY'
      ? currentRsi <= (p.oversold || 30)
      : currentRsi >= (p.overbought || 70);

    return {
      ruleId: 'TECH_RSI_THRESHOLD',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { rsi: currentRsi, direction: ctx.direction },
      thresholdValues: { targetLevel: ctx.direction === 'BUY' ? (p.oversold || 30) : (p.overbought || 70) },
      reasonCodes: passed ? ['RSI_THRESHOLD_CONFIRMED'] : ['RSI_CONDITION_NOT_MET'],
      diagnosticMessageFa: passed ? `مقدار RSI برابر ${currentRsi} در محدوده مطلوب ${ctx.direction} است.` : `مقدار RSI (${currentRsi}) شرط را برآورده نکرد.`,
    };
  }
);

// ۲۰. موقعیت نسبت به باندهای بولینگر (TECH_BOLLINGER_POSITION)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_BOLLINGER_POSITION',
    ruleVersion: '1.0.0',
    category: 'TRIGGER',
    nameFa: 'لمس یا شکست باند بولینگر (Bollinger Bands Position)',
    nameEn: 'Bollinger Bands Position',
    descriptionFa: 'لمس یا نفوذ کلوز به باند پایین برای خرید یا باند بالا برای فروش.',
    parameterSchema: {
      period: { type: 'number', default: 20, min: 5, max: 100, descriptionFa: 'دوره بولینگر' },
      multiplier: { type: 'number', default: 2.0, min: 1.0, max: 4.0, descriptionFa: 'انحراف معیار' },
    },
    defaultParameters: { period: 20, multiplier: 2.0 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 25,
    computeWarmupBars: (params) => ((params as { period?: number })?.period || 20) + 2,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-bollinger',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { period?: number; multiplier?: number };
    const period = p.period || 20;
    const mult = p.multiplier || 2.0;

    const bb = TechnicalPrimitives.calculateBollingerBands(ctx.candles.slice(0, ctx.currentIndex + 1), period, mult);
    const upper = bb.upper[bb.upper.length - 1];
    const lower = bb.lower[bb.lower.length - 1];

    const passed = ctx.direction === 'BUY' ? c.low <= lower : c.high >= upper;

    return {
      ruleId: 'TECH_BOLLINGER_POSITION',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { close: c.close, upper, lower, direction: ctx.direction },
      thresholdValues: { targetBand: ctx.direction === 'BUY' ? lower : upper },
      reasonCodes: passed ? ['BOLLINGER_TOUCHED'] : ['NO_BOLLINGER_TOUCH'],
      diagnosticMessageFa: passed ? `برخورد قیمت با باند بولینگر برای ${ctx.direction} تایید شد.` : 'برخوردی با باند بولینگر مشاهده نشد.',
    };
  }
);

// ۲۱. وضعیت قیمت نسبت به ابر ایچیموکو (TECH_ICHIMOKU_PRICE_VS_CLOUD)
RuleRegistry.registerRule(
  {
    ruleId: 'TECH_ICHIMOKU_PRICE_VS_CLOUD',
    ruleVersion: '1.0.0',
    category: 'CONTEXT',
    nameFa: 'جایگاه قیمت نسبت به ابر کومو (Ichimoku Cloud Position)',
    nameEn: 'Ichimoku Cloud Trend',
    descriptionFa: 'بررسی قرارگیری کلوز کندل جاری در بالای ابر تاریخی (صعودی) یا پایین آن (نزولی) بدون نگاه به آینده.',
    parameterSchema: {},
    defaultParameters: {},
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 55,
    computeWarmupBars: () => 55,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-ichimoku-cloud',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const ichi = TechnicalPrimitives.calculateIchimokuAt(ctx.candles.slice(0, ctx.currentIndex + 1), ctx.currentIndex);

    if (!ichi) {
      return {
        ruleId: 'TECH_ICHIMOKU_PRICE_VS_CLOUD',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'CONTEXT',
        status: 'NOT_AVAILABLE',
        eventTime: c.timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: ctx.evaluatedAt,
        inputFingerprint: '',
        parameterHash: '',
        evidenceRefs: {},
        actualValues: {},
        thresholdValues: {},
        reasonCodes: ['WARMUP_INSUFFICIENT'],
        diagnosticMessageFa: 'داده کافی برای ابر ایچیموکو موجود نیست (حداقل ۵۲ کندل).',
      };
    }

    const cloudTop = Math.max(ichi.senkouSpanA, ichi.senkouSpanB);
    const cloudBottom = Math.min(ichi.senkouSpanA, ichi.senkouSpanB);

    const passed = ctx.direction === 'BUY' ? c.close > cloudTop : c.close < cloudBottom;

    return {
      ruleId: 'TECH_ICHIMOKU_PRICE_VS_CLOUD',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'CONTEXT',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: '',
      evidenceRefs: {},
      actualValues: { close: c.close, cloudTop, cloudBottom, direction: ctx.direction },
      thresholdValues: { requiredPosition: ctx.direction === 'BUY' ? 'ABOVE_CLOUD' : 'BELOW_CLOUD' },
      reasonCodes: passed ? ['ICHIMOKU_CLOUD_ALIGNED'] : ['ICHIMOKU_CLOUD_MISALIGNED'],
      diagnosticMessageFa: passed ? `قیمت در جایگاه روند مطلوب نسبت به ابر کومو برای ${ctx.direction} قرار دارد.` : 'قیمت درون یا خلاف ابر کومو است.',
    };
  }
);

// ۲۲. ورود لیمیت در سطح قیمتی مشخص (EXEC_LIMIT_AT_LEVEL)
RuleRegistry.registerRule(
  {
    ruleId: 'EXEC_LIMIT_AT_LEVEL',
    ruleVersion: '1.0.0',
    category: 'ENTRY',
    nameFa: 'سفارش ورود لیمیت در سطح مشخص (Limit Order Execution)',
    nameEn: 'Limit Order Execution',
    descriptionFa: 'ثبت سفارش لیمیت با سطح قیمت مشخص و تاریخ انقضا.',
    parameterSchema: {
      offsetPips: { type: 'number', default: 0, min: -50, max: 50, descriptionFa: 'فاصله آفست پیپ نسبت به کلوز' },
    },
    defaultParameters: { offsetPips: 0 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 1,
    computeWarmupBars: () => 1,
    availabilityPolicy: 'NEXT_BAR_OPEN',
    evaluatorId: 'eval-exec-limit',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { offsetPips?: number };
    const pip = SYMBOL_SPECS[ctx.symbol]?.pipSize || 0.0001;
    const offset = (p.offsetPips || 0) * pip;
    const limitPrice = ctx.direction === 'BUY' ? c.close - offset : c.close + offset;

    return {
      ruleId: 'EXEC_LIMIT_AT_LEVEL',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'ENTRY',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { orderType: 'LIMIT_AT_LEVEL', limitPrice: roundSymbolPrice(limitPrice, ctx.symbol), eligibleFromTimestamp: closeTime },
      thresholdValues: {},
      reasonCodes: ['LIMIT_ORDER_PREPARED'],
      diagnosticMessageFa: `سفارش لیمیت در قیمت ${limitPrice.toFixed(4)} برای ${ctx.direction} تنظیم شد.`,
    };
  }
);

// ۲۳. ورود استاپ در سطح شکست (EXEC_STOP_AT_LEVEL)
RuleRegistry.registerRule(
  {
    ruleId: 'EXEC_STOP_AT_LEVEL',
    ruleVersion: '1.0.0',
    category: 'ENTRY',
    nameFa: 'سفارش ورود استاپ در سطح شکست (Stop Order Execution)',
    nameEn: 'Stop Order Execution',
    descriptionFa: 'ثبت سفارش استاپ برای فعال‌سازی در صورت ادامه حرکت قیمت فراتر از سطح.',
    parameterSchema: {
      bufferPips: { type: 'number', default: 1, min: 0, max: 20, descriptionFa: 'بافر نفوذ پیپ' },
    },
    defaultParameters: { bufferPips: 1 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 1,
    computeWarmupBars: () => 1,
    availabilityPolicy: 'NEXT_BAR_OPEN',
    evaluatorId: 'eval-exec-stop',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { bufferPips?: number };
    const pip = SYMBOL_SPECS[ctx.symbol]?.pipSize || 0.0001;
    const buf = (p.bufferPips || 1) * pip;
    const stopEntryPrice = ctx.direction === 'BUY' ? c.high + buf : c.low - buf;

    return {
      ruleId: 'EXEC_STOP_AT_LEVEL',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'ENTRY',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { orderType: 'STOP_AT_LEVEL', stopPrice: roundSymbolPrice(stopEntryPrice, ctx.symbol), eligibleFromTimestamp: closeTime },
      thresholdValues: {},
      reasonCodes: ['STOP_ORDER_PREPARED'],
      diagnosticMessageFa: `سفارش استاپ در قیمت ${stopEntryPrice.toFixed(4)} برای ${ctx.direction} تنظیم شد.`,
    };
  }
);

// ۲۴. مدیریت ریسک پیپ ثابت (RISK_FIXED_PIPS)
RuleRegistry.registerRule(
  {
    ruleId: 'RISK_FIXED_PIPS',
    ruleVersion: '1.0.0',
    category: 'RISK',
    nameFa: 'حد ضرر و حد سود پیپ ثابت (Fixed Pips Risk)',
    nameEn: 'Fixed Pips Risk',
    descriptionFa: 'محاسبه استاپ لاس و تیک پروفیت با فاصله پیپ ثابت بر اساس پیپ واقعی نماد.',
    parameterSchema: {
      stopPips: { type: 'number', default: 20, min: 1, max: 500, descriptionFa: 'فاصله استاپ به پیپ' },
      targetPips: { type: 'number', default: 40, min: 1, max: 2000, descriptionFa: 'فاصله تارگت به پیپ' },
    },
    defaultParameters: { stopPips: 20, targetPips: 40 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 1,
    computeWarmupBars: () => 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-risk-fixed-pips',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { stopPips?: number; targetPips?: number };
    const pip = SYMBOL_SPECS[ctx.symbol]?.pipSize || 0.0001;
    const stopDist = (p.stopPips || 20) * pip;
    const targetDist = (p.targetPips || 40) * pip;

    const entryPrice = c.close;
    const stopLossPrice = ctx.direction === 'BUY' ? entryPrice - stopDist : entryPrice + stopDist;
    const takeProfitPrice = ctx.direction === 'BUY' ? entryPrice + targetDist : entryPrice - targetDist;
    const rr = stopDist > 0 ? targetDist / stopDist : 2.0;

    return {
      ruleId: 'RISK_FIXED_PIPS',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'RISK',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: {
        entryPrice: roundSymbolPrice(entryPrice, ctx.symbol),
        stopLossPrice: roundSymbolPrice(stopLossPrice, ctx.symbol),
        takeProfitPrice: roundSymbolPrice(takeProfitPrice, ctx.symbol),
        riskDistance: stopDist,
        riskRewardRatio: rr,
      },
      thresholdValues: { stopPips: p.stopPips || 20, targetPips: p.targetPips || 40 },
      reasonCodes: ['FIXED_PIPS_RISK_CALCULATED'],
      diagnosticMessageFa: `حد ضرر ${stopLossPrice.toFixed(4)} و تارگت ${takeProfitPrice.toFixed(4)} با پیپ ثابت تنظیم شد.`,
    };
  }
);

// ۲۵. حد ضرر پشت ساختار تاییدشده (RISK_CONFIRMED_STRUCTURE)
RuleRegistry.registerRule(
  {
    ruleId: 'RISK_CONFIRMED_STRUCTURE',
    ruleVersion: '1.0.0',
    category: 'RISK',
    nameFa: 'حد ضرر پشت سقف/کف ساختار تاییدشده (Confirmed Structure SL)',
    nameEn: 'Confirmed Structure Risk',
    descriptionFa: 'قرار دادن حد ضرر با فاصله بافر مشخص پشت آخرین سووینگ تاییدشده ساختار.',
    parameterSchema: {
      bufferPips: { type: 'number', default: 2, min: 0, max: 20, descriptionFa: 'بافر پیپ پشت سووینگ' },
      targetRiskReward: { type: 'number', default: 2.5, min: 1.0, max: 10, descriptionFa: 'نسبت ریسک به ریوارد' },
    },
    defaultParameters: { bufferPips: 2, targetRiskReward: 2.5 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    computeWarmupBars: () => 15,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-risk-structure',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx): RuleEvaluationResult => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { bufferPips?: number; targetRiskReward?: number };
    const pip = SYMBOL_SPECS[ctx.symbol]?.pipSize || 0.0001;
    const buf = (p.bufferPips || 2) * pip;
    const rr = p.targetRiskReward || 2.5;

    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), 2, 2, ctx.timeframe);
    const targetType = ctx.direction === 'BUY' ? 'LOW' : 'HIGH';
    const structSwing = swings.filter(s => s.type === targetType).at(-1);

    if (!structSwing) {
      return {
        ruleId: 'RISK_CONFIRMED_STRUCTURE',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'RISK',
        status: 'FAIL',
        eventTime: c.timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: ctx.evaluatedAt,
        inputFingerprint: `${c.timestamp}`,
        parameterHash: computeDeterministicFingerprint(p),
        evidenceRefs: {},
        actualValues: {},
        thresholdValues: {},
        reasonCodes: ['NO_CONFIRMED_SWING_FOR_STRUCTURE_SL'],
        diagnosticMessageFa: 'هیچ سووینگ ساختاری معتبری برای قرار دادن حد ضرر یافت نشد.',
      };
    }

    const entryPrice = c.close;
    const stopLossPrice = ctx.direction === 'BUY' ? structSwing.price - buf : structSwing.price + buf;
    const riskDistance = ctx.direction === 'BUY' ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;

    if (riskDistance <= 0) {
      return {
        ruleId: 'RISK_CONFIRMED_STRUCTURE',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'RISK',
        status: 'FAIL',
        eventTime: c.timestamp,
        observedAt: closeTime,
        availableAt: closeTime,
        evaluatedAt: ctx.evaluatedAt,
        inputFingerprint: `${c.timestamp}`,
        parameterHash: computeDeterministicFingerprint(p),
        evidenceRefs: {},
        actualValues: { riskDistance },
        thresholdValues: {},
        reasonCodes: ['INVALID_STRUCTURE_RISK_DISTANCE'],
        diagnosticMessageFa: 'فاصله حد ضرر ساختاری منفی یا صفر است.',
      };
    }

    const takeProfitPrice = ctx.direction === 'BUY' ? entryPrice + riskDistance * rr : entryPrice - riskDistance * rr;

    return {
      ruleId: 'RISK_CONFIRMED_STRUCTURE',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'RISK',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: { contextSwingId: structSwing.id },
      actualValues: {
        entryPrice: roundSymbolPrice(entryPrice, ctx.symbol),
        stopLossPrice: roundSymbolPrice(stopLossPrice, ctx.symbol),
        takeProfitPrice: roundSymbolPrice(takeProfitPrice, ctx.symbol),
        riskDistance,
        riskRewardRatio: rr,
        structureSwingPrice: structSwing.price,
      },
      thresholdValues: { targetRiskReward: rr },
      reasonCodes: ['STRUCTURE_SL_CALCULATED'],
      diagnosticMessageFa: `حد ضرر ساختاری در ${stopLossPrice.toFixed(4)} پشت سووینگ ${structSwing.price} تثبیت شد.`,
    };
  }
);

// ۲۶. خروج با شکست ساختار مخالف (EXIT_STRUCTURE)
RuleRegistry.registerRule(
  {
    ruleId: 'EXIT_STRUCTURE',
    ruleVersion: '1.0.0',
    category: 'EXIT',
    nameFa: 'خروج در صورت شکست ساختار مخالف (Structure Exit)',
    nameEn: 'Opposite Structure Exit',
    descriptionFa: 'خروج زودهنگام از معامله در صورت مشاهده CHoCH یا BOS مخالف جهت پوزیشن.',
    parameterSchema: {},
    defaultParameters: {},
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    computeWarmupBars: () => 20,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-exit-structure',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const swings = SmcPrimitives.detectFractalSwings(ctx.candles.slice(0, ctx.currentIndex + 1), 2, 2, ctx.timeframe);
    // بررسی شکست مخالف: اگر پوزیشن BUY است، شکست کف (BEARISH BOS) سیگنال خروج است
    const opposingBos = SmcPrimitives.evaluateBos(c, ctx.currentIndex, swings, ctx.symbol, 'CLOSE_BREAK', 0);
    const shouldExit = opposingBos.detected && (ctx.direction === 'BUY' ? opposingBos.type === 'BEARISH' : opposingBos.type === 'BULLISH');

    return {
      ruleId: 'EXIT_STRUCTURE',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'EXIT',
      status: shouldExit ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: '',
      evidenceRefs: (shouldExit && opposingBos.evidenceId ? { bosId: opposingBos.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { shouldExit, opposingBreak: opposingBos.type },
      thresholdValues: {},
      reasonCodes: shouldExit ? ['OPPOSING_STRUCTURE_BREAK_EXIT'] : ['NO_EXIT_SIGNAL'],
      diagnosticMessageFa: shouldExit ? `شکست ساختار مخالف ${opposingBos.type} برای پوزیشن ${ctx.direction} رخ داد.` : 'سیگنال خروج ساختاری وجود ندارد.',
    };
  }
);

// ۲۷. خروج بر مبنای سقف زمان کندلی (EXIT_TIME_BARS)
RuleRegistry.registerRule(
  {
    ruleId: 'EXIT_TIME_BARS',
    ruleVersion: '1.0.0',
    category: 'EXIT',
    nameFa: 'خروج پس از سپری شدن حداکثر کندل (Time Bar Exit)',
    nameEn: 'Time Expiry Exit',
    descriptionFa: 'بستن پوزیشن در صورتی که پس از N کندل به حد سود یا حد ضرر نرسیده باشد.',
    parameterSchema: {
      maxBars: { type: 'number', default: 24, min: 1, max: 500, descriptionFa: 'حداکثر تعداد کندل' },
    },
    defaultParameters: { maxBars: 24 },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 1,
    computeWarmupBars: () => 1,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-exit-time',
    lifecycle: 'ACTIVE',
  },
  (instance, ctx) => {
    const c = ctx.candles[ctx.currentIndex];
    const closeTime = getCandleCloseTimestamp(c, ctx.timeframe);
    const p = instance.parameters as { maxBars?: number };
    const maxBars = p.maxBars || 24;

    return {
      ruleId: 'EXIT_TIME_BARS',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'EXIT',
      status: 'PASS',
      eventTime: c.timestamp,
      observedAt: closeTime,
      availableAt: closeTime,
      evaluatedAt: ctx.evaluatedAt,
      inputFingerprint: `${c.timestamp}`,
      parameterHash: computeDeterministicFingerprint(p),
      evidenceRefs: {},
      actualValues: { maxBars },
      thresholdValues: { maxBars },
      reasonCodes: ['TIME_EXIT_RULE_ACTIVE'],
      diagnosticMessageFa: `پایش خروج زمانی بر مبنای سقف ${maxBars} کندل فعال است.`,
    };
  }
);

