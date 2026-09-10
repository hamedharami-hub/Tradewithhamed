import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId, type Timeframe } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { WalkForwardEvaluator } from '../lib/research/walk-forward';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';

const symbol = (process.env.WF_SYMBOL || 'EURUSD') as SymbolId;
const timeframe = (process.env.WF_TIMEFRAME || '4H') as Timeframe;
const fixedShortlist = ['S0_SWEEP_FVG', 'BOS_ORDER_BLOCK_V1', 'TREND_BREAKOUT_55_EMA200_V1'] as const;
if (!['EURUSD', 'GBPUSD', 'USDJPY'].includes(symbol)) throw new Error('WF_SYMBOL must be EURUSD, GBPUSD or USDJPY');
if (!['1H', '4H'].includes(timeframe)) throw new Error('WF_TIMEFRAME must be 1H or 4H');

async function main(): Promise<void> {
  const descriptor = bundledIntradayDatasetForSymbol(symbol, timeframe);
  if (!descriptor) throw new Error(`No bundled descriptor for ${symbol}/${timeframe}`);
  const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
  const parsed = DataWorkbench.parseCSV(csv, timeframe, 0);
  const dataset = createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: symbol, instrumentLabel: descriptor.labelFa, timeframe, rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'HistData public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
  const base = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe, experimentId: `EXP-WF-${timeframe}-${symbol}-20260910` });
  base.strategyVariants = [...fixedShortlist];
  base.aiModes = ['OFF'];
  base.costModel = { ...base.costModel, spreadPips: SYMBOL_SPECS[symbol].typicalSpreadPips, commissionPerLotRoundTrip: SYMBOL_SPECS[symbol].commissionPerLot };
  const options = timeframe === '4H' ? { trainBars: 600, testBars: 300, stepBars: 300, purgeBars: 8 } : { trainBars: 2400, testBars: 900, stepBars: 900, purgeBars: 12 };
  console.log(JSON.stringify({ event: 'START', symbol, timeframe, bars: dataset.manifest.acceptedBars, options }));
  const result = WalkForwardEvaluator.run(dataset, base, options);
  const outputPath = resolve(process.cwd(), `data/runs/walk-forward-${timeframe.toLowerCase()}-${symbol.toLowerCase()}-20240910.json`);
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ ...result, source: descriptor, assumptions: { aiMode: 'OFF', spreadPips: base.costModel.spreadPips, slippagePips: base.costModel.slippagePips, commissionPerLotRoundTrip: base.costModel.commissionPerLotRoundTrip } }, null, 2)}\n`);
  console.table(result.folds.map(fold => ({ fold: fold.fold, selected: fold.selectedVariant, trainNet: fold.trainSummary.netProfit, oosNet: fold.outOfSampleSummary.netProfit, oosPF: fold.outOfSampleSummary.profitFactor, oosTrades: fold.outOfSampleSummary.totalTrades })));
  console.log(JSON.stringify({ event: 'DONE', outputPath, folds: result.folds.length, oosTrades: result.outOfSampleTrades.length, foldsSummary: result.folds.map(fold => ({ fold: fold.fold, selected: fold.selectedVariant, oosNet: fold.outOfSampleSummary.netProfit, oosPF: fold.outOfSampleSummary.profitFactor, oosTrades: fold.outOfSampleSummary.totalTrades })) }));
}
void main();
