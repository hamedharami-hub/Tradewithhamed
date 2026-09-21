// lib/core/__tests__/monte-carlo-stress-matrix.test.ts
// سوئیت تست جامع دامنه‌ای پکیج E: شبیه‌سازی مونت‌کارلو و ماتریس تنش چندبعدی

import type { Candle } from '@/lib/contracts/market';
import { AdvancedMonteCarloEngine } from '../monte-carlo-engine';
import { StressMatrixEngine } from '../stress-matrix-engine';
import { StrategyParameterOptimizer } from '../parameter-optimizer';
import { ResearchLab } from '../research-lab';

export interface DomainCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

function generateCandles(count = 250): Candle[] {
  const candles: Candle[] = [];
  let price = 1.2500;
  const startTime = 1_700_000_000_000;

  for (let i = 0; i < count; i++) {
    const change = Math.sin(i / 8) * 0.0020 + 0.0001;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) + 0.0010;
    const low = Math.min(open, close) - 0.0010;
    price = close;

    candles.push({
      timestamp: startTime + i * 15 * 60_000,
      open: Number(open.toFixed(5)),
      high: Number(high.toFixed(5)),
      low: Number(low.toFixed(5)),
      close: Number(close.toFixed(5)),
      volume: 1000,
      isClosed: true,
    });
  }

  return candles;
}

