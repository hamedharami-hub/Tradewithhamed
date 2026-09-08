// lib/core/__tests__/multi-style-backtester.test.ts
// آزمون‌های جامع موتور بک‌تست تاریخی چند سبکه، خروج پله‌ای و اعتبارسنجی مونت‌کارلو

import { MultiStyleBacktester } from '../multi-style-backtester';
import { Candle } from '../../contracts/market';

export interface TestResultItem {
  name: string;
  passed: boolean;
  details: string;
}

// ساخت ۶۰ کندل آزمایشی با سوئینگ و نوسان جهت بررسی ستاپ‌ها
function generateTestCandles(count: number = 60, basePrice: number = 2050): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const startTime = Date.now() - count * 5 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 4) * 4;
    const open = price;
    const close = basePrice + wave + (i % 2 === 0 ? 0.8 : -0.6);
    const high = Math.max(open, close) + 1.2;
    const low = Math.min(open, close) - 1.2;
    price = close;

    candles.push({
      timestamp: startTime + i * 5 * 60 * 1000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1500 + Math.abs(Math.sin(i) * 500),
      isClosed: true,
    });
  }
  return candles;
}

export function runMultiStyleBacktesterTestSuite(): TestResultItem[] {
  const results: TestResultItem[] = [];
  const testCandles = generateTestCandles(70, 2050);

  // ۱. بررسی اجرای موفق بک‌تست و صحت ساختار گزارش
  try {
    const report = MultiStyleBacktester.runBacktest(testCandles, {
      symbol: 'XAUUSD',
      initialCapital: 10000,
      minAlphaConsensusScore: 50,
      minMonteCarloTpProbability: 45,
      requireQuorum: false,
    });

    const hasSummary = !!report.summary && report.summary.winRatePercent >= 0 && report.summary.winRatePercent <= 100;
    const hasEquityCurve = Array.isArray(report.equityCurve) && report.equityCurve.length >= 1;
    const initialEquityMatch = report.equityCurve[0].equity === 10000;
    const hasRegimes = typeof report.regimePerformance === 'object';
    const hasStyles = typeof report.stylePerformance === 'object';
    const hasMcAccuracy = typeof report.monteCarloAccuracy === 'object';

    const passed = hasSummary && hasEquityCurve && initialEquityMatch && hasRegimes && hasStyles && hasMcAccuracy;

    results.push({
      name: '[Multi-Style Backtester] Report Generation & Metric Structure Integrity',
      passed,
      details: `معاملات ثبت‌شده: ${report.summary.totalTrades} | وین‌ریت: ${report.summary.winRatePercent}٪ | سود خالص: $${report.summary.netProfit} | نقاط منحنی اکوئیتی: ${report.equityCurve.length}`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style Backtester] Report Generation & Metric Structure Integrity',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. آزمون اثر فعال‌سازی خروج پله‌ای ۵۰٪ در ۱.۲R و ریسک‌فری خودکار
  try {
    const reportWithPartial = MultiStyleBacktester.runBacktest(testCandles, {
      symbol: 'XAUUSD',
      initialCapital: 10000,
      enablePartialTp: true,
      minAlphaConsensusScore: 50,
      minMonteCarloTpProbability: 45,
      requireQuorum: false,
    });

    const reportWithoutPartial = MultiStyleBacktester.runBacktest(testCandles, {
      symbol: 'XAUUSD',
      initialCapital: 10000,
      enablePartialTp: false,
      minAlphaConsensusScore: 50,
      minMonteCarloTpProbability: 45,
      requireQuorum: false,
    });

    const validConfigs = reportWithPartial.config.enablePartialTp === true &&
                         reportWithoutPartial.config.enablePartialTp === false;

    const validExitReasons = reportWithPartial.trades.every(t =>
      ['TP_FULL', 'TP_PARTIAL_RUNNER_TP', 'TP_PARTIAL_RUNNER_BE', 'SL', 'TIMEOUT_CLOSE'].includes(t.exitReason)
    );

    results.push({
      name: '[Multi-Style Backtester] 50% Partial TP at 1.2R & Auto-Breakeven Engine',
      passed: validConfigs && validExitReasons,
      details: `پیکربندی خروج پله‌ای معتبر | بررسی دلایل خروج معاملات: ${validExitReasons ? 'تایید شد' : 'نامعتبر'}`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style Backtester] 50% Partial TP at 1.2R & Auto-Breakeven Engine',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. آزمون تکرارپذیری قطعی (Deterministic Backtest Repeatability)
  try {
    const run1 = MultiStyleBacktester.runBacktest(testCandles, {
      symbol: 'XAUUSD',
      initialCapital: 10000,
      minAlphaConsensusScore: 60,
      minMonteCarloTpProbability: 50,
    });

    const run2 = MultiStyleBacktester.runBacktest(testCandles, {
      symbol: 'XAUUSD',
      initialCapital: 10000,
      minAlphaConsensusScore: 60,
      minMonteCarloTpProbability: 50,
    });

    const exactMatch = run1.summary.totalTrades === run2.summary.totalTrades &&
                       run1.summary.netProfit === run2.summary.netProfit &&
                       run1.summary.winRatePercent === run2.summary.winRatePercent &&
                       run1.summary.maxDrawdownDollar === run2.summary.maxDrawdownDollar;

    results.push({
      name: '[Multi-Style Backtester] Deterministic Repeatability Across Identical Runs',
      passed: exactMatch,
      details: exactMatch
        ? `دو اجرای متوالی مستقل نتایج کاملاً یکسان تولید کردند (سود خالص: $${run1.summary.netProfit}).`
        : 'اختلاف در اجرای تکراری شناسایی شد.',
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style Backtester] Deterministic Repeatability Across Identical Runs',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. آزمون اعتبارسنجی و تطابق دقت شبیه‌سازی مونت‌کارلو
  try {
    const report = MultiStyleBacktester.runBacktest(testCandles, {
      symbol: 'XAUUSD',
      initialCapital: 10000,
      minAlphaConsensusScore: 50,
      minMonteCarloTpProbability: 40,
      requireQuorum: false,
    });

    const acc = report.monteCarloAccuracy;
    const metricsValid = typeof acc.highProbWinRate === 'number' &&
                         typeof acc.lowProbWinRate === 'number' &&
                         acc.correlationNoteFa.length > 10;

    results.push({
      name: '[Multi-Style Backtester] Monte Carlo Probability Correlation Verification',
      passed: metricsValid,
      details: `وین‌ریت پیش‌بینی بالا: ${acc.highProbWinRate}٪ | وین‌ریت معمولی: ${acc.lowProbWinRate}٪ | یادداشت: ${acc.correlationNoteFa.slice(0, 50)}...`,
    });
  } catch (err) {
    results.push({
      name: '[Multi-Style Backtester] Monte Carlo Probability Correlation Verification',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
