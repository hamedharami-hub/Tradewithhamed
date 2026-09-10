import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import type { SymbolId, Timeframe } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import { ParameterOptimizer } from '../lib/research/parameter-optimizer';
import { WalkForwardEvaluator } from '../lib/research/walk-forward';

const symbol: SymbolId = 'GBPUSD';
const timeframe: Timeframe = '4H';

async function main(): Promise<void> {
  const descriptor = bundledIntradayDatasetForSymbol(symbol, timeframe);
  if (!descriptor) throw new Error('دادهٔ bundled برای GBPUSD/4H پیدا نشد.');
  const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
  const parsed = DataWorkbench.parseCSV(csv, timeframe, 0);
  const dataset = createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: symbol, instrumentLabel: descriptor.labelFa, timeframe, rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'HistData public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
  const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe, experimentId: 'EXP-STAGE23-LIMITED-GBPUSD-4H' });
  config.strategyVariants = ['TREND_BREAKOUT_55_EMA200_V1'];
  config.aiModes = ['OFF'];
  const searchSpace = { trendChannelLookback: [34, 55] as const, trendEmaPeriod: [100, 200] as const, trendStopAtrMultiple: [1.5, 2] as const, trendTargetAtrMultiple: [3, 4] as const };
  const optimization = ParameterOptimizer.run(dataset, config, { method: 'GRID', searchSpace, maxEvaluations: 8, minTrades: 5, objective: 'CALMAR_LIKE' });
  const walkForward = WalkForwardEvaluator.run(dataset, config, { trainBars: 600, testBars: 300, stepBars: 300, purgeBars: 8, parameterOptimization: { method: 'GRID', searchSpace, maxEvaluations: 8, minTrades: 5, objective: 'CALMAR_LIKE' } });
  const outputPath = resolve(process.cwd(), 'data/runs/stage23-limited-gbpusd-4h.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ stage: 23, symbol, timeframe, bars: dataset.manifest.acceptedBars, optimization, walkForward }, null, 2)}\n`);
  console.log(JSON.stringify({ event: 'DONE', outputPath, bars: dataset.manifest.acceptedBars, evaluatedCandidates: optimization.evaluatedCandidates, folds: walkForward.folds.length, oosTrades: walkForward.outOfSampleTrades.length, foldSummary: walkForward.folds.map(fold => ({ fold: fold.fold, selectedParameters: fold.selectedParameters, trainNet: fold.trainSummary.netProfit, oosNet: fold.outOfSampleSummary.netProfit, oosTrades: fold.outOfSampleSummary.totalTrades })) }));
}
void main();
