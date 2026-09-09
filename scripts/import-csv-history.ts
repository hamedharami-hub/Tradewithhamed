import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { SymbolId, Timeframe } from '../lib/contracts/market';
import { DataWorkbench } from '../lib/core/data-workbench';
import { createDatasetFromCandles, inferTimeframe } from '../lib/research/dataset';

function flag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(flagName: string): string {
  const value = flag(flagName);
  if (!value) throw new Error(`Missing ${flagName}.`);
  return value;
}

async function main(): Promise<void> {
  const input = resolve(required('--input'));
  const output = resolve(required('--output'));
  const symbol = required('--symbol') as SymbolId;
  const provider = required('--provider');
  const providerSymbol = required('--provider-symbol');
  const timeframe = required('--timeframe') as Timeframe;
  const timezoneOffset = Number(flag('--timezone-offset') || '0');
  if (!['EURUSD', 'XAUUSD'].includes(symbol)) throw new Error('--symbol must be EURUSD or XAUUSD.');
  if (!['1M', '5M', '15M', '1H', '4H', 'D1'].includes(timeframe)) throw new Error('Unsupported --timeframe.');
  if (!Number.isFinite(timezoneOffset)) throw new Error('--timezone-offset must be numeric.');

  const raw = await readFile(input);
  const { candles, errorCount } = DataWorkbench.parseCSV(raw.toString('utf8'), timeframe, timezoneOffset);
  const inferred = inferTimeframe(candles);
  if (inferred && inferred !== timeframe) throw new Error(`CSV interval appears to be ${inferred}, not declared ${timeframe}.`);
  const hash = createHash('sha256').update(raw).digest('hex');
  const dataset = createDatasetFromCandles({
    candles,
    provider,
    providerSymbol,
    canonicalSymbol: symbol,
    instrumentLabel: `${symbol} imported from ${provider}`,
    timeframe,
    rawSourcePath: `data/raw/${basename(input)}`,
    contentSha256: hash,
    sourceLicense: 'User-provided broker/platform export; use subject to the source account and provider terms.',
  });
  dataset.manifest.notes.unshift(`CSV parse errors: ${errorCount}`);
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ datasetId: dataset.manifest.datasetId, status: dataset.manifest.status, bars: dataset.manifest.acceptedBars, parseErrors: errorCount, output }, null, 2));
}

void main();
