import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import type { ResearchExperimentConfig, StrategyVariantId } from '../lib/research/contracts';

const symbols: SymbolId[] = ['EURUSD', 'GBPUSD', 'USDJPY'];
const shortlist: StrategyVariantId[] = ['S0_SWEEP_FVG', 'BOS_ORDER_BLOCK_V1', 'TREND_BREAKOUT_55_EMA200_V1'];
const quarter = Number(process.env.CHECKPOINT_QUARTER || '1');
const selectedSymbol = process.env.CHECKPOINT_SYMBOL as SymbolId | undefined;
const selectedSymbols = selectedSymbol ? [selectedSymbol] : symbols;
const year = 2024;
const quarterStartMonth = (quarter - 1) * 3;
const startTime = Date.UTC(year, quarterStartMonth, 1);
const endTime = Date.UTC(year, quarterStartMonth + 3, 1) - 1;

async function main(): Promise<void> {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error('CHECKPOINT_QUARTER must be 1..4');
  const checkpointDir = resolve(process.cwd(), 'data/runs/checkpoints-5m-2024');
  await mkdir(checkpointDir, { recursive: true });
  for (const symbol of selectedSymbols) {
    const descriptor = bundledIntradayDatasetForSymbol(symbol, '5M');
    if (!descriptor) throw new Error(`No bundled 5M descriptor for ${symbol}`);
    const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
    const parsed = DataWorkbench.parseCSV(csv, '5M', 0);
    const contextCandles = parsed.candles.filter(candle => candle.timestamp <= endTime);
    const windowCandles = contextCandles.filter(candle => candle.timestamp >= startTime - 220 * 5 * 60_000);
    const dataset = createDatasetFromCandles({ candles: windowCandles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: symbol, instrumentLabel: descriptor.labelFa, timeframe: '5M', rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}-Q${quarter}`, sourceLicense: 'HistData public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
    const baseConfig = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe: '5M', experimentId: `EXP-BUNDLED-5M-${symbol}-Q${quarter}-SHORTLIST-OFF-20260910` });
    const config: ResearchExperimentConfig = { ...baseConfig, strategyVariants: shortlist, aiModes: ['OFF'], warmupBars: 220, evaluationStartTime: startTime, endTime, costModel: { ...baseConfig.costModel, spreadPips: SYMBOL_SPECS[symbol].typicalSpreadPips, commissionPerLotRoundTrip: SYMBOL_SPECS[symbol].commissionPerLot } };
    console.log(JSON.stringify({ event: 'START', symbol, quarter, bars: dataset.manifest.acceptedBars, evaluationStart: new Date(startTime).toISOString(), evaluationEnd: new Date(endTime).toISOString() }));
    const result = ResearchExperimentEngine.run(dataset, config);
    const checkpoint = { version: '5m-shortlist-checkpoint-v1', generatedAt: new Date().toISOString(), symbol, quarter, timeframe: '5M', evaluationStart: new Date(startTime).toISOString(), evaluationEnd: new Date(endTime).toISOString(), purpose: 'Read-only historical research; AI OFF; no broker or order-writing API.', config, dataset: dataset.manifest, summaries: result.runs.map(run => run.summary), comparisons: result.comparisons, warnings: result.warnings };
    const outputPath = resolve(checkpointDir, `${symbol.toLowerCase()}-q${quarter}.json`);
    await writeFile(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    console.log(JSON.stringify({ event: 'DONE', symbol, quarter, outputPath, summaries: checkpoint.summaries }));
  }
}
void main();
