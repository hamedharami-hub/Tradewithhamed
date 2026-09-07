// lib/core/__tests__/monte-carlo.test.ts
// آزمون‌های جامع موتور شبیه‌سازی ۱۰۰۰ مسیره استوکاستیک مونت‌کارلو

import { MonteCarloSimulator } from '../monte-carlo-simulator';

export interface TestResultItem {
  name: string;
  passed: boolean;
  details: string;
}

export function runMonteCarloTestSuite(): TestResultItem[] {
  const results: TestResultItem[] = [];

  // ۱. بررسی سلامت اجرای ۱۰۰۰ مسیر و بقای تعداد نمونه‌ها
  try {
    const res = MonteCarloSimulator.runSimulation({
      initialPrice: 2050.0,
      targetPrice: 2060.0,
      stopLossPrice: 2045.0,
      iterations: 1000,
      steps: 40,
      seed: 9999,
    });

    const pathsMatch = res.totalPaths === 1000;
    const countSumMatch = res.tpFirstCount + res.slFirstCount + res.neitherCount === 1000;
    const boundsValid = res.probabilityOfProfit >= 0 && res.probabilityOfProfit <= 100 &&
                        res.probabilityOfStopLoss >= 0 && res.probabilityOfStopLoss <= 100;

    results.push({
      name: '[Monte Carlo] 1000 Paths Stochastic Execution & Conservation',
      passed: pathsMatch && countSumMatch && boundsValid,
      details: `تعداد مسیرها: ${res.totalPaths} | مجموع نتایج: ${res.tpFirstCount + res.slFirstCount + res.neitherCount} | احتمال برد: ${res.probabilityOfProfit}٪ | احتمال باخت: ${res.probabilityOfStopLoss}٪`,
    });
  } catch (err) {
    results.push({
      name: '[Monte Carlo] 1000 Paths Stochastic Execution & Conservation',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. بررسی درستی ساختار مخروط صدک‌ها (Percentile Cone Monotonicity)
  try {
    const res = MonteCarloSimulator.runSimulation({
      initialPrice: 2050.0,
      targetPrice: 2065.0,
      stopLossPrice: 2042.0,
      iterations: 500,
      steps: 30,
      seed: 8888,
    });

    const cone = res.percentileCone;
    const lengthMatch = cone.length === 31; // step 0 to step 30

    let orderOk = true;
    for (const pt of cone) {
      if (!(pt.p5 <= pt.p25 && pt.p25 <= pt.p50 && pt.p50 <= pt.p75 && pt.p75 <= pt.p95)) {
        orderOk = false;
        break;
      }
    }

    results.push({
      name: '[Monte Carlo] Percentile Cone Monotonicity (P5 <= P25 <= P50 <= P75 <= P95)',
      passed: lengthMatch && orderOk,
      details: `تعداد گام‌های مخروط: ${cone.length} | ترتیب یکنوای صدک‌ها در تمام گام‌ها: ${orderOk ? 'صحیح' : 'خطا'}`,
    });
  } catch (err) {
    results.push({
      name: '[Monte Carlo] Percentile Cone Monotonicity (P5 <= P25 <= P50 <= P75 <= P95)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. آزمون تکرارپذیری با بذر شبه‌تصادفی معین (Deterministic Seed Reproducibility)
  try {
    const res1 = MonteCarloSimulator.runSimulation({
      initialPrice: 2050.0,
      targetPrice: 2060.0,
      stopLossPrice: 2045.0,
      iterations: 500,
      steps: 25,
      seed: 12345,
    });

    const res2 = MonteCarloSimulator.runSimulation({
      initialPrice: 2050.0,
      targetPrice: 2060.0,
      stopLossPrice: 2045.0,
      iterations: 500,
      steps: 25,
      seed: 12345,
    });

    const exactMatch = res1.probabilityOfProfit === res2.probabilityOfProfit &&
                       res1.medianFinalPrice === res2.medianFinalPrice &&
                       res1.tpFirstCount === res2.tpFirstCount &&
                       res1.slFirstCount === res2.slFirstCount;

    results.push({
      name: '[Monte Carlo] Deterministic Seed Output Reproducibility',
      passed: exactMatch,
      details: exactMatch
        ? `دو اجرای مستقل با بذر ۱۲۳۴۵ نتایج کاملاً یکسان تولید کردند (PoP = ${res1.probabilityOfProfit}٪).`
        : 'اختلاف در خروجی‌های بذر تکرارپذیر مشاهده شد.',
    });
  } catch (err) {
    results.push({
      name: '[Monte Carlo] Deterministic Seed Output Reproducibility',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. بررسی معیارهای ارزش در معرض ریسک (VaR 95% و CVaR 95%) و گزارش فارسی
  try {
    const res = MonteCarloSimulator.runSimulation({
      initialPrice: 2050.0,
      targetPrice: 2058.0,
      stopLossPrice: 2046.0,
      iterations: 500,
      steps: 30,
      seed: 7777,
    });

    const varValid = res.var95Percent >= 0;
    const cvarValid = res.cvar95Percent >= res.var95Percent || res.cvar95Percent >= 0;
    const faValid = res.persianRiskAssessment.length > 20;

    results.push({
      name: '[Monte Carlo] VaR 95% & CVaR 95% Risk Metrics & Persian Report',
      passed: varValid && cvarValid && faValid,
      details: `VaR 95%: ${res.var95Percent}٪ | CVaR 95%: ${res.cvar95Percent}٪ | گزارش فارسی: ${res.persianRiskAssessment.slice(0, 60)}...`,
    });
  } catch (err) {
    results.push({
      name: '[Monte Carlo] VaR 95% & CVaR 95% Risk Metrics & Persian Report',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
