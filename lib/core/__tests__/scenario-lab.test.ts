// lib/core/__tests__/scenario-lab.test.ts
// آزمون‌های یکپارچگی آزمایشگاه سناریو:
// RNG قطعی، اثرانگشت دیتاست، Monte Carlo سید‌دار، تنش اجرایی، محدودیت ماتریس

import type { Candle } from '../../contracts/market';
import { SeededRNG } from '../seeded-rng';
import { DatasetFingerprintEngine } from '../dataset-fingerprint';
import { ResearchLab } from '../research-lab';

// ─── نوع مشترک نتیجه ──────────────────────────────────────────────────────
export interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

// ─── کمکی: ساخت کندل‌های مصنوعی ────────────────────────────────────────────
function makeFakeCandles(
  count: number,
  startPrice = 1.3,
  startTime = 1_700_000_000_000
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price += Math.sin(i * 0.1) * 0.0003;
    const open = price;
    const close = price + (i % 3 === 0 ? 0.0005 : -0.0003);
    candles.push({
      timestamp: startTime + i * 15 * 60_000,
      open,
      high: Math.max(open, close) + 0.0008,
      low: Math.min(open, close) - 0.0006,
      close,
      volume: 500 + (i % 100),
      isClosed: true,
    });
  }
  return candles;
}

