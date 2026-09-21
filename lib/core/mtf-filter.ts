// lib/core/mtf-filter.ts
// موتور فیلترهای چندتایم‌فریمی بر روی کندل‌های گذشته تاییدشده (HTF Filters)
// پشتیبانی از TREND_EMA, MARKET_STRUCTURE, MOMENTUM, VOLATILITY و COMBINED

import { Candle, Timeframe } from '../contracts/market';
import {
  HigherTimeframeFilterMode,
  MultiTimeframeConfig,
} from '../contracts/strategy-parameters';
import { calculateWilderATR } from './atr';
import { detectSwingPoints } from './swings';

export interface MtfFilterEvaluationResult {
  allowed: boolean;
  filterMode: HigherTimeframeFilterMode;
  reasonCode: string;
  reasonFa: string;
  approvedFilters?: string[];
  rejectedFilters?: string[];
  htfMetrics?: {
    trendEma?: number;
    trendSlope?: number;
    marketStructure?: 'BULLISH_HH_HL' | 'BEARISH_LH_LL' | 'RANGE' | 'INSUFFICIENT_DATA';
    momentumValue?: number;
    atrValue?: number;
    atrPercentile?: number;
  };
}

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * multiplier + result[i - 1] * (1 - multiplier));
  }
  return result;
}

export class MtfFilterEngine {
  /**
   * متد کمکی ارزیابی فیلتر با ورودی شئ یکپارچه
   */
  public static evaluateFilter(params: {
    executionCandle: Candle;
    htfCandle: Candle | null;
    htfHistory: readonly Candle[];
    candidateDirection: 'BUY' | 'SELL';
    config?: MultiTimeframeConfig;
  }): { isApproved: boolean; filterMode: HigherTimeframeFilterMode; reasonCode: string; reasonFa: string } {
    const config = params.config;
    if (!config || !config.enabled || config.higherTimeframeFilterMode === 'OFF') {
      return {
        isApproved: true,
        filterMode: 'OFF',
        reasonCode: 'MTF_FILTER_OFF',
        reasonFa: 'فیلتر تایم‌فریم بالاتر غیرفعال است (بیس‌لاین تک‌تایم‌فریمی).',
      };
    }

    if (!params.htfCandle || !params.htfHistory || params.htfHistory.length === 0) {
      return {
        isApproved: false,
        filterMode: config.higherTimeframeFilterMode,
        reasonCode: 'NO_HTF_CANDLE',
        reasonFa: 'کندل بسته تایم‌فریم بالاتر موجود نیست',
      };
    }

    const res = this.evaluateCandidate(
      params.candidateDirection,
      params.htfHistory,
      config.higherTimeframe || '1H',
      config
    );

    return {
      isApproved: res.allowed,
      filterMode: res.filterMode,
      reasonCode: res.reasonCode,
      reasonFa: res.reasonFa,
    };
  }

  /**
   * ارزیابی کاندیدای معامله بر اساس فیلتر تایم‌فریم بالاتر
   * نکته حیاتی: htfCandles باید فقط شامل کندل‌های تاییدشده گذشته باشد.
   */
  public static evaluateCandidate(
    direction: 'BUY' | 'SELL',
    htfCandles: readonly Candle[],
    timeframe: Timeframe,
    config?: MultiTimeframeConfig
  ): MtfFilterEvaluationResult {
    const filterMode = config?.higherTimeframeFilterMode || 'OFF';

    // ۱. حالت OFF: بازتولید دقیق بیس‌لاین تک‌تایم‌فریمی
    if (filterMode === 'OFF' || !config) {
      return {
        allowed: true,
        filterMode: 'OFF',
        reasonCode: 'MTF_FILTER_OFF',
        reasonFa: 'فیلتر تایم‌فریم بالاتر غیرفعال است (بیس‌لاین تک‌تایم‌فریمی).',
      };
    }

    if (!htfCandles || htfCandles.length < 10) {
      return {
        allowed: false,
        filterMode,
        reasonCode: 'INSUFFICIENT_HTF_HISTORY',
        reasonFa: `تاریخچه کندل‌های تایم‌فریم بالاتر (${timeframe}) برای ارزیابی فیلتر کافی نیست (حداقل ۱۰ کندل نیاز است).`,
      };
    }

    switch (filterMode) {
      case 'TREND_EMA':
        return this.evaluateTrendEma(direction, htfCandles, config);
      case 'MARKET_STRUCTURE':
        return this.evaluateMarketStructure(direction, htfCandles, timeframe, config);
      case 'MOMENTUM':
        return this.evaluateMomentum(direction, htfCandles, config);
      case 'VOLATILITY':
        return this.evaluateVolatility(htfCandles, config);
      case 'COMBINED':
        return this.evaluateCombined(direction, htfCandles, timeframe, config);
      default:
        return {
          allowed: true,
          filterMode: 'OFF',
          reasonCode: 'UNKNOWN_MODE_PASSED',
          reasonFa: 'حالت فیلتر نامشخص بود.',
        };
    }
  }

