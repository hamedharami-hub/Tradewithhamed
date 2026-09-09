import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HistoricalDataset, ResearchExperimentConfig, StrategyVariantId } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';

const variants: StrategyVariantId[] = ['S0_SWEEP_ONLY', 'S0_SWEEP_FVG', 'BOS_ORDER_BLOCK_V1', 'FVG_EQUILIBRIUM_V1', 'MEAN_REVERSION_V1'];
const targets = [1.5, 2, 2.5, 3];
function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
function score(summary: { netProfit: number; profitFactor: number; totalTrades: number }): number {
  if (summary.totalTrades < 8) return -1e9;
  return summary.netProfit + Math.min(summary.profitFactor, 3) * 25;
}

async function main(): Promise<void> {
  const datasetPath = arg('--dataset');
  const outputPath = arg('--output');
  if (!datasetPath || !outputPath) throw new Error('Usage: tsx scripts/optimize-gbp-session.ts --dataset <dataset.json> --output <result.json>');
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  if (dataset.manifest.canonicalSymbol !== 'GBPUSD') throw new Error('This optimizer is restricted to GBPUSD.');
  const base = createBaselineFromManifest(dataset.manifest);
  const splitIndex = Math.floor(dataset.candles.length * 0.6);
  const splitTimestamp = dataset.candles[splitIndex].timestamp;
  const common = { ...base, strategyVariants: variants, aiModes: ['OFF'] as ResearchExperimentConfig['aiModes'], allowedSessions: ['LONDON', 'NEW_YORK'] as ResearchExperimentConfig['allowedSessions'] };
  const candidates: Array<{ variant: StrategyVariantId; targetRiskReward: number; train: ReturnType<typeof ResearchExperimentEngine.run>['runs'][number]['summary']; oos: ReturnType<typeof ResearchExperimentEngine.run>['runs'][number]['summary'] }> = [];
  for (const variant of variants) for (const targetRiskReward of targets) {
    const trainConfig: ResearchExperimentConfig = { ...common, experimentId: `GBP-SESSION-TRAIN-${variant}-${targetRiskReward}`, strategyVariants: [variant], targetRiskReward };
    const train = ResearchExperimentEngine.run(dataset, trainConfig).runs[0];
    const oosConfig: ResearchExperimentConfig = { ...trainConfig, experimentId: `GBP-SESSION-OOS-${variant}-${targetRiskReward}`, evaluationStartTime: splitTimestamp };
    const oos = ResearchExperimentEngine.run(dataset, oosConfig).runs[0];
    candidates.push({ variant, targetRiskReward, train: train.summary, oos: oos.summary });
  }
  const ranked = [...candidates].sort((a, b) => score(b.train) - score(a.train));
  const selected = ranked[0];
  const result = { version: 'gbpusd-session-optimizer-v1', datasetId: dataset.manifest.datasetId, symbol: 'GBPUSD', timeframe: dataset.manifest.timeframe, sessionsUtc: ['LONDON', 'NEW_YORK'], splitTimestamp, splitIso: new Date(splitTimestamp).toISOString(), candidates: ranked, selected, warnings: ['انتخاب فقط بر اساس بخش Train انجام شده است؛ OOS برای سنجش خارج از نمونه است.', 'این بهینه‌سازی روی یک سال انجام شده و هنوز اثبات پایداری چندساله نیست.', 'هزینه‌ها شامل spread، slippage و commission مدل‌شده هستند.'] };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ selected: { variant: selected.variant, targetRiskReward: selected.targetRiskReward }, train: selected.train, oos: selected.oos, splitIso: result.splitIso }, null, 2));
}
void main();
