// lib/contracts/parameter-optimization.ts
// قراردادهای تایپ‌سیف پکیج D: بهینه‌سازی پارامترها و اعتبارسنجی پیش‌رو با بافر قرنطینه (Purged Walk-Forward)

import type { Candle, SymbolId, Timeframe } from './market';
import type { StrategyParameters, StrategyPreset } from './strategy-parameters';
import type { TradingStyleType } from './regimes';
import type { PerformanceMetrics } from '../core/research-lab';

export type OptimizationMethod = 'GRID' | 'RANDOM';

export type OptimizationObjective =
  | 'NET_PROFIT'
  | 'PROFIT_FACTOR'
  | 'EXPECTANCY'
  | 'CALMAR_LIKE'
  | 'SHARPE_LIKE'
  | 'WIN_RATE';

export interface ParameterRangeDefinition {
  parameterKey: string;
  nameFa: string;
  family: TradingStyleType | 'COMMON' | 'EXECUTION_FRICTION';
  values: number[];
}

export type StrategySearchSpace = {
  common?: Partial<{
    riskRewardRatio: number[];
    atrMultiplier: number[];
    atrPeriod: number[];
    expiryBars: number[];
    cooldownBars: number[];
    breakevenTriggerR: number[];
  }>;
  trendBreakout?: Partial<{
    channelPeriod: number[];
    fastEmaPeriod: number[];
    slowEmaPeriod: number[];
    breakoutBufferAtr: number[];
  }>;
  meanReversion?: Partial<{
    lookbackPeriod: number[];
    zScoreThreshold: number[];
    exitZScore: number[];
  }>;
  smc?: Partial<{
    liquidityLookback: number[];
    sweepThreshold: number[];
  }>;
  scalp?: Partial<{
    fastEma: number[];
    slowEma: number[];
    minAtr: number[];
  }>;
  swing?: Partial<{
    trendEma: number[];
    pullbackDepth: number[];
    confirmationBars: number[];
  }>;
  executionFriction?: Partial<{
    baseSlippagePips: number[];
    volatilityMultiplier: number[];
    additionalSlippagePips: number[];
  }>;
};

export interface ParameterCandidateEvaluation {
  candidateId: string;
  rank: number;
  parameters: StrategyParameters;
  score: number;
  objective: OptimizationObjective;
  metrics: PerformanceMetrics;
  isAccepted: boolean;
  plateauScore: number; // پایداری در برابر تغییرات همسایه (۰ تا ۱۰۰)
  rejectionReason?: string;
}

export interface ParameterOptimizationOptions {
  method?: OptimizationMethod;
  searchSpace: StrategySearchSpace;
  objective?: OptimizationObjective;
  maxEvaluations?: number;
  minTrades?: number;
  randomSeed?: number;
  style?: TradingStyleType | 'ALL';
  evaluatePlateauStability?: boolean;
}

export interface ParameterOptimizationReport {
  optimizerVersion: 'v2-purged-optimizer';
  method: OptimizationMethod;
  objective: OptimizationObjective;
  evaluatedCount: number;
  acceptedCount: number;
  bestCandidate: ParameterCandidateEvaluation | null;
  leaderboard: ParameterCandidateEvaluation[];
  searchSpace: StrategySearchSpace;
  warnings: string[];
  executionTimeMs: number;
}

// ─── Walk-Forward Contracts ───────────────────────────────────────────────

export type WalkForwardWindowType = 'ANCHORED' | 'ROLLING';
export type StrategyRobustnessGrade = 'ROBUST' | 'DEGRADED' | 'OVERFITTED';

export interface PurgedWalkForwardConfig {
  windowCount: number; // e.g. 3, 4, 5
  windowType: WalkForwardWindowType;
  trainRatio?: number; // e.g. 0.70
  testRatio?: number; // e.g. 0.30
  purgeBars?: number; // تعداد کندل‌های حائل قرنطینه (پیش‌فرض: max(lookback, expiry))
  minTradesPerWindow?: number;
  parameterOptimization?: ParameterOptimizationOptions;
}

export interface PurgedWalkForwardFold {
  foldIndex: number;
  trainStartTime: number;
  trainEndTime: number;
  purgeStartTime: number;
  purgeEndTime: number;
  testStartTime: number;
  testEndTime: number;
  trainCandlesCount: number;
  testCandlesCount: number;
  purgeCandlesCount: number;
  selectedParameters: StrategyParameters;
  trainMetrics: PerformanceMetrics;
  testMetrics: PerformanceMetrics;
  foldEfficiencyRatio: number; // OOS Net Profit / IS Net Profit (Normalized)
  isFoldProfitableOos: boolean;
  isFoldPassed: boolean;
}

export interface PurgedWalkForwardReport {
  evaluatorVersion: 'v2-purged-walk-forward';
  windowType: WalkForwardWindowType;
  totalFolds: number;
  passedFolds: number;
  aggregateIsProfit: number;
  aggregateOosProfit: number;
  walkForwardEfficiency: number; // Aggregate WFE = Agg OOS / Agg IS
  stabilityScorePercent: number; // درصد پایداری نتایج برون‌نمونه‌ای
  robustnessGrade: StrategyRobustnessGrade;
  robustnessSummaryFa: string;
  folds: PurgedWalkForwardFold[];
  warnings: string[];
  executionTimeMs: number;
}