  // ─── ۲. فیلتر روند میانگین متحرک (TREND_EMA) ───────────────────────────
  private static evaluateTrendEma(
    direction: 'BUY' | 'SELL',
    htfCandles: readonly Candle[],
    config: MultiTimeframeConfig
  ): MtfFilterEvaluationResult {
    const period = config.trendEmaSettings?.trendEmaPeriod || 50;
    const lookback = config.trendEmaSettings?.trendSlopeLookback || 3;
    const minSlope = config.trendEmaSettings?.minimumSlope || 0.0;

    const closes = htfCandles.map(c => c.close);
    const effectivePeriod = Math.min(period, Math.max(5, Math.floor(closes.length * 0.8)));
    const emaValues = calculateEMA(closes, effectivePeriod);

    const currentIdx = emaValues.length - 1;
    const currentEma = emaValues[currentIdx];
    const prevIdx = Math.max(0, currentIdx - lookback);
    const prevEma = emaValues[prevIdx];
    const slope = (currentEma - prevEma) / Math.max(1, lookback);
    const lastClose = closes[currentIdx];

    if (direction === 'BUY') {
      const isBullish = lastClose >= currentEma && slope >= minSlope;
      return {
        allowed: isBullish,
        filterMode: 'TREND_EMA',
        reasonCode: isBullish ? 'MTF_TREND_BULLISH_CONFIRMED' : 'MTF_TREND_OPPOSITE_BEARISH',
        reasonFa: isBullish
          ? `روند تایم‌فریم بالاتر صعودی است (کلوز ${lastClose} >= EMA ${currentEma.toFixed(4)}، شیب ${slope.toFixed(6)}).`
          : `معامله خرید رد شد؛ روند تایم‌فریم بالاتر نزولی یا زیر EMA است (کلوز ${lastClose} < EMA ${currentEma.toFixed(4)} یا شیب منفی).`,
        htfMetrics: {
          trendEma: Number(currentEma.toFixed(5)),
          trendSlope: Number(slope.toFixed(6)),
        },
      };
    } else {
      const isBearish = lastClose <= currentEma && slope <= -minSlope;
      return {
        allowed: isBearish,
        filterMode: 'TREND_EMA',
        reasonCode: isBearish ? 'MTF_TREND_BEARISH_CONFIRMED' : 'MTF_TREND_OPPOSITE_BULLISH',
        reasonFa: isBearish
          ? `روند تایم‌فریم بالاتر نزولی است (کلوز ${lastClose} <= EMA ${currentEma.toFixed(4)}، شیب ${slope.toFixed(6)}).`
          : `معامله فروش رد شد؛ روند تایم‌فریم بالاتر صعودی یا بالای EMA است (کلوز ${lastClose} > EMA ${currentEma.toFixed(4)} یا شیب مثبت).`,
        htfMetrics: {
          trendEma: Number(currentEma.toFixed(5)),
          trendSlope: Number(slope.toFixed(6)),
        },
      };
    }
  }

  // ─── ۳. ساختار بازار تایم‌فریم بالاتر (MARKET_STRUCTURE) ────────────────
  private static evaluateMarketStructure(
    direction: 'BUY' | 'SELL',
    htfCandles: readonly Candle[],
    timeframe: Timeframe,
    config: MultiTimeframeConfig
  ): MtfFilterEvaluationResult {
    const lookback = config.structureSettings?.structureLookback || 10;
    const minPoints = config.structureSettings?.minimumStructurePoints || 2;

    const swings = detectSwingPoints([...htfCandles], timeframe);
    const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= htfCandles.length - 1);

