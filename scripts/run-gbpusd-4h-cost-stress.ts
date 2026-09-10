import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import type { ResearchExperimentConfig } from '../lib/research/contracts';

async function main(): Promise<void> {
  const descriptor = bundledIntradayDatasetForSymbol('GBPUSD', '4H');
  if (!descriptor) throw new Error('Missing GBPUSD 4H bundle');
  const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
  const parsed = DataWorkbench.parseCSV(csv, '4H', 0);
  const dataset = createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: 'GBPUSD', instrumentLabel: descriptor.labelFa, timeframe: '4H', rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'HistData public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
  const base = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol: 'GBPUSD', timeframe: '4H', experimentId: 'EXP-COST-STRESS-GBPUSD-4H-20260910' });
  const scenarios = [
    { id: 'BASE', labelFa: 'پایه', spreadPips: SYMBOL_SPECS.GBPUSD.typicalSpreadPips, slippagePips: 0.2, commission: SYMBOL_SPECS.GBPUSD.commissionPerLot },
    { id: 'WIDE_SPREAD', labelFa: 'spread دو برابر', spreadPips: SYMBOL_SPECS.GBPUSD.typicalSpreadPips * 2, slippagePips: 0.2, commission: SYMBOL_SPECS.GBPUSD.commissionPerLot },
    { id: 'ADVERSE', labelFa: 'بدبینانه', spreadPips: SYMBOL_SPECS.GBPUSD.typicalSpreadPips * 3, slippagePips: 0.5, commission: SYMBOL_SPECS.GBPUSD.commissionPerLot * 1.5 },
  ];
  const reports = [];
  for (const scenario of scenarios) {
    const config: ResearchExperimentConfig = { ...base, experimentId: `${base.experimentId}-${scenario.id}`, strategyVariants: ['TREND_BREAKOUT_55_EMA200_V1'], aiModes: ['OFF'], costModel: { ...base.costModel, spreadPips: scenario.spreadPips, slippagePips: scenario.slippagePips, commissionPerLotRoundTrip: scenario.commission } };
    const result = ResearchExperimentEngine.run(dataset, config);
    const summary = result.runs[0]?.summary;
    reports.push({ scenario, summary });
    console.log(JSON.stringify({ scenario, summary }));
  }
  const outputPath = resolve(process.cwd(), 'data/runs/cost-stress-gbpusd-4h-20260910.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ version: 'cost-stress-v1', generatedAt: new Date().toISOString(), purpose: 'Read-only historical stress test; no broker or order-writing API.', symbol: 'GBPUSD', timeframe: '4H', variant: 'TREND_BREAKOUT_55_EMA200_V1', dataset: dataset.manifest, reports }, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, reports }));
}
void main();
