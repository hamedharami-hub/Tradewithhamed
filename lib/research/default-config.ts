import { SYMBOL_SPECS, type SymbolId, type Timeframe } from '@/lib/contracts/market';
import type { HistoricalDatasetManifest, ResearchExperimentConfig } from './contracts';

export function createBaselineResearchConfig(input: {
  datasetId: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  experimentId?: string;
}): ResearchExperimentConfig {
  return {
    experimentId: input.experimentId || `EXP-${input.datasetId}-BASELINE-V1`,
    datasetId: input.datasetId,
    environment: 'BACKTEST',
    symbol: input.symbol,
    timeframe: input.timeframe,
    strategyVariants: ['S0_SWEEP_ONLY', 'S0_SWEEP_FVG', 'BOS_ORDER_BLOCK_V1', 'FVG_EQUILIBRIUM_V1', 'MEAN_REVERSION_V1', 'TREND_BREAKOUT_55_EMA200_V1'],
    aiModes: ['OFF', 'DETERMINISTIC_COUNCIL'],
    initialCash: 10_000,
    riskPerTradePercent: 0.25,
    maxConcurrentPositions: 1,
    warmupBars: Math.max(120, input.timeframe === 'D1' ? 60 : 120),
    stopLossAtrBuffer: 0.2,
    targetRiskReward: 2,
    entryExpiryBars: input.timeframe === 'D1' ? 5 : 12,
    trendMinEmaDistanceAtr: 0,
    costModel: {
      modelVersion: 'cost-model-v1',
      spreadPips: SYMBOL_SPECS[input.symbol].typicalSpreadPips,
      slippagePips: 0.2,
      commissionPerLotRoundTrip: SYMBOL_SPECS[input.symbol].commissionPerLot,
      adverseFillOnly: true,
    },
    seed: 20260909,
    ruleVersion: 'research-rules-v1',
  };
}

export function createBaselineFromManifest(manifest: HistoricalDatasetManifest): ResearchExperimentConfig {
  if (!manifest.canonicalSymbol) throw new Error('دیتاست reference بدون نگاشت نماد قابل معامله، در paper simulator اجرا نمی‌شود.');
  return createBaselineResearchConfig({ datasetId: manifest.datasetId, symbol: manifest.canonicalSymbol, timeframe: manifest.timeframe });
}
