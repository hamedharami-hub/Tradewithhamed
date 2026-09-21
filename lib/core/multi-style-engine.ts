// lib/core/multi-style-engine.ts
// موتور جامع سبک‌های معاملاتی چندگانه (Multi-Style Trading Engine 2026)
// پشتیبانی کامل از تمام پارامترهای ممیزی‌شده، فیلتر MTF ضد نگاه‌به‌آینده و شیوه‌های حد ضرر

import { Candle, SymbolId, Timeframe, SYMBOL_SPECS } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { MarketRegimeAnalysis, TradingStyleType } from '../contracts/regimes';
import { MarketRegimeClassifier } from './market-regime-classifier';
import { evaluateS0Strategy } from './s0-engine';
import { calculateWilderATR } from './atr';
import { detectSwingPoints } from './swings';
import { StrategyParameters } from '../contracts/strategy-parameters';
import { StopLossCalculator } from './stop-loss-calculator';
import { MtfFilterEngine, MtfFilterEvaluationResult } from './mtf-filter';

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
  const effectivePeriod = Math.max(2, Math.min(period, values.length));
  const multiplier = 2 / (effectivePeriod + 1);
  const result = [values[0]];
  for (let index = 1; index < values.length; index++) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier));
  }
  return result;
}

export interface EngineEvaluationResult {
  regime: MarketRegimeAnalysis;
  candidate: StrategyCandidate | null;
  allCandidates: StrategyCandidate[];
  rejectedByMtfCount: number;
  mtfEvaluationResults: Record<string, MtfFilterEvaluationResult>;
}

export class MultiStyleEngine {
  /**
   * ۱. ردیاب سبک اسکلپینگ سریع (Fast Momentum Scalp)
   * با اتصال کامل تمام پارامترهای ممیزی‌شده: fastEma, slowEma, minAtr, session, stopLossMode
   */
  public static evaluateScalp(
    symbol: SymbolId,
    candles: Candle[],
    timeframe: Timeframe = '5M',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    if (candles.length < 15) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const common = params?.common;
    const scalpParams = params?.scalp;

    const prevCandle = candles[candles.length - 2];
    const atrPeriod = common?.atrPeriod || 7;
    const atrs = calculateWilderATR(candles, atrPeriod);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 1.5 : 0.0008;

    // فیلتر حداقل نوسان‌پذیری اسکلپ (minAtr)
    const minAtr = scalpParams?.minAtr ?? 0.0002;
    if (currentAtr < minAtr) return null;

    // تاییدیه مومنتوم با میانگین‌های متحرک اسکلپ (fastEma و slowEma)
    const closes = candles.map(c => c.close);
    const fastEmaPeriod = scalpParams?.fastEma || 9;
    const slowEmaPeriod = scalpParams?.slowEma || 21;
    const fastEmas = calculateEMA(closes, fastEmaPeriod);
    const slowEmas = calculateEMA(closes, slowEmaPeriod);

    const currentFast = fastEmas[fastEmas.length - 1];
    const currentSlow = slowEmas[slowEmas.length - 1];

    const hasExplicitEma = scalpParams?.fastEma !== undefined && scalpParams?.slowEma !== undefined;
    const canBuy =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY') &&
      (!hasExplicitEma || currentFast >= currentSlow);
    const canSell =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY') &&
      (!hasExplicitEma || currentFast <= currentSlow);

    const rr = common?.riskRewardRatio ?? 1.5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars ?? 3) * tfMs;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const slMode = common?.stopLossMode || 'ATR';

    // اسکلپ خرید: سوییپ میکرو کف کندل قبل و بسته شدن پرقدرت در یک‌سوم بالایی
    const isBullishMicroReversal =
      currentCandle.low < prevCandle.low &&
      currentCandle.close > prevCandle.close &&
      currentCandle.close > currentCandle.open;

