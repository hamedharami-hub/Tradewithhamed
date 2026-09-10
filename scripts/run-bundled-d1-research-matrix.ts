import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { BUNDLED_HISTORICAL_DATASETS } from '../lib/research/bundled-historical-datasets';

async function main(): Promise<void> {
  const reports = [];
  for (const descriptor of BUNDLED_HISTORICAL_DATASETS) {
    const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
    const parsed = DataWorkbench.parseCSV(csv, 'D1', 0);
    const dataset = createDatasetFromCandles({
      candles: parsed.candles,
      provider: descriptor.source,
      providerSymbol: descriptor.providerSymbol,
      canonicalSymbol: descriptor.symbol,
      instrumentLabel: descriptor.labelFa,
      timeframe: 'D1',
      rawSourcePath: descriptor.url,
      contentSha256: `bundled-${descriptor.id}`,
      sourceLicense: 'Yahoo Finance public chart data; research only.',
      importedAt: '2026-09-10T00:00:00.000Z',
    });
    const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol: descriptor.symbol, timeframe: 'D1', experimentId: `EXP-BUNDLED-D1-${descriptor.symbol}-20260910` });
    const result = ResearchExperimentEngine.run(dataset, {
      ...config,
      warmupBars: 220,
      initialCash: 10_000,
      riskPerTradePercent: 0.25,
      costModel: {
        ...config.costModel,
        spreadPips: SYMBOL_SPECS[descriptor.symbol as SymbolId].typicalSpreadPips,
        commissionPerLotRoundTrip: SYMBOL_SPECS[descriptor.symbol as SymbolId].commissionPerLot,
      },
    });
    reports.push({
      symbol: descriptor.symbol,
      descriptor,
      dataset: dataset.manifest,
      topComparisons: result.comparisons.slice(0, 12),
      result,
    });
  }
  const output = {
    version: 'bundled-d1-matrix-v1',
    generatedAt: new Date().toISOString(),
    purpose: 'Read-only historical research. No broker, exchange, or order-writing API was called.',
    reports,
  };
  const outputPath = resolve(process.cwd(), 'data/runs/bundled-d1-research-matrix-20260910.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, summaries: reports.map(report => ({ symbol: report.symbol, bars: report.dataset.acceptedBars, top: report.topComparisons.slice(0, 3) })) }, null, 2));
}

void main();
