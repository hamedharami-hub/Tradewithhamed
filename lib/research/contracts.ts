import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import type { MarketRegimeType, TradingStyleType } from '@/lib/contracts/regimes';
import type { PositionLedgerEntry } from '@/lib/core/ports';
import type { TradingEnvironment } from '@/lib/core/ports';

export type DatasetKind = 'HISTORICAL_BAR' | 'HISTORICAL_TICK' | 'PAPER_FORWARD_BAR';
export type DatasetStatus = 'READY' | 'REJECTED' | 'PARTIAL' | 'UNVERIFIED';
export type StrategyVariantId =
  | 'S0_SWEEP_ONLY'
  | 'S0_SWEEP_FVG'
  | 'BOS_ORDER_BLOCK_V1'
  | 'FVG_EQUILIBRIUM_V1'
  | 'MEAN_REVERSION_V1'
  | 'TREND_BREAKOUT_55_EMA200_V1';
export type AIReviewMode = 'OFF' | 'DETERMINISTIC_COUNCIL' | 'WEBLLM_ADVISORY' | 'AGENTIC_OFFLINE' | 'ONLINE_ADVISORY' | 'HYBRID_COMPARE';
export type AdvisoryProviderMode = 'NONE' | 'LOCAL_WEBGPU' | 'ONLINE_API' | 'HYBRID_COMPARE';
export type AnalysisDimension = 'VARIANT' | 'AI_MODE' | 'HOUR_UTC' | 'DAY_OF_WEEK_UTC' | 'MONTH_UTC' | 'SESSION_UTC' | 'REGIME' | 'DIRECTION';

export interface HistoricalDatasetManifest {
  datasetId: string;
  datasetKind: DatasetKind;
  status: DatasetStatus;
  provider: string;
  providerSymbol: string;
  canonicalSymbol?: SymbolId;
  instrumentLabel: string;
  timeframe: Timeframe;
  timezone: 'UTC';
  requestedStartTime?: number;
  requestedEndTime?: number;
  startTime: number;
  endTime: number;
  totalBars: number;
  acceptedBars: number;
  rejectedBars: number;
  duplicateBars: number;
  gapsDetected: number;
  contentSha256: string;
  rawSourcePath: string;
  importedAt: string;
  schemaVersion: 'research-dataset-v1';
  sourceLicense: string;
  notes: string[];
}

export interface HistoricalDataset {
  manifest: HistoricalDatasetManifest;
  candles: Candle[];
}

export interface CostModelConfig {
  modelVersion: string;
  spreadPips: number;
  slippagePips: number;
  commissionPerLotRoundTrip: number;
  adverseFillOnly: boolean;
}

export interface ResearchExperimentConfig {
  experimentId: string;
  datasetId: string;
  environment?: Extract<TradingEnvironment, 'BACKTEST' | 'PAPER_REPLAY'>;
  symbol: SymbolId;
  timeframe: Timeframe;
  strategyVariants: StrategyVariantId[];
  aiModes: AIReviewMode[];
  /** Advisory selection only; never grants order or broker authority. */
  advisoryProvider?: AdvisoryProviderMode;
  /** Online advisory is disabled by default and is not used for news in Stage 1. */
  onlineAdvisoryEnabled?: boolean;
  initialCash: number;
  riskPerTradePercent: number;
  maxConcurrentPositions: number;
  warmupBars: number;
  stopLossAtrBuffer: number;
  targetRiskReward: number;
  entryExpiryBars: number;
  minSweepPenetrationAtr?: number;
  minFvgSizeAtr?: number;
  /** Minimum absolute distance between close and trend EMA, measured in ATR. */
  trendMinEmaDistanceAtr?: number;
  costModel: CostModelConfig;
  startTime?: number;
  endTime?: number;
  /** Optional scoring boundary; candles before it provide warmup context only. */
  evaluationStartTime?: number;
  allowedSessions?: ResearchTrade['sessionUtc'][];
  allowedDaysOfWeekUtc?: number[];
  seed: number;
  ruleVersion: 'research-rules-v1';
  approvedCandidateIds?: string[];
}

export interface CandidateDecisionTrace {
  candidateId: string;
  variant: StrategyVariantId;
  aiMode: AIReviewMode;
  timestamp: number;
  eligibleFromTimestamp: number;
  status: 'SUBMITTED' | 'FILTERED' | 'NO_TRADE';
  reasonCodes: string[];
  regime?: MarketRegimeType;
  evidenceIds: string[];
}

export interface ResearchTrade extends PositionLedgerEntry {
  variant: StrategyVariantId;
  aiMode: AIReviewMode;
  candidateId: string;
  regime: MarketRegimeType | 'UNCLASSIFIED';
  sessionUtc: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS';
  entryHourUtc: number;
  entryDayOfWeekUtc: number;
  entryMonthUtc: number;
  signalTimestamp: number;
  eligibleFromTimestamp: number;
}

export interface PerformanceSlice {
  key: string;
  labelFa: string;
  tradesCount: number;
  winRatePercent: number;
  netProfit: number;
  profitFactor: number;
  expectancy: number;
  averageHoldingBars: number;
  maxDrawdownPercent: number;
}

export interface StrategyRunSummary {
  variant: StrategyVariantId;
  aiMode: AIReviewMode;
  totalSignals: number;
  submittedOrders: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  netProfit: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPercent: number;
  totalCommission: number;
  totalSlippagePips: number;
  startEquity: number;
  endEquity: number;
  markToMarketEquity: number;
  unrealizedPnlAtEnd: number;
  cashBalanceAtEnd: number;
  openPositionDetails: Array<{ positionId: string; direction: 'BUY' | 'SELL'; entryPrice: number; currentPrice: number; unrealizedPnl: number; openedTimestamp: number }>;
  openPositionsAtEnd: number;
  status: 'COMPLETE' | 'INSUFFICIENT_DATA' | 'NO_TRADES';
}

export interface StrategyRunResult {
  summary: StrategyRunSummary;
  traces: CandidateDecisionTrace[];
  trades: ResearchTrade[];
  equityCurve: { timestamp: number; equity: number; drawdownPercent: number }[];
  analysis: Partial<Record<AnalysisDimension, PerformanceSlice[]>>;
}

export interface ResearchExperimentResult {
  manifest: {
    experimentId: string;
    createdAt: string;
    datasetId: string;
    datasetContentSha256: string;
    config: ResearchExperimentConfig;
    engineVersion: 'research-engine-v1';
  };
  runs: StrategyRunResult[];
  comparisons: PerformanceSlice[];
  warnings: string[];
}

export interface PaperForwardState {
  paperRunId: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  startedAt: number;
  latestProcessedTimestamp?: number;
  receivedBars: number;
  acceptedBars: number;
  rejectedBars: number;
  strategyVariants: StrategyVariantId[];
  aiMode: AIReviewMode;
  isRunning: boolean;
  lastError?: string;
}

export interface PaperForwardSnapshot {
  state: PaperForwardState;
  result: StrategyRunResult | null;
  recentTraces: CandidateDecisionTrace[];
}