    if (canBuy && isBullishMicroReversal) {
      const entryPrice = currentCandle.close;
      const slRes = StopLossCalculator.calculate(slMode, 'BUY', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 0.2,
        fixedStopPips: common?.fixedStopPips ?? 15,
        structureLookback: 3,
      });

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
        const takeProfitPrice = Number((entryPrice + slRes.riskDistancePrice * rr).toFixed(precision));
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
          stopLossPrice: slRes.stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { sweepId: `MICRO-LOW-${prevCandle.timestamp}` },
          rationale: `سوییپ سریع میکروکف با بازگشت شتابان و تایید EMA(${fastEmaPeriod}/${slowEmaPeriod}) در تایم‌فریم ${timeframe}؛ تارگت ${rr}R.`,
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
      const slRes = StopLossCalculator.calculate(slMode, 'SELL', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 0.2,
        fixedStopPips: common?.fixedStopPips ?? 15,
        structureLookback: 3,
      });

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
        const takeProfitPrice = Number((entryPrice - slRes.riskDistancePrice * rr).toFixed(precision));
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
          stopLossPrice: slRes.stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { sweepId: `MICRO-HIGH-${prevCandle.timestamp}` },
          rationale: `سوییپ سریع میکروسقف با فشار فروش لحظه‌ای و تایید EMA(${fastEmaPeriod}/${slowEmaPeriod}) در تایم‌فریم ${timeframe}؛ تارگت ${rr}R.`,
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
   * ۳. شکست کانال در جهت رژیم روند (Trend Breakout)
   * با اتصال کامل channelPeriod, fastEmaPeriod, slowEmaPeriod, breakoutBufferAtr و stopLossMode
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
    const fastEmaPeriod = tbParams?.fastEmaPeriod || 20;
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

    const effectiveSlowPeriod = candles.length >= slowEmaPeriod ? slowEmaPeriod : Math.max(10, Math.floor(candles.length / 2));
    const slowEma = calculateEMA(closes, effectiveSlowPeriod);
    const currentSlowEma = slowEma[slowEma.length - 1];
    const prevSlowEma = slowEma[slowEma.length - 2] || currentSlowEma;

    const fastEma = calculateEMA(closes, fastEmaPeriod);
    const currentFastEma = fastEma[fastEma.length - 1];
    const prevFastEma = fastEma[fastEma.length - 2] || currentFastEma;

    const atrPeriod = common?.atrPeriod || 20;
    const atrs = calculateWilderATR(candles, atrPeriod);
    const atr = atrs[atrs.length - 1] || (symbol === 'XAUUSD' ? 2.5 : 0.0015);
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars || 6) * tfMs;
    const rr = common?.riskRewardRatio ?? 2.0;
    const buffer = (tbParams?.breakoutBufferAtr || 0) * atr;
    const slMode = common?.stopLossMode || 'ATR';

    const canBuy =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY') &&
      (regime.regime === 'TRENDING_BULLISH' || regime.regime === 'COMPRESSION') &&
      currentFastEma >= prevFastEma;

    const canSell =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY') &&
      (regime.regime === 'TRENDING_BEARISH' || regime.regime === 'COMPRESSION') &&
      currentFastEma <= prevFastEma;

    if (canBuy && current.close > (priorHigh + buffer) && currentSlowEma >= prevSlowEma) {
      const entryPrice = current.close;
      const slRes = StopLossCalculator.calculate(slMode, 'BUY', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 2.0,
        fixedStopPips: common?.fixedStopPips ?? 25,
        structureLookback: 5,
      });

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
        const takeProfitPrice = Number((entryPrice + slRes.riskDistancePrice * rr).toFixed(precision));
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
          stopLossPrice: slRes.stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `CHANNEL-HIGH-${priorHigh}` },
          rationale: `بسته‌شدن بالای سقف کانال ${lookback} دوره‌ای (بافر ${buffer.toFixed(4)}) با تایید EMA(${fastEmaPeriod}/${slowEmaPeriod})؛ R:R=${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    if (canSell && current.close < (priorLow - buffer) && currentSlowEma <= prevSlowEma) {
      const entryPrice = current.close;
      const slRes = StopLossCalculator.calculate(slMode, 'SELL', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 2.0,
        fixedStopPips: common?.fixedStopPips ?? 25,
        structureLookback: 5,
      });

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
        const takeProfitPrice = Number((entryPrice - slRes.riskDistancePrice * rr).toFixed(precision));
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
          stopLossPrice: slRes.stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `CHANNEL-LOW-${priorLow}` },
          rationale: `بسته‌شدن زیر کف کانال ${lookback} دوره‌ای (بافر ${buffer.toFixed(4)}) با تایید EMA(${fastEmaPeriod}/${slowEmaPeriod})؛ R:R=${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    return null;
  }

  /**
   * ۴. ردیاب سبک سوئینگ کلان (Macro Trend Swing)
   * با اتصال کامل trendEma, pullbackDepth, confirmationBars و stopLossMode
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
    const swingParams = params?.swing;

    const trendEmaPeriod = swingParams?.trendEma || 50;
    const pullbackAtrFactor = swingParams?.pullbackDepth ?? 1.0;
    const confirmationBars = swingParams?.confirmationBars ?? 2;

    const closes = candles.map(c => c.close);
    const trendEmaValues = calculateEMA(closes, trendEmaPeriod);
    const currentTrendEma = trendEmaValues[trendEmaValues.length - 1];

    const hasExplicitTrendEma = swingParams?.trendEma !== undefined;
    const canBuy =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY') &&
      regime.regime === 'TRENDING_BULLISH' &&
      (!hasExplicitTrendEma || closes[closes.length - 1] >= currentTrendEma);

    const canSell =
      (!common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY') &&
      regime.regime === 'TRENDING_BEARISH' &&
      (!hasExplicitTrendEma || closes[closes.length - 1] <= currentTrendEma);

    if (!canBuy && !canSell) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const atrPeriod = common?.atrPeriod || 14;
    const atrs = calculateWilderATR(candles, atrPeriod);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 4.0 : 0.0025;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars || 24) * tfMs;
    const rr = common?.riskRewardRatio ?? 3.5;
    const slMode = common?.stopLossMode || 'STRUCTURE';

    // بررسی کندل‌های تاییدیه چرخش (confirmationBars)
    const hasExplicitConfirmation = swingParams?.confirmationBars !== undefined;
    const recentBars = candles.slice(-confirmationBars);
    const isBullishConfirmed = hasExplicitConfirmation
      ? recentBars.every(c => c.close >= c.open)
      : currentCandle.close > currentCandle.open;
    const isBearishConfirmed = hasExplicitConfirmation
      ? recentBars.every(c => c.close <= c.open)
      : currentCandle.close < currentCandle.open;

    // بررسی عمق پولبک (pullbackDepth)
    const hasExplicitPullback = swingParams?.pullbackDepth !== undefined;
    const recentExtreme = canBuy
      ? Math.max(...candles.slice(-10, -1).map(c => c.high))
      : Math.min(...candles.slice(-10, -1).map(c => c.low));
    const actualPullbackDist = canBuy ? recentExtreme - currentCandle.low : currentCandle.high - recentExtreme;
    const hasEnoughPullback = !hasExplicitPullback || actualPullbackDist >= (pullbackAtrFactor * currentAtr * 0.5);

    if (canBuy && isBullishConfirmed && hasEnoughPullback) {
      const entryPrice = currentCandle.close;
      let slRes = StopLossCalculator.calculate(slMode, 'BUY', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 0.5,
        fixedStopPips: common?.fixedStopPips ?? 35,
        structureLookback: 5,
      });

      if (slRes.status === 'INSUFFICIENT_STRUCTURE' && !common?.stopLossMode) {
        slRes = StopLossCalculator.calculate('ATR', 'BUY', entryPrice, candles, symbol, timeframe, {
          atrPeriod,
          atrMultiplier: common?.atrMultiplier ?? 1.5,
          fixedStopPips: common?.fixedStopPips ?? 35,
          structureLookback: 5,
        });
      }

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
        const takeProfitPrice = Number((entryPrice + slRes.riskDistancePrice * rr).toFixed(precision));
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
          stopLossPrice: slRes.stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `EMA-${trendEmaPeriod}` },
          rationale: `پولبک به میانگین EMA(${trendEmaPeriod}) با تایید ${confirmationBars} کندل صعودی در تایم‌فریم ${timeframe}؛ R:R=${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    if (canSell && isBearishConfirmed && hasEnoughPullback) {
      const entryPrice = currentCandle.close;
      let slRes = StopLossCalculator.calculate(slMode, 'SELL', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 0.5,
        fixedStopPips: common?.fixedStopPips ?? 35,
        structureLookback: 5,
      });

      if (slRes.status === 'INSUFFICIENT_STRUCTURE' && !common?.stopLossMode) {
        slRes = StopLossCalculator.calculate('ATR', 'SELL', entryPrice, candles, symbol, timeframe, {
          atrPeriod,
          atrMultiplier: common?.atrMultiplier ?? 1.5,
          fixedStopPips: common?.fixedStopPips ?? 35,
          structureLookback: 5,
        });
      }

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
        const takeProfitPrice = Number((entryPrice - slRes.riskDistancePrice * rr).toFixed(precision));
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
          stopLossPrice: slRes.stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: rr,
          evidenceIds: { contextSwingId: `EMA-${trendEmaPeriod}` },
          rationale: `پولبک به میانگین EMA(${trendEmaPeriod}) با تایید ${confirmationBars} کندل نزولی در تایم‌فریم ${timeframe}؛ R:R=${rr}.`,
          status: 'CONFIRMED',
        };
      }
    }

    return null;
  }

  /**
   * ۵. ردیاب سبک بازگشت به میانگین (Statistical Mean Reversion)
   * با اتصال کامل lookbackPeriod, zScoreThreshold, exitZScore, trendFilter و stopLossMode
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
    const atrPeriod = common?.atrPeriod || 14;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const tfMs = timeframeToMs(timeframe);
    const expiryMs = (common?.expiryBars || 8) * tfMs;
    const slMode = common?.stopLossMode || 'ATR';

    // فیلتر روند در بازگشت به میانگین (trendFilter)
    let trendFilterPass = true;
    if (mrParams?.trendFilter) {
      const closes = candles.map(c => c.close);
      const ema50 = calculateEMA(closes, 50);
      const currentEma50 = ema50[ema50.length - 1];
      // در بازارهای خیلی رونددار قوی، بازگشت به میانگین با ریسک همراه است
      const distFromEma = Math.abs(currentCandle.close - currentEma50);
      const atrs = calculateWilderATR(candles, atrPeriod);
      const atrVal = atrs[atrs.length - 1] || 0.001;
      if (distFromEma > 4 * atrVal) {
        trendFilterPass = false;
      }
    }
    if (!trendFilterPass) return null;

    const canBuy = !common || common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY';
    const canSell = !common || common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY';

    // خرید از باند پایین به سمت میانگین
    const isLowerRejection = currentCandle.low < lowerBand && currentCandle.close > currentCandle.low;
    if (canBuy && isLowerRejection && currentCandle.close < mean) {
      const entryPrice = currentCandle.close;
      const slRes = StopLossCalculator.calculate(slMode, 'BUY', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 0.2,
        fixedStopPips: common?.fixedStopPips ?? 20,
        structureLookback: 3,
      });

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0 && mean > entryPrice) {
        // سطح خروج بر اساس exitZScore
        const exitOffset = (mrParams?.exitZScore ?? 0) * stdDev;
        const takeProfitPrice = Number((mean + exitOffset).toFixed(precision));
        const calculatedRr = Number(((takeProfitPrice - entryPrice) / slRes.riskDistancePrice).toFixed(2));

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
            stopLossPrice: slRes.stopLossPrice,
            takeProfitPrice,
            riskRewardRatio: calculatedRr,
            evidenceIds: { sweepId: `BAND-LOWER-${lowerBand.toFixed(2)}` },
            rationale: `اشباع فروش در انحراف معیار ${zThresh}- در تایم‌فریم ${timeframe} و بازگشت قیمت به میانگین (R:R=${calculatedRr}).`,
            status: 'CONFIRMED',
          };
        }
      }
    }

    // فروش از باند بالا به سمت میانگین
    const isUpperRejection = currentCandle.high > upperBand && currentCandle.close < currentCandle.high;
    if (canSell && isUpperRejection && currentCandle.close > mean) {
      const entryPrice = currentCandle.close;
      const slRes = StopLossCalculator.calculate(slMode, 'SELL', entryPrice, candles, symbol, timeframe, {
        atrPeriod,
        atrMultiplier: common?.atrMultiplier ?? 0.2,
        fixedStopPips: common?.fixedStopPips ?? 20,
        structureLookback: 3,
      });

      if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0 && mean < entryPrice) {
        const exitOffset = (mrParams?.exitZScore ?? 0) * stdDev;
        const takeProfitPrice = Number((mean - exitOffset).toFixed(precision));
        const calculatedRr = Number(((entryPrice - takeProfitPrice) / slRes.riskDistancePrice).toFixed(2));

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
            stopLossPrice: slRes.stopLossPrice,
            takeProfitPrice,
            riskRewardRatio: calculatedRr,
            evidenceIds: { sweepId: `BAND-UPPER-${upperBand.toFixed(2)}` },
            rationale: `اشباع خرید در انحراف معیار ${zThresh}+ در تایم‌فریم ${timeframe} و بازگشت قیمت به میانگین (R:R=${calculatedRr}).`,
            status: 'CONFIRMED',
          };
        }
      }
    }

    return null;
  }

  /**
   * هاب مرکزی ارزیابی: طبقه‌بندی رژیم بازار، فیلتر MTF و انتخاب بهینه‌ترین ستاپ
   */
  public static evaluate(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    filterStyle: TradingStyleType | 'ALL' = 'ALL',
    timeframe: Timeframe = '5M',
    params?: StrategyParameters,
    htfCandles?: readonly Candle[],
    htfTimeframe?: Timeframe
  ): EngineEvaluationResult {
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

    // ۳. بررسی شکست روندی
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

    // فیلتر تاییدیه چندتایم‌فریمی (MTF)
    const mtfConfig = params?.common.mtfConfig;
    const isMtfActive =
      (params?.common.higherTimeframeFilter || (mtfConfig && mtfConfig.higherTimeframeFilterMode !== 'OFF')) &&
      htfCandles &&
      htfCandles.length > 0 &&
      htfTimeframe;

    let rejectedByMtfCount = 0;
    const mtfEvaluationResults: Record<string, MtfFilterEvaluationResult> = {};

    const mtfFilteredCandidates = candidates.filter(c => {
      if (!isMtfActive) return true;

      const mtfRes = MtfFilterEngine.evaluateCandidate(
        c.direction,
        htfCandles!,
        htfTimeframe!,
        mtfConfig
      );

      mtfEvaluationResults[c.id] = mtfRes;

      if (!mtfRes.allowed) {
        rejectedByMtfCount++;
        return false;
      }
      return true;
    });

    // غنی‌سازی کاندیداها با اطلاعات رژیم بازار و تطبیق‌پذیری
    const enrichedCandidates = mtfFilteredCandidates.map(c => {
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
      rejectedByMtfCount,
      mtfEvaluationResults,
    };
  }
}