    if (confirmedSwings.length < minPoints) {
      return {
        allowed: false,
        filterMode: 'MARKET_STRUCTURE',
        reasonCode: 'MTF_INSUFFICIENT_STRUCTURE',
        reasonFa: `نقاط پیوت ساختار تاییدشده کافی در تایم‌فریم بالاتر یافت نشد (${confirmedSwings.length} از حداقل ${minPoints}).`,
        htfMetrics: { marketStructure: 'INSUFFICIENT_DATA' },
      };
    }

    const recentSwings = confirmedSwings.slice(-lookback);
    const highs = recentSwings.filter(s => s.type === 'HIGH');
    const lows = recentSwings.filter(s => s.type === 'LOW');

    let isHigherHigh = false;
    let isHigherLow = false;
    let isLowerHigh = false;
    let isLowerLow = false;

    if (highs.length >= 2) {
      isHigherHigh = highs[highs.length - 1].price > highs[highs.length - 2].price;
      isLowerHigh = highs[highs.length - 1].price < highs[highs.length - 2].price;
    }
    if (lows.length >= 2) {
      isHigherLow = lows[lows.length - 1].price > lows[lows.length - 2].price;
      isLowerLow = lows[lows.length - 1].price < lows[lows.length - 2].price;
    }

    let structure: 'BULLISH_HH_HL' | 'BEARISH_LH_LL' | 'RANGE' = 'RANGE';
    if (isHigherHigh && isHigherLow) structure = 'BULLISH_HH_HL';
    else if (isLowerHigh && isLowerLow) structure = 'BEARISH_LH_LL';

    const allowed = (direction === 'BUY' && structure === 'BULLISH_HH_HL') ||
                    (direction === 'SELL' && structure === 'BEARISH_LH_LL');

