import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId, type Timeframe } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { bundledDatasetForSymbol, bundledIntradayDatasetForSymbol } from '../lib/research/bundled-historical-datasets';
import type { RuleParameters } from '../lib/research/strategy-rules';

const cases: Array<{ symbol: SymbolId; timeframe: Timeframe }> = [
  { symbol: 'EURUSD', timeframe: '4H' },
  { symbol: 'GBPUSD', timeframe: '4H' },
  { symbol: 'USDJPY', timeframe: '4H' },
  { symbol: 'BTCUSD', timeframe: 'D1' },
];
const optimizedParameters: Partial<RuleParameters> = { trendChannelLookback: 34, trendEmaPeriod: 200, trendStopAtrMultiple: 1.5, trendTargetAtrMultiple: 4 };
const scenarios = [
  { id: 'BASE', spreadMultiplier: 1, slippagePips: 0.2, commissionMultiplier: 1 },
  { id: 'STRESSED', spreadMultiplier: 2, slippagePips: 0.4, commissionMultiplier: 2 },
  { id: 'ADVERSE', spreadMultiplier: 3, slippagePips: 0.5, commissionMultiplier: 1.5 },
] as const;

async function loadDataset(symbol: SymbolId, timeframe: Timeframe) {
  const descriptor = timeframe === 'D1' ? bundledDatasetForSymbol(symbol) : bundledIntradayDatasetForSymbol(symbol, timeframe);
  if (!descriptor) throw new Error(`دادهٔ bundled برای ${symbol}/${timeframe} پیدا نشد.`);
  const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
  const parsed = DataWorkbench.parseCSV(csv, timeframe, 0);
  return createDatasetFromCandles({ candles: parsed.candles, provider: descriptor.source, providerSymbol: descriptor.providerSymbol, canonicalSymbol: symbol, instrumentLabel: descriptor.labelFa, timeframe, rawSourcePath: descriptor.url, contentSha256: `bundled-${descriptor.id}`, sourceLicense: 'Public historical data; research only; broker-match not established.', importedAt: '2026-09-10T00:00:00.000Z' });
}

async function main(): Promise<void> {
  const reports: Array<Record<string, unknown>> = [];
  for (const item of cases) {
    const dataset = await loadDataset(item.symbol, item.timeframe);
    const base = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol: item.symbol, timeframe: item.timeframe, experimentId: `EXP-STAGE24-${item.symbol}-${item.timeframe}` });
    for (const scenario of scenarios) {
      const costModel = { ...base.costModel, spreadPips: SYMBOL_SPECS[item.symbol].typicalSpreadPips * scenario.spreadMultiplier, slippagePips: scenario.slippagePips, commissionPerLotRoundTrip: SYMBOL_SPECS[item.symbol].commissionPerLot * scenario.commissionMultiplier };
      for (const variant of ['BASELINE', 'OPTIMIZED'] as const) {
        const result = ResearchExperimentEngine.run(dataset, { ...base, experimentId: `${base.experimentId}-${scenario.id}-${variant}`, strategyVariants: ['TREND_BREAKOUT_55_EMA200_V1'], aiModes: ['OFF'], costModel, ...(variant === 'OPTIMIZED' ? { ruleParameters: optimizedParameters } : {}) });
        const summary = result.runs[0]?.summary;
        if (!summary) continue;
        reports.push({ symbol: item.symbol, timeframe: item.timeframe, bars: dataset.manifest.acceptedBars, scenario: scenario.id, variant, parameters: variant === 'OPTIMIZED' ? optimizedParameters : 'DEFAULT_RULE_PARAMETERS', totalTrades: summary.totalTrades, winRatePercent: summary.winRatePercent, netProfit: summary.netProfit, profitFactor: summary.profitFactor, maxDrawdownPercent: summary.maxDrawdownPercent, totalCommission: summary.totalCommission, totalSlippagePips: summary.totalSlippagePips, status: summary.status });
      }
    }
  }
  const output = { stage: 24, version: 'robustness-matrix-v1', generatedAt: new Date().toISOString(), cases, scenarios, optimizedParameters, reports, warnings: ['این ماتریس portability و sensitivity را بررسی می‌کند و جایگزین Walk-Forward کامل برای هر نماد نیست.', 'داده‌ها عمومی هستند و broker-match نیستند؛ هیچ live trading یا broker write اجرا نشده است.', 'Cost Stress فقط هزینه‌های spread، slippage و commission را تغییر می‌دهد؛ مدل نقدشوندگی و اخبار واقعی در آن نیست.'] };
  const outputPath = resolve(process.cwd(), 'data/runs/stage24-robustness-matrix.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ event: 'DONE', outputPath, reports: reports.length, cases: cases.length, scenarios: scenarios.length }));
}
void main();
