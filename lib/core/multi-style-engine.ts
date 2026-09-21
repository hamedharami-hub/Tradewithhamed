import { Candle, SymbolId, Timeframe } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { MarketRegimeAnalysis, TradingStyleType } from '../contracts/regimes';
import { MarketRegimeClassifier } from './market-regime-classifier';
import { evaluateS0Strategy } from './s0-engine';
import { calculateWilderATR } from './atr';
import { detectSwingPoints } from './swings';
import {
  StrategyParameters,
  getDefaultStrategyParameters,
} from '../contracts/strategy-parameters';

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

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const result = [values[0]];
  for (let index = 1; index < values.length; index++) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier));
  }
  return result;
}

/**
 * موتور جامع سبک‌های معاملاتی چندگانه (Multi-Style Trading Engine 2026)
 * با قابلیت تنظیم پارامترهای اختصاصی، تایم‌فریم و رژیم‌های بازار
 */
export class MultiStyleEngine {
  /**
   * ۱. ردیاب سبک اسکلپینگ سریع (Fast Momentum Scalp)
   */
  public static evaluateScalp(
    symbol: SymbolId,
    candles: Candle[],
    timeframe: Timeframe = '5M',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    if (candles.length < 10) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const common = params?.common;
    const scalpParams = params?.scalp;

    const prevCandle = candles[candles.length - 2];
    const atrs = calculateWilderATR(candles, common?.atrPeriod || 7);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 1.5 : 0.0008;

    if (currentAtr < (scalpParams?.minAtr || 0.0002)) return null;

    const canBuy = !common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY';
    const canSell = !common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY';
    const rr = common?.riskRewardRatio ?? 1.5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars ?? 3) * tfMs;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const atrMultiplier = common?.atrMultiplier ?? 0.2;

    // اسکلپ خرید: سوییپ میکرو کف کندل قبل و بسته شدن پرقدرت در یک‌سوم بالایی
    const isBullishMicroReversal =
      currentCandle.low < prevCandle.low &&
      currentCandle.close > prevCandle.close &&
      currentCandle.close > currentCandle.open;