    return {
      allowed,
      filterMode: 'MARKET_STRUCTURE',
      reasonCode: allowed ? `MTF_STRUCTURE_${structure}` : `MTF_STRUCTURE_MISALIGNED_${structure}`,
      reasonFa: allowed
        ? `ساختار بازار در تایم‌فریم بالاتر با جهت ${direction} هم‌راستاست (${structure}).`
        : `کاندیدای ${direction} به دلیل عدم هم‌راستایی ساختار بازار تایم‌فریم بالاتر (${structure}) رد شد.`,
      htfMetrics: { marketStructure: structure },
    };
  }

  // ─── ۴. فیلتر مومنتوم تایم‌فریم بالاتر (MOMENTUM) ───────────────────────
  private static evaluateMomentum(
    direction: 'BUY' | 'SELL',
    htfCandles: readonly Candle[],
    config: MultiTimeframeConfig
  ): MtfFilterEvaluationResult {
    const period = config.momentumSettings?.momentumPeriod || 14;
    const threshold = config.momentumSettings?.momentumThreshold || 0.0;
    const method = config.momentumSettings?.momentumMethod || 'RATE_OF_CHANGE';

    const currentClose = htfCandles[htfCandles.length - 1].close;
    const pastIdx = Math.max(0, htfCandles.length - 1 - period);
    const pastClose = htfCandles[pastIdx].close;

    const rocPercent = pastClose > 0 ? ((currentClose - pastClose) / pastClose) * 100 : 0;

    let isPositive = rocPercent >= threshold;
    let isNegative = rocPercent <= -threshold;

    if (method === 'EMA_SLOPE') {
      const closes = htfCandles.map(c => c.close);
      const ema = calculateEMA(closes, period);
      const slope = ema.length > 2 ? ema[ema.length - 1] - ema[ema.length - 2] : 0;
      isPositive = slope >= threshold;
      isNegative = slope <= -threshold;
    }

    const allowed = (direction === 'BUY' && isPositive) || (direction === 'SELL' && isNegative);

    return {
      allowed,
      filterMode: 'MOMENTUM',
      reasonCode: allowed ? 'MTF_MOMENTUM_CONFIRMED' : 'MTF_MOMENTUM_MISALIGNED',
      reasonFa: allowed
        ? `مومنتوم تایم‌فریم بالاتر هم‌جهت با ${direction} است (مقدار: ${rocPercent.toFixed(2)}٪).`
        : `مومنتوم تایم‌فریم بالاتر جهت ${direction} را تایید نکرد (مقدار: ${rocPercent.toFixed(2)}٪).`,
      htfMetrics: { momentumValue: Number(rocPercent.toFixed(3)) },
    };
  }

  // ─── ۵. فیلتر نوسان‌پذیری (VOLATILITY) ──────────────────────────────────
  private static evaluateVolatility(
    htfCandles: readonly Candle[],
    config: MultiTimeframeConfig
  ): MtfFilterEvaluationResult {
    const atrPeriod = config.volatilitySettings?.atrPeriod || 14;
    const minPercentile = config.volatilitySettings?.minimumAtrPercentile ?? 20;
    const maxPercentile = config.volatilitySettings?.maximumAtrPercentile ?? 90;
    const lookback = config.volatilitySettings?.percentileLookback || 50;

    const atrs = calculateWilderATR([...htfCandles], atrPeriod);
    if (atrs.length === 0) {
      return {
        allowed: true,
        filterMode: 'VOLATILITY',
        reasonCode: 'MTF_ATR_INSUFFICIENT_DATA',
        reasonFa: 'داده کافی برای محاسبه ATR نوسان‌پذیری موجود نیست.',
      };
    }

    const currentAtr = atrs[atrs.length - 1];
    const recentAtrs = atrs.slice(-lookback);
    const sorted = [...recentAtrs].sort((a, b) => a - b);
    const rank = sorted.findIndex(v => v >= currentAtr);
    const percentile = recentAtrs.length > 0 ? (Math.max(0, rank) / recentAtrs.length) * 100 : 50;

    const allowed = percentile >= minPercentile && percentile <= maxPercentile;

    return {
      allowed,
      filterMode: 'VOLATILITY',
      reasonCode: allowed ? 'MTF_VOLATILITY_IN_RANGE' : 'MTF_VOLATILITY_OUT_OF_RANGE',
      reasonFa: allowed
        ? `نوسان‌پذیری تایم‌فریم بالاتر در بازه مناسب قرار دارد (صدک ${percentile.toFixed(0)}٪ بین ${minPercentile}٪ و ${maxPercentile}٪).`
        : `نوسان‌پذیری تایم‌فریم بالاتر نامناسب است (صدک ${percentile.toFixed(0)}٪ خارج از بازه ${minPercentile}٪ تا ${maxPercentile}٪).`,
      htfMetrics: {
        atrValue: Number(currentAtr.toFixed(5)),
        atrPercentile: Number(percentile.toFixed(1)),
      },
    };
  }

  // ─── ۶. فیلتر ترکیبی چندگانه (COMBINED) ─────────────────────────────────
  private static evaluateCombined(
    direction: 'BUY' | 'SELL',
    htfCandles: readonly Candle[],
    timeframe: Timeframe,
    config: MultiTimeframeConfig
  ): MtfFilterEvaluationResult {
    const enabled = config.combinedSettings?.enabledFilters || ['TREND_EMA', 'MARKET_STRUCTURE'];
    const required = config.combinedSettings?.minimumConfirmations || Math.min(2, enabled.length);

    const approved: string[] = [];
    const rejected: string[] = [];

    for (const f of enabled) {
      let subRes: MtfFilterEvaluationResult;
      if (f === 'TREND_EMA') subRes = this.evaluateTrendEma(direction, htfCandles, config);
      else if (f === 'MARKET_STRUCTURE') subRes = this.evaluateMarketStructure(direction, htfCandles, timeframe, config);
      else if (f === 'MOMENTUM') subRes = this.evaluateMomentum(direction, htfCandles, config);
      else if (f === 'VOLATILITY') subRes = this.evaluateVolatility(htfCandles, config);
      else continue;

      if (subRes.allowed) approved.push(f);
      else rejected.push(f);
    }

    const allowed = approved.length >= required;

    return {
      allowed,
      filterMode: 'COMBINED',
      reasonCode: allowed ? 'MTF_COMBINED_QUORUM_PASSED' : 'MTF_COMBINED_QUORUM_FAILED',
      reasonFa: allowed
        ? `فیلتر ترکیبی تایید شد (${approved.length} از حداقل ${required} فیلتر فعال موافقت کردند: [${approved.join(', ')}]).`
        : `فیلتر ترکیبی رد شد (${approved.length} تایید کمتر از آستانه ${required} بود. ردشده‌ها: [${rejected.join(', ')}]).`,
      approvedFilters: approved,
      rejectedFilters: rejected,
    };
  }
}