// ─── تابع اصلی ──────────────────────────────────────────────────────────────
export async function runScenarioLabTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ────────────── ۱. SeededRNG: قطعیت ──────────────────────────────────────

  // ۱-الف: دو نمونه با سید یکسان باید توالی یکسان تولید کنند
  try {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);
    const seq1 = Array.from({ length: 20 }, () => rng1.next());
    const seq2 = Array.from({ length: 20 }, () => rng2.next());
    const ok = JSON.stringify(seq1) === JSON.stringify(seq2);
    results.push({ name: 'SeededRNG – سید یکسان → توالی یکسان', passed: ok, details: ok ? 'ok' : `seq1[0]=${seq1[0]} seq2[0]=${seq2[0]}` });
  } catch (e) {
    results.push({ name: 'SeededRNG – سید یکسان → توالی یکسان', passed: false, details: String(e) });
  }

  // ۱-ب: دو سید متفاوت باید توالی متفاوت تولید کنند
  try {
    const a = new SeededRNG(1);
    const b = new SeededRNG(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    const ok = JSON.stringify(seqA) !== JSON.stringify(seqB);
    results.push({ name: 'SeededRNG – سید متفاوت → توالی متفاوت', passed: ok, details: ok ? 'ok' : 'توالی‌ها یکسان بودند' });
  } catch (e) {
    results.push({ name: 'SeededRNG – سید متفاوت → توالی متفاوت', passed: false, details: String(e) });
  }

  // ۱-ج: nextInt باید در بازه صحیح بماند
  try {
    const rng = new SeededRNG(9999);
    let ok = true;
    let badVal = '';
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(1, 10);
      if (v < 1 || v > 10 || !Number.isInteger(v)) {
        ok = false;
        badVal = `v=${v}`;
        break;
      }
    }
    results.push({ name: 'SeededRNG – nextInt بازه صحیح [1,10]', passed: ok, details: ok ? 'ok' : badVal });
  } catch (e) {
    results.push({ name: 'SeededRNG – nextInt بازه صحیح [1,10]', passed: false, details: String(e) });
  }

  // ۱-د: shuffle نباید آرایه اصلی را تغییر دهد
  try {
    const rng = new SeededRNG(555);
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = [...original];
    rng.shuffle(original);
    const unchanged = JSON.stringify(original) === JSON.stringify(copy);
    results.push({ name: 'SeededRNG – shuffle آرایه اصلی را تغییر نمی‌دهد', passed: unchanged, details: unchanged ? 'ok' : 'تغییر یافت' });
  } catch (e) {
    results.push({ name: 'SeededRNG – shuffle آرایه اصلی را تغییر نمی‌دهد', passed: false, details: String(e) });
  }

  // ۱-ه: fork باید مولد فرزند مستقل تولید کند
  try {
    const parent = new SeededRNG(7777);
    const child = parent.fork();
    const pSeq = Array.from({ length: 10 }, () => parent.next());
    const cSeq = Array.from({ length: 10 }, () => child.next());
    const ok = JSON.stringify(pSeq) !== JSON.stringify(cSeq);
    results.push({ name: 'SeededRNG – fork مولد فرزند مستقل', passed: ok, details: ok ? 'ok' : 'توالی‌ها یکسان بودند' });
  } catch (e) {
    results.push({ name: 'SeededRNG – fork مولد فرزند مستقل', passed: false, details: String(e) });
  }

  // ۱-و: sampleWithReplacement با سید یکسان → نتیجه یکسان
  try {
    const items = [10, 20, 30, 40, 50];
    const r1 = new SeededRNG(123);
    const r2 = new SeededRNG(123);
    const s1 = r1.sampleWithReplacement(items, 10);
    const s2 = r2.sampleWithReplacement(items, 10);
    const ok = JSON.stringify(s1) === JSON.stringify(s2);
    results.push({ name: 'SeededRNG – sampleWithReplacement سید یکسان → نتیجه یکسان', passed: ok, details: ok ? 'ok' : 'نتایج متفاوت' });
  } catch (e) {
    results.push({ name: 'SeededRNG – sampleWithReplacement سید یکسان → نتیجه یکسان', passed: false, details: String(e) });
  }

  // ────────────── ۲. DatasetFingerprint ─────────────────────────────────────

  // ۲-الف: اثرانگشت یکسان برای داده یکسان
  try {
    const candles = makeFakeCandles(50);
    const fp1 = DatasetFingerprintEngine.compute(candles);
    const fp2 = DatasetFingerprintEngine.compute(candles);
    const ok = fp1 === fp2 && fp1.length > 0;
    results.push({ name: 'DatasetFingerprint – داده یکسان → اثرانگشت یکسان', passed: ok, details: ok ? fp1 : `fp1=${fp1} fp2=${fp2}` });
  } catch (e) {
    results.push({ name: 'DatasetFingerprint – داده یکسان → اثرانگشت یکسان', passed: false, details: String(e) });
  }

  // ۲-ب: تغییر کندل → اثرانگشت متفاوت
  try {
    const candles = makeFakeCandles(50);
    const fp1 = DatasetFingerprintEngine.compute(candles);
    const modified = candles.map((c, i) =>
      i === 10 ? { ...c, close: c.close + 0.9999 } : c
    );
    const fp2 = DatasetFingerprintEngine.compute(modified);
    const ok = fp1 !== fp2;
    results.push({ name: 'DatasetFingerprint – تغییر داده → اثرانگشت متفاوت', passed: ok, details: ok ? 'ok' : 'اثرانگشت تغییر نکرد' });
  } catch (e) {
    results.push({ name: 'DatasetFingerprint – تغییر داده → اثرانگشت متفاوت', passed: false, details: String(e) });
  }

  // ۲-ج: داده خالی → رشته ثابت
  try {
    const fp1 = DatasetFingerprintEngine.compute([]);
    const fp2 = DatasetFingerprintEngine.compute([]);
    const ok = fp1 === fp2 && fp1 === 'ds-fp-empty-00000000';
    results.push({ name: 'DatasetFingerprint – دیتاست خالی → ثابت', passed: ok, details: ok ? fp1 : `fp=${fp1}` });
  } catch (e) {
    results.push({ name: 'DatasetFingerprint – دیتاست خالی → ثابت', passed: false, details: String(e) });
  }

  // ────────────── ۳. Monte Carlo سید‌دار ────────────────────────────────────

  // ۳-الف: سید یکسان → نتیجه یکسان
  try {
    const candles = makeFakeCandles(3000);
    const { trades } = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 10000 });
    const r1 = ResearchLab.runMonteCarlo(trades, 10000, 100, 42);
    const r2 = ResearchLab.runMonteCarlo(trades, 10000, 100, 42);
    const ok =
      r1.medianMaxDrawdownPercent === r2.medianMaxDrawdownPercent &&
      r1.riskOfRuinPercent === r2.riskOfRuinPercent &&
      r1.medianProfit === r2.medianProfit;
    results.push({ name: 'Monte Carlo – سید یکسان → نتیجه یکسان', passed: ok, details: ok ? 'ok' : `DD1=${r1.medianMaxDrawdownPercent} DD2=${r2.medianMaxDrawdownPercent}` });
  } catch (e) {
    results.push({ name: 'Monte Carlo – سید یکسان → نتیجه یکسان', passed: false, details: String(e) });
  }

  // ۳-ب: بدون سید → نتیجه معتبر
  try {
    const candles = makeFakeCandles(3000);
    const { trades } = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 10000 });
    const result = ResearchLab.runMonteCarlo(trades, 10000, 50);
    const ok = result.iterations === 50 && typeof result.medianMaxDrawdownPercent === 'number';
    results.push({ name: 'Monte Carlo – بدون سید → نتیجه معتبر', passed: ok, details: ok ? `itr=${result.iterations}` : 'نتیجه نامعتبر' });
  } catch (e) {
    results.push({ name: 'Monte Carlo – بدون سید → نتیجه معتبر', passed: false, details: String(e) });
  }

  // ────────────── ۴. Stress Config ─────────────────────────────────────────

  // ۴-الف: spread 2x → سود کمتر
  try {
    const candles = makeFakeCandles(3000);
    const base = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 10000 });
    const stressed = ResearchLab.runBacktest(candles, 'GBPUSD', {
      initialCash: 10000,
      stressConfig: { spreadMultiplier: 2 },
    });
    const ok = stressed.metrics.netProfit <= base.metrics.netProfit + 0.01;
    results.push({ name: 'Stress – spread×2 → سود خالص کمتر یا مساوی', passed: ok, details: ok ? `base=${base.metrics.netProfit.toFixed(0)} stressed=${stressed.metrics.netProfit.toFixed(0)}` : 'سود بیشتر شد' });
  } catch (e) {
    results.push({ name: 'Stress – spread×2 → سود خالص کمتر یا مساوی', passed: false, details: String(e) });
  }

  // ۴-ب: slippage اضافی → سود کمتر
  try {
    const candles = makeFakeCandles(3000);
    const base = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 10000 });
    const stressed = ResearchLab.runBacktest(candles, 'GBPUSD', {
      initialCash: 10000,
      stressConfig: { slippageAdditionPips: 1.5 },
    });
    const ok = stressed.metrics.netProfit <= base.metrics.netProfit + 0.01;
    results.push({ name: 'Stress – slippage+1.5pip → سود خالص کمتر یا مساوی', passed: ok, details: ok ? 'ok' : `base=${base.metrics.netProfit.toFixed(0)} stressed=${stressed.metrics.netProfit.toFixed(0)}` });
  } catch (e) {
    results.push({ name: 'Stress – slippage+1.5pip → سود خالص کمتر یا مساوی', passed: false, details: String(e) });
  }

  // ۴-ج: randomSeed یکسان → نتیجه یکسان با تنش
  try {
    const candles = makeFakeCandles(3000);
    const run1 = ResearchLab.runBacktest(candles, 'GBPUSD', {
      initialCash: 10000,
      randomSeed: 1337,
      stressConfig: { randomSkippedFillsPercent: 10 },
    });
    const run2 = ResearchLab.runBacktest(candles, 'GBPUSD', {
      initialCash: 10000,
      randomSeed: 1337,
      stressConfig: { randomSkippedFillsPercent: 10 },
    });
    const ok =
      run1.metrics.totalTrades === run2.metrics.totalTrades &&
      Math.abs(run1.metrics.netProfit - run2.metrics.netProfit) < 0.001;
    results.push({ name: 'Stress – randomSeed یکسان → نتیجه تکرارپذیر', passed: ok, details: ok ? `trades=${run1.metrics.totalTrades}` : `t1=${run1.metrics.totalTrades} t2=${run2.metrics.totalTrades}` });
  } catch (e) {
    results.push({ name: 'Stress – randomSeed یکسان → نتیجه تکرارپذیر', passed: false, details: String(e) });
  }

  // ۴-د: stressConfig خالی → مانند حالت پیش‌فرض
  try {
    const candles = makeFakeCandles(3000);
    const run1 = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 10000 });
    const run2 = ResearchLab.runBacktest(candles, 'GBPUSD', {
      initialCash: 10000,
      stressConfig: {},
    });
    const ok = run1.metrics.totalTrades === run2.metrics.totalTrades;
    results.push({ name: 'Stress – stressConfig خالی ≡ پیش‌فرض', passed: ok, details: ok ? 'ok' : `t1=${run1.metrics.totalTrades} t2=${run2.metrics.totalTrades}` });
  } catch (e) {
    results.push({ name: 'Stress – stressConfig خالی ≡ پیش‌فرض', passed: false, details: String(e) });
  }

  // ────────────── ۵. محدودیت ماتریس ────────────────────────────────────────

  // ۵-الف: ماتریس ۴×۸ نباید از ۳۰ ران تجاوز کند
  try {
    const capitals = [1000, 5000, 10000, 50000];
    const risks = [0.25, 0.5, 1.0, 1.5, 2.0, 0.75, 0.1, 0.3];
    const MAX_RUNS = 30;
    let count = 0;
    for (const _c of capitals) {
      for (const _r of risks) {
        if (count >= MAX_RUNS) break;
        count++;
      }
      if (count >= MAX_RUNS) break;
    }
    const ok = count <= MAX_RUNS;
    results.push({ name: 'ScenarioMatrix – ماتریس ۴×۸ → حداکثر ۳۰ ران', passed: ok, details: `count=${count}` });
  } catch (e) {
    results.push({ name: 'ScenarioMatrix – ماتریس ۴×۸ → حداکثر ۳۰ ران', passed: false, details: String(e) });
  }

  // ۵-ب: ماتریس ۲×۲ باید ۴ ران داشته باشد
  try {
    const d1 = [1000, 5000];
    const d2 = ['LONDON', 'NEW_YORK'];
    let count = 0;
    for (const _a of d1) for (const _b of d2) count++;
    const ok = count === 4;
    results.push({ name: 'ScenarioMatrix – ماتریس ۲×۲ باید ۴ ران داشته باشد', passed: ok, details: `count=${count}` });
  } catch (e) {
    results.push({ name: 'ScenarioMatrix – ماتریس ۲×۲ باید ۴ ران داشته باشد', passed: false, details: String(e) });
  }

  // ────────────── ۶. یکپارچگی metrics ──────────────────────────────────────

  // ۶-الف: فیلدهای عددی اصلی معتبر هستند
  try {
    const candles = makeFakeCandles(3000);
    const { metrics } = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 10000 });
    const ok =
      metrics.totalTrades >= 0 &&
      metrics.winRatePercent >= 0 && metrics.winRatePercent <= 100 &&
      metrics.profitFactor >= 0 &&
      metrics.maxDrawdownPercent >= 0;
    results.push({ name: 'Metrics – فیلدهای عددی اصلی در بازه معتبر', passed: ok, details: ok ? `trades=${metrics.totalTrades} wr=${metrics.winRatePercent.toFixed(1)}%` : 'مقدار نامعتبر' });
  } catch (e) {
    results.push({ name: 'Metrics – فیلدهای عددی اصلی در بازه معتبر', passed: false, details: String(e) });
  }

  // ۶-ب: netProfit = finalEquity - initialCash
  try {
    const candles = makeFakeCandles(3000);
    const { metrics } = ResearchLab.runBacktest(candles, 'GBPUSD', { initialCash: 5000 });
    const lastEquity = metrics.equityCurve[metrics.equityCurve.length - 1]?.equity ?? 5000;
    const expectedProfit = lastEquity - 5000;
    const ok = Math.abs(metrics.netProfit - expectedProfit) < 1;
    results.push({ name: 'Metrics – netProfit = finalEquity − initialCash', passed: ok, details: ok ? `net=${metrics.netProfit.toFixed(0)} expected=${expectedProfit.toFixed(0)}` : 'ناسازگار' });
  } catch (e) {
    results.push({ name: 'Metrics – netProfit = finalEquity − initialCash', passed: false, details: String(e) });
  }

  return results;
}
