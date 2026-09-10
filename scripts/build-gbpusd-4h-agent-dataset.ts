import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';

async function main(): Promise<void> {
  const descriptor = bundledIntradayDatasetForSymbol('GBPUSD', '4H');
  if (!descriptor) throw new Error('Missing GBPUSD 4H bundle');
  const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
  const parsed = DataWorkbench.parseCSV(csv, '4H', 0);
  const dataset = createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: 'GBPUSD', instrumentLabel: descriptor.labelFa, timeframe: '4H', rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'HistData public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
  const output = resolve(process.cwd(), 'data/runs/gbpusd-4h-agent-ablation-dataset.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(output, `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(JSON.stringify({ output, bars: dataset.manifest.acceptedBars }));
}
void main();