    if (canBuy && isBullishMicroReversal) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.low - currentAtr * atrMultiplier).toFixed(precision));
      const slDist = entryPrice - stopLossPrice;
      if (slDist > 0) {
        const takeProfitPrice = Number((entryPrice + slDist * rr).toFixed(precision));
        return {
          id: `SCALP-BUY-${currentCandle.timestamp}`,
          strategyName: 'اسکلپ مومنتوم سریع (M1/M5 Micro-Sweep)',
          symbol,
          timeframe,
          direction: 'BUY',
          style: 'SCALP_M1_M5',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { sweepId: `MICRO-LOW-${prevCandle.timestamp}` },
          rationale: `سوییپ سریع میکروکف با بازگشت شتابان در تایم‌فریم ${timeframe}؛ تارگت ${rr}R.`,
          status: 'CONFIRMED',
        };
      }
    }

    // اسکلپ فروش: سوییپ میکرو سقف کندل قبل و بسته شدن پرقدرت در یک‌سوم پایینی
    const isBearishMicroReversal =
      currentCandle.high > prevCandle.high &&
      currentCandle.close < prevCandle.close &&
      currentCandle.close < currentCandle.open;

    if (canSell && isBearishMicroReversal) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.high + currentAtr * atrMultiplier).toFixed(precision));
      const slDist = stopLossPrice - entryPrice;
      if (slDist > 0) {
        const takeProfitPrice = Number((entryPrice - slDist * rr).toFixed(precision));
        return {
          id: `SCALP-SELL-${currentCandle.timestamp}`,
          strategyName: 'اسکلپ مومنتوم سریع (M1/M5 Micro-Sweep)',
          symbol,
          timeframe,
          direction: 'SELL',
          style: 'SCALP_M1_M5',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { sweepId: `MICRO-HIGH-${prevCandle.timestamp}` },
          rationale: `سوییپ سریع میکروسقف با فشار فروش لحظه‌ای در تایم‌فریم ${timeframe}؛ تارگت ${rr}R.`,
          status: 'CONFIRMED',
        };
      }
    }

    return null;
  }

  /**
   * ۲. ردیاب سبک پرایس‌اکشن اسمارت‌مانی (SMC / S0)
   */
  public static evaluateSMC(
    symbol: SymbolId,
    candles: Candle[],
    timeframe: Timeframe = '5M',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    const candidate = evaluateS0Strategy(symbol, candles, candles, timeframe, params);
    if (candidate) {
      return {
        ...candidate,
        style: 'SMC_INTRADAY',
        strategyName: 'اسمارت‌مانی درون‌روز S0 (FVG + Liquidity Sweep)',
      };
    }
    return null;
  }

  /**
   * ۳. شکست کانال در جهت رژیم روند.
   */
  public static evaluateTrendBreakout(
    symbol: SymbolId,
    candles: Candle[],
    regime: MarketRegimeAnalysis,
    timeframe: Timeframe = '15M',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    const common = params?.common;
    const tbParams = params?.trendBreakout;

    const lookback = tbParams?.channelPeriod || 55;
    const slowEmaPeriod = tbParams?.slowEmaPeriod || 200;
    const minCandles = Math.min(slowEmaPeriod + 1, Math.max(30, lookback + 1));
    if (candles.length < minCandles) return null;

    const current = candles[candles.length - 1];
    if (!current.isClosed) return null;

    const history = candles.slice(0, -1);
    const channel = history.slice(-lookback);
    if (channel.length === 0) return null;

    const priorHigh = Math.max(...channel.map(candle => candle.high));
    const priorLow = Math.min(...channel.map(candle => candle.low));
    const closes = candles.map(candle => candle.close);
    const effectiveEmaPeriod = candles.length >= slowEmaPeriod ? slowEmaPeriod : Math.max(10, Math.floor(candles.length / 2));
    const ema200 = calculateEMA(closes, effectiveEmaPeriod);
    const currentEma = ema200[ema200.length - 1];
    const previousEma = ema200[ema200.length - 2] || currentEma;
    const atrs = calculateWilderATR(candles, common?.atrPeriod || 20);
    const atr = atrs[atrs.length - 1] || (symbol === 'XAUUSD' ? 2.5 : 0.0015);
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars || 6) * tfMs;
    const rr = common?.riskRewardRatio ?? 2.0;
    const buffer = (tbParams?.breakoutBufferAtr || 0) * atr;

    const canBuy =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY') &&
      (regime.regime === 'TRENDING_BULLISH' || regime.regime === 'COMPRESSION');
    const canSell =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY') &&
      (regime.regime === 'TRENDING_BEARISH' || regime.regime === 'COMPRESSION');

    if (canBuy && current.close > (priorHigh + buffer) && currentEma >= previousEma) {
      const entryPrice = current.close;
      const stopLossPrice = Number((entryPrice - atr * (common?.atrMultiplier || 2)).toFixed(precision));
      const slDist = entryPrice - stopLossPrice;
      if (slDist > 0) {
        const takeProfitPrice = Number((entryPrice + slDist * rr).toFixed(precision));
        return {
          id: `BREAKOUT-BUY-${current.timestamp}`,
          strategyName: 'شکست روندی کانال (Regime-Filtered Breakout)',
          symbol,
          timeframe,
          direction: 'BUY',
          style: 'TREND_BREAKOUT',
          createdAtTimestamp: current.timestamp,
          expiresAtTimestamp: current.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `CHANNEL-HIGH-${priorHigh}` },
          rationale: `بسته‌شدن بالای سقف کانال ${lookback} دوره‌ای در تایم‌فریم ${timeframe} با R:R=${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    if (canSell && current.close < (priorLow - buffer) && currentEma <= previousEma) {
      const entryPrice = current.close;
      const stopLossPrice = Number((entryPrice + atr * (common?.atrMultiplier || 2)).toFixed(precision));
      const slDist = stopLossPrice - entryPrice;
      if (slDist > 0) {
        const takeProfitPrice = Number((entryPrice - slDist * rr).toFixed(precision));
        return {
          id: `BREAKOUT-SELL-${current.timestamp}`,
          strategyName: 'شکست روندی کانال (Regime-Filtered Breakout)',
          symbol,
          timeframe,
          direction: 'SELL',
          style: 'TREND_BREAKOUT',
          createdAtTimestamp: current.timestamp,
          expiresAtTimestamp: current.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `CHANNEL-LOW-${priorLow}` },
          rationale: `بسته‌شدن زیر کف کانال ${lookback} دوره‌ای در تایم‌فریم ${timeframe} با R:R=${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    return null;
  }

  /**
   * ۴. ردیاب سبک سوئینگ کلان (Macro Trend Swing)
   */
  public static evaluateSwing(
    symbol: SymbolId,
    candles: Candle[],
    regime: MarketRegimeAnalysis,
    timeframe: Timeframe = '1H',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    if (candles.length < 25) return null;

    const common = params?.common;
    const canBuy = (!common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY') && regime.regime === 'TRENDING_BULLISH';
    const canSell = (!common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY') && regime.regime === 'TRENDING_BEARISH';

    if (!canBuy && !canSell) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const swings = detectSwingPoints(candles, timeframe);
    const atrs = calculateWilderATR(candles, common?.atrPeriod || 14);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 4.0 : 0.0025;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars || 24) * tfMs;
    const rr = common?.riskRewardRatio ?? 3.5;
    const atrMultiplier = common?.atrMultiplier ?? 0.5;

    // روند صعودی سوئینگ: پولبک به میانگین و حرکت مجدد در جهت روند
    if (canBuy) {
      const recentLows = swings.filter(s => s.type === 'LOW').slice(-2);
      const structuralLow = recentLows.length > 0 ? recentLows[recentLows.length - 1].price : currentCandle.low - currentAtr * 1.5;

      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((structuralLow - currentAtr * atrMultiplier).toFixed(precision));
      const slDist = entryPrice - stopLossPrice;

      if (slDist > 0 && currentCandle.close > currentCandle.open) {
        const takeProfitPrice = Number((entryPrice + slDist * rr).toFixed(precision));
        return {
          id: `SWING-BUY-${currentCandle.timestamp}`,
          strategyName: 'سوئینگ و ترند کلان (Macro Trend Continuation)',
          symbol,
          timeframe,
          direction: 'BUY',
          style: 'SWING_MACRO',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `STRUCT-LOW-${structuralLow}` },
          rationale: `تداوم روند پرشتاب کلان صعودی در تایم‌فریم ${timeframe}؛ نسبت ریسک به ریوارد 1:${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    // روند نزولی سوئینگ
    if (canSell) {
      const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-2);
      const structuralHigh = recentHighs.length > 0 ? recentHighs[recentHighs.length - 1].price : currentCandle.high + currentAtr * 1.5;

      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((structuralHigh + currentAtr * atrMultiplier).toFixed(precision));
      const slDist = stopLossPrice - entryPrice;

      if (slDist > 0 && currentCandle.close < currentCandle.open) {
        const takeProfitPrice = Number((entryPrice - slDist * rr).toFixed(precision));
        return {
          id: `SWING-SELL-${currentCandle.timestamp}`,
          strategyName: 'سوئینگ و ترند کلان (Macro Trend Continuation)',
          symbol,
          timeframe,
          direction: 'SELL',
          style: 'SWING_MACRO',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `STRUCT-HIGH-${structuralHigh}` },
          rationale: `فروش در ریتریسمنت روند نزولی کلان در تایم‌فریم ${timeframe}؛ نسبت سود به ضرر 1:${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    return null;
  }

  /**
   * ۵. ردیاب سبک بازگشت به میانگین (Statistical Mean Reversion)
   */
  public static evaluateMeanReversion(
    symbol: SymbolId,
    candles: Candle[],
    timeframe: Timeframe = '5M',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    const common = params?.common;
    const mrParams = params?.meanReversion;

    const lookback = mrParams?.lookbackPeriod || 20;
    if (candles.length < lookback) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const sample = candles.slice(-lookback).map(c => c.close);
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sample.length;
    const stdDev = Math.sqrt(variance);

    const zThresh = mrParams?.zScoreThreshold || 2.0;
    const upperBand = mean + stdDev * zThresh;
    const lowerBand = mean - stdDev * zThresh;
    const atrs = calculateWilderATR(candles, common?.atrPeriod || 14);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 2.0 : 0.001;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars || 8) * tfMs;
    const atrMultiplier = common?.atrMultiplier ?? 0.2;

    const canBuy = !common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY';
    const canSell = !common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY';

    // خرید از باند پایین به سمت میانگین: نفوذ به زیر باند و بازگشت به سمت خط تعادل
    const isLowerRejection = currentCandle.low < lowerBand && currentCandle.close > currentCandle.low;
    if (canBuy && isLowerRejection && currentCandle.close < mean) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.low - currentAtr * atrMultiplier).toFixed(precision));
      const slDist = entryPrice - stopLossPrice;
      if (slDist > 0 && mean > entryPrice) {
        const takeProfitPrice = Number(mean.toFixed(precision));
        const calculatedRr = Number(((takeProfitPrice - entryPrice) / slDist).toFixed(2));
        if (calculatedRr >= 0.8) {
          return {
            id: `MEANREV-BUY-${currentCandle.timestamp}`,
            strategyName: 'بازگشت به میانگین آماری (Band Exhaustion Reversion)',
            symbol,
            timeframe,
            direction: 'BUY',
            style: 'MEAN_REVERSION',
            createdAtTimestamp: currentCandle.timestamp,
            expiresAtTimestamp: currentCandle.timestamp + expiryMs,
            entryPrice,
            stopLossPrice,
            takeProfitPrice,
            riskRewardRatio: calculatedRr,
            evidenceIds: { sweepId: `BAND-LOWER-${lowerBand.toFixed(2)}` },
            rationale: `اشباع فروش در انحراف معیار ${zThresh}- در تایم‌فریم ${timeframe} و بازگشت قیمت با R:R=${calculatedRr}.`,
            status: 'CONFIRMED',
          };
        }
      }
    }

    // فروش از باند بالا به سمت میانگین
    const isUpperRejection = currentCandle.high > upperBand && currentCandle.close < currentCandle.high;
    if (canSell && isUpperRejection && currentCandle.close > mean) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.high + currentAtr * atrMultiplier).toFixed(precision));
      const slDist = stopLossPrice - entryPrice;
      if (slDist > 0 && mean < entryPrice) {
        const takeProfitPrice = Number(mean.toFixed(precision));
        const calculatedRr = Number(((entryPrice - takeProfitPrice) / slDist).toFixed(2));
        if (calculatedRr >= 0.8) {
          return {
            id: `MEANREV-SELL-${currentCandle.timestamp}`,
            strategyName: 'بازگشت به میانگین آماری (Band Exhaustion Reversion)',
            symbol,
            timeframe,
            direction: 'SELL',
            style: 'MEAN_REVERSION',
            createdAtTimestamp: currentCandle.timestamp,
            expiresAtTimestamp: currentCandle.timestamp + expiryMs,
            entryPrice,
            stopLossPrice,
            takeProfitPrice,
            riskRewardRatio: calculatedRr,
            evidenceIds: { sweepId: `BAND-UPPER-${upperBand.toFixed(2)}` },
            rationale: `اشباع خرید در انحراف معیار ${zThresh}+ در تایم‌فریم ${timeframe} و بازگشت قیمت با R:R=${calculatedRr}.`,
            status: 'CONFIRMED',
          };
        }
      }
    }

    return null;
  }

  /**
   * هاب مرکزی ارزیابی: طبقه‌بندی رژیم بازار و انتخاب بهینه‌ترین ستاپ
   */
  public static evaluate(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    filterStyle: TradingStyleType | 'ALL' = 'ALL',
    timeframe: Timeframe = '5M',
    params?: StrategyParameters
  ): {
    regime: MarketRegimeAnalysis;
    candidate: StrategyCandidate | null;
    allCandidates: StrategyCandidate[];
  } {
    const regime = MarketRegimeClassifier.classify(candles);
    const candidates: StrategyCandidate[] = [];

    // ۱. بررسی سبک اسکلپ
    if (filterStyle === 'ALL' || filterStyle === 'SCALP_M1_M5') {
      const scalpCand = this.evaluateScalp(symbol, candles, timeframe, params);
      if (scalpCand) candidates.push(scalpCand);
    }

    // ۲. بررسی سبک اسمارت‌مانی
    if (filterStyle === 'ALL' || filterStyle === 'SMC_INTRADAY') {
      const smcCand = this.evaluateSMC(symbol, candles, timeframe, params);
      if (smcCand) candidates.push(smcCand);
    }

    // ۳. بررسی شکست روندی فقط در رژیم سازگار
    if (filterStyle === 'ALL' || filterStyle === 'TREND_BREAKOUT') {
      const breakoutCand = this.evaluateTrendBreakout(symbol, candles, regime, timeframe, params);
      if (breakoutCand) candidates.push(breakoutCand);
    }

    // ۴. بررسی سبک سوئینگ
    if (filterStyle === 'ALL' || filterStyle === 'SWING_MACRO') {
      const swingCand = this.evaluateSwing(symbol, candles, regime, timeframe, params);
      if (swingCand) candidates.push(swingCand);
    }

    // ۵. بررسی سبک بازگشت به میانگین
    if (filterStyle === 'ALL' || filterStyle === 'MEAN_REVERSION') {
      const mrCand = this.evaluateMeanReversion(symbol, candles, timeframe, params);
      if (mrCand) candidates.push(mrCand);
    }

    // غنی‌سازی کاندیداها با اطلاعات رژیم بازار و تطبیق‌پذیری
    const enrichedCandidates = candidates.map(c => {
      const isRecommended = c.style ? regime.recommendedStyles.includes(c.style) : false;
      const isBlocked = c.style ? regime.blockedStyles.includes(c.style) : false;
      const regimeScore = isBlocked ? 25 : isRecommended ? 95 : 65;

      return {
        ...c,
        regimeAtCreation: regime.regime,
        regimeScore,
      };
    });

    // سورت کاندیداها: اولویت با ستاپ‌هایی که بالاترین تطابق با رژیم بازار و بیشترین R:R را دارند
    enrichedCandidates.sort((a, b) => {
      const scoreDiff = (b.regimeScore || 0) - (a.regimeScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return b.riskRewardRatio - a.riskRewardRatio;
    });

    const activeCandidate = enrichedCandidates.length > 0 ? enrichedCandidates[0] : null;

    return {
      regime,
      candidate: activeCandidate,
      allCandidates: enrichedCandidates,
    };
  }
}
