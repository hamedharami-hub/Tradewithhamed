import type { StrategyRunSummary } from './contracts';

export type CandidateAcceptanceStatus = 'REJECTED' | 'RESEARCH_CANDIDATE' | 'PAPER_FORWARD_ELIGIBLE';

export interface AcceptanceGateThresholds {
  minOosTrades: number;
  minProfitFactor: number;
  maxDrawdownPercent: number;
  minPositiveStressScenarios: number;
  minStableFoldsPercent: number;
  maxTrainToOosGapRatio: number;
}

export interface AcceptanceFoldInput {
  trainNetProfit: number;
  oosNetProfit: number;
  oosTrades: number;
  oosProfitFactor?: number;
  oosMaxDrawdownPercent?: number;
  stressNetProfits: number[];
}

export interface AcceptanceGateInput {
  candidateId: string;
  symbol: string;
  timeframe: string;
  baseline?: { oosNetProfit: number; oosTrades: number };
  optimized: { oosNetProfit: number; oosTrades: number; oosProfitFactor?: number; oosMaxDrawdownPercent?: number; stressNetProfits: number[] };
  folds: AcceptanceFoldInput[];
  thresholds?: Partial<AcceptanceGateThresholds>;
}

export interface AcceptanceGateResult {
  candidateId: string;
  symbol: string;
  timeframe: string;
  status: CandidateAcceptanceStatus;
  score: number;
  reasonsFa: string[];
  metrics: { oosNetProfit: number; oosTrades: number; positiveStressScenarios: number; stableFoldsPercent: number; maxDrawdownPercent: number; profitFactor: number; trainToOosGapRatio: number };
  thresholds: AcceptanceGateThresholds;
}

export const DEFAULT_ACCEPTANCE_THRESHOLDS: AcceptanceGateThresholds = {
  minOosTrades: 30,
  minProfitFactor: 1.05,
  maxDrawdownPercent: 8,
  minPositiveStressScenarios: 2,
  minStableFoldsPercent: 60,
  maxTrainToOosGapRatio: 4,
};

function positive(value: number): number { return value > 0 ? 1 : 0; }
function ratio(numerator: number, denominator: number): number { return Math.abs(denominator) > 0.01 ? Math.abs(numerator / denominator) : Math.abs(numerator); }

export function evaluateAcceptanceGate(input: AcceptanceGateInput): AcceptanceGateResult {
  const thresholds = { ...DEFAULT_ACCEPTANCE_THRESHOLDS, ...input.thresholds };
  const optimized = input.optimized;
  const positiveStressScenarios = optimized.stressNetProfits.filter(value => value > 0).length;
  const stableFolds = input.folds.filter(fold => fold.oosNetProfit > 0 && fold.oosTrades > 0).length;
  const stableFoldsPercent = input.folds.length ? (stableFolds / input.folds.length) * 100 : 0;
  const trainProfit = input.folds.reduce((sum, fold) => sum + Math.max(0, fold.trainNetProfit), 0);
  const oosProfit = input.folds.reduce((sum, fold) => sum + fold.oosNetProfit, 0);
  const trainToOosGapRatio = ratio(trainProfit - oosProfit, Math.max(1, trainProfit));
  const metrics = {
    oosNetProfit: optimized.oosNetProfit,
    oosTrades: optimized.oosTrades,
    positiveStressScenarios,
    stableFoldsPercent: Number(stableFoldsPercent.toFixed(1)),
    maxDrawdownPercent: optimized.oosMaxDrawdownPercent ?? 0,
    profitFactor: optimized.oosProfitFactor ?? 0,
    trainToOosGapRatio: Number(trainToOosGapRatio.toFixed(2)),
  };
  const failures: string[] = [];
  if (metrics.oosTrades < thresholds.minOosTrades) failures.push(`تعداد معاملات OOS (${metrics.oosTrades}) کمتر از حداقل ${thresholds.minOosTrades} است.`);
  if (metrics.oosNetProfit <= 0) failures.push('سود خالص OOS غیرمثبت است.');
  if (metrics.profitFactor > 0 && metrics.profitFactor < thresholds.minProfitFactor) failures.push(`Profit Factor (${metrics.profitFactor}) کمتر از ${thresholds.minProfitFactor} است.`);
  if (metrics.maxDrawdownPercent > thresholds.maxDrawdownPercent) failures.push(`افت سرمایه (${metrics.maxDrawdownPercent}٪) از سقف ${thresholds.maxDrawdownPercent}٪ بیشتر است.`);
  if (metrics.positiveStressScenarios < thresholds.minPositiveStressScenarios) failures.push(`فقط ${metrics.positiveStressScenarios} سناریوی Cost Stress مثبت است.`);
  if (metrics.stableFoldsPercent < thresholds.minStableFoldsPercent) failures.push(`ثبات foldها (${metrics.stableFoldsPercent}٪) کمتر از ${thresholds.minStableFoldsPercent}٪ است.`);
  if (metrics.trainToOosGapRatio > thresholds.maxTrainToOosGapRatio) failures.push(`شکاف train/OOS (${metrics.trainToOosGapRatio}) بیش از حد مجاز است.`);
  const score = Math.max(0, Math.round(100 - failures.length * 14 - (metrics.oosNetProfit <= 0 ? 20 : 0)));
  const status: CandidateAcceptanceStatus = failures.length === 0 ? 'PAPER_FORWARD_ELIGIBLE' : (metrics.oosNetProfit > 0 && metrics.positiveStressScenarios > 0 && metrics.stableFoldsPercent >= 40 ? 'RESEARCH_CANDIDATE' : 'REJECTED');
  return { candidateId: input.candidateId, symbol: input.symbol, timeframe: input.timeframe, status, score, reasonsFa: failures.length ? failures : ['همهٔ شروط پذیرش فعلی برقرار است؛ این وضعیت همچنان مجوز معاملهٔ زنده نیست.'], metrics, thresholds };
}

export function summaryToGateMetrics(summary: StrategyRunSummary) {
  return { oosNetProfit: summary.netProfit, oosTrades: summary.totalTrades, oosProfitFactor: summary.profitFactor, oosMaxDrawdownPercent: summary.maxDrawdownPercent, stressNetProfits: [summary.netProfit] };
}
