// lib/core/__tests__/multi-timeframe-split.test.ts
// آزمون‌های اعتبارسنجی نمای دوگانه چندتایم‌فریمه و همگام‌سازی چارت بدون سوگیری زمانی

import { DataWorkbench } from '../data-workbench';
import { Candle } from '../../contracts/market';

export interface MultiTimeframeSplitTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export async function runMultiTimeframeSplitSuite(): Promise<MultiTimeframeSplitTestResult[]> {
  const results: MultiTimeframeSplitTestResult[] = [];

  // ایجاد مجموعه‌ای از کندل‌های ساختگی ۵ دقیقه‌ای متوالی تراز شده روی مرز ساعت
  const oneHourMs = 60 * 60 * 1000;
  const baseTime = Math.floor(1715000000000 / oneHourMs) * oneHourMs;
  const fiveMinMs = 5 * 60 * 1000;
  const mock5MCandles: Candle[] = [];

  for (let i = 0; i < 60; i++) {
    const t = baseTime + i * fiveMinMs;
    const open = 2000 + i * 0.5;
    const high = open + 1.2;
    const low = open - 0.8;
    const close = open + 0.4;
    mock5MCandles.push({
      timestamp: t,
      open,
      high,
      low,
      close,
      volume: 100 + i,
      isClosed: true,
    });
  }

  // ۱. تست تجمیع کندل‌های ۵ دقیقه به ۱۵ دقیقه (باید هر ۳ کندل یک کندل ۱۵M تشکیل دهد)
  const agg15M = DataWorkbench.aggregateCandles(mock5MCandles, '15M');
  const expected15MCount = Math.ceil(mock5MCandles.length / 3);
  const test1Passed = agg15M.length === expected15MCount;
  results.push({
    id: 'MTF-01-AGG-15M',
    name: 'تجمیع دقیق کندل‌های 5M به 15M بدون نقض ساختار',
    passed: test1Passed,
    details: `تعداد کندل‌ها: ${agg15M.length} (مورد انتظار: ${expected15MCount})`,
  });

  // ۲. تست تجمیع کندل‌های ۵ دقیقه به ۱ ساعته (H1)
  const agg1H = DataWorkbench.aggregateCandles(mock5MCandles, '1H');
  const expected1HCount = Math.ceil(mock5MCandles.length / 12);
  const test2Passed = agg1H.length === expected1HCount;
  results.push({
    id: 'MTF-02-AGG-1H',
    name: 'تجمیع دقیق کندل‌های 5M به 1H با مرزبندی صحیح ساعتی',
    passed: test2Passed,
    details: `تعداد کندل‌های ۱ ساعته: ${agg1H.length} (مورد انتظار: ${expected1HCount})`,
  });

  // ۳. آزمون تضمین عدم نگاه به آینده (Zero Lookahead Bias)
  // کندل‌های اول نباید به قیمت‌های کندل‌های آینده دسترسی داشته باشند
  const first15M = agg15M[0];
  const firstThree5M = mock5MCandles.slice(0, 3);
  const expectedHigh = Math.max(...firstThree5M.map(c => c.high));
  const expectedLow = Math.min(...firstThree5M.map(c => c.low));
  const expectedOpen = firstThree5M[0].open;
  const expectedClose = firstThree5M[2].close;

  const test3Passed =
    first15M.open === expectedOpen &&
    first15M.close === expectedClose &&
    first15M.high === expectedHigh &&
    first15M.low === expectedLow;

  results.push({
    id: 'MTF-03-ZERO-LOOKAHEAD',
    name: 'تطابق کامل OHLC کندل تجمیعی با کندل‌های مبنا بدون سوگیری',
    passed: test3Passed,
    details: `Open: ${first15M.open}, High: ${first15M.high}, Low: ${first15M.low}, Close: ${first15M.close}`,
  });

  // ۴. آزمون همگام‌سازی مرزهای زمانی (Timestamp Alignment)
  const test4Passed = agg1H.every(c => c.timestamp % oneHourMs === 0);
  results.push({
    id: 'MTF-04-TIMESTAMP-ALIGNMENT',
    name: 'انطباق مرز زمانی تایم‌فریم کلان با استانداردهای UTC',
    passed: test4Passed,
    details: `تمام ${agg1H.length} کندل دارای تراز استاندارد ساعتی هستند`,
  });

  return results;
}
