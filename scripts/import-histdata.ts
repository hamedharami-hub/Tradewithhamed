import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createDatasetFromCandles } from '../lib/research/dataset';
import type { SymbolId, Timeframe } from '../lib/contracts/market';
import type { Candle } from '../lib/contracts/market';

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseHistdataTimestamp(value: string): number {
  const match = /^(\d{8})\s+(\d{6})$/.exec(value.trim());
  if (!match) return NaN;
  const date = match[1];
  const time = match[2];
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  // HistData documents EST without DST. Convert fixed EST (UTC-05:00) to UTC.
  return Date.UTC(year, month - 1, day, hour + 5, minute, second);
}

function parseRows(text: string): { candles: Candle[]; parseErrors: number } {
  const candles: Candle[] = [];
  let parseErrors = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(';');
    if (parts.length !== 6) { parseErrors++; continue; }
    const timestamp = parseHistdataTimestamp(parts[0]);
    const [open, high, low, close, volume] = parts.slice(1).map(Number);
    if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) { parseErrors++; continue; }
    candles.push({ timestamp, open, high, low, close, volume, isClosed: true });
  }
  return { candles: candles.sort((a, b) => a.timestamp - b.timestamp), parseErrors };
}

async function main(): Promise<void> {
  const input = resolve(arg('--input'));
  const output = resolve(arg('--output'));
  const symbol = arg('--symbol') as SymbolId;
  const providerSymbol = arg('--provider-symbol');
  const timeframe = arg('--timeframe') as Timeframe;
  if (!['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'].includes(symbol)) throw new Error('Unsupported canonical symbol.');
  if (timeframe !== '1M') throw new Error('HistData importer currently accepts native M1 files only.');
  const raw = await readFile(input);
  const { candles, parseErrors } = parseRows(raw.toString('utf8'));
  const dataset = createDatasetFromCandles({
    candles,
    provider: 'HistData',
    providerSymbol,
    canonicalSymbol: symbol,
    instrumentLabel: `${symbol} HistData M1 historical bid bars`,
    timeframe,
    rawSourcePath: `data/raw/histdata/${basename(input)}`,
    contentSha256: createHash('sha256').update(raw).digest('hex'),
    sourceLicense: 'HistData public historical data; research use; verify redistribution terms before publication.',
  });
  dataset.manifest.notes.unshift('HistData timestamp converted from fixed EST (UTC-05:00), no daylight-saving adjustment, to UTC.');
  dataset.manifest.notes.unshift(`HistData parser errors: ${parseErrors}`);
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(dataset)}\n`, 'utf8');
  console.log(JSON.stringify({ datasetId: dataset.manifest.datasetId, status: dataset.manifest.status, totalBars: dataset.manifest.totalBars, acceptedBars: dataset.manifest.acceptedBars, rejectedBars: dataset.manifest.rejectedBars, duplicateBars: dataset.manifest.duplicateBars, gapsDetected: dataset.manifest.gapsDetected, parseErrors, startTime: dataset.manifest.startTime, endTime: dataset.manifest.endTime, output }, null, 2));
}

void main();
