import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createDatasetFromCandles, inferTimeframe, parseYahooChartPayload } from '../lib/research/dataset';
import type { SymbolId, Timeframe } from '../lib/contracts/market';

type ImportOptions = {
  input: string;
  output: string;
  providerSymbol: string;
  instrumentLabel: string;
  timeframe: Timeframe;
  canonicalSymbol?: SymbolId;
};

function requireValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required ${flag} value.`);
  return value;
}

function parseArgs(argv: string[]): ImportOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) values.set(argv[index], argv[index + 1]);
  const canonical = values.get('--symbol');
  if (canonical && canonical !== 'EURUSD' && canonical !== 'XAUUSD') throw new Error('--symbol must be EURUSD or XAUUSD when supplied.');
  const timeframe = requireValue('--timeframe', values.get('--timeframe')) as Timeframe;
  if (!['1M', '5M', '15M', '1H', '4H', 'D1'].includes(timeframe)) throw new Error('Unsupported timeframe.');
  return {
    input: requireValue('--input', values.get('--input')),
    output: requireValue('--output', values.get('--output')),
    providerSymbol: requireValue('--provider-symbol', values.get('--provider-symbol')),
    instrumentLabel: requireValue('--instrument-label', values.get('--instrument-label')),
    timeframe,
    canonicalSymbol: canonical as SymbolId | undefined,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rawPath = resolve(options.input);
  const raw = await readFile(rawPath);
  const payload = JSON.parse(raw.toString('utf8'));
  const candles = parseYahooChartPayload(payload);
  const inferredTimeframe = inferTimeframe(candles);
  if (inferredTimeframe && inferredTimeframe !== options.timeframe) {
    throw new Error(`Provider payload interval is ${inferredTimeframe}, but import requested ${options.timeframe}. Refusing mislabeled dataset.`);
  }
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const dataset = createDatasetFromCandles({
    candles,
    provider: 'Yahoo Finance',
    providerSymbol: options.providerSymbol,
    canonicalSymbol: options.canonicalSymbol,
    instrumentLabel: options.instrumentLabel,
    timeframe: options.timeframe,
    rawSourcePath: `data/raw/${basename(rawPath)}`,
    contentSha256: sha256,
    sourceLicense: 'Provider terms apply; research use only. Verify redistribution rights before publication.',
  });
  await mkdir(resolve(options.output, '..'), { recursive: true });
  await writeFile(resolve(options.output), `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    datasetId: dataset.manifest.datasetId,
    status: dataset.manifest.status,
    totalBars: dataset.manifest.totalBars,
    acceptedBars: dataset.manifest.acceptedBars,
    rejectedBars: dataset.manifest.rejectedBars,
    gapsDetected: dataset.manifest.gapsDetected,
    output: resolve(options.output),
  }, null, 2));
}

void main();
