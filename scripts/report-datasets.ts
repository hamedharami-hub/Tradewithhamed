import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';

async function datasetPaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await datasetPaths(path));
    else if (entry.isFile() && entry.name.endsWith('.dataset.json')) paths.push(path);
  }
  return paths;
}

async function main(): Promise<void> {
  const root = resolve('data/datasets');
  const paths = (await datasetPaths(root)).sort();
  const datasets: Array<Record<string, unknown>> = [];
  for (const path of paths) {
    const dataset = JSON.parse(await readFile(path, 'utf8')) as HistoricalDataset;
    datasets.push({
      file: path.replace(`${resolve('.')}/`, ''),
      datasetId: dataset.manifest.datasetId,
      provider: dataset.manifest.provider,
      symbol: dataset.manifest.canonicalSymbol || dataset.manifest.providerSymbol,
      timeframe: dataset.manifest.timeframe,
      status: dataset.manifest.status,
      startUtc: new Date(dataset.manifest.startTime).toISOString(),
      endUtc: new Date(dataset.manifest.endTime).toISOString(),
      totalBars: dataset.manifest.totalBars,
      acceptedBars: dataset.manifest.acceptedBars,
      rejectedBars: dataset.manifest.rejectedBars,
      duplicateBars: dataset.manifest.duplicateBars,
      gapsDetected: dataset.manifest.gapsDetected,
      sha256: dataset.manifest.contentSha256,
    });
  }
  const markdown = [
    '# Stage 1 Dataset Quality Report', '',
    `Generated: ${new Date().toISOString()}`, '',
    '| File | Provider | Symbol | TF | Status | Start UTC | End UTC | Bars | Rejected | Duplicates | Gaps |',
    '|---|---|---|---|---|---|---|---:|---:|---:|---:|',
    ...datasets.map(item => `| ${item.file} | ${item.provider} | ${item.symbol} | ${item.timeframe} | ${item.status} | ${item.startUtc} | ${item.endUtc} | ${item.acceptedBars} | ${item.rejectedBars} | ${item.duplicateBars} | ${item.gapsDetected} |`),
    '',
    '## Interpretation', '',
    '- `READY` means no rejected bars remained after the repository validator; it does not mean the provider is identical to a broker feed.',
    '- `PARTIAL` means the raw source contained duplicate or invalid records and the rejected records were excluded rather than silently accepted.',
    '- Gaps are reported for research review; weekend gaps are excluded from the non-weekend gap count.',
  ].join('\n');
  await writeFile('docs/stage1-dataset-quality-report-fa.md', `${markdown}\n`, 'utf8');
  await writeFile('data/datasets/stage1-dataset-quality.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), datasets }, null, 2)}\n`, 'utf8');
  console.log(markdown);
}

void main();
