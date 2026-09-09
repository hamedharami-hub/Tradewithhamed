import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DataWorkbench } from '../lib/core/data-workbench';
import { createDatasetFromCandles } from '../lib/research/dataset';
import type { HistoricalDataset } from '../lib/research/contracts';
import type { SymbolId, Timeframe } from '../lib/contracts/market';

async function main(): Promise<void> {
  const inputArg = process.argv.indexOf('--input');
  const outputArg = process.argv.indexOf('--output-dir');
  const symbolArg = process.argv.indexOf('--symbol');
  const input = resolve(process.argv[inputArg + 1] || '');
  const outputDir = resolve(process.argv[outputArg + 1] || '');
  const symbol = process.argv[symbolArg + 1] as SymbolId;
  if (!inputArg || !outputArg || !symbolArg || !symbol) throw new Error('Usage: --input dataset.json --output-dir dir --symbol EURUSD');

  const source = JSON.parse(await readFile(input, 'utf8')) as HistoricalDataset;
  const base = source.candles;
  const sourceHash = source.manifest.contentSha256;
  await mkdir(outputDir, { recursive: true });
  for (const timeframe of ['5M', '15M', '1H'] as Timeframe[]) {
    const aggregated = DataWorkbench.aggregateCandles(base, timeframe);
    const closed = aggregated.filter(candle => candle.isClosed);
    const contentSha256 = createHash('sha256').update(`${sourceHash}:${timeframe}:${closed.length}`).digest('hex');
    const dataset = createDatasetFromCandles({
      candles: closed,
      provider: 'HistData-aggregated',
      providerSymbol: source.manifest.providerSymbol,
      canonicalSymbol: symbol,
      instrumentLabel: `${symbol} HistData ${timeframe} derived from verified M1`,
      timeframe,
      rawSourcePath: source.manifest.rawSourcePath,
      contentSha256,
      sourceLicense: source.manifest.sourceLicense,
    });
    dataset.manifest.notes.unshift(`Derived deterministically from ${source.manifest.datasetId}; only complete closed buckets retained.`);
    const output = resolve(outputDir, `histdata-${symbol.toLowerCase()}-${timeframe.toLowerCase()}-2024.dataset.json`);
    await writeFile(output, `${JSON.stringify(dataset)}\n`, 'utf8');
    console.log(JSON.stringify({ symbol, timeframe, datasetId: dataset.manifest.datasetId, status: dataset.manifest.status, bars: dataset.manifest.acceptedBars, rejected: dataset.manifest.rejectedBars, gaps: dataset.manifest.gapsDetected, output }));
  }
}

void main();
