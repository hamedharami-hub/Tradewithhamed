import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import type { ResearchExperimentConfig } from '../lib/research/contracts';

const symbols: SymbolId[] = ['EURUSD', 'GBPUSD', 'USDJPY'];

async function main(): Promise<void> {
  const reports = [];
  for (const symbol of symbols) {
    const descriptor = bundledIntradayDatasetForSymbol(symbol, '5M');
    if (!descriptor) throw new Error(`No bundled 5M descriptor for ${symbol}`);
    const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
    const parsed = DataWorkbench.parseCSV(csv, '5M', 0);
    const dataset = createDatasetFromCandles({
      candles: parsed.candles,
      provider: descriptor.source,
      providerSymbol: descriptor.providerSymbol,
      canonicalSymbol: symbol,
      instrumentLabel: descriptor.labelFa,
      timeframe: '5M',
      rawSourcePath: descriptor.url,
      contentSha256: `bundled-${descriptor.id}`,
      sourceLicense: 'HistData public historical data; research only; broker-match not established.',
      importedAt: '2026-09-10T00:00:00.000Z',
    });
    const baseConfig = createBaselineResearchConfig({
      datasetId: dataset.manifest.datasetId,
      symbol,
      timeframe: '5M',
      experimentId: `EXP-BUNDLED-5M-${symbol}-BASELINE-20260910`,
    });
    const config: ResearchExperimentConfig = {
      ...baseConfig,
      aiModes: ['OFF'],
      warmupBars: 220,
      initialCash: 10_000,
      riskPerTradePercent: 0.25,
      costModel: {
        ...baseConfig.costModel,
        spreadPips: SYMBOL_SPECS[symbol].typicalSpreadPips,
        commissionPerLotRoundTrip: SYMBOL_SPECS[symbol].commissionPerLot,
      },
    };
    const result = ResearchExperimentEngine.run(dataset, config);
    const summary = result.runs[0]?.summary;
    reports.push({
      symbol,
      descriptor,
      dataset: dataset.manifest,
      config: { ...config, aiModes: ['OFF'] },
      summary,
      topComparisons: result.comparisons.slice(0, 12),
      result,
    });
    console.log(JSON.stringify({ symbol, bars: dataset.manifest.acceptedBars, summary, top: result.comparisons.slice(0, 3) }, null, 2));
  }
  const output = {
    version: 'bundled-5m-baseline-v1',
    generatedAt: new Date().toISOString(),
    purpose: 'Read-only historical research baseline. AI mode OFF only. No broker, exchange, or order-writing API was called.',
    assumptions: {
      initialCash: 10_000,
      riskPerTradePercent: 0.25,
      ambiguityPolicy: 'PESSIMISTIC',
      costs: 'symbol typical spread + 0.2 pips slippage + commission from SYMBOL_SPECS',
      warmupBars: 220,
    },
    reports,
  };
  const outputPath = resolve(process.cwd(), 'data/runs/bundled-5m-baseline-20260910.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, summaries: reports.map(report => ({ symbol: report.symbol, bars: report.dataset.acceptedBars, summary: report.summary, top: report.topComparisons.slice(0, 3) })) }, null, 2));
}

void main();
