// lib/contracts/research-run.ts
// مدل داده‌ای تغییرناپذیر ران‌های پژوهشی، سناریوها، ماتریس و ارزیابی استحکام

import { SymbolId, Timeframe } from './market';
import {
  AccountConfiguration,
  DateRangeFilterConfig,
  SessionTimezoneConfig,
  StrategyParameters,
  StrategyPreset,
} from './strategy-parameters';
import { TradingStyleType } from './regimes';
import { EndOfDataPolicy } from '../core/ports';
import { PerformanceMetrics, ResearchDiagnostics } from '../core/research-lab';

export type ResearchRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface ExecutionCostsConfig {
  defaultSpreadPips: number;
  commissionPerLot: number;
  additionalSlippagePips: number;
}

export type RobustnessWarningCode =
  | 'TOO_FEW_TRADES'
  | 'PROFIT_DEPENDS_ON_FEW_TRADES'
  | 'HIGH_DRAWDOWN'
  | 'COST_SENSITIVE'
  | 'SESSION_DEPENDENT'
  | 'UNSTABLE_ACROSS_PERIODS'
  | 'LARGE_IN_SAMPLE_OUT_OF_SAMPLE_GAP'
  | 'NEGATIVE_EXPECTANCY'
  | 'HIGH_LOSS_STREAK'
  | 'PARAMETER_SENSITIVE';

export interface RobustnessWarning {
  code: RobustnessWarningCode;
  titleFa: string;
  descriptionFa: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  actualValue: number | string;
  threshold: number | string;
}

export interface AdvancedExecutionStressConfig {
  delayedEntryBars?: 0 | 1 | 2;
  randomSkippedFillsPercent?: number; // 0 to 100
  orderTypeOverride?: 'MARKET' | 'LIMIT';
  spreadMultiplier?: number;
  slippageAdditionPips?: number;
  gapShockMultiplier?: number;
}

export interface ResearchRun {
  readonly runId: string;
  readonly runName: string;
  readonly isBaseline: boolean;
  readonly baselineRunId?: string;
  readonly createdAt: string; // ISO string
  readonly datasetId: string;
  readonly datasetFingerprint: string;
  readonly symbol: SymbolId;
  readonly timeframe: Timeframe;
  readonly dateRange: DateRangeFilterConfig;
  readonly warmupBars: number;
  readonly evaluationBars: number;
  readonly timezone: string;
  readonly sessions: SessionTimezoneConfig;
  readonly weekdays: string[];
  readonly accountConfiguration: AccountConfiguration;
  readonly strategyFamily: TradingStyleType | 'ALL';
  readonly strategyPreset: StrategyPreset;
  readonly strategyParameters?: StrategyParameters;
  readonly executionCosts: ExecutionCostsConfig;
  readonly stressConfig?: AdvancedExecutionStressConfig;
  readonly endOfDataPolicy: EndOfDataPolicy;
  readonly randomSeed: number;
  readonly engineVersion: string;
  readonly status: ResearchRunStatus;
  readonly durationMs: number;
  readonly metrics?: PerformanceMetrics;
  readonly diagnostics?: ResearchDiagnostics;
  readonly tradeCount: number;
  readonly warnings: RobustnessWarning[];
  readonly failureReason?: string;
  readonly settingsDiff?: ScenarioSettingDiff[];
}

export interface ScenarioSettingDiff {
  categoryFa: string;
  field: string;
  labelFa: string;
  baselineValue: string | number | boolean;
  scenarioValue: string | number | boolean;
}

export type ScenarioTemplateKey =
  | 'CONSERVATIVE_PRESET'
  | 'BALANCED_PRESET'
  | 'AGGRESSIVE_PRESET'
  | 'CAPITAL_1K'
  | 'CAPITAL_50K'
  | 'RISK_0_25'
  | 'RISK_0_5'
  | 'RISK_1_0'
  | 'SESSION_LONDON_ONLY'
  | 'SESSION_NEW_YORK_ONLY'
  | 'SESSION_ASIAN_ONLY'
  | 'SESSION_OVERLAP_ONLY'
  | 'SESSION_ALL'
  | 'SPREAD_STRESS_1_5X'
  | 'SPREAD_STRESS_2X'
  | 'COMMISSION_STRESS_1_5X'
  | 'SLIPPAGE_STRESS_0_5PIP'
  | 'SLIPPAGE_STRESS_1PIP'
  | 'DELAYED_ENTRY_1BAR'
  | 'DELAYED_ENTRY_2BAR'
  | 'ORDER_TYPE_MARKET'
  | 'ORDER_TYPE_LIMIT'
  | 'POLICY_CLOSE_AT_END'
  | 'POLICY_KEEP_OPEN'
  | 'CUSTOM';

