import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { WalkForwardEvaluator } from '../lib/research/walk-forward';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';

async function main(): Promise<void> {
  const descriptor = bundledIntradayDatasetForSymbol('GBPUSD', '4H');
  if (!descriptor) throw new Error('Missing GBPUSD 4H bundle');
  const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
  const parsed = DataWorkbench.parseCSV(csv, '4H', 0);
  const dataset = createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: 'GBPUSD', instrumentLabel: descriptor.labelFa, timeframe: '4H', rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'HistData public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
  const reports = [];
  for (const threshold of [0.15, 0.25, 0.5]) {
    const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol: 'GBPUSD', timeframe: '4H', experimentId: `EXP-WF-REGIME-${threshold}-GBPUSD-4H-20260910` });
    // Single-variant ablation: the threshold must not change the selected strategy.
    config.strategyVariants = ['TREND_BREAKOUT_55_EMA200_V1'];
    config.aiModes = ['OFF'];
    config.costModel = { ...config.costModel, spreadPips: SYMBOL_SPECS.GBPUSD.typicalSpreadPips, commissionPerLotRoundTrip: SYMBOL_SPECS.GBPUSD.commissionPerLot };
    config.trendMinEmaDistanceAtr = threshold;
    const result = WalkForwardEvaluator.run(dataset, config, { trainBars: 600, testBars: 300, stepBars: 300, purgeBars: 8 });
    reports.push({ thresholdAtr: threshold, folds: result.folds.map(fold => ({ fold: fold.fold, selectedVariant: fold.selectedVariant, oos: fold.outOfSampleSummary })), aggregate: { folds: result.folds.length, oosTrades: result.outOfSampleTrades.length, netProfit: Number(result.outOfSampleTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0).toFixed(2)), winningTrades: result.outOfSampleTrades.filter(trade => trade.realizedPnl > 0).length, losingTrades: result.outOfSampleTrades.filter(trade => trade.realizedPnl < 0).length }, warnings: result.warnings });
  }
  const output = { version: 'regime-oos-threshold-ablation-v1', generatedAt: new Date().toISOString(), symbol: 'GBPUSD', timeframe: '4H', metric: 'abs(close - EMA200) / ATR20', thresholdsAtr: [0.15, 0.25, 0.5], reports, brokerWrites: false, liveTrading: false, warnings: ['آستانه‌ها روی همان foldهای ثابت OOS اجرا شدند؛ هیچ انتخابی بر اساس نتیجهٔ OOS انجام نشده است.', 'دادهٔ عمومی HistData است و broker-match نشده است.'] };
  const path = resolve('data/runs/gbpusd-4h-regime-oos-thresholds-20260910.json');
  await mkdir(resolve('data/runs'), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ path, reports: reports.map(item => ({ thresholdAtr: item.thresholdAtr, aggregate: item.aggregate })) }));
}
void main();
