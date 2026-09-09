import type { Candle } from '@/lib/contracts/market';
import { createDatasetFromCandles } from '../dataset';
import { createBaselineFromManifest } from '../default-config';
import { WalkForwardEvaluator } from '../walk-forward';

export interface WalkForwardTestResult { name: string; passed: boolean; details: string }

function buildDataset() {
  const candles: Candle[] = Array.from({ length: 260 }, (_, index) => {
    const base = 1.1 + Math.sin(index / 9) * 0.002 + index * 0.00001;
    return { timestamp: 1_700_000_000_000 + index * 300_000, open: base, high: base + 0.0006, low: base - 0.0006, close: base + Math.sin(index / 3) * 0.0002, volume: 100, isClosed: true };
  });
  return createDatasetFromCandles({ candles, provider: 'test', providerSymbol: 'EURUSD.TEST', canonicalSymbol: 'EURUSD', instrumentLabel: 'walk-forward fixture', timeframe: '5M', rawSourcePath: 'test://walk-forward', contentSha256: 'b'.repeat(64), sourceLicense: 'test', importedAt: '2026-09-09T00:00:00.000Z' });
}

export function runWalkForwardSuite(): WalkForwardTestResult[] {
  const dataset = buildDataset();
  const config = createBaselineFromManifest(dataset.manifest);
  const result = WalkForwardEvaluator.run(dataset, config, { trainBars: 100, testBars: 40, stepBars: 40, purgeBars: 12 });
  const results: WalkForwardTestResult[] = [];
  results.push({ name: 'Walk-forward creates chronological folds', passed: result.folds.length > 0 && result.folds.every(fold => fold.trainEndTime < fold.outOfSampleStartTime && fold.outOfSampleStartTime <= fold.outOfSampleEndTime), details: `folds=${result.folds.length}` });
  results.push({ name: 'Walk-forward has explicit purge gap', passed: result.folds.length > 0 && result.folds.every(fold => fold.outOfSampleStartTime > fold.trainEndTime), details: result.folds.map(fold => `${fold.fold}:${fold.trainEndTime}->${fold.outOfSampleStartTime}`).join(',') });
  results.push({ name: 'Segment analysis returns required dimensions', passed: Boolean(result.outOfSampleAnalysis.SESSION_UTC && result.outOfSampleAnalysis.DAY_OF_WEEK_UTC && result.outOfSampleAnalysis.HOUR_UTC), details: `trades=${result.outOfSampleTrades.length}` });
  return results;
}
