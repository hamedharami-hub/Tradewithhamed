import type { Candle } from '@/lib/contracts/market';
import { createDatasetFromCandles } from '../dataset';
import { createBaselineFromManifest } from '../default-config';
import { ParameterOptimizer } from '../parameter-optimizer';

export interface ParameterOptimizerTestResult { name: string; passed: boolean; details: string }

function buildDataset() {
  const candles: Candle[] = Array.from({ length: 280 }, (_, index) => {
    const base = 1.1 + index * 0.00002 + Math.sin(index / 8) * 0.0005;
    return { timestamp: 1_700_000_000_000 + index * 300_000, open: base, high: base + 0.001, low: base - 0.001, close: base + 0.0002, volume: 100, isClosed: true };
  });
  return createDatasetFromCandles({ candles, provider: 'test', providerSymbol: 'EURUSD.TEST', canonicalSymbol: 'EURUSD', instrumentLabel: 'optimizer fixture', timeframe: '5M', rawSourcePath: 'test://optimizer', contentSha256: 'c'.repeat(64), sourceLicense: 'test', importedAt: '2026-09-10T00:00:00.000Z' });
}

export function runParameterOptimizerSuite(): ParameterOptimizerTestResult[] {
  const dataset = buildDataset();
  const config = createBaselineFromManifest(dataset.manifest);
  config.strategyVariants = ['TREND_BREAKOUT_55_EMA200_V1'];
  config.aiModes = ['OFF'];
  const options = {
    method: 'GRID' as const,
    searchSpace: { trendChannelLookback: [20, 30] as const, trendEmaPeriod: [100, 120] as const },
    maxEvaluations: 10,
    minTrades: 0,
  };
  const grid = ParameterOptimizer.runOnCandles(dataset.candles.slice(0, 220), dataset, config, options);
  const randomA = ParameterOptimizer.runOnCandles(dataset.candles.slice(0, 220), dataset, config, { ...options, method: 'RANDOM', maxEvaluations: 5, seed: 42 });
  const randomB = ParameterOptimizer.runOnCandles(dataset.candles.slice(0, 220), dataset, config, { ...options, method: 'RANDOM', maxEvaluations: 5, seed: 42 });
  return [
    { name: 'Grid evaluates Cartesian product', passed: grid.evaluatedCandidates === 4, details: `evaluated=${grid.evaluatedCandidates}` },
    { name: 'Random search is deterministic for the same seed', passed: JSON.stringify(randomA.leaderboard.map(item => item.parameters)) === JSON.stringify(randomB.leaderboard.map(item => item.parameters)), details: `evaluated=${randomA.evaluatedCandidates}` },
    { name: 'Optimizer can be scoped to train candles only', passed: grid.leaderboard.length > 0 && grid.leaderboard.every(item => item.summary.variant === 'TREND_BREAKOUT_55_EMA200_V1'), details: `variant=${grid.leaderboard[0]?.summary.variant}` },
  ];
}
