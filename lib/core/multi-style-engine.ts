import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { MarketRegimeAnalysis, TradingStyleType } from '../contracts/regimes';
import { MarketRegimeClassifier } from './market-regime-classifier';
import { evaluateS0Strategy } from './s0-engine';
import { calculateWilderATR } from './atr';
import { detectSwingPoints } from './swings';

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
 * پشتیبانی از اسکلپینگ سریع M1/M5، اسمارت‌مانی SMC، سوئینگ کلان، و بازگشت به میانگین
 */
export class MultiStyleEngine {
  /**
   * ۱. ردیاب سبک اسکلپینگ سریع (Fast Momentum Scalp)
   */
  public static evaluateScalp(
    symbol: SymbolId,
    candles: Candle[]
  ): StrategyCandidate | null {
    if (candles.length < 10) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const prevCandle = candles[candles.length - 2];
    const atrs = calculateWilderATR(candles, 7);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 1.5 : 0.0008;

    // اسکلپ خرید: سوییپ میکرو کف کندل قبل و بسته شدن پرقدرت در یک‌سوم بالایی
    const isBullishMicroReversal =
      currentCandle.low < prevCandle.low &&
      currentCandle.close > prevCandle.close &&
      currentCandle.close > currentCandle.open;

    if (isBullishMicroReversal) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.low - currentAtr * 0.25).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDist = entryPrice - stopLossPrice;
      if (slDist > 0) {
        const takeProfitPrice = Number((entryPrice + slDist * 1.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        return {
          id: `SCALP-BUY-${currentCandle.timestamp}`,
          strategyName: 'اسکلپ مومنتوم سریع (M1/M5 Micro-Sweep)',
          symbol,
          timeframe: '5M',
          direction: 'BUY',
          style: 'SCALP_M1_M5',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + 3 * 5 * 60 * 1000, // انقضای سریع ۳ کندل
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: 1.5,
          evidenceIds: { sweepId: `MICRO-LOW-${prevCandle.timestamp}` },
          rationale: `سوییپ سریع میکروکف با بازگشت شتابان؛ تارگت کوتاه 1.5R با خروج نقطه‌ای زیر ۱۵ دقیقه.`,
          status: 'CONFIRMED',
        };
      }
    }

    // اسکلپ فروش: سوییپ میکرو سقف کندل قبل و بسته شدن پرقدرت در یک‌سوم پایینی
    const isBearishMicroReversal =
      currentCandle.high > prevCandle.high &&
      currentCandle.close < prevCandle.close &&
      currentCandle.close < currentCandle.open;

    if (isBearishMicroReversal) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.high + currentAtr * 0.25).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDist = stopLossPrice - entryPrice;
      if (slDist > 0) {
        const takeProfitPrice = Number((entryPrice - slDist * 1.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        return {
          id: `SCALP-SELL-${currentCandle.timestamp}`,
          strategyName: 'اسکلپ مومنتوم سریع (M1/M5 Micro-Sweep)',
          symbol,
          timeframe: '5M',
          direction: 'SELL',
          style: 'SCALP_M1_M5',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + 3 * 5 * 60 * 1000,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: 1.5,
          evidenceIds: { sweepId: `MICRO-HIGH-${prevCandle.timestamp}` },
          rationale: `سوییپ سریع میکروسقف با فشار فروش لحظه‌ای؛ تارگت کوتاه 1.5R و خروج سریع.`,
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
    candles: Candle[]
  ): StrategyCandidate | null {
    const candidate = evaluateS0Strategy(symbol, candles, candles);
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
   * ۳. شکست کانال در جهت رژیم روند. سطح کانال فقط از کندل‌های قبل از
   * کندل فعلی ساخته می‌شود تا سیگنال نگاه‌به‌آینده نداشته باشد.
   */
  public static evaluateTrendBreakout(
    symbol: SymbolId,
    candles: Candle[],
    regime: MarketRegimeAnalysis
  ): StrategyCandidate | null {
    const lookback = 55;
    const emaPeriod = 200;
    if (candles.length < emaPeriod + 1) return null;

    const current = candles[candles.length - 1];
    if (!current.isClosed) return null;

    const history = candles.slice(0, -1);
    const channel = history.slice(-lookback);
    const priorHigh = Math.max(...channel.map(candle => candle.high));
    const priorLow = Math.min(...channel.map(candle => candle.low));
    const closes = candles.map(candle => candle.close);
    const ema200 = calculateEMA(closes, emaPeriod);
    const currentEma = ema200[ema200.length - 1];
    const previousEma = ema200[ema200.length - 2];
    const atrs = calculateWilderATR(candles, 20);
    const atr = atrs[atrs.length - 1] || (symbol === 'XAUUSD' ? 2.5 : 0.0015);
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;

    const canBuy =
      regime.regime === 'TRENDING_BULLISH' || regime.regime === 'COMPRESSION';
    const canSell =
      regime.regime === 'TRENDING_BEARISH' || regime.regime === 'COMPRESSION';

    if (canBuy && current.close > priorHigh && currentEma >= previousEma) {
      const entryPrice = current.close;
      const stopLossPrice = Number((entryPrice - atr * 2).toFixed(precision));
      const takeProfitPrice = Number((entryPrice + atr * 4).toFixed(precision));
      return {
        id: `BREAKOUT-BUY-${current.timestamp}`,
        strategyName: 'شکست روندی کانال (Regime-Filtered Breakout)',
        symbol,
        timeframe: '15M',
        direction: 'BUY',
        style: 'TREND_BREAKOUT',
        createdAtTimestamp: current.timestamp,
        expiresAtTimestamp: current.timestamp + 4 * 60 * 60 * 1000,
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        riskRewardRatio: 2,
        evidenceIds: { contextSwingId: `CHANNEL-HIGH-${priorHigh}` },
        rationale: 'بسته‌شدن بالای سقف کانال ۵۵ دوره‌ای، هم‌جهت با شیب EMA200؛ ورود فرضی فقط در کندل بعد قابل شبیه‌سازی است.',
        status: 'CONFIRMED',
      };
    }

    if (canSell && current.close < priorLow && currentEma <= previousEma) {
      const entryPrice = current.close;
      const stopLossPrice = Number((entryPrice + atr * 2).toFixed(precision));
      const takeProfitPrice = Number((entryPrice - atr * 4).toFixed(precision));
      return {
        id: `BREAKOUT-SELL-${current.timestamp}`,
        strategyName: 'شکست روندی کانال (Regime-Filtered Breakout)',
        symbol,
        timeframe: '15M',
        direction: 'SELL',
        style: 'TREND_BREAKOUT',
        createdAtTimestamp: current.timestamp,
        expiresAtTimestamp: current.timestamp + 4 * 60 * 60 * 1000,
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        riskRewardRatio: 2,
        evidenceIds: { contextSwingId: `CHANNEL-LOW-${priorLow}` },
        rationale: 'بسته‌شدن زیر کف کانال ۵۵ دوره‌ای، هم‌جهت با شیب EMA200؛ ورود فرضی فقط در کندل بعد قابل شبیه‌سازی است.',
        status: 'CONFIRMED',
      };
    }

    return null;
  }

  /**
   * ۴. ردیاب سبک سوئینگ کلان (Macro Trend Swing)
   */
  public static evaluateSwing(
    symbol: SymbolId,
    candles: Candle[],
    regime: MarketRegimeAnalysis
  ): StrategyCandidate | null {
    if (candles.length < 25) return null;

    // سوئینگ صرفاً در روندهای تاییدشده صعودی یا نزولی معتبر است
    if (regime.regime !== 'TRENDING_BULLISH' && regime.regime !== 'TRENDING_BEARISH') {
      return null;
    }

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const swings = detectSwingPoints(candles, '1H');
    const atrs = calculateWilderATR(candles, 14);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 4.0 : 0.0025;

    // روند صعودی سوئینگ: پولبک به میانگین و حرکت مجدد در جهت روند
    if (regime.regime === 'TRENDING_BULLISH') {
      const recentLows = swings.filter(s => s.type === 'LOW').slice(-2);
      const structuralLow = recentLows.length > 0 ? recentLows[recentLows.length - 1].price : currentCandle.low - currentAtr * 1.5;

      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((structuralLow - currentAtr * 0.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDist = entryPrice - stopLossPrice;

      if (slDist > 0 && currentCandle.close > currentCandle.open) {
        const takeProfitPrice = Number((entryPrice + slDist * 3.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        return {
          id: `SWING-BUY-${currentCandle.timestamp}`,
          strategyName: 'سوئینگ و ترند کلان (Macro Trend Continuation)',
          symbol,
          timeframe: '1H',
          direction: 'BUY',
          style: 'SWING_MACRO',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + 24 * 60 * 60 * 1000, // ۲۴ ساعت انقضا
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: 3.5,
          evidenceIds: { contextSwingId: `STRUCT-LOW-${structuralLow}` },
          rationale: `تداوم روند پرشتاب کلان صعودی همراه با تثبیت بالای پیوت ساختاری؛ نسبت ریسک به ریوارد 1:3.5.`,
          status: 'CONFIRMED',
        };
      }
    }

    // روند نزولی سوئینگ
    if (regime.regime === 'TRENDING_BEARISH') {
      const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-2);
      const structuralHigh = recentHighs.length > 0 ? recentHighs[recentHighs.length - 1].price : currentCandle.high + currentAtr * 1.5;

      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((structuralHigh + currentAtr * 0.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDist = stopLossPrice - entryPrice;

      if (slDist > 0 && currentCandle.close < currentCandle.open) {
        const takeProfitPrice = Number((entryPrice - slDist * 3.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        return {
          id: `SWING-SELL-${currentCandle.timestamp}`,
          strategyName: 'سوئینگ و ترند کلان (Macro Trend Continuation)',
          symbol,
          timeframe: '1H',
          direction: 'SELL',
          style: 'SWING_MACRO',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + 24 * 60 * 60 * 1000,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio: 3.5,
          evidenceIds: { contextSwingId: `STRUCT-HIGH-${structuralHigh}` },
          rationale: `فروش در ریتریسمنت روند نزولی کلان همسو با فشار فروش مارکت؛ نسبت سود به ضرر 1:3.5.`,
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
    candles: Candle[]
  ): StrategyCandidate | null {
    if (candles.length < 20) return null;

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle.isClosed) return null;

    const sample = candles.slice(-20).map(c => c.close);
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sample.length;
    const stdDev = Math.sqrt(variance);

    const upperBand = mean + stdDev * 2.0;
    const lowerBand = mean - stdDev * 2.0;
    const atrs = calculateWilderATR(candles, 14);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 2.0 : 0.001;

    // خرید از باند پایین به سمت میانگین: نفوذ به زیر باند و بازگشت به سمت خط تعادل
    const isLowerRejection = currentCandle.low < lowerBand && currentCandle.close > currentCandle.low;
    if (isLowerRejection && currentCandle.close < mean) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.low - currentAtr * 0.2).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDist = entryPrice - stopLossPrice;
      if (slDist > 0 && mean > entryPrice) {
        const takeProfitPrice = Number(mean.toFixed(symbol === 'XAUUSD' ? 2 : 5));
        const rr = Number(((takeProfitPrice - entryPrice) / slDist).toFixed(2));
        if (rr >= 0.8) {
          return {
            id: `MEANREV-BUY-${currentCandle.timestamp}`,
            strategyName: 'بازگشت به میانگین آماری (Band Exhaustion Reversion)',
            symbol,
            timeframe: '5M',
            direction: 'BUY',
            style: 'MEAN_REVERSION',
            createdAtTimestamp: currentCandle.timestamp,
            expiresAtTimestamp: currentCandle.timestamp + 8 * 5 * 60 * 1000,
            entryPrice,
            stopLossPrice,
            takeProfitPrice,
            riskRewardRatio: rr,
            evidenceIds: { sweepId: `BAND-LOWER-${lowerBand.toFixed(2)}` },
            rationale: `اشباع فروش در انحراف معیار ۲٫۰- و بازگشت قیمت به سمت میانگین مرکزی (${mean.toFixed(2)}) با R:R=${rr}.`,
            status: 'CONFIRMED',
          };
        }
      }
    }

    // فروش از باند بالا به سمت میانگین
    const isUpperRejection = currentCandle.high > upperBand && currentCandle.close < currentCandle.high;
    if (isUpperRejection && currentCandle.close > mean) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.high + currentAtr * 0.2).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDist = stopLossPrice - entryPrice;
      if (slDist > 0 && mean < entryPrice) {
        const takeProfitPrice = Number(mean.toFixed(symbol === 'XAUUSD' ? 2 : 5));
        const rr = Number(((entryPrice - takeProfitPrice) / slDist).toFixed(2));
        if (rr >= 0.8) {
          return {
            id: `MEANREV-SELL-${currentCandle.timestamp}`,
            strategyName: 'بازگشت به میانگین آماری (Band Exhaustion Reversion)',
            symbol,
            timeframe: '5M',
            direction: 'SELL',
            style: 'MEAN_REVERSION',
            createdAtTimestamp: currentCandle.timestamp,
            expiresAtTimestamp: currentCandle.timestamp + 8 * 5 * 60 * 1000,
            entryPrice,
            stopLossPrice,
            takeProfitPrice,
            riskRewardRatio: rr,
            evidenceIds: { sweepId: `BAND-UPPER-${upperBand.toFixed(2)}` },
            rationale: `اشباع خرید در انحراف معیار ۲٫۰+ و بازگشت قیمت به خط تعادلی میانگین (${mean.toFixed(2)}) با R:R=${rr}.`,
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
    filterStyle: TradingStyleType | 'ALL' = 'ALL'
  ): {
    regime: MarketRegimeAnalysis;
    candidate: StrategyCandidate | null;
    allCandidates: StrategyCandidate[];
  } {
    const regime = MarketRegimeClassifier.classify(candles);
    const candidates: StrategyCandidate[] = [];

    // ۱. بررسی سبک اسکلپ
    if (filterStyle === 'ALL' || filterStyle === 'SCALP_M1_M5') {
      const scalpCand = this.evaluateScalp(symbol, candles);
      if (scalpCand) candidates.push(scalpCand);
    }

    // ۲. بررسی سبک اسمارت‌مانی
    if (filterStyle === 'ALL' || filterStyle === 'SMC_INTRADAY') {
      const smcCand = this.evaluateSMC(symbol, candles);
      if (smcCand) candidates.push(smcCand);
    }

    // ۳. بررسی شکست روندی فقط در رژیم سازگار
    if (filterStyle === 'ALL' || filterStyle === 'TREND_BREAKOUT') {
      const breakoutCand = this.evaluateTrendBreakout(symbol, candles, regime);
      if (breakoutCand) candidates.push(breakoutCand);
    }

    // ۴. بررسی سبک سوئینگ
    if (filterStyle === 'ALL' || filterStyle === 'SWING_MACRO') {
      const swingCand = this.evaluateSwing(symbol, candles, regime);
      if (swingCand) candidates.push(swingCand);
    }

    // ۵. بررسی سبک بازگشت به میانگین
    if (filterStyle === 'ALL' || filterStyle === 'MEAN_REVERSION') {
      const mrCand = this.evaluateMeanReversion(symbol, candles);
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
