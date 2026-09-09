import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';

function valueFor(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const datasetPath = valueFor('--dataset');
  const outputPath = valueFor('--output');
  if (!datasetPath || !outputPath) throw new Error('Usage: tsx scripts/run-research-experiment.ts --dataset <dataset.json> --output <report.json>');
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  if (!dataset.manifest.canonicalSymbol) throw new Error('Dataset has no canonical tradable symbol and cannot run through the paper simulator.');
  const config = createBaselineFromManifest(dataset.manifest);
  const result = ResearchExperimentEngine.run(dataset, config);
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.table(result.comparisons.map(row => ({
    variant: row.labelFa,
    trades: row.tradesCount,
    winRate: row.winRatePercent,
    netProfit: row.netProfit,
    profitFactor: row.profitFactor,
    maxDrawdown: row.maxDrawdownPercent,
  })));
  console.log(`Saved report: ${resolve(outputPath)}`);
}

void main();
