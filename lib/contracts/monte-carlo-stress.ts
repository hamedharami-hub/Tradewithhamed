// lib/contracts/monte-carlo-stress.ts
// قراردادهای تایپ‌سیف پکیج E: ماتریس تنش، شبیه‌سازی مونت‌کارلو و محاسبه ریسک ورشکستگی

export type MonteCarloResamplingMethod =
  | 'TRADE_RESHUFFLE'
  | 'BLOCK_BOOTSTRAP'
  | 'RETURN_PERTURBATION';

export interface MonteCarloSimulationConfig {
  iterations: number; // مثلاً ۱۰۰، ۵۰۰، ۱۰۰۰، ۲۵۰۰
  method: MonteCarloResamplingMethod;
  seed: number;
  blockSize?: number; // برای بوت‌استرپینگ بلوکی (پیش‌فرض: ۵ معامله)
  initialEquity?: number;
  ruinDrawdownThresholdPercent?: number; // آستانه ورشکستگی، مثلاً ۱۰٪ یا ۲۰٪
  maxAllowedDailyLossPercent?: number; // آستانه مجاز زیان روزانه، مثلاً ۵٪
}

export interface MonteCarloPercentileBands {
  p5: number;
  p25: number;
  p50: number; // میانه (Median)
  p75: number;
  p95: number;
}

export interface SimulatedEquityPath {
  pathIndex: number;
  finalEquity: number;
  netProfit: number;
  maxDrawdownPercent: number;
  isRuined: boolean;
  equityPoints: number[]; // نقاط نمونه‌برداری‌شده اکوئیتی
}

export interface RiskOfRuinAnalysis {
  ruinProbabilityPercent: number; // احتمال کلی برخورد با آستانه افت ورشکستگی
  p50MaxDrawdownPercent: number;
  p95MaxDrawdownPercent: number; // بدترین حالت دروداون با اطمینان ۹۵٪
  propFirmPassProbabilityPercent: number; // احتمال رعایت کامل سقف افت ۵٪ روزانه و ۱۰٪ کل
  drawdownExceedanceProbabilities: {
    exceeds5Percent: number;
    exceeds10Percent: number;
    exceeds15Percent: number;
    exceeds20Percent: number;
  };
}

export interface MonteCarloSimulationReport {
  simulationVersion: 'v2-monte-carlo';
  iterations: number;
  method: MonteCarloResamplingMethod;
  seed: number;
  initialEquity: number;
  finalEquityPercentiles: MonteCarloPercentileBands;
  maxDrawdownPercentiles: MonteCarloPercentileBands;
  riskOfRuin: RiskOfRuinAnalysis;
  samplePaths: SimulatedEquityPath[]; // حداکثر ۲۰ مسیر نمونه برای ترسیم نمودار
  executionTimeMs: number;
}

// ─── Stress Matrix Contracts ──────────────────────────────────────────────

export interface StressDimensionOptions {
  spreadMultipliers: number[]; // مثلاً [1.0, 1.5, 2.0, 3.0]
  additionalSlippagePips: number[]; // مثلاً [0.0, 0.5, 1.0, 2.0]
  skippedFillsPercents?: number[]; // مثلاً [0, 5, 10, 20]
  gapShockMultipliers?: number[]; // مثلاً [1.0, 1.5, 2.5]
}

export interface StressMatrixCell {
  scenarioId: string;
  spreadMultiplier: number;
  slippageAdditionPips: number;
  skippedFillsPercent: number;
  gapShockMultiplier: number;
  netProfit: number;
  profitFactor: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  isProfitable: boolean;
  isPropFirmSafe: boolean; // آیا دروداون کمتر از ۱۰٪ مانده است
}

export type StrategyResilienceGrade = 'RESILIENT' | 'VULNERABLE' | 'FRAGILE';

export interface StressMatrixReport {
  matrixVersion: 'v2-stress-matrix';
  totalScenariosEvaluated: number;
  profitableScenariosCount: number;
  propFirmSafeScenariosCount: number;
  breakEvenSlippageThresholdPips: number; // حداکثر اسلیپیج قابل تحمل قبل از زیان‌دهی
  breakEvenSpreadMultiplier: number; // حداکثر ضریب اسپرد قابل تحمل
  resilienceGrade: StrategyResilienceGrade;
  resilienceSummaryFa: string;
  scenarios: StressMatrixCell[];
  worstCaseScenario: StressMatrixCell;
  executionTimeMs: number;
}