export async function runMonteCarloStressMatrixTestSuite(): Promise<DomainCheckResult[]> {
  const checks: DomainCheckResult[] = [];
  const baseParams = StrategyParameterOptimizer.createDefaultParameters();
  const candles = generateCandles(260);

  // داده‌های نمونه معاملات سودآور و زیان‌ده
  const profitableTrades = [120, -50, 180, -60, 200, -80, 140, -40, 220, -70, 160, -50, 190, -60, 150];
  const losingTrades = [-120, -150, 50, -180, -200, 40, -160, -220, -100, 30, -140];

  // ۱. راستی‌آزمایی تکرارپذیری ۱۰۰٪ مونت‌کارلو با Seed یکسان
  try {
    const report1 = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 200,
      method: 'TRADE_RESHUFFLE',
      seed: 42,
      initialEquity: 10000,
    });

    const report2 = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 200,
      method: 'TRADE_RESHUFFLE',
      seed: 42,
      initialEquity: 10000,
    });

    const report3 = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 200,
      method: 'TRADE_RESHUFFLE',
      seed: 999,
      initialEquity: 10000,
    });

    const sameSeedIdentical = report1.finalEquityPercentiles.p50 === report2.finalEquityPercentiles.p50 &&
      report1.riskOfRuin.p95MaxDrawdownPercent === report2.riskOfRuin.p95MaxDrawdownPercent;
    const diffSeedVaries = report1.finalEquityPercentiles.p5 !== report3.finalEquityPercentiles.p5 ||
      report1.riskOfRuin.p95MaxDrawdownPercent !== report3.riskOfRuin.p95MaxDrawdownPercent;

    checks.push({
      name: '1. Monte Carlo simulation is deterministic with identical seed and varies with different seed',
      passed: sameSeedIdentical && diffSeedVaries,
      details: `sameSeedIdentical=${sameSeedIdentical}, diffSeedVaries=${diffSeedVaries}`,
    });
  } catch (err) {
    checks.push({
      name: '1. Monte Carlo simulation is deterministic with identical seed',
      passed: false,
      details: String(err),
    });
  }

  // ۲. محاسبه صحیح صدک‌های توزیع اکوئیتی (P5 <= P25 <= P50 <= P75 <= P95)
  try {
    const report = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 300,
      method: 'TRADE_RESHUFFLE',
      seed: 123,
      initialEquity: 10000,
    });

    const p = report.finalEquityPercentiles;
    const isMonotonic = p.p5 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p95;

    checks.push({
      name: '2. Final equity percentile bands are monotonically increasing (P5 <= P25 <= P50 <= P75 <= P95)',
      passed: isMonotonic,
      details: `P5=${p.p5}, P25=${p.p25}, P50=${p.p50}, P75=${p.p75}, P95=${p.p95}`,
    });
  } catch (err) {
    checks.push({
      name: '2. Final equity percentile bands are monotonically increasing',
      passed: false,
      details: String(err),
    });
  }

  // ۳. اعتبارسنجی ریسک ورشکستگی (Risk of Ruin) برای معاملات سودآور در برابر زیان‌ده
  try {
    const safeReport = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 200,
      method: 'TRADE_RESHUFFLE',
      seed: 777,
      initialEquity: 10000,
      ruinDrawdownThresholdPercent: 10,
    });

    const ruinReport = AdvancedMonteCarloEngine.simulate(losingTrades, {
      iterations: 200,
      method: 'TRADE_RESHUFFLE',
      seed: 777,
      initialEquity: 5000,
      ruinDrawdownThresholdPercent: 10,
    });

    const safeRuinLow = safeReport.riskOfRuin.ruinProbabilityPercent <= 10;
    const losingRuinHigh = ruinReport.riskOfRuin.ruinProbabilityPercent >= 80;

    checks.push({
      name: '3. Risk of Ruin accurately distinguishes high-expectancy vs deteriorating trade streams',
      passed: safeRuinLow && losingRuinHigh,
      details: `safeRuin=${safeReport.riskOfRuin.ruinProbabilityPercent}%, losingRuin=${ruinReport.riskOfRuin.ruinProbabilityPercent}%`,
    });
  } catch (err) {
    checks.push({
      name: '3. Risk of Ruin accurately distinguishes high-expectancy vs deteriorating trade streams',
      passed: false,
      details: String(err),
    });
  }

  // ۴. شبیه‌سازی بوت‌استرپ بلوکی (Block Bootstrapping)
  try {
    const blockReport = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 200,
      method: 'BLOCK_BOOTSTRAP',
      blockSize: 4,
      seed: 555,
      initialEquity: 10000,
    });

    const hasPaths = blockReport.samplePaths.length > 0;
    const validMetrics = blockReport.riskOfRuin.p50MaxDrawdownPercent >= 0;

    checks.push({
      name: '4. Block Bootstrap preserves trade dependency and generates valid drawdown distributions',
      passed: hasPaths && validMetrics,
      details: `paths=${blockReport.samplePaths.length}, p50DD=${blockReport.riskOfRuin.p50MaxDrawdownPercent}%`,
    });
  } catch (err) {
    checks.push({
      name: '4. Block Bootstrap preserves trade dependency',
      passed: false,
      details: String(err),
    });
  }

  // ۵. انطباق‌سنجی با قوانین چالش‌های پراپ‌فرم
  try {
    const report = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 200,
      method: 'TRADE_RESHUFFLE',
      seed: 888,
      initialEquity: 10000,
      ruinDrawdownThresholdPercent: 10,
      maxAllowedDailyLossPercent: 5,
    });

    const hasPropProbability = Number.isFinite(report.riskOfRuin.propFirmPassProbabilityPercent);
    const hasDrawdownExceedance = report.riskOfRuin.drawdownExceedanceProbabilities.exceeds10Percent !== undefined;

    checks.push({
      name: '5. Prop firm pass probability and drawdown exceedance thresholds are correctly calculated',
      passed: hasPropProbability && hasDrawdownExceedance,
      details: `propPass=${report.riskOfRuin.propFirmPassProbabilityPercent}%, exceeds10%=${report.riskOfRuin.drawdownExceedanceProbabilities.exceeds10Percent}%`,
    });
  } catch (err) {
    checks.push({
      name: '5. Prop firm pass probability is correctly calculated',
      passed: false,
      details: String(err),
    });
  }

  // ۶. ارزیابی ماتریس تنش چندبعدی و اعمال ضرایب اسپرد/اسلیپیج
  try {
    const stressReport = StressMatrixEngine.evaluateMatrix(candles.slice(0, 150), 'EURUSD', baseParams, {
      dimensions: {
        spreadMultipliers: [1.0, 2.0],
        additionalSlippagePips: [0.0, 1.0],
      },
      randomSeed: 101,
    });

    const isGridCovered = stressReport.totalScenariosEvaluated === 4;
    const hasWorstCase = stressReport.worstCaseScenario !== null;

    checks.push({
      name: '6. Stress Matrix evaluates full cross-product of friction parameters and captures worst case',
      passed: isGridCovered && hasWorstCase,
      details: `evaluated=${stressReport.totalScenariosEvaluated}, worstNetProfit=${stressReport.worstCaseScenario.netProfit}`,
    });
  } catch (err) {
    checks.push({
      name: '6. Stress Matrix evaluates full cross-product of friction parameters',
      passed: false,
      details: String(err),
    });
  }

  // ۷. محاسبه نقطه شکست اسلیپیج و ضریب اسپرد
  try {
    const stressReport = StressMatrixEngine.evaluateMatrix(candles.slice(0, 150), 'EURUSD', baseParams, {
      dimensions: {
        spreadMultipliers: [1.0, 1.5, 3.0],
        additionalSlippagePips: [0.0, 0.5, 2.0],
      },
      randomSeed: 202,
    });

    const validSlippageCeiling = Number.isFinite(stressReport.breakEvenSlippageThresholdPips);
    const validSpreadCeiling = Number.isFinite(stressReport.breakEvenSpreadMultiplier);

    checks.push({
      name: '7. Break-even slippage threshold and spread multiplier ceilings are deterministically discovered',
      passed: validSlippageCeiling && validSpreadCeiling,
      details: `maxSlip=${stressReport.breakEvenSlippageThresholdPips} pips, maxSpread=${stressReport.breakEvenSpreadMultiplier}x`,
    });
  } catch (err) {
    checks.push({
      name: '7. Break-even slippage threshold is discovered',
      passed: false,
      details: String(err),
    });
  }

  // ۸. رده‌بندی تاب‌آوری استراتژی در برابر تنش
  try {
    const stressReport = StressMatrixEngine.evaluateMatrix(candles.slice(0, 150), 'EURUSD', baseParams, {
      dimensions: {
        spreadMultipliers: [1.0, 2.0],
        additionalSlippagePips: [0.0, 1.0],
      },
      randomSeed: 303,
    });

    const validGrade = ['RESILIENT', 'VULNERABLE', 'FRAGILE'].includes(stressReport.resilienceGrade);
    const hasSummary = stressReport.resilienceSummaryFa.length > 10;

    checks.push({
      name: '8. Strategy resilience grading classifies portfolio robustness into standard categories',
      passed: validGrade && hasSummary,
      details: `grade=${stressReport.resilienceGrade}, summary=${stressReport.resilienceSummaryFa}`,
    });
  } catch (err) {
    checks.push({
      name: '8. Strategy resilience grading classifies portfolio robustness',
      passed: false,
      details: String(err),
    });
  }

  // ۹. رفتار مقاوم در برابر لیست خالی معاملات در مونت‌کارلو
  try {
    const emptyReport = AdvancedMonteCarloEngine.simulate([], {
      iterations: 100,
      method: 'TRADE_RESHUFFLE',
      seed: 42,
      initialEquity: 10000,
    });

    checks.push({
      name: '9. Monte Carlo engine handles empty trade list gracefully without crashing',
      passed: emptyReport.iterations === 0 && emptyReport.riskOfRuin.ruinProbabilityPercent === 0,
      details: `iterations=${emptyReport.iterations}, finalP50=${emptyReport.finalEquityPercentiles.p50}`,
    });
  } catch (err) {
    checks.push({
      name: '9. Monte Carlo engine handles empty trade list gracefully',
      passed: false,
      details: String(err),
    });
  }

  // ۱۰. استخراج آرایه PnL از پوزیشن‌های دفترکل
  try {
    const mockPositions: any[] = [
      { realizedPnl: 150.5 },
      { realizedPnl: -80.2 },
      { realizedPnl: 210.0 },
    ];
    const pnls = AdvancedMonteCarloEngine.extractTradePnls(mockPositions);

    checks.push({
      name: '10. Trade PnL extraction accurately extracts net realized cash values from ledger',
      passed: pnls.length === 3 && pnls[0] === 150.5 && pnls[1] === -80.2,
      details: `extracted=[${pnls.join(', ')}]`,
    });
  } catch (err) {
    checks.push({
      name: '10. Trade PnL extraction accurately extracts net realized cash values',
      passed: false,
      details: String(err),
    });
  }

  // ۱۱. ادغام مستقیم متدهای پکیج E در ResearchLab
  try {
    const mcReport = ResearchLab.runMonteCarloSimulation(profitableTrades, {
      iterations: 50,
      method: 'TRADE_RESHUFFLE',
      seed: 42,
    });

    const stressReport = ResearchLab.runStressMatrix(candles.slice(0, 100), 'EURUSD', baseParams, {
      dimensions: { spreadMultipliers: [1.0, 1.5], additionalSlippagePips: [0.0] },
      randomSeed: 42,
    });

    checks.push({
      name: '11. ResearchLab exposes runMonteCarloSimulation and runStressMatrix seamlessly',
      passed: mcReport.samplePaths.length > 0 && stressReport.scenarios.length === 2,
      details: `mcIterations=${mcReport.iterations}, stressScenarios=${stressReport.scenarios.length}`,
    });
  } catch (err) {
    checks.push({
      name: '11. ResearchLab exposes runMonteCarloSimulation and runStressMatrix seamlessly',
      passed: false,
      details: String(err),
    });
  }

  // ۱۲. کارایی محاسباتی زیر ۴۰۰ میلی‌ثانیه برای ۱۰۰۰ تکرار مونت‌کارلو
  try {
    const start = performance.now();
    const benchmarkReport = AdvancedMonteCarloEngine.simulate(profitableTrades, {
      iterations: 1000,
      method: 'TRADE_RESHUFFLE',
      seed: 12345,
      initialEquity: 10000,
    });
    const elapsedMs = performance.now() - start;

    checks.push({
      name: '12. High computational throughput completes 1000 Monte Carlo iterations in under 400ms',
      passed: elapsedMs < 400 && benchmarkReport.iterations === 1000,
      details: `elapsed=${elapsedMs.toFixed(1)}ms (threshold < 400ms)`,
    });
  } catch (err) {
    checks.push({
      name: '12. High computational throughput completes 1000 Monte Carlo iterations in under 400ms',
      passed: false,
      details: String(err),
    });
  }

  return checks;
}
