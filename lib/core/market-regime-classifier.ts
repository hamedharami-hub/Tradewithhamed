import { Candle } from '../contracts/market';
import {
  MarketRegimeAnalysis,
  MarketRegimeMetrics,
  MarketRegimeType,
  TradingStyleType,
} from '../contracts/regimes';
import { calculateWilderATR } from './atr';

/**
 * سیستم طبقه‌بندی هوشمند رژیم بازار (Market Regime Classifier 2026)
 * ارزیابی پیوسته نوسان، مومنتوم، فشردگی و حجم جهت هدایت سبک‌های بهینه معاملاتی
 */
export class MarketRegimeClassifier {
  /**
   * محاسبه میانگین متحرک نمایی (EMA)
   */
  private static calculateEMA(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const emaValues: number[] = [values[0]];

    for (let i = 1; i < values.length; i++) {
      const currentEma = values[i] * k + emaValues[i - 1] * (1 - k);
      emaValues.push(currentEma);
    }
    return emaValues;
  }

  /**
   * طبقه‌بندی وضعیت جاری بازار بر مبنای داده‌های کندل
   */
  public static classify(candles: Candle[]): MarketRegimeAnalysis {
    const timestamp = candles.length > 0 ? candles[candles.length - 1].timestamp : Date.now();

    // اگر کندل‌ها ناکافی باشند، حالت پیش‌فرض مطمئن CHOPPY_RANGING است
    if (candles.length < 15) {
      return {
        regime: 'CHOPPY_RANGING',
        confidence: 60,
        headlineFa: 'بازار کم‌نوسان و داده ناکافی',
        summaryFa: 'تعداد کندل‌های موجود کمتر از حد نصاب محاسباتی است؛ ارزیابی محافظه‌کارانه رنج فعال شد.',
        recommendedStyles: ['SCALP_M1_M5', 'MEAN_REVERSION'],
        blockedStyles: ['SWING_MACRO'],
        metrics: {
          adxTrendStrength: 15,
          emaSlope: 0,
          atrRatio: 1.0,
          compressionRatio: 1.0,
          volumeZScore: 0,
          priceVsEmaPercent: 0,
        },
        timestamp,
      };
    }

    const closes = candles.map(c => c.close);
    const currentClose = closes[closes.length - 1];

    // ۱. محاسبات ATR و شوک نوسان
    const atrs = calculateWilderATR(candles, 14);
    const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : 1.0;
    const avgAtr = atrs.length > 0 ? atrs.reduce((a, b) => a + b, 0) / atrs.length : currentAtr;
    const atrRatio = avgAtr > 0 ? Number((currentAtr / avgAtr).toFixed(2)) : 1.0;

    // شوک آخرین کندل (آیا اندازه آخرین کندل ۲٫۵ برابر ATR است؟)
    const lastCandle = candles[candles.length - 1];
    const lastCandleRange = Math.abs(lastCandle.high - lastCandle.low);
    const isCandleSpike = avgAtr > 0 && lastCandleRange > avgAtr * 2.3;

    // ۲. میانگین‌های متحرک EMA(9) و EMA(21)
    const ema9 = this.calculateEMA(closes, Math.min(9, closes.length));
    const ema21 = this.calculateEMA(closes, Math.min(21, closes.length));
    const currentEma9 = ema9[ema9.length - 1];
    const currentEma21 = ema21[ema21.length - 1];
    const prevEma9 = ema9.length > 3 ? ema9[ema9.length - 4] : currentEma9;

    const emaSlope = Number((((currentEma9 - prevEma9) / (currentClose || 1)) * 100).toFixed(3));
    const priceVsEmaPercent = Number((((currentClose - currentEma21) / (currentEma21 || 1)) * 100).toFixed(2));

    // ۳. تخمین قدرت روند (Trend Strength Proxy / ADX)
    let trendScore = 0;
    const recentSlices = closes.slice(-10);
    let consecutiveHigher = 0;
    let consecutiveLower = 0;
    for (let i = 1; i < recentSlices.length; i++) {
      if (recentSlices[i] > recentSlices[i - 1]) consecutiveHigher++;
      if (recentSlices[i] < recentSlices[i - 1]) consecutiveLower++;
    }
    const maxConsecutive = Math.max(consecutiveHigher, consecutiveLower);
    trendScore = Math.min(100, Math.round((maxConsecutive / 9) * 60 + Math.abs(emaSlope) * 150));

    // ۴. شاخص فشردگی (Compression Ratio بر مبنای انحراف معیار ۲۰ کندل)
    const sample = closes.slice(-20);
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sample.length;
    const stdDev = Math.sqrt(variance);
    const bandWidthPercent = (stdDev * 2) / (mean || 1);
    // فشردگی زمانی است که پهنای باند بسیار باریک باشد
    const isCompressed = bandWidthPercent < 0.0035;
    const compressionRatio = Number((bandWidthPercent * 100).toFixed(3));

    // ۵. شاخص حجم
    const volumes = candles.map(c => c.volume || 100);
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const lastVol = volumes[volumes.length - 1];
    const volumeZScore = avgVol > 0 ? Number(((lastVol - avgVol) / avgVol).toFixed(2)) : 0;

    const metrics: MarketRegimeMetrics = {
      adxTrendStrength: trendScore,
      emaSlope,
      atrRatio,
      compressionRatio,
      volumeZScore,
      priceVsEmaPercent,
    };

    // تصمیم‌گیری قطعی رژیم بازار (Decision Matrix)
    let regime: MarketRegimeType = 'CHOPPY_RANGING';
    let confidence = 70;
    let headlineFa = '';
    let summaryFa = '';
    const recommendedStyles: TradingStyleType[] = [];
    const blockedStyles: TradingStyleType[] = [];

    // اولویت ۱: تلاطم شدید خبری (High Volatility / News Spike)
    if (atrRatio >= 2.0 || isCandleSpike) {
      regime = 'HIGH_VOL_NEWS';
      confidence = Math.min(95, Math.round(atrRatio * 38));
      headlineFa = 'تلاطم شدید خبری و اسپایک غیرعادی';
      summaryFa = `نسبت نوسان جاری به میانگین به ${atrRatio} رسیده و اسپایک قیمتی مشاهده می‌شود. جهت محافظت از سرمایه در برابر اسلیپیج، پوزیشن‌گیری فرکانس‌بالا محدود است.`;
      recommendedStyles.push('SWING_MACRO');
      blockedStyles.push('SCALP_M1_M5', 'MEAN_REVERSION', 'SMC_INTRADAY', 'TREND_BREAKOUT');
    }
    // اولویت ۲: فشردگی شدید قبل از انفجار (Compression)
    else if (isCompressed && trendScore < 35) {
      regime = 'COMPRESSION';
      confidence = 82;
      headlineFa = 'فشردگی قیمت و تراکم حجم (در آستانه شکست)';
      summaryFa = `نوسانات به کمتر از ۰٫۳۵٪ فشرده شده است. بازار در حال آماده‌سازی برای شکست قوی سطوح است؛ ستاپ‌های بریک‌اوت و اسکلپ لبه‌ها در اولویت قرار دارند.`;
      recommendedStyles.push('SCALP_M1_M5', 'SMC_INTRADAY', 'TREND_BREAKOUT');
      blockedStyles.push('SWING_MACRO');
    }
    // اولویت ۳: روند پرقدرت صعودی (Trending Bullish)
    else if (trendScore >= 45 && currentEma9 > currentEma21 && emaSlope > 0.01) {
      regime = 'TRENDING_BULLISH';
      confidence = Math.min(95, 60 + Math.round(trendScore * 0.35));
      headlineFa = 'روند صعودی منظم و پرشتاب';
      summaryFa = `تقاطع صعودی میانگین‌ها و توالی سقف‌های بالاتر مشهود است (قدرت روند: ${trendScore}٪). سبک‌های سوئینگ و همراه با روند اسمارت‌مانی بیشترین مزیت را دارند.`;
      recommendedStyles.push('SMC_INTRADAY', 'TREND_BREAKOUT', 'SWING_MACRO', 'SCALP_M1_M5');
      blockedStyles.push('MEAN_REVERSION');
    }
    // اولویت ۴: روند پرقدرت نزولی (Trending Bearish)
    else if (trendScore >= 45 && currentEma9 < currentEma21 && emaSlope < -0.01) {
      regime = 'TRENDING_BEARISH';
      confidence = Math.min(95, 60 + Math.round(trendScore * 0.35));
      headlineFa = 'روند نزولی مقتدر و فروش سنگین';
      summaryFa = `تقاطع نزولی میانگین‌ها و کف‌های پایین‌تر تثبیت شده‌اند (قدرت روند: ${trendScore}٪). ورودهای فروش در پولبک‌ها و سبک‌های سوئینگ توصیه می‌شود.`;
      recommendedStyles.push('SMC_INTRADAY', 'TREND_BREAKOUT', 'SWING_MACRO', 'SCALP_M1_M5');
      blockedStyles.push('MEAN_REVERSION');
    }
    // اولویت ۵: بازار رنج و نوسانی (Choppy Ranging)
    else {
      regime = 'CHOPPY_RANGING';
      confidence = 78;
      headlineFa = 'بازار ساید‌وی و نوسان در محدوده (رنج)';
      summaryFa = `قیمت حول میانگین نوسان می‌کند و مومنتوم جهت‌دار واضحی وجود ندارد. استراتژی‌های بازگشت به میانگین و اسکلپ‌های سریع بیشترین بازدهی را دارند.`;
      recommendedStyles.push('MEAN_REVERSION', 'SCALP_M1_M5');
      blockedStyles.push('SWING_MACRO', 'TREND_BREAKOUT');
    }

    return {
      regime,
      confidence,
      headlineFa,
      summaryFa,
      recommendedStyles,
      blockedStyles,
      metrics,
      timestamp,
    };
  }
}
