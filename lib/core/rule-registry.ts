// lib/core/rule-registry.ts
// رجیستری رسمی تعاریف قوانین و مفسرهای قطعی (Package 4A Rules Registry)
// اجرای امن بدون eval، با تضمین تطابق نسخه و کنترل قابلیت‌های داده

import type { RuleDefinition, RuleInstance, RuleEvaluationResult, DataCapability } from '../contracts/strategy-definition';
import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import type { VolumeType } from '../contracts/dataset-contract';
import { SmcPrimitives } from './smc-primitives';
import { TechnicalPrimitives } from './technical-primitives';
import { computeDeterministicHash } from './strategy-definition-serializer';
import { calculateWilderATR } from './atr';

export type RuleEvaluatorFn = (
  instance: RuleInstance,
  candles: Candle[],
  currentIndex: number,
  symbol: SymbolId,
  timeframe: Timeframe,
  availableDataCapabilities: DataCapability[],
  currentVolumeType?: VolumeType
) => RuleEvaluationResult;

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

  /**
   * ارزیابی یک RuleInstance با بررسی تطابق قابلیت‌های داده
   */
  public static evaluateInstance(
    instance: RuleInstance,
    candles: Candle[],
    currentIndex: number,
    symbol: SymbolId,
    timeframe: Timeframe,
    availableCapabilities: DataCapability[],
    currentVolumeType: VolumeType = 'REAL_SOURCE_VOLUME'
  ): RuleEvaluationResult {
    const key = `${instance.ruleId}@${instance.ruleVersion}`;
    const def = this.definitions.get(key);
    const evaluator = this.evaluators.get(key);
    const currentCandle = candles[currentIndex];
    const timestamp = currentCandle?.timestamp || 0;

    if (!def || !evaluator) {
      return {
        ruleId: instance.ruleId,
        ruleVersion: instance.ruleVersion,
        instanceId: instance.instanceId,
        category: 'TRIGGER',
        status: 'NOT_AVAILABLE',
        eventTime: timestamp,
        observedAt: timestamp,
        availableAt: timestamp,
        evaluatedAt: timestamp,
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
    const missingCaps = def.requiredCapabilities.filter(c => !availableCapabilities.includes(c));
    if (missingCaps.length > 0) {
      return {
        ruleId: def.ruleId,
        ruleVersion: def.ruleVersion,
        instanceId: instance.instanceId,
        category: def.category,
        status: 'NOT_AVAILABLE',
        eventTime: timestamp,
        observedAt: timestamp,
        availableAt: timestamp,
        evaluatedAt: timestamp,
        inputFingerprint: '',
        parameterHash: computeDeterministicHash(instance.parameters),
        evidenceRefs: {},
        actualValues: { missingCapabilities: missingCaps },
        thresholdValues: { requiredCapabilities: def.requiredCapabilities },
        reasonCodes: ['DATA_CAPABILITY_MISSING'],
        diagnosticMessageFa: `داده جاری فاقد قابلیت‌های لازم برای این قاعده است: ${missingCaps.join(', ')}`,
      };
    }

    // ۲. بررسی نیازمندی‌های وارم‌آپ کندل
    const paramPeriod = (instance.parameters as Record<string, number>)?.period || (instance.parameters as Record<string, number>)?.lookback;
    const requiredWarmup = typeof paramPeriod === 'number' && paramPeriod > 0
      ? Math.min(def.warmupRequirements, paramPeriod)
      : def.warmupRequirements;

    if (currentIndex < requiredWarmup) {
      return {
        ruleId: def.ruleId,
        ruleVersion: def.ruleVersion,
        instanceId: instance.instanceId,
        category: def.category,
        status: 'NOT_AVAILABLE',
        eventTime: timestamp,
        observedAt: timestamp,
        availableAt: timestamp,
        evaluatedAt: timestamp,
        inputFingerprint: '',
        parameterHash: computeDeterministicHash(instance.parameters),
        evidenceRefs: {},
        actualValues: { availableBars: currentIndex },
        thresholdValues: { requiredBars: requiredWarmup },
        reasonCodes: ['WARMUP_INSUFFICIENT'],
        diagnosticMessageFa: `تعداد کندل‌های وارم‌آپ کافی نیست (${currentIndex} از ${requiredWarmup})`,
      };
    }

    return evaluator(instance, candles, currentIndex, symbol, timeframe, availableCapabilities, currentVolumeType);
  }
}

// ============================================================================
// ثبت تعاریف رسمی SMC و Technical در رجیستری داخلی
// ============================================================================

// ۱. قاعده سوییپ نقدینگی (SMC_LIQUIDITY_SWEEP)
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
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-sweep',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index, symbol, timeframe) => {
    const c = candles[index];
    const swings = SmcPrimitives.detectFractalSwings(candles.slice(0, index + 1), 2, 2, timeframe);
    const p = instance.parameters as { minPenetrationPips?: number; reclaimMode?: 'CLOSE_RECLAIM' | 'WICK_REJECTION' };
    const res = SmcPrimitives.evaluateLiquiditySweep(c, index, swings, symbol, p.reclaimMode || 'CLOSE_RECLAIM', p.minPenetrationPips || 0.5);

    return {
      ruleId: 'SMC_LIQUIDITY_SWEEP',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: res.detected ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: c.timestamp,
      availableAt: res.availableAt || c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${symbol}:${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: (res.evidenceId ? { sweepId: res.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { detected: res.detected, penetrationPips: res.penetrationPips, sweepType: res.type },
      thresholdValues: { minPenetrationPips: p.minPenetrationPips || 0.5, reclaimMode: p.reclaimMode || 'CLOSE_RECLAIM' },
      reasonCodes: res.detected ? ['LIQUIDITY_SWEEP_CONFIRMED'] : ['NO_LIQUIDITY_SWEEP'],
      diagnosticMessageFa: res.detected ? `سوییپ نقدینگی تایید شد: ${res.penetrationPips} پیپ نفوذ.` : 'سوییپ نقدینگی معتبری مشاهده نشد.',
    };
  }
);

// ۲. قاعده شکست ساختار (SMC_BOS)
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
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-smc-bos',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index, symbol, timeframe) => {
    const c = candles[index];
    const swings = SmcPrimitives.detectFractalSwings(candles.slice(0, index + 1), 2, 2, timeframe);
    const p = instance.parameters as { breakMode?: 'CLOSE_BREAK' | 'WICK_BREAK'; bufferPips?: number };
    const res = SmcPrimitives.evaluateBos(c, index, swings, symbol, p.breakMode || 'CLOSE_BREAK', p.bufferPips || 0);

    return {
      ruleId: 'SMC_BOS',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: res.detected ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: c.timestamp,
      availableAt: res.availableAt || c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${symbol}:${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: (res.evidenceId ? { bosId: res.evidenceId } : {}) as Record<string, string | number>,
      actualValues: { detected: res.detected, breakType: res.breakType, direction: res.type },
      thresholdValues: { breakMode: p.breakMode || 'CLOSE_BREAK', bufferPips: p.bufferPips || 0 },
      reasonCodes: res.detected ? ['BOS_CONFIRMED'] : ['NO_BOS'],
      diagnosticMessageFa: res.detected ? `شکست ساختار ${res.type} با ${res.breakType} رخ داد.` : 'شکست ساختاری رخ نداد.',
    };
  }
);

// ۳. قاعده شکاف ارزش منصفانه (SMC_FVG)
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
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-fvg',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index, symbol) => {
    const c = candles[index];
    const p = instance.parameters as { measurementMode?: 'WICK_TO_WICK' | 'BODY_TO_BODY'; minGapPips?: number };
    const res = SmcPrimitives.detectFvg(candles, index, p.measurementMode || 'WICK_TO_WICK', p.minGapPips || 0, symbol);

    return {
      ruleId: 'SMC_FVG',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'SETUP',
      status: res !== null ? 'PASS' : 'FAIL',
      eventTime: res ? res.formedAtTimestamp : c.timestamp,
      observedAt: c.timestamp,
      availableAt: res ? res.availableAt : c.timestamp, // تضمین بسته شدن کندل سوم
      evaluatedAt: c.timestamp,
      inputFingerprint: `${symbol}:${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: (res ? { fvgId: res.id } : {}) as Record<string, string | number>,
      actualValues: res ? { type: res.type, midpoint: res.midpoint, top: res.top, bottom: res.bottom } : { detected: false },
      thresholdValues: { minGapPips: p.minGapPips || 0, measurementMode: p.measurementMode || 'WICK_TO_WICK' },
      reasonCodes: res ? ['FVG_FORMED'] : ['NO_FVG'],
      diagnosticMessageFa: res ? `تشکیل FVG ${res.type} در سطح ${res.bottom} تا ${res.top}.` : 'گپ ارزش منصفانه تشکیل نشد.',
    };
  }
);

// ۴. قاعده وضعیت روند EMA (TECH_EMA_POSITION)
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
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-ema-pos',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index) => {
    const c = candles[index];
    const p = instance.parameters as { period?: number; requiredPosition?: 'ABOVE' | 'BELOW' };
    const period = p.period || 50;
    const closes = candles.map(x => x.close);
    const emas = TechnicalPrimitives.calculateEma(closes, period);
    const pos = TechnicalPrimitives.evaluateEmaPosition(c, emas, index);
    const passed = pos.position === (p.requiredPosition || 'ABOVE');

    return {
      ruleId: 'TECH_EMA_POSITION',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'CONTEXT',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: c.timestamp,
      availableAt: c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: {},
      actualValues: { currentPosition: pos.position, emaValue: pos.emaValue, distancePercent: pos.distancePercent },
      thresholdValues: { requiredPosition: p.requiredPosition || 'ABOVE', period },
      reasonCodes: passed ? ['EMA_POSITION_MATCHED'] : ['EMA_POSITION_MISMATCHED'],
      diagnosticMessageFa: passed ? `قیمت در موقعیت مطلوب ${pos.position} نسبت به EMA${period} قرار دارد.` : `قیمت مخالف شرط (${pos.position}) است.`,
    };
  }
);

// ۵. قاعده شکست کانال دانچیان (TECH_DONCHIAN_BREAKOUT)
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
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-donchian',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index) => {
    const c = candles[index];
    const p = instance.parameters as { period?: number; requiredBreakout?: 'UP' | 'DOWN' };
    const period = p.period || 20;
    const res = TechnicalPrimitives.evaluateDonchianBreakout(candles, index, period);
    const passed = res.breakout === (p.requiredBreakout || 'UP');

    return {
      ruleId: 'TECH_DONCHIAN_BREAKOUT',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: c.timestamp,
      availableAt: c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: {},
      actualValues: { breakout: res.breakout, channelHigh: res.channelHigh, channelLow: res.channelLow },
      thresholdValues: { requiredBreakout: p.requiredBreakout || 'UP', period },
      reasonCodes: passed ? ['DONCHIAN_BREAKOUT_CONFIRMED'] : ['NO_DONCHIAN_BREAKOUT'],
      diagnosticMessageFa: passed ? `شکست معتبر کانال دانچیان در جهت ${res.breakout} ثبت شد.` : 'شکست کانال رخ نداد.',
    };
  }
);

// ۶. قاعده انحراف آماری Z-Score برای بازگشت به میانگین (TECH_ZSCORE)
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
      direction: { type: 'enum', default: 'BUY', options: ['BUY', 'SELL'], descriptionFa: 'جهت سیگنال' },
    },
    defaultParameters: { lookback: 20, threshold: 2.0, direction: 'BUY' },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 20,
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-zscore',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index) => {
    const c = candles[index];
    const p = instance.parameters as { lookback?: number; threshold?: number; direction?: 'BUY' | 'SELL' };
    const lookback = p.lookback || 20;
    const threshold = p.threshold || 2.0;
    const direction = p.direction || 'BUY';

    const priorCloses = candles.slice(Math.max(0, index - lookback), index).map(item => item.close);
    if (priorCloses.length < lookback) {
      return {
        ruleId: 'TECH_ZSCORE',
        ruleVersion: '1.0.0',
        instanceId: instance.instanceId,
        category: 'TRIGGER',
        status: 'NOT_AVAILABLE',
        eventTime: c.timestamp,
        observedAt: c.timestamp,
        availableAt: c.timestamp,
        evaluatedAt: c.timestamp,
        inputFingerprint: `${c.timestamp}:${index}`,
        parameterHash: computeDeterministicHash(p),
        evidenceRefs: {},
        actualValues: { availableBars: priorCloses.length },
        thresholdValues: { lookback, threshold },
        reasonCodes: ['INSUFFICIENT_PRIOR_BARS'],
        diagnosticMessageFa: 'کندل‌های کافی برای محاسبه Z-Score وجود ندارد.',
      };
    }

    const mean = priorCloses.reduce((sum, v) => sum + v, 0) / priorCloses.length;
    const variance = priorCloses.reduce((sum, v) => sum + (v - mean) ** 2, 0) / priorCloses.length;
    const std = Math.sqrt(variance);
    const zScore = std > 0 ? (c.close - mean) / std : 0;

    const passed = direction === 'BUY' ? zScore <= -threshold : zScore >= threshold;

    return {
      ruleId: 'TECH_ZSCORE',
      ruleVersion: '1.0.0',
      instanceId: instance.instanceId,
      category: 'TRIGGER',
      status: passed ? 'PASS' : 'FAIL',
      eventTime: c.timestamp,
      observedAt: c.timestamp,
      availableAt: c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: {},
      actualValues: { zScore: Number(zScore.toFixed(2)), mean: Number(mean.toFixed(5)), std: Number(std.toFixed(5)) },
      thresholdValues: { threshold, direction },
      reasonCodes: passed ? ['ZSCORE_TRIGGER_MET'] : ['ZSCORE_CONDITION_NOT_MET'],
      diagnosticMessageFa: passed ? `Z-Score برابر ${zScore.toFixed(2)} با آستانه ${threshold} تطابق دارد.` : `Z-Score برابر ${zScore.toFixed(2)} خارج از آستانه است.`,
    };
  }
);

// ۷. قاعده شیب و فیلتر EMA (TECH_EMA_SLOPE)
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
    availabilityPolicy: 'IMMEDIATE',
    evaluatorId: 'eval-tech-ema-slope',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index) => {
    const c = candles[index];
    const p = instance.parameters as { period?: number; requiredDirection?: 'RISING' | 'FALLING' };
    const period = p.period || 200;
    const required = p.requiredDirection || 'RISING';

    const closes = candles.slice(0, index + 1).map(x => x.close);
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
      observedAt: c.timestamp,
      availableAt: c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: {},
      actualValues: { currentEma: Number(currentEma?.toFixed(5)), prevEma: Number(prevEma?.toFixed(5)) },
      thresholdValues: { requiredDirection: required, period },
      reasonCodes: passed ? ['EMA_SLOPE_ALIGNED'] : ['EMA_SLOPE_MISALIGNED'],
      diagnosticMessageFa: passed ? `شیب EMA${period} با جهت ${required} همگام است.` : `شیب EMA${period} مخالف جهت ${required} است.`,
    };
  }
);

// ۸. قاعده بازگشت به تعادل FVG (SMC_FVG_MIDPOINT)
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
      direction: { type: 'enum', default: 'BUY', options: ['BUY', 'SELL'], descriptionFa: 'جهت معامله' },
    },
    defaultParameters: { lookbackBars: 12, direction: 'BUY' },
    requiredCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    warmupRequirements: 15,
    availabilityPolicy: 'CONFIRMATION_BARS',
    evaluatorId: 'eval-smc-fvg-midpoint',
    lifecycle: 'ACTIVE',
  },
  (instance, candles, index, symbol) => {
    const c = candles[index];
    const p = instance.parameters as { lookbackBars?: number; direction?: 'BUY' | 'SELL' };
    const lookback = p.lookbackBars || 12;
    const direction = p.direction || 'BUY';

    let matchedFvg: { id: string; midpoint: number; lower: number; upper: number } | null = null;
    const lastFormationIndex = index - 1;

    for (let i = lastFormationIndex; i >= Math.max(2, index - lookback); i--) {
      const left = candles[i - 2];
      const formed = candles[i];
      const fvgDir = formed.low > left.high ? 'BUY' : formed.high < left.low ? 'SELL' : null;
      if (!fvgDir || fvgDir !== direction) continue;

      const lower = fvgDir === 'BUY' ? left.high : formed.high;
      const upper = fvgDir === 'BUY' ? formed.low : left.low;
      const midpoint = (lower + upper) / 2;

      const touched = c.low <= midpoint && c.high >= midpoint;
      const closedAligned = direction === 'BUY' ? c.close >= midpoint : c.close <= midpoint;

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
      observedAt: c.timestamp,
      availableAt: c.timestamp,
      evaluatedAt: c.timestamp,
      inputFingerprint: `${symbol}:${c.timestamp}:${index}`,
      parameterHash: computeDeterministicHash(p),
      evidenceRefs: (matchedFvg ? { fvgId: matchedFvg.id } : {}) as Record<string, string | number>,
      actualValues: matchedFvg ? { midpoint: matchedFvg.midpoint, lower: matchedFvg.lower, upper: matchedFvg.upper } : {},
      thresholdValues: { direction, lookbackBars: lookback },
      reasonCodes: passed ? ['FVG_EQUILIBRIUM_TOUCHED'] : ['NO_FVG_EQUILIBRIUM_TOUCH'],
      diagnosticMessageFa: passed ? `سطح ۵۰٪ FVG در نقطه ${matchedFvg?.midpoint} بازآزمایی شد.` : 'هیچ بازآزمایی معتبری در میانه FVG مشاهده نشد.',
    };
  }
);