export interface ScenarioDraft {
  scenarioId: string;
  name: string;
  templateKey: ScenarioTemplateKey;
  overrides: {
    initialCapital?: number;
    accountCurrency?: 'USD' | 'AUD';
    leverage?: number;
    riskPercent?: number;
    strategyPreset?: StrategyPreset;
    sessionFilter?: SessionTimezoneConfig['session'];
    timezone?: SessionTimezoneConfig['timezone'];
    defaultSpreadPips?: number;
    commissionPerLot?: number;
    additionalSlippagePips?: number;
    delayedEntryBars?: 0 | 1 | 2;
    orderTypeOverride?: 'MARKET' | 'LIMIT';
    endOfDataPolicy?: EndOfDataPolicy;
    randomSkippedFillsPercent?: number;
  };
}

export interface ScenarioMatrixDimension {
  key: 'initialCapital' | 'riskPercent' | 'session' | 'strategyPreset';
  labelFa: string;
  values: (string | number)[];
}

export interface ScenarioMatrixConfig {
  dimensions: ScenarioMatrixDimension[];
  maxRunsAllowed: number; // default 12, max 30
}

export interface RunComparisonRow {
  runId: string;
  runName: string;
  isBaseline: boolean;
  status: ResearchRunStatus;
  initialCapital: number;
  finalBalance: number;
  finalEquity: number;
  netProfit: number;
  returnPercent: number;
  totalTrades: number;
  winRatePercent: number;
  profitFactor: number;
  expectancyR: number;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  recoveryFactor: number;
  avgMaePips: number;
  avgMfePips: number;
  totalCommissions: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  avgTradeDurationMinutes: number;
  exposureTimePercent: number;
  tradesPerMonth: number;
  profitBySession: Record<string, number>;
  profitByWeekday: Record<string, number>;
  rejectedOrdersCount: number;
  zeroTradeRationale?: string;
  warningsCount: number;
  criticalWarningsCount: number;
}

export interface WalkForwardWindowConfig {
  windowCount: number; // e.g. 4
  trainRatio: number; // e.g. 0.70
  validationRatio: number; // e.g. 0.30
  mode: 'ANCHORED' | 'ROLLING';
  minTradesPerWindow: number;
}

export interface WalkForwardFoldResult {
  foldIndex: number;
  trainStartTime: number;
  trainEndTime: number;
  valStartTime: number;
  valEndTime: number;
  trainTradesCount: number;
  valTradesCount: number;
  trainNetProfit: number;
  valNetProfit: number;
  trainWinRate: number;
  valWinRate: number;
  efficiencyRatio: number; // OOS / IS return ratio
  isWindowPassed: boolean;
}

export interface WalkForwardRunResult {
  mode: 'ANCHORED' | 'ROLLING';
  totalFolds: number;
  passedFolds: number;
  aggregateOosNetProfit: number;
  aggregateOosReturnPercent: number;
  aggregateEfficiencyRatio: number;
  stabilityScorePercent: number;
  folds: WalkForwardFoldResult[];
}

export interface SeededMonteCarloConfig {
  iterations: 100 | 500 | 1000 | 5000;
  seed: number;
  ruinDrawdownThresholdPercent: number; // default 20%
}

export interface SeededMonteCarloResult {
  iterations: number;
  seed: number;
  medianFinalEquity: number;
  percentile5FinalEquity: number;
  percentile95FinalEquity: number;
  medianMaxDrawdownPercent: number;
  percentile95DrawdownPercent: number;
  probabilityOfLossPercent: number;
  probabilityOfDrawdownAboveThresholdPercent: number;
  riskOfRuinPercent: number;
}
