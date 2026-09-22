// lib/core/__tests__/strategy-definition-engine.test.ts
// آزمون‌های جامع دامنه پکیج 4A: کتابخانه تعاریف استراتژی نسخه‌دار، موتور قواعد ترکیبی و ردیابی تصمیم
// شامل آزمون‌های هش قطعی، عملگرهای ALL/ANY/AT_LEAST_N/NOT/SEQUENCE، ایزوله بودن وضعیت، ضد نگاه به آینده SMC،
// انطباق قابلیت‌های داده، مهاجرت ۵ سبک و ۶ استراتژی، و تولید تریس تصمیم

import type { Candle } from '../../contracts/market';
import { StrategyDefinitionSerializer } from '../strategy-definition-serializer';
import { CompositeRuleEvaluator } from '../composite-rule-evaluator';
import { RuleRegistry } from '../rule-registry';
import { SmcPrimitives } from '../smc-primitives';
import { TechnicalPrimitives } from '../technical-primitives';
import { StrategyDefinitionEvaluator } from '../strategy-definition-evaluator';
import { StrategyLegacyAdapters } from '../strategy-legacy-adapters';
import { buildDecisionTraceFromEvaluation } from '../../contracts/decision-trace';
import type { StrategyDefinition } from '../../contracts/strategy-definition';

export interface TestCaseResult {
  name: string;
  passed: boolean;
  details: string;
}

function makeCandle(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
  isClosed = true
): Candle {
  return { timestamp, open, high, low, close, volume, isClosed };
}

