import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId, type Timeframe } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import type { ResearchExperimentConfig, StrategyVariantId } from '../lib/research/contracts';

const symbols: SymbolId[] = ['EURUSD', 'GBPUSD', 'USDJPY'];
const timeframes: Timeframe[] = ['1H', '4H'];
const shortlist: StrategyVariantId[] = ['S0_SWEEP_FVG', 'BOS_ORDER_BLOCK_V1', 'TREND_BREAKOUT_55_EMA200_V1'];

async function main(): Promise<void> {
  const reports = [];
  for (const timeframe of timeframes) {
    for (const symbol of symbols) {
      const descriptor = bundledIntradayDatasetForSymbol(symbol, timeframe);
      if (!descriptor) throw new Error(`No bundled ${timeframe} descriptor for ${symbol}`);
      const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
      const parsed = DataWorkbench.parseCSV(csv, timeframe, 0);
      const dataset = createDatasetFromCandles({
        candles: parsed.candles,
        provider: descriptor.source,
        providerSymbol: descriptor.providerSymbol,
        canonicalSymbol: symbol,
        instrumentLabel: descriptor.labelFa,
        timeframe,
        rawSourcePath: descriptor.url,
        contentSha256: `bundled-${descriptor.id}`,
        sourceLicense: 'HistData public historical data; research only; broker-match not established.',
        importedAt: '2026-09-10T00:00:00.000Z',
      });
      const baseConfig = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe, experimentId: `EXP-BUNDLED-${timeframe}-${symbol}-SHORTLIST-OFF-20260910` });
      const config: ResearchExperimentConfig = {
        ...baseConfig,
        strategyVariants: shortlist,
        aiModes: ['OFF'],
        warmupBars: timeframe === '1H' ? 220 : 120,
        entryExpiryBars: timeframe === '1H' ? 12 : 8,
        costModel: { ...baseConfig.costModel, spreadPips: SYMBOL_SPECS[symbol].typicalSpreadPips, commissionPerLotRoundTrip: SYMBOL_SPECS[symbol].commissionPerLot },
      };
      const result = ResearchExperimentEngine.run(dataset, config);
      const summaries = result.runs.map(run => run.summary);
      reports.push({ symbol, timeframe, descriptor, dataset: dataset.manifest, config, summaries, topComparisons: result.comparisons.slice(0, 6), warnings: result.warnings });
      console.log(JSON.stringify({ symbol, timeframe, bars: dataset.manifest.acceptedBars, summaries, top: result.comparisons.slice(0, 3) }, null, 2));
    }
  }
  const outputPath = resolve(process.cwd(), 'data/runs/bundled-higher-timeframes-shortlist-20260910.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ version: 'bundled-higher-timeframes-shortlist-v1', generatedAt: new Date().toISOString(), purpose: 'Read-only historical shortlist baseline; AI OFF only; no broker or order-writing API.', reports }, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, reports: reports.map(report => ({ symbol: report.symbol, timeframe: report.timeframe, summaries: report.summaries })) }, null, 2));
}

void main();
