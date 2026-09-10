import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId, type Timeframe } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { bundledDatasetForSymbol, bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import { WalkForwardEvaluator, type WalkForwardResult } from '../lib/research/walk-forward';
import type { HistoricalDataset, ResearchExperimentConfig } from '../lib/research/contracts';
import type { RuleParameters } from '../lib/research/strategy-rules';

const cases: Array<{ symbol: SymbolId; timeframe: Timeframe; trainBars: number; testBars: number; stepBars: number }> = [
  { symbol: 'EURUSD', timeframe: '4H', trainBars: 600, testBars: 300, stepBars: 300 },
  { symbol: 'BTCUSD', timeframe: 'D1', trainBars: 1000, testBars: 500, stepBars: 500 },
];
const searchSpace = { trendChannelLookback: [34, 55] as const, trendEmaPeriod: [100, 200] as const, trendStopAtrMultiple: [1.5, 2] as const, trendTargetAtrMultiple: [3, 4] as const };
const scenarios = [
  { id: 'BASE', spreadMultiplier: 1, slippagePips: 0.2, commissionMultiplier: 1 },
  { id: 'STRESSED', spreadMultiplier: 2, slippagePips: 0.4, commissionMultiplier: 2 },
  { id: 'ADVERSE', spreadMultiplier: 3, slippagePips: 0.5, commissionMultiplier: 1.5 },
] as const;

async function loadDataset(symbol: SymbolId, timeframe: Timeframe): Promise<HistoricalDataset> {
  const descriptor = timeframe === 'D1' ? bundledDatasetForSymbol(symbol) : bundledIntradayDatasetForSymbol(symbol, timeframe);
  if (!descriptor) throw new Error(`دادهٔ bundled برای ${symbol}/${timeframe} پیدا نشد.`);
  const parsed = DataWorkbench.parseCSV(await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8'), timeframe, 0);
  return createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: symbol, instrumentLabel: descriptor.labelFa, timeframe, rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'Public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
}

function stressOos(dataset: HistoricalDataset, config: ResearchExperimentConfig, wf: WalkForwardResult, optimized: boolean) {
  return scenarios.map(scenario => {
    const folds = wf.folds.map(fold => {
      const candles = dataset.candles.filter(candle => candle.isClosed && candle.timestamp <= fold.outOfSampleEndTime);
      const costModel = { ...config.costModel, spreadPips: SYMBOL_SPECS[config.symbol].typicalSpreadPips * scenario.spreadMultiplier, slippagePips: scenario.slippagePips, commissionPerLotRoundTrip: SYMBOL_SPECS[config.symbol].commissionPerLot * scenario.commissionMultiplier };
      const foldConfig: ResearchExperimentConfig = { ...config, experimentId: `${config.experimentId}-${optimized ? 'OPT' : 'BASE'}-${scenario.id}-F${fold.fold}`, strategyVariants: [fold.selectedVariant], aiModes: [fold.selectedAiMode], costModel, evaluationStartTime: fold.outOfSampleStartTime, ...(optimized && fold.selectedParameters ? { ruleParameters: fold.selectedParameters } : {}) };
      const run = ResearchExperimentEngine.run({ ...dataset, candles, manifest: { ...dataset.manifest, startTime: candles[0]?.timestamp || dataset.manifest.startTime, endTime: candles.at(-1)?.timestamp || dataset.manifest.endTime, totalBars: candles.length, acceptedBars: candles.length } }, foldConfig).runs[0];
      return { fold: fold.fold, netProfit: run?.summary.netProfit ?? 0, totalTrades: run?.summary.totalTrades ?? 0, profitFactor: run?.summary.profitFactor ?? 0, maxDrawdownPercent: run?.summary.maxDrawdownPercent ?? 0 };
    });
    return { scenario: scenario.id, folds, totalNetProfit: Number(folds.reduce((sum, fold) => sum + fold.netProfit, 0).toFixed(2)), totalTrades: folds.reduce((sum, fold) => sum + fold.totalTrades, 0) };
  });
}

async function main(): Promise<void> {
  const reports = [];
  for (const item of cases) {
    const dataset = await loadDataset(item.symbol, item.timeframe);
    const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol: item.symbol, timeframe: item.timeframe, experimentId: `EXP-STAGE25-${item.symbol}-${item.timeframe}` });
    config.strategyVariants = ['TREND_BREAKOUT_55_EMA200_V1'];
    config.aiModes = ['OFF'];
    const wfOptions = { trainBars: item.trainBars, testBars: item.testBars, stepBars: item.stepBars, purgeBars: config.entryExpiryBars };
    const baseline = WalkForwardEvaluator.run(dataset, config, wfOptions);
    const optimized = WalkForwardEvaluator.run(dataset, config, { ...wfOptions, parameterOptimization: { method: 'GRID' as const, searchSpace, maxEvaluations: 8, minTrades: 5, objective: 'CALMAR_LIKE' as const } });
    reports.push({ symbol: item.symbol, timeframe: item.timeframe, bars: dataset.manifest.acceptedBars, parameters: wfOptions, baseline: { folds: baseline.folds, oosNetProfit: Number(baseline.folds.reduce((sum, fold) => sum + fold.outOfSampleSummary.netProfit, 0).toFixed(2)), oosTrades: baseline.outOfSampleTrades.length, costStress: stressOos(dataset, config, baseline, false) }, optimized: { folds: optimized.folds, oosNetProfit: Number(optimized.folds.reduce((sum, fold) => sum + fold.outOfSampleSummary.netProfit, 0).toFixed(2)), oosTrades: optimized.outOfSampleTrades.length, costStress: stressOos(dataset, config, optimized, true) } });
  }
  const output = { stage: 25, version: 'independent-walk-forward-v1', generatedAt: new Date().toISOString(), searchSpace, reports, warnings: ['انتخاب پارامتر فقط روی train هر fold انجام شد و OOS برای انتخاب به optimizer داده نشد.', 'Cost Stress روی همان foldهای OOS و با پارامتر منتخب همان fold اجرا شد.', 'نتایج پژوهشی هستند؛ داده‌ها عمومی و broker-match نشده‌اند و هیچ live trading یا broker write انجام نشده است.'] };
  const outputPath = resolve(process.cwd(), 'data/runs/stage25-independent-walk-forward.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ event: 'DONE', outputPath, cases: reports.length, folds: reports.map(item => ({ symbol: item.symbol, baselineFolds: item.baseline.folds.length, optimizedFolds: item.optimized.folds.length })) }));
}
void main();