export function runStrategyDefinitionEngineTestSuite(): TestCaseResult[] {
  const results: TestCaseResult[] = [];

  // ==========================================================================
  // بخش ۱: سریال‌سازی، هش قطعی، اعتبارسنجی و مهار دستکاری (Tamper Detection)
  // ==========================================================================
  try {
    const sweepDef = StrategyLegacyAdapters.createResearchVariantDefinition('S0_SWEEP_ONLY');
    const serialized = StrategyDefinitionSerializer.serialize(sweepDef);
    const deserialized = StrategyDefinitionSerializer.deserialize(serialized);

    const hashMatch = deserialized.metadata.deterministicHash === sweepDef.metadata.deterministicHash;
    const validation = StrategyDefinitionSerializer.validate(deserialized);

    // بررسی مهار دستکاری در هش: تغییر یک پارامتر در JSON بدون به‌روزرسانی هش
    let tamperDetected = false;
    try {
      const tamperedObj = JSON.parse(serialized);
      tamperedObj.trigger.rules[0].parameters.minPenetrationPips = 999.9;
      StrategyDefinitionSerializer.deserialize(JSON.stringify(tamperedObj));
    } catch {
      tamperDetected = true;
    }

    results.push({
      name: '1.1 Serialization, Canonicalization, and Tamper Detection',
      passed: hashMatch && validation.valid && tamperDetected,
      details: `Hash: ${sweepDef.metadata.deterministicHash}, Valid: ${validation.valid}, TamperDetected: ${tamperDetected}`,
    });
  } catch (error) {
    results.push({
      name: '1.1 Serialization, Canonicalization, and Tamper Detection',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ==========================================================================
  // بخش ۲: عملگرهای منطقی ترکیبی (ALL, ANY, AT_LEAST_N, NOT) و قطع منطقی
  // ==========================================================================
  try {
    const candles: Candle[] = [];
    const baseTs = 1700000000000;
    const stepMs = 60000;
    // ساخت ۲۰ کندل صعودی بالای EMA
    for (let i = 0; i < 30; i++) {
      candles.push(makeCandle(baseTs + i * stepMs, 1.0 + i * 0.001, 1.0 + i * 0.001 + 0.0005, 1.0 + i * 0.001 - 0.0002, 1.0 + i * 0.001 + 0.0003));
    }

    const testCtx = {
      candles,
      currentIndex: 25,
      symbol: 'EURUSD' as const,
      timeframe: '5M' as const,
      direction: 'BUY' as const,
      definitionId: 'TEST_DEF',
      availableCapabilities: ['OHLC', 'CLOSED_BAR_STATUS', 'REAL_SOURCE_VOLUME'] as any[],
    };

    // آزمون ALL: دو شرط، اولی صادق (EMA_POS)، دومی غیرصادق (DONCHIAN_BREAKOUT DOWN)
    const allGroup = {
      groupId: 'grp_all',
      operator: 'ALL' as const,
      rules: [
        {
          instanceId: 'inst_1',
          ruleId: 'TECH_EMA_POSITION',
          ruleVersion: '1.0.0',
          parameters: { period: 10, requiredPosition: 'ABOVE' },
        },
        {
          instanceId: 'inst_2',
          ruleId: 'TECH_DONCHIAN_BREAKOUT',
          ruleVersion: '1.0.0',
          parameters: { period: 20, requiredBreakout: 'DOWN' },
        },
        {
          instanceId: 'inst_3',
          ruleId: 'TECH_EMA_POSITION',
          ruleVersion: '1.0.0',
          parameters: { period: 5, requiredPosition: 'ABOVE' },
        },
      ],
    };

    const allRes = CompositeRuleEvaluator.evaluateGroup(allGroup, testCtx);
    // شرط اول PASS، شرط دوم FAIL، شرط سوم باید NOT_EVALUATED باشد به دلیل قطع منطقی در ALL
    const allPassedCorrectly = allRes.status === 'FAIL';
    const shortCircuitRecorded = allRes.childEvaluations[2]?.status === 'NOT_EVALUATED';

    // آزمون ANY: شرط اول صادق، ادامه نباید اجرا شوند
    const anyGroup = {
      groupId: 'grp_any',
      operator: 'ANY' as const,
      rules: [
        {
          instanceId: 'inst_any_1',
          ruleId: 'TECH_EMA_POSITION',
          ruleVersion: '1.0.0',
          parameters: { period: 10, requiredPosition: 'ABOVE' },
        },
        {
          instanceId: 'inst_any_2',
          ruleId: 'TECH_DONCHIAN_BREAKOUT',
          ruleVersion: '1.0.0',
          parameters: { period: 20, requiredBreakout: 'DOWN' },
        },
      ],
    };
    const anyRes = CompositeRuleEvaluator.evaluateGroup(anyGroup, testCtx);
    const anyPassedCorrectly = anyRes.status === 'PASS' && anyRes.childEvaluations[1]?.status === 'NOT_EVALUATED';

    // آزمون AT_LEAST_N: نیاز به حداقل ۲ شرط از ۳ شرط
    const atLeastGroup = {
      groupId: 'grp_at_least',
      operator: 'AT_LEAST_N' as const,
      atLeastNCount: 2,
      rules: [
        {
          instanceId: 'inst_at_1',
          ruleId: 'TECH_EMA_POSITION',
          ruleVersion: '1.0.0',
          parameters: { period: 10, requiredPosition: 'ABOVE' }, // PASS
        },
        {
          instanceId: 'inst_at_2',
          ruleId: 'TECH_EMA_POSITION',
          ruleVersion: '1.0.0',
          parameters: { period: 20, requiredPosition: 'ABOVE' }, // PASS
        },
        {
          instanceId: 'inst_at_3',
          ruleId: 'TECH_DONCHIAN_BREAKOUT',
          ruleVersion: '1.0.0',
          parameters: { period: 15, requiredBreakout: 'DOWN' }, // FAIL
        },
      ],
    };
    const atLeastRes = CompositeRuleEvaluator.evaluateGroup(atLeastGroup, testCtx);
    const atLeastPassed = atLeastRes.status === 'PASS' && atLeastRes.passedCount === 2;

    // آزمون NOT: نقیض شرط غیرصادق باید صادق شود
    const notGroup = {
      groupId: 'grp_not',
      operator: 'NOT' as const,
      rules: [
        {
          instanceId: 'inst_not_1',
          ruleId: 'TECH_DONCHIAN_BREAKOUT',
          ruleVersion: '1.0.0',
          parameters: { period: 20, requiredBreakout: 'DOWN' }, // FAIL -> NOT -> PASS
        },
      ],
    };
    const notRes = CompositeRuleEvaluator.evaluateGroup(notGroup, testCtx);
    const notPassed = notRes.status === 'PASS';

    results.push({
      name: '2.1 Logical Operators ALL, ANY, AT_LEAST_N, NOT with Short-Circuit Trace',
      passed: allPassedCorrectly && shortCircuitRecorded && anyPassedCorrectly && atLeastPassed && notPassed,
      details: `ALL: ${allRes.status} (shortCircuit=${shortCircuitRecorded}), ANY: ${anyRes.status}, AtLeast2: ${atLeastRes.status}, NOT: ${notRes.status}`,
    });
  } catch (error) {
    results.push({
      name: '2.1 Logical Operators ALL, ANY, AT_LEAST_N, NOT with Short-Circuit Trace',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ==========================================================================
  // بخش ۳: توالی کندلی (SEQUENCE_WITHIN_BARS)، انقضا و ایزوله بودن وضعیت
  // ==========================================================================
  try {
    CompositeRuleEvaluator.clearAllSequenceStates();

    const seqCandles: Candle[] = [];
    const baseTs = 1700000000000;
    const stepMs = 60000;
    for (let i = 0; i < 40; i++) {
      seqCandles.push(makeCandle(baseTs + i * stepMs, 1.1000, 1.1020, 1.0980, 1.1000));
    }

    const sequenceGroup = {
      groupId: 'grp_sequence',
      operator: 'SEQUENCE_WITHIN_BARS' as const,
      maxBarsWindow: 10,
      sequenceSteps: [
        {
          stepIndex: 0,
          ruleInstance: {
            instanceId: 'seq_step_0',
            ruleId: 'TECH_EMA_POSITION',
            ruleVersion: '1.0.0',
            parameters: { period: 5, requiredPosition: 'ABOVE' },
          },
        },
        {
          stepIndex: 1,
          ruleInstance: {
            instanceId: 'seq_step_1',
            ruleId: 'TECH_EMA_POSITION',
            ruleVersion: '1.0.0',
            parameters: { period: 5, requiredPosition: 'BELOW' },
          },
        },
      ],
    };

    // کندل ۱۰: قیمت بالای EMA است -> گام اول پاس می‌شود و وضعیت PENDING می‌شود
    seqCandles[10] = makeCandle(baseTs + 10 * stepMs, 1.1000, 1.1050, 1.0990, 1.1040);
    const step0Res = CompositeRuleEvaluator.evaluateGroup(sequenceGroup, {
      candles: seqCandles,
      currentIndex: 10,
      symbol: 'EURUSD',
      timeframe: '5M',
      direction: 'BUY',
      definitionId: 'DEF_SEQ_TEST',
      availableCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    });

    const step0Pending = step0Res.status === 'PENDING' && step0Res.sequenceState?.currentStepIndex === 1;

    // بررسی ایزوله بودن وضعیت برای نماد دیگر: GBPUSD نباید از پیشرفت EURUSD تاثیر بگیرد!
    const gbpRes = CompositeRuleEvaluator.evaluateGroup(sequenceGroup, {
      candles: seqCandles,
      currentIndex: 10,
      symbol: 'GBPUSD',
      timeframe: '5M',
      direction: 'BUY',
      definitionId: 'DEF_SEQ_TEST',
      availableCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    });
    // روی GBPUSD گام اول همزمان سنجیده می‌شود اما وضعیت آن ایزوله در مخزن کلید GBPUSD است
    const isolationPreserved = CompositeRuleEvaluator.getSequenceState('GBPUSD', 'DEF_SEQ_TEST', 'BUY', 'grp_sequence') !== undefined &&
      CompositeRuleEvaluator.getSequenceState('EURUSD', 'DEF_SEQ_TEST', 'BUY', 'grp_sequence')?.symbol === 'EURUSD';

    // کندل ۱۲: قیمت پایین EMA می‌آید -> گام دوم پاس شده و کل توالی COMPLETE و status: PASS می‌شود
    seqCandles[12] = makeCandle(baseTs + 12 * stepMs, 1.1040, 1.1045, 1.0950, 1.0960);
    const step1Res = CompositeRuleEvaluator.evaluateGroup(sequenceGroup, {
      candles: seqCandles,
      currentIndex: 12,
      symbol: 'EURUSD',
      timeframe: '5M',
      direction: 'BUY',
      definitionId: 'DEF_SEQ_TEST',
      availableCapabilities: ['OHLC', 'CLOSED_BAR_STATUS'],
    });

    const sequenceCompleted = step1Res.status === 'PASS' && step1Res.sequenceState?.isComplete === true;

    results.push({
      name: '3.1 SEQUENCE_WITHIN_BARS State Transition, Completion, and Multi-Symbol Isolation',
      passed: step0Pending && isolationPreserved && sequenceCompleted,
      details: `Step0: ${step0Res.status} (idx=${step0Res.sequenceState?.currentStepIndex}), Isolated: ${isolationPreserved}, Final: ${step1Res.status}`,
    });
  } catch (error) {
    results.push({
      name: '3.1 SEQUENCE_WITHIN_BARS State Transition, Completion, and Multi-Symbol Isolation',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ==========================================================================
  // بخش ۴: آزمون دقت و ضد نگاه به آینده در تعاریف SMC Primitives
  // ==========================================================================
  try {
    const smcCandles: Candle[] = [];
    const baseTs = 1700000000000;
    const stepMs = 300000;

    for (let i = 0; i < 20; i++) {
      smcCandles.push(makeCandle(baseTs + i * stepMs, 1.2000, 1.2010, 1.1990, 1.2000));
    }

    // ایجاد یک سووینگ کف فرکتالی در کندل ۵ (نیاز به ۲ کندل راست: یعنی در کندل ۷ تایید می‌شود)
    smcCandles[5] = makeCandle(baseTs + 5 * stepMs, 1.2000, 1.2005, 1.1950, 1.1990); // کف در 1.1950
    smcCandles[6] = makeCandle(baseTs + 6 * stepMs, 1.1990, 1.2010, 1.1980, 1.2000);
    smcCandles[7] = makeCandle(baseTs + 7 * stepMs, 1.2000, 1.2020, 1.1995, 1.2015);

    // ۱. بررسی تایید سووینگ و زمان در دسترس بودن آن (availableAt)
    const swingsAt6 = SmcPrimitives.detectFractalSwings(smcCandles.slice(0, 7), 2, 2, '5M');
    const swingsAt7 = SmcPrimitives.detectFractalSwings(smcCandles.slice(0, 8), 2, 2, '5M');

    const notConfirmedAt6 = swingsAt6.length === 0;
    const confirmedAt7 = swingsAt7.length === 1 && swingsAt7[0].candleIndex === 5 && swingsAt7[0].availableAt === smcCandles[7].timestamp;
    const antiLookAheadSwing = confirmedAt7 && swingsAt7[0].availableAt === smcCandles[7].timestamp;

    // ۲. سوییپ نقدینگی و ری‌کلیم کف در کندل ۱۰
    smcCandles[10] = makeCandle(baseTs + 10 * stepMs, 1.2000, 1.2005, 1.1940, 1.1970); // low نفوذ کرده (1.1940 < 1.1950) اما close بالای سطح بسته شده (1.1970 > 1.1950)
    const sweepRes = SmcPrimitives.evaluateLiquiditySweep(smcCandles[10], 10, swingsAt7, 'EURUSD', 'CLOSE_RECLAIM', 0.5);
    const sweepConfirmed = sweepRes.detected && sweepRes.type === 'LOW_SWEEP';

    // ۳. تشکیل FVG ۳ کندلی و تضمین بسته شدن کندل سوم
    smcCandles[12] = makeCandle(baseTs + 12 * stepMs, 1.2000, 1.2010, 1.1995, 1.2005); // کندل ۱: high = 1.2010
    smcCandles[13] = makeCandle(baseTs + 13 * stepMs, 1.2005, 1.2050, 1.2000, 1.2045); // کندل ۲: جهش قوی
    smcCandles[14] = makeCandle(baseTs + 14 * stepMs, 1.2045, 1.2060, 1.2025, 1.2055); // کندل ۳: low = 1.2025 > 1.2010 -> گپ = 1.2025 - 1.2010 = 0.0015

    const fvgRes = SmcPrimitives.detectFvg(smcCandles, 14, 'WICK_TO_WICK', 0, 'EURUSD');
    const fvgDetected = fvgRes !== null && fvgRes.type === 'BULLISH' && fvgRes.availableAt === smcCandles[14].timestamp;

    // ۴. آزمون تفاوت BOS با کلوز در برابر شدو
    // ساخت سووینگ سقف در کندل ۱۵ تاییدشده
    smcCandles[15] = makeCandle(baseTs + 15 * stepMs, 1.2055, 1.2080, 1.2050, 1.2070);
    smcCandles[16] = makeCandle(baseTs + 16 * stepMs, 1.2070, 1.2075, 1.2050, 1.2060);
    smcCandles[17] = makeCandle(baseTs + 17 * stepMs, 1.2060, 1.2065, 1.2040, 1.2050);
    const highSwings = SmcPrimitives.detectFractalSwings(smcCandles.slice(0, 18), 2, 2, '5M').filter(s => s.type === 'HIGH');

    // کندل ۱۸: شدو نفوذ کرده (high = 1.2085 > 1.2080) اما کلوز نفوذ نکرده (close = 1.2075 < 1.2080)
    smcCandles[18] = makeCandle(baseTs + 18 * stepMs, 1.2050, 1.2085, 1.2045, 1.2075);
    const bosCloseFail = SmcPrimitives.evaluateBos(smcCandles[18], 18, highSwings, 'EURUSD', 'CLOSE_BREAK', 0);
    const bosWickPass = SmcPrimitives.evaluateBos(smcCandles[18], 18, highSwings, 'EURUSD', 'WICK_BREAK', 0);

    const bosDistinction = !bosCloseFail.detected && bosWickPass.detected;

    results.push({
      name: '4.1 SMC Primitives Anti-Lookahead, Reclaim and BOS Close vs Wick Distinction',
      passed: notConfirmedAt6 && antiLookAheadSwing && sweepConfirmed && fvgDetected && bosDistinction,
      details: `SwingConfirmed: ${antiLookAheadSwing}, Sweep: ${sweepConfirmed}, FVG: ${fvgDetected}, BOS Distinction: ${bosDistinction}`,
    });
  } catch (error) {
    results.push({
      name: '4.1 SMC Primitives Anti-Lookahead, Reclaim and BOS Close vs Wick Distinction',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ==========================================================================
  // بخش ۵: مهار خطا در صورت عدم تطابق قابلیت‌های داده (Data Capability Enforcement)
  // ==========================================================================
  try {
    const dummyDef: StrategyDefinition = {
      ...StrategyLegacyAdapters.createResearchVariantDefinition('S0_SWEEP_ONLY'),
      requiredCapabilities: ['OHLC', 'REAL_SOURCE_VOLUME', 'DEPTH_OF_MARKET'],
    };

    const dummyCandles = [
      makeCandle(1700000000000, 1.2, 1.21, 1.19, 1.2),
      makeCandle(1700000060000, 1.2, 1.21, 1.19, 1.2),
    ];

    // فقط OHLC و TICK_VOLUME در دسترس است؛ DEPTH_OF_MARKET و REAL_SOURCE_VOLUME غایب هستند
    const evalResult = StrategyDefinitionEvaluator.evaluate(
      dummyDef,
      dummyCandles,
      'EURUSD',
      '5M',
      1,
      ['OHLC', 'TICK_VOLUME']
    );

    const capabilityHandled = evalResult.overallStatus === 'NOT_AVAILABLE' &&
      evalResult.rejectionReasons.includes('DATA_CAPABILITY_MISSING') &&
      evalResult.dataCapabilityWarnings.length > 0;

    results.push({
      name: '5.1 Missing Data Capabilities Enforcement without Runtime Crashes',
      passed: capabilityHandled,
      details: `Status: ${evalResult.overallStatus}, Warnings: ${evalResult.dataCapabilityWarnings.join('; ')}`,
    });
  } catch (error) {
    results.push({
      name: '5.1 Missing Data Capabilities Enforcement without Runtime Crashes',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ==========================================================================
  // بخش ۶: سازگاری آداپتورهای مهاجرت ۵ سبک و ۶ استراتژی به تعاریف متعارف
  // ==========================================================================
  try {
    const legacyStyles = ['SCALP_M1_M5', 'SMC_INTRADAY', 'TREND_BREAKOUT', 'SWING_MACRO', 'MEAN_REVERSION'] as const;
    const researchVariants = [
      'S0_SWEEP_ONLY',
      'S0_SWEEP_FVG',
      'BOS_ORDER_BLOCK_V1',
      'FVG_EQUILIBRIUM_V1',
      'MEAN_REVERSION_V1',
      'TREND_BREAKOUT_55_EMA200_V1',
    ] as const;

    let allStylesMigrated = true;
    let allVariantsMigrated = true;

    for (const style of legacyStyles) {
      const def = StrategyLegacyAdapters.createLegacyStyleDefinition(style);
      const val = StrategyDefinitionSerializer.validate(def);
      if (!val.valid || !def.metadata.deterministicHash) {
        allStylesMigrated = false;
      }
    }

    for (const variant of researchVariants) {
      const def = StrategyLegacyAdapters.createResearchVariantDefinition(variant);
      const val = StrategyDefinitionSerializer.validate(def);
      if (!val.valid || !def.metadata.deterministicHash) {
        allVariantsMigrated = false;
      }
    }

    // آزمون تابع migrateLegacyToDefinition
    const roundTripDef = StrategyLegacyAdapters.migrateLegacyToDefinition('TREND_BREAKOUT_55_EMA200_V1');
    const roundTripValid = roundTripDef.definitionId === 'STRAT_RESEARCH_TREND_BREAKOUT_55_EMA200_V1';

    results.push({
      name: '6.1 Legacy Styles and Research Strategy Variants Migration to Canonical Schema',
      passed: allStylesMigrated && allVariantsMigrated && roundTripValid,
      details: `5 Styles: ${allStylesMigrated}, 6 Variants: ${allVariantsMigrated}, Dynamic Migrate: ${roundTripValid}`,
    });
  } catch (error) {
    results.push({
      name: '6.1 Legacy Styles and Research Strategy Variants Migration to Canonical Schema',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ==========================================================================
  // بخش ۷: یکپارچه‌سازی کامل ارزیابی، تولید کاندیدا و اتصال به DecisionTrace
  // ==========================================================================
  try {
    const def = StrategyLegacyAdapters.createResearchVariantDefinition('S0_SWEEP_ONLY');
    const candles: Candle[] = [];
    const baseTs = 1700000000000;
    const stepMs = 300000;

    for (let i = 0; i < 25; i++) {
      candles.push(makeCandle(baseTs + i * stepMs, 1.2500, 1.2510, 1.2490, 1.2500));
    }

    // تشکیل کف سووینگ تاییدشده در کندل ۸ (تایید در ۱۰)
    candles[8] = makeCandle(baseTs + 8 * stepMs, 1.2500, 1.2505, 1.2450, 1.2490);
    candles[9] = makeCandle(baseTs + 9 * stepMs, 1.2490, 1.2510, 1.2480, 1.2500);
    candles[10] = makeCandle(baseTs + 10 * stepMs, 1.2500, 1.2520, 1.2495, 1.2515);

    // سوییپ و ری‌کلیم در کندل ۱۸
    candles[18] = makeCandle(baseTs + 18 * stepMs, 1.2500, 1.2505, 1.2440, 1.2470);

    const evalResult = StrategyDefinitionEvaluator.evaluate(
      def,
      candles,
      'EURUSD',
      '5M',
      18,
      ['OHLC', 'CLOSED_BAR_STATUS', 'REAL_SOURCE_VOLUME']
    );

    const isPass = evalResult.overallStatus === 'PASS';
    const candidateGenerated = evalResult.candidate !== null &&
      evalResult.candidate.direction === 'BUY' &&
      evalResult.candidate.entryPrice === candles[18].close &&
      evalResult.candidate.stopLossPrice < candles[18].close;

    // ساخت تریس استاندارد DecisionTrace بر پایه خروجی ارزیابی
    const trace = buildDecisionTraceFromEvaluation(
      'RUN_1001',
      evalResult,
      'EURUSD',
      '5M',
      'BUY',
      candles[18].timestamp,
      'FINGERPRINT_EURUSD_5M'
    );

    const traceValid = trace.traceId.startsWith('TRACE-') &&
      trace.strategyId === def.definitionId &&
      trace.overallEvaluationStatus === 'PASS' &&
      trace.ruleEvaluations.length > 0 &&
      trace.candidateId === evalResult.candidate?.id;

    results.push({
      name: '7.1 End-to-End Evaluation, Candidate Synthesis, and DecisionTrace Generation',
      passed: isPass && candidateGenerated && traceValid,
      details: `Status: ${evalResult.overallStatus}, Candidate: ${evalResult.candidate?.id}, Trace: ${trace.traceId}`,
    });
  } catch (error) {
    results.push({
      name: '7.1 End-to-End Evaluation, Candidate Synthesis, and DecisionTrace Generation',
      passed: false,
      details: (error as Error).message,
    });
  }

  return results;
}
