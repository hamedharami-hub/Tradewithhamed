import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { WalkForwardEvaluator } from '../lib/research/walk-forward';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const datasetPath = arg('--dataset');
  const outputPath = arg('--output');
  if (!datasetPath || !outputPath) throw new Error('Usage: tsx scripts/run-walk-forward.ts --dataset <dataset.json> --output <result.json>');
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  const config = createBaselineFromManifest(dataset.manifest);
  const variant = arg('--variant');
  const aiMode = arg('--ai-mode');
  if (variant) config.strategyVariants = [variant as typeof config.strategyVariants[number]];
  if (aiMode) config.aiModes = [aiMode as typeof config.aiModes[number]];
  const result = WalkForwardEvaluator.run(dataset, config, {
    trainBars: arg('--train-bars') ? Number(arg('--train-bars')) : undefined,
    testBars: arg('--test-bars') ? Number(arg('--test-bars')) : undefined,
    stepBars: arg('--step-bars') ? Number(arg('--step-bars')) : undefined,
    purgeBars: arg('--purge-bars') ? Number(arg('--purge-bars')) : undefined,
  });
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), JSON.stringify(result, null, 2));
  console.table(result.folds.map(fold => ({ fold: fold.fold, selected: `${fold.selectedVariant}/${fold.selectedAiMode}`, trainNet: fold.trainSummary.netProfit, oosNet: fold.outOfSampleSummary.netProfit, oosPF: fold.outOfSampleSummary.profitFactor, oosTrades: fold.outOfSampleSummary.totalTrades })));
  console.log(`Saved walk-forward report: ${resolve(outputPath)}`);
}

void main();
