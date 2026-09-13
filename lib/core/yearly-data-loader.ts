import { Candle, SymbolId } from '../contracts/market';
import { getDatasetProvenance, type DatasetProvenance } from '../research/dataset-manifest';
import { validateBacktestDataset, type DatasetCoverage } from '../research/dataset-validator';
import type { DatasetQualityCheck } from '../research/dataset';
import { DataWorkbench } from './data-workbench';

export type TimeHorizon = 'FULL_YEAR' | 'H2_6M' | 'Q4_3M' | 'REPLAY_WINDOW';
export type YearDatasetId = '2025' | '2024';
export type BacktestTimeframe = 'D1' | 'W1' | '4H' | '1H' | '15M' | '5M' | '1M';
export interface HorizonOption { id: TimeHorizon; labelFa: string; descriptionFa: string; }
export const TIME_HORIZONS: HorizonOption[] = [
  { id: 'FULL_YEAR', labelFa: 'تمام داده موجود', descriptionFa: 'همهٔ کندل‌های موجود در دیتاست انتخاب‌شده' },
  { id: 'H2_6M', labelFa: 'نیمهٔ دوم (H2)', descriptionFa: 'از اول ژوئیه، فقط اگر در داده موجود باشد' },
  { id: 'Q4_3M', labelFa: 'سه‌ماههٔ چهارم (Q4)', descriptionFa: 'از اول اکتبر، فقط اگر در داده موجود باشد' },
  { id: 'REPLAY_WINDOW', labelFa: 'پنجرهٔ ریپلی', descriptionFa: 'کندل‌های فعال چارت' },
];

export interface LoadedYearlyDataset { candles: Candle[]; provenance: DatasetProvenance; quality: DatasetQualityCheck; coverage: DatasetCoverage; }
export class DatasetLoadError extends Error { constructor(public readonly datasetUrl: string, message: string) { super(message); } }
const memoryCache = new Map<string, LoadedYearlyDataset>();

export function parseCsvToCandles(csvText: string): Candle[] {
  return csvText.trim().split(/\r?\n/).slice(1).flatMap((line) => {
    const [rawTime, rawOpen, rawHigh, rawLow, rawClose, rawVolume] = line.split(',');
    const timestamp = new Date(rawTime).getTime();
    const values = [timestamp, Number(rawOpen), Number(rawHigh), Number(rawLow), Number(rawClose)];
    if (!values.every(Number.isFinite)) return [];
    return [{ timestamp, open: Number(rawOpen), high: Number(rawHigh), low: Number(rawLow), close: Number(rawClose), volume: Number(rawVolume) || 0, isClosed: true }];
  });
}

export async function loadYearlyDataset(symbol: SymbolId, timeframe: BacktestTimeframe = '4H', year: YearDatasetId = '2024'): Promise<LoadedYearlyDataset> {
  const cacheKey = `${symbol}-${timeframe}-${year}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  const url = `/historical/intraday/histdata-${symbol.toLowerCase()}-${timeframe.toLowerCase()}-${year}.csv`;
  let text: string;
  if (typeof window !== 'undefined') {
    const response = await fetch(url);
    if (!response.ok) {
      if (timeframe === 'W1') return loadWeeklyFromDaily(symbol, year, url);
      throw new DatasetLoadError(url, `دیتاست در دسترس نیست: ${url} (HTTP ${response.status})`);
    }
    text = await response.text();
  } else {
    const { existsSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const path = resolve(`public${url}`);
    if (!existsSync(path)) {
      if (timeframe === 'W1') return loadWeeklyFromDaily(symbol, year, url);
      throw new DatasetLoadError(url, `دیتاست در دسترس نیست: ${path}`);
    }
    text = readFileSync(path, 'utf8');
  }
  const validated = validateBacktestDataset(parseCsvToCandles(text), timeframe, year);
  if (validated.candles.length === 0) throw new DatasetLoadError(url, `هیچ کندل معتبر در ${url} وجود ندارد.`);
  const loaded: LoadedYearlyDataset = { candles: validated.candles, provenance: getDatasetProvenance(symbol, timeframe, year), quality: validated.quality, coverage: validated.coverage };
  memoryCache.set(cacheKey, loaded);
  return loaded;
}

async function loadWeeklyFromDaily(symbol: SymbolId, year: YearDatasetId, requestedUrl: string): Promise<LoadedYearlyDataset> {
  const daily = await loadYearlyDataset(symbol, 'D1', year);
  const candles = DataWorkbench.aggregateCandles(daily.candles, 'W1');
  const validated = validateBacktestDataset(candles, 'W1', year);
  const provenance = {
    ...daily.provenance,
    labelFa: `${daily.provenance.labelFa} — W1 تجمیع‌شده از D1`,
    warnings: [...daily.provenance.warnings, `فایل W1 مستقل برای ${requestedUrl} موجود نبود؛ W1 به‌طور شفاف از D1 همان دیتاست تجمیع شد.`],
  };
  const loaded: LoadedYearlyDataset = { candles: validated.candles, provenance, quality: validated.quality, coverage: validated.coverage };
  memoryCache.set(`${symbol}-W1-${year}`, loaded);
  return loaded;
}

export function filterCandlesByHorizon(candles: Candle[], horizon: TimeHorizon, replayVisibleCandles?: Candle[], year: YearDatasetId = '2025'): Candle[] {
  if (horizon === 'REPLAY_WINDOW') return replayVisibleCandles || [];
  if (horizon === 'FULL_YEAR') return candles;
  const cutoff = Date.parse(`${year}-${horizon === 'H2_6M' ? '07-01' : '10-01'}T00:00:00.000Z`);
  return candles.filter(candle => candle.timestamp >= cutoff);
}
