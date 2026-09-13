import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import type { Candle, SymbolId, Timeframe } from '../lib/contracts/market';
import { DataWorkbench } from '../lib/core/data-workbench';

const supportedSymbols: SymbolId[] = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
const timeframes: Timeframe[] = ['1M', '5M', '15M', '1H', '4H', 'D1', 'W1'];

function requestedYear(): string {
  const index = process.argv.indexOf('--year');
  const year = index >= 0 ? process.argv[index + 1] : '2024';
  if (!year || !/^20\d\d$/.test(year)) throw new Error('Use --year YYYY.');
  return year;
}

function requestedSymbols(): SymbolId[] {
  const index = process.argv.indexOf('--symbols');
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  if (!raw) return supportedSymbols;
  const symbols = raw.split(',').map(value => value.trim()) as SymbolId[];
  if (!symbols.length || symbols.some(symbol => !supportedSymbols.includes(symbol))) {
    throw new Error(`Use --symbols with a comma-separated subset of ${supportedSymbols.join(', ')}.`);
  }
  return symbols;
}

function sourcePathFor(symbol: SymbolId, year: string): string {
  if (symbol === 'USDJPY' && year === '2024') {
    return 'data/datasets/histdata/multi-year/histdata-usdjpy-1m-2020-2024.dataset.json';
  }
  return `data/datasets/histdata/histdata-${symbol.toLowerCase()}-1m-${year}.dataset.json`;
}

function csvRow(candle: Candle): string {
  return [new Date(candle.timestamp).toISOString(), candle.open, candle.high, candle.low, candle.close, candle.volume].join(',');
}

async function main(): Promise<void> {
  const year = requestedYear();
  const symbols = requestedSymbols();
  const outputDir = resolve('public/historical/intraday');
  await mkdir(outputDir, { recursive: true });
  const manifestPath = resolve(outputDir, 'manifest.json');
  let previous: Array<Record<string, unknown>> = [];
  try {
    previous = (JSON.parse(await readFile(manifestPath, 'utf8')) as { datasets?: Array<Record<string, unknown>> }).datasets ?? [];
  } catch { /* first build has no manifest */ }
  const manifest = previous.filter((entry) => {
    const sameYear = entry.year === year || (typeof entry.id === 'string' && entry.id.endsWith(`-${year}`));
    return !(sameYear && symbols.includes(entry.symbol as SymbolId));
  });
  for (const symbol of symbols) {
    const sourcePath = sourcePathFor(symbol, year);
    const source = JSON.parse(await readFile(resolve(sourcePath), 'utf8')) as HistoricalDataset;
    const sourceCandles = source.candles.filter(candle => new Date(candle.timestamp).getUTCFullYear() === Number(year));
    if (!sourceCandles.length) throw new Error(`No ${year} candles in ${sourcePath}.`);
    for (const timeframe of timeframes) {
      const candles = timeframe === '1M'
        ? sourceCandles
        : DataWorkbench.aggregateCandles(sourceCandles, timeframe).filter(candle => candle.isClosed);
      const csv = ['time,open,high,low,close,volume', ...candles.map(csvRow)].join('\n').concat('\n');
      const filename = `histdata-${symbol.toLowerCase()}-${timeframe.toLowerCase()}-${year}.csv`;
      await writeFile(resolve(outputDir, filename), csv, 'utf8');
      const contentSha256 = createHash('sha256').update(csv).digest('hex');
      manifest.push({
        id: filename.replace('.csv', ''),
        symbol,
        year,
        provider: timeframe === '1M' ? 'HistData' : 'HistData aggregated',
        providerSymbol: symbol,
        timeframe,
        url: `/historical/intraday/${filename}`,
        bars: candles.length,
        startUtc: candles[0] ? new Date(candles[0].timestamp).toISOString() : null,
        endUtc: candles.at(-1) ? new Date(candles.at(-1)!.timestamp).toISOString() : null,
        contentSha256,
        sourceDataset: source.manifest.datasetId,
        sourceNoteFa: `از HistData M1 سال ${year} تهیه شده و برای تایم‌فریم ${timeframe} آماده شده است؛ قیمت Bid عمومی است و broker-match نیست.`,
      });
      console.log(JSON.stringify({ symbol, year, timeframe, bars: candles.length, output: resolve(outputDir, filename), contentSha256 }));
    }
  }
  await writeFile(manifestPath, `${JSON.stringify({ version: 'bundled-intraday-v3', datasets: manifest }, null, 2)}\n`, 'utf8');
}

void main();
