import { Candle } from '../../contracts/market';
import { MarketRegimeClassifier } from '../market-regime-classifier';
import { MultiStyleEngine } from '../multi-style-engine';
import { GOLD_CANDLES_FIXTURE_5M } from '../../replay/fixtures/gold-candles';

export interface MultiStyleTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export function runMultiStyleRegimesTestSuite(): MultiStyleTestResult[] {
  const results: MultiStyleTestResult[] = [];

  // ۱. تست طبقه‌بندی رژیم رنج و نوسانی (Choppy Ranging)
  try {
    const rangingCandles: Candle[] = [];
    let basePrice = 2000;
    for (let i = 0; i < 30; i++) {
      const delta = (i % 2 === 0 ? 1 : -1) * 1.5;
      basePrice += delta;
      rangingCandles.push({
        timestamp: 1700000000000 + i * 300000,
        open: basePrice - 0.5,
        high: basePrice + 1.5,
        low: basePrice - 1.5,
        close: basePrice,
        volume: 100,
        isClosed: true,
      });
    }

    const regime = MarketRegimeClassifier.classify(rangingCandles);
    const passed = regime.regime === 'CHOPPY_RANGING' && regime.recommendedStyles.includes('MEAN_REVERSION');
    results.push({
      name: '[Multi-Style] Market Regime: Choppy Ranging Detection',
      passed,
      details: `رژیم ${regime.regime} با ضریب اطمینان ${regime.confidence}٪ و سبک‌های پیشنهادی [${regime.recommendedStyles.join(', ')}] شناسایی شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Market Regime: Choppy Ranging Detection',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. تست طبقه‌بندی رژیم صعودی پرقدرت (Trending Bullish)
  try {
    const bullishCandles: Candle[] = [];
    let price = 2000;
    for (let i = 0; i < 30; i++) {
      price += 2.0; // افزایش مداوم
      bullishCandles.push({
        timestamp: 1700000000000 + i * 300000,
        open: price - 1.0,
        high: price + 1.0,
        low: price - 1.2,
        close: price,
        volume: 150,
        isClosed: true,
      });
    }

    const regime = MarketRegimeClassifier.classify(bullishCandles);
    const passed = regime.regime === 'TRENDING_BULLISH' && regime.metrics.emaSlope > 0;
    results.push({
      name: '[Multi-Style] Market Regime: Trending Bullish Detection',
      passed,
      details: `رژیم ${regime.regime} با قدرت روند ${regime.metrics.adxTrendStrength}٪ و شیب مثبت ${regime.metrics.emaSlope} تایید شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Market Regime: Trending Bullish Detection',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. تست تلاطم شدید خبری (High Volatility News Spike)
  try {
    const newsCandles: Candle[] = [];
    let price = 2000;
    for (let i = 0; i < 25; i++) {
      newsCandles.push({
        timestamp: 1700000000000 + i * 300000,
        open: price,
        high: price + 1.0,
        low: price - 1.0,
        close: price + 0.2,
        volume: 100,
        isClosed: true,
      });
    }
    // اسپایک وحشی خبری در آخرین کندل (۱۰ برابر ATR عادی)
    newsCandles.push({
      timestamp: 1700000000000 + 26 * 300000,
      open: price,
      high: price + 25.0,
      low: price - 15.0,
      close: price + 18.0,
      volume: 800,
      isClosed: true,
    });

    const regime = MarketRegimeClassifier.classify(newsCandles);
    const passed = regime.regime === 'HIGH_VOL_NEWS' && regime.blockedStyles.includes('SCALP_M1_M5');
    results.push({
      name: '[Multi-Style] Market Regime: High Volatility News Spike Safeguard',
      passed,
      details: `اسپایک خبری با موفقیت شناسایی و سبک‌های پرریسک [${regime.blockedStyles.join(', ')}] مسدود شدند.`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Market Regime: High Volatility News Spike Safeguard',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. تست سبک اسکلپینگ سریع (Fast Momentum Scalp Detector)
  try {
    const scalpCandles: Candle[] = [
      ...GOLD_CANDLES_FIXTURE_5M.slice(0, 15),
      {
        timestamp: 1700000000000,
        open: 2050,
        high: 2052,
        low: 2045,
        close: 2046,
        volume: 100,
        isClosed: true,
      },
      // کندل سوییپ میکروکف و بسته شدن شتابان در سقف
      {
        timestamp: 1700000300000,
        open: 2046,
        high: 2051,
        low: 2044, // سوییپ کف قبلی ۲۰۴۵
        close: 2050.5, // بسته شدن بالاتر از کلوز قبلی
        volume: 220,
        isClosed: true,
      },
    ];

    const scalp = MultiStyleEngine.evaluateScalp('XAUUSD', scalpCandles);
    const passed = scalp !== null && scalp.direction === 'BUY' && scalp.riskRewardRatio === 1.5 && scalp.style === 'SCALP_M1_M5';
    results.push({
      name: '[Multi-Style] Scalp Engine: Fast Micro-Sweep Setup',
      passed,
      details: scalp
        ? `ستاپ اسکلپ ${scalp.direction} با قیمت ورود ${scalp.entryPrice}، حد ضرر ${scalp.stopLossPrice} و تارگت ${scalp.takeProfitPrice} تولید شد.`
        : 'ستاپ اسکلپ شناسایی نشد.',
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Scalp Engine: Fast Micro-Sweep Setup',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. تست سبک بازگشت به میانگین آماری (Mean Reversion Band Exhaustion)
  try {
    const mrCandles: Candle[] = [];
    const mean = 2000;
    // ساخت نوار تعادلی با نوسان استاندارد
    for (let i = 0; i < 20; i++) {
      mrCandles.push({
        timestamp: 1700000000000 + i * 300000,
        open: mean,
        high: mean + 3,
        low: mean - 3,
        close: mean + (i % 2 === 0 ? 2 : -2),
        volume: 100,
        isClosed: true,
      });
    }
    // پرتاب قیمت به زیر باند و بازگشت با کلوز نزدیک به کف
    mrCandles.push({
      timestamp: 1700000000000 + 21 * 300000,
      open: mean - 6,
      high: mean - 4,
      low: mean - 9, // نفوذ زیر باند ۱۹۹۴
      close: mean - 5, // ورود در ۱۹۹۵ با تارگت خط میانگین ۲۰۰۰
      volume: 300,
      isClosed: true,
    });

    const mr = MultiStyleEngine.evaluateMeanReversion('XAUUSD', mrCandles);
    const passed = mr !== null && mr.direction === 'BUY' && mr.style === 'MEAN_REVERSION' && Math.abs(mr.takeProfitPrice - mean) <= 1.0;
    results.push({
      name: '[Multi-Style] Mean Reversion: Statistical Exhaustion Rebound',
      passed,
      details: mr
        ? `ستاپ بازگشت به میانگین با تارگت خط تعادل ${mr.takeProfitPrice} و R:R=${mr.riskRewardRatio} تولید شد.`
        : 'ستاپ بازگشت به میانگین شناسایی نشد.',
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Mean Reversion: Statistical Exhaustion Rebound',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۶. تست سبک سوئینگ کلان در روند صعودی (Macro Trend Swing)
  try {
    const swingCandles: Candle[] = [];
    let p = 2000;
    for (let i = 0; i < 30; i++) {
      p += 1.8;
      swingCandles.push({
        timestamp: 1700000000000 + i * 300000,
        open: p - 1.0,
        high: p + 1.0,
        low: p - 1.0,
        close: p,
        volume: 150,
        isClosed: true,
      });
    }
    const regime = MarketRegimeClassifier.classify(swingCandles);
    const swing = MultiStyleEngine.evaluateSwing('XAUUSD', swingCandles, regime);
    const passed = swing !== null && swing.style === 'SWING_MACRO' && swing.riskRewardRatio === 3.5;
    results.push({
      name: '[Multi-Style] Swing Engine: Macro Trend Continuation 3.5R',
      passed,
      details: swing
        ? `ستاپ سوئینگ ${swing.direction} با تارگت 3.5R و زمان انقضای ۲۴ ساعته ثبت شد.`
        : 'ستاپ سوئینگ شناسایی نشد.',
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Swing Engine: Macro Trend Continuation 3.5R',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۷. تست هاب مرکزی ارزیابی و فیلترگذاری سبک (Style Filtering & Regime Alignment)
  try {
    const evaluationAll = MultiStyleEngine.evaluate(GOLD_CANDLES_FIXTURE_5M.slice(0, 25), 'XAUUSD', 'ALL');
    const evaluationScalpOnly = MultiStyleEngine.evaluate(GOLD_CANDLES_FIXTURE_5M.slice(0, 25), 'XAUUSD', 'SCALP_M1_M5');

    const passed =
      evaluationAll.regime !== undefined &&
      evaluationAll.regime.confidence > 0 &&
      (evaluationScalpOnly.candidate === null || evaluationScalpOnly.candidate.style === 'SCALP_M1_M5');

    results.push({
      name: '[Multi-Style] Multi-Style Coordinator & Filter Enforcement',
      passed,
      details: `هماهنگ‌کننده چندسبکی با رژیم جاری [${evaluationAll.regime.headlineFa}] و فیلترگذاری سبک‌ها با موفقیت راستی‌آزمایی شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style] Multi-Style Coordinator & Filter Enforcement',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
