import { validateBacktestDataset } from '../dataset-validator';
import { loadYearlyDataset } from '../../core/yearly-data-loader';
import type { Candle } from '../../contracts/market';

export async function runDatasetValidatorTests() {
  const valid: Candle = { timestamp: Date.UTC(2025, 11, 5, 15, 20), open: 1, high: 2, low: 0.5, close: 1.5, volume: 1, isClosed: true };
  const invalid: Candle = { ...valid, timestamp: valid.timestamp + 60_000, high: 0.8, low: 1.2 };
  const quality = validateBacktestDataset([valid, invalid], '1M', '2025');
  const loaded = await loadYearlyDataset('EURUSD', '1M', '2025');
  const weeklyGold = await loadYearlyDataset('XAUUSD', 'W1', '2024');
  return [
    { name: 'Dataset validator rejects invalid OHLC', passed: quality.quality.rejectedBars === 1, details: `${quality.quality.rejectedBars} invalid bars rejected` },
    { name: '2025 intraday provenance identifies non-synthetic historical data', passed: loaded.provenance.isSynthetic === false && loaded.provenance.isBrokerMatched === false, details: loaded.provenance.labelFa },
    { name: '2025 M1 coverage spans the full requested year', passed: loaded.coverage.coversRequestedYear && loaded.coverage.coveredDays >= 360, details: loaded.coverage.labelFa },
    { name: 'Weekly gold historical dataset is available across 2024', passed: weeklyGold.candles.length > 40 && weeklyGold.coverage.coveredDays > 350, details: weeklyGold.provenance.labelFa },
  ];
}
