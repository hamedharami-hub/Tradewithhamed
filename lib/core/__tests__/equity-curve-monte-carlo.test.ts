// lib/core/__tests__/equity-curve-monte-carlo.test.ts
// آزمون‌های واحد موتور شبیه‌سازی مونت‌کارلو توالی معاملات و احتمال ورشکستگی

import { EquityCurveMonteCarloEngine } from '../equity-curve-monte-carlo';

export async function runEquityMonteCarloTests() {
  const checks: { name: string; passed: boolean; details?: string }[] = [];

  // ۱. بررسی قطعی بودن نتایج شبیه‌سازی برای یک سید مشخص (Deterministic PRNG)
  const tradesSample = [150, -100, 200, -100, -100, 300, 150, -100, 250, -100];
  const sim1 = EquityCurveMonteCarloEngine.runSimulation(tradesSample, {
    iterations: 500,
    seed: 42,
    initialEquity: 10000,
  });
  const sim2 = EquityCurveMonteCarloEngine.runSimulation(tradesSample, {
    iterations: 500,
    seed: 42,
    initialEquity: 10000,
  });

  checks.push({
    name: 'تکرارپذیری ۱۰۰٪ قطعی شبیه‌سازی با سید مشخص',
    passed:
      sim1.drawdownDistribution.p50 === sim2.drawdownDistribution.p50 &&
      sim1.drawdownDistribution.p95 === sim2.drawdownDistribution.p95 &&
      sim1.riskMetrics.ruinProbabilityPercent === sim2.riskMetrics.ruinProbabilityPercent,
    details: `p50=${sim1.drawdownDistribution.p50}, p95=${sim1.drawdownDistribution.p95}`,
  });

  // ۲. آزمون یکنواختی صعودی صدک‌های دراودان (p05 <= p50 <= p95 <= worstCase)
  const dd = sim1.drawdownDistribution;
  const isMonotonic =
    dd.p05 <= dd.p25 &&
    dd.p25 <= dd.p50 &&
    dd.p50 <= dd.p75 &&
    dd.p75 <= dd.p90 &&
    dd.p90 <= dd.p95 &&
    dd.p95 <= dd.p99 &&
    dd.p99 <= dd.worstCase;

  checks.push({
    name: 'یکنواختی آماری صدک‌های دراودان (p05 <= p50 <= p95 <= worstCase)',
    passed: isMonotonic,
    details: `p05: ${dd.p05}%, p50: ${dd.p50}%, p95: ${dd.p95}%, worst: ${dd.worstCase}%`,
  });

  // ۳. آزمون استراتژی زیان‌ده متوالی و تشخیص ریسک بالای ورشکستگی
  const losingTrades = [-200, -250, -300, 100, -250, -300, -200, -400, 50, -300];
  const losingSim = EquityCurveMonteCarloEngine.runSimulation(losingTrades, {
    iterations: 500,
    initialEquity: 5000,
    maxDrawdownThresholdPercent: 8.0,
    seed: 42,
  });

  checks.push({
    name: 'شناسایی و هشدار ریسک ورشکستگی بالا (HIGH_RUIN_RISK) در سیستم‌های زیان‌ده',
    passed:
      losingSim.safetyRating === 'HIGH_RUIN_RISK' &&
      losingSim.riskMetrics.ruinProbabilityPercent > 50,
    details: `احتمال ورشکستگی: ${losingSim.riskMetrics.ruinProbabilityPercent}%, رتبه: ${losingSim.safetyRating}`,
  });

  // ۴. آزمون استراتژی پایدار با برتری سوددهی و عبور از چالش پراپ‌فرم
  const solidTrades = [
    250, 180, -100, 220, -100, 300, -100, 200, 150, -100,
    280, -100, 210, -100, 190, 250, -100, 310, 170, -100,
  ];
  const solidSim = EquityCurveMonteCarloEngine.runSimulation(solidTrades, {
    iterations: 500,
    initialEquity: 10000,
    profitTargetPercent: 8.0,
    maxDrawdownThresholdPercent: 10.0,
    seed: 42,
  });

  checks.push({
    name: 'تخمین احتمال قبولی و پایداری حساب در چالش پراپ‌فرم',
    passed:
      solidSim.riskMetrics.ruinProbabilityPercent < 5 &&
      solidSim.riskMetrics.propFirmPassProbabilityPercent > 70 &&
      (solidSim.safetyRating === 'INSTITUTIONAL_SAFE' || solidSim.safetyRating === 'ROBUST_EDGE'),
    details: `شانس قبولی: ${solidSim.riskMetrics.propFirmPassProbabilityPercent}%, احتمال ورشکستگی: ${solidSim.riskMetrics.ruinProbabilityPercent}%`,
  });

  // ۵. رفتار ایمن در صورت ورودی خالی
  const emptySim = EquityCurveMonteCarloEngine.runSimulation([], { initialEquity: 10000 });
  checks.push({
    name: 'پایداری و مدیریت خطا در صورت عدم وجود معامله',
    passed: emptySim.tradeCount === 0 && emptySim.riskMetrics.ruinProbabilityPercent === 0,
    details: emptySim.summaryFa,
  });

  return checks;
}
