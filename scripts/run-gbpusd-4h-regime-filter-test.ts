import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset, ResearchExperimentConfig } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(resolve('data/runs/gbpusd-4h-agent-ablation-dataset.json'), 'utf8')) as HistoricalDataset;
  const base = createBaselineFromManifest(dataset.manifest);
  const common: ResearchExperimentConfig = { ...base, experimentId: 'GBPUSD-4H-REGIME-FILTER-20260910', strategyVariants: ['TREND_BREAKOUT_55_EMA200_V1'], aiModes: ['OFF'], allowedSessions: ['ASIA', 'LONDON', 'NEW_YORK', 'OFF_HOURS'] };
  const baseline = ResearchExperimentEngine.run(dataset, { ...common, trendMinEmaDistanceAtr: 0 }).runs[0];
  const filtered = ResearchExperimentEngine.run(dataset, { ...common, experimentId: `${common.experimentId}-MIN-025ATR`, trendMinEmaDistanceAtr: 0.25 }).runs[0];
  const result = { version: 'regime-ema-distance-ablation-v1', generatedAt: new Date().toISOString(), purpose: 'Single-factor historical ablation; price-to-EMA200 distance measured in ATR; no broker writes.', dataset: dataset.manifest, filter: { metric: 'abs(close - EMA200) / ATR20', baselineMinAtr: 0, testedMinAtr: 0.25 }, baseline: baseline.summary, filtered: filtered.summary, delta: { trades: filtered.summary.totalTrades - baseline.summary.totalTrades, netProfit: Number((filtered.summary.netProfit - baseline.summary.netProfit).toFixed(2)), profitFactor: Number((filtered.summary.profitFactor - baseline.summary.profitFactor).toFixed(2)), maxDrawdownPercent: Number((filtered.summary.maxDrawdownPercent - baseline.summary.maxDrawdownPercent).toFixed(2)) }, openPositionComparison: { baseline: baseline.summary.openPositionDetails, filtered: filtered.summary.openPositionDetails }, warnings: ['این آزمون فقط یک پارامتر را تغییر می‌دهد و نتیجهٔ آن برای پذیرش نهایی کافی نیست.', 'داده HistData عمومی و broker-match نشده است.'] };
  const path = resolve('data/runs/gbpusd-4h-regime-filter-test-20260910.json');
  await mkdir(resolve('data/runs'), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ path, baseline: result.baseline, filtered: result.filtered, delta: result.delta }));
}
void main();
