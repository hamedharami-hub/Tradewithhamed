import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
  const base = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol: 'GBPUSD', timeframe: '4H', experimentId: 'EXP-COST-ATTRIBUTION-GBPUSD-4H-20260910' });
  const typicalSpread = SYMBOL_SPECS.GBPUSD.typicalSpreadPips;
  const typicalCommission = SYMBOL_SPECS.GBPUSD.commissionPerLot;
  const scenarios = [
    { id: 'BASE', spreadPips: typicalSpread, slippagePips: 0.2, commission: typicalCommission },
    { id: 'SPREAD_X2', spreadPips: typicalSpread * 2, slippagePips: 0.2, commission: typicalCommission },
    { id: 'COMMISSION_X2', spreadPips: typicalSpread, slippagePips: 0.2, commission: typicalCommission * 2 },
    { id: 'SPREAD_AND_COMMISSION_X2', spreadPips: typicalSpread * 2, slippagePips: 0.2, commission: typicalCommission * 2 },
    { id: 'SLIPPAGE_X2', spreadPips: typicalSpread, slippagePips: 0.4, commission: typicalCommission },
    { id: 'ADVERSE', spreadPips: typicalSpread * 3, slippagePips: 0.5, commission: typicalCommission * 1.5 },
  ];
  const reports = scenarios.map(scenario => {
    const config: ResearchExperimentConfig = { ...base, experimentId: `${base.experimentId}-${scenario.id}`, strategyVariants: ['TREND_BREAKOUT_55_EMA200_V1'], aiModes: ['OFF'], costModel: { ...base.costModel, spreadPips: scenario.spreadPips, slippagePips: scenario.slippagePips, commissionPerLotRoundTrip: scenario.commission } };
    const summary = ResearchExperimentEngine.run(dataset, config).runs[0].summary;
    return { scenario, summary, deltaVsBase: null as null | { netProfit: number; profitFactor: number; totalCommission: number; totalSlippagePips: number } };
  });
  const baseline = reports[0].summary;
  for (const report of reports) report.deltaVsBase = { netProfit: Number((report.summary.netProfit - baseline.netProfit).toFixed(2)), profitFactor: Number((report.summary.profitFactor - baseline.profitFactor).toFixed(2)), totalCommission: Number((report.summary.totalCommission - baseline.totalCommission).toFixed(2)), totalSlippagePips: Number((report.summary.totalSlippagePips - baseline.totalSlippagePips).toFixed(2)) };
  const output = { version: 'cost-attribution-v1', generatedAt: new Date().toISOString(), symbol: 'GBPUSD', timeframe: '4H', variant: 'TREND_BREAKOUT_55_EMA200_V1', reports, warnings: ['هزینه‌ها در این مدل با spread، slippage و commission شبیه‌سازی شده‌اند و broker-match نیستند.', 'این تحلیل تاریخی پژوهشی است و هیچ broker write یا live trading انجام نشده است.'] };
  const path = resolve('data/runs/gbpusd-4h-cost-attribution-20260910.json');
  await mkdir(resolve('data/runs'), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ path, reports: reports.map(item => ({ id: item.scenario.id, netProfit: item.summary.netProfit, profitFactor: item.summary.profitFactor, deltaVsBase: item.deltaVsBase })) }));
}
void main();
