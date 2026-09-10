import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import type { Candle, SymbolId } from '../lib/contracts/market';
import { DataWorkbench } from '../lib/core/data-workbench';

const inputs: Array<{ symbol: SymbolId; sourcePath: string; providerSymbol: string }> = [
  { symbol: 'EURUSD', sourcePath: 'data/datasets/histdata/histdata-eurusd-1m-2024.dataset.json', providerSymbol: 'EURUSD' },
  { symbol: 'GBPUSD', sourcePath: 'data/datasets/histdata/histdata-gbpusd-1m-2024.dataset.json', providerSymbol: 'GBPUSD' },
  { symbol: 'USDJPY', sourcePath: 'data/datasets/histdata/multi-year/histdata-usdjpy-1m-2020-2024.dataset.json', providerSymbol: 'USDJPY' },
];

function csvRow(candle: Candle): string {
  return [new Date(candle.timestamp).toISOString(), candle.open, candle.high, candle.low, candle.close, candle.volume].join(',');
}

async function main(): Promise<void> {
  const outputDir = resolve('public/historical/intraday');
  await mkdir(outputDir, { recursive: true });
  const manifest: Array<Record<string, unknown>> = [];
  for (const input of inputs) {
    const source = JSON.parse(await readFile(resolve(input.sourcePath), 'utf8')) as HistoricalDataset;
    const sourceCandles = source.candles.filter(candle => new Date(candle.timestamp).getUTCFullYear() === 2024);
    const aggregated = DataWorkbench.aggregateCandles(sourceCandles, '5M').filter(candle => candle.isClosed);
    const csv = ['time,open,high,low,close,volume', ...aggregated.map(csvRow)].join('\n').concat('\n');
    const filename = `histdata-${input.symbol.toLowerCase()}-5m-2024.csv`;
    await writeFile(resolve(outputDir, filename), csv, 'utf8');
    const contentSha256 = createHash('sha256').update(csv).digest('hex');
    manifest.push({
      id: filename.replace('.csv', ''),
      symbol: input.symbol,
      provider: 'HistData aggregated',
      providerSymbol: input.providerSymbol,
      timeframe: '5M',
      url: `/historical/intraday/${filename}`,
      bars: aggregated.length,
      startUtc: aggregated[0] ? new Date(aggregated[0].timestamp).toISOString() : null,
      endUtc: aggregated.at(-1) ? new Date(aggregated.at(-1)!.timestamp).toISOString() : null,
      contentSha256,
      sourceDataset: source.manifest.datasetId,
      sourceNoteFa: input.symbol === 'USDJPY'
        ? 'از artifact چندسالهٔ USDJPY در repository، فقط سال ۲۰۲۴ استخراج و به ۵ دقیقه تجمیع شده است.'
        : 'از HistData M1 سال ۲۰۲۴ استخراج و به ۵ دقیقه تجمیع شده است؛ برای پژوهش، نه broker-match.',
    });
    console.log(JSON.stringify({ symbol: input.symbol, timeframe: '5M', bars: aggregated.length, output: resolve(outputDir, filename), contentSha256 }));
  }
  await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify({ version: 'bundled-intraday-v1', datasets: manifest }, null, 2)}\n`, 'utf8');
}

void main();
