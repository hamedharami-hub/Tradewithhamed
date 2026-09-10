import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { BUNDLED_HISTORICAL_DATASETS } from '../lib/research/bundled-historical-datasets';
import type { AIReviewMode, ResearchTrade, StrategyVariantId } from '../lib/research/contracts';
import { WalkForwardEvaluator } from '../lib/research/walk-forward';

interface Candidate {
  symbol: SymbolId;
  variant: StrategyVariantId;
  aiMode: AIReviewMode;
  dataCaveatFa?: string;
}

interface CostScenario {
  id: 'BASELINE' | 'ELEVATED' | 'SEVERE';
  labelFa: string;
  spreadMultiplier: number;
  slippagePips: number;
  commissionMultiplier: number;
}

const candidates: Candidate[] = [
  { symbol: 'USDJPY', variant: 'FVG_EQUILIBRIUM_V1', aiMode: 'OFF' },
  { symbol: 'XAUUSD', variant: 'S0_SWEEP_ONLY', aiMode: 'OFF', dataCaveatFa: 'GC=F یک proxy آتی COMEX است؛ عبور از stress فقط برای ادامهٔ پژوهش ساختاری معتبر است، نه Paper-Forward یا اجرای بروکر.' },
];

const scenarios: CostScenario[] = [
  { id: 'BASELINE', labelFa: 'هزینهٔ پایه', spreadMultiplier: 1, slippagePips: 0.2, commissionMultiplier: 1 },
  { id: 'ELEVATED', labelFa: 'هزینهٔ افزایش‌یافته', spreadMultiplier: 2, slippagePips: 0.8, commissionMultiplier: 1.25 },
  { id: 'SEVERE', labelFa: 'هزینهٔ شدید', spreadMultiplier: 3, slippagePips: 1.5, commissionMultiplier: 1.5 },
];

function metric(trades: ResearchTrade[], initialCash: number) {
  const closed = trades.filter(trade => !trade.isOpen);
  const wins = closed.filter(trade => trade.realizedPnl > 0);
  const losses = closed.filter(trade => trade.realizedPnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.realizedPnl, 0));
  const netProfit = closed.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  let equity = initialCash;
  let peak = equity;
  let maxDrawdownPercent = 0;
  for (const trade of closed) {
    equity += trade.realizedPnl;
    peak = Math.max(peak, equity);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, peak ? ((peak - equity) / peak) * 100 : 0);
  }
  return {
    tradesCount: closed.length,
    netProfit: Number(netProfit.toFixed(2)),
    profitFactor: Number((grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0).toFixed(2)),
    winRatePercent: Number((closed.length ? (wins.length / closed.length) * 100 : 0).toFixed(1)),
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
  };
}

async function main(): Promise<void> {
  const reports = [];
  for (const candidate of candidates) {
    const descriptor = BUNDLED_HISTORICAL_DATASETS.find(dataset => dataset.symbol === candidate.symbol);
    if (!descriptor) throw new Error(`No bundled descriptor for ${candidate.symbol}`);
    const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
    const parsed = DataWorkbench.parseCSV(csv, 'D1', 0);
    const dataset = createDatasetFromCandles({
      candles: parsed.candles,
      provider: descriptor.source,
      providerSymbol: descriptor.providerSymbol,
      canonicalSymbol: candidate.symbol,
      instrumentLabel: descriptor.labelFa,
      timeframe: 'D1',
      rawSourcePath: descriptor.url,
      contentSha256: `bundled-${descriptor.id}`,
      sourceLicense: 'Yahoo Finance public chart data; research only.',
      importedAt: '2026-09-10T00:00:00.000Z',
    });
    const rows = scenarios.map(scenario => {
      const config = createBaselineResearchConfig({
        datasetId: dataset.manifest.datasetId,
        symbol: candidate.symbol,
        timeframe: 'D1',
        experimentId: `EXP-OOS-COST-${candidate.symbol}-${scenario.id}-20260910`,
      });
      config.strategyVariants = [candidate.variant];
      config.aiModes = [candidate.aiMode];
      config.warmupBars = 220;
      config.costModel = {
        ...config.costModel,
        modelVersion: `cost-model-v1-${scenario.id.toLowerCase()}`,
        spreadPips: SYMBOL_SPECS[candidate.symbol].typicalSpreadPips * scenario.spreadMultiplier,
        slippagePips: scenario.slippagePips,
        commissionPerLotRoundTrip: SYMBOL_SPECS[candidate.symbol].commissionPerLot * scenario.commissionMultiplier,
      };
      const trainBars = Math.max(900, Math.floor(dataset.candles.length * 0.45));
      const testBars = Math.max(180, Math.floor(dataset.candles.length * 0.12));
      const walkForward = WalkForwardEvaluator.run(dataset, config, { trainBars, testBars, stepBars: testBars, purgeBars: config.entryExpiryBars });
      const aggregate = metric(walkForward.outOfSampleTrades, config.initialCash);
      return { scenario, costs: config.costModel, aggregate, profitableFolds: walkForward.folds.filter(fold => fold.outOfSampleSummary.netProfit > 0).length, totalFolds: walkForward.folds.length, walkForward };
    });
    const elevated = rows.find(row => row.scenario.id === 'ELEVATED')!;
    const severe = rows.find(row => row.scenario.id === 'SEVERE')!;
    const gate = elevated.aggregate.tradesCount >= 30
      && elevated.aggregate.profitFactor >= 1.05
      && severe.aggregate.profitFactor >= 1
      && severe.aggregate.maxDrawdownPercent <= 12
      ? candidate.dataCaveatFa ? 'RESEARCH_ONLY_PENDING_BROKER_MATCHED_DATA' : 'PROMOTE_TO_DATA_MATCHING_CHECK'
      : 'HOLD_FOR_RULE_OR_COST_REVIEW';
    reports.push({ candidate, dataset: dataset.manifest, gatePolicy: 'Elevated: at least 30 OOS trades and PF >= 1.05; Severe: PF >= 1.00 and max DD <= 12%.', gate, rows });
  }
  const output = {
    version: 'bundled-oos-cost-stress-v1',
    generatedAt: new Date().toISOString(),
    purpose: 'Read-only OOS cost stress on fixed candidates that previously passed the OOS selection gate. No optimization, broker, exchange, or order-writing API was called.',
    reports,
  };
  const outputPath = resolve(process.cwd(), 'data/runs/bundled-oos-cost-stress-20260910.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.table(reports.flatMap(report => report.rows.map(row => ({
    symbol: report.candidate.symbol,
    scenario: row.scenario.id,
    oosTrades: row.aggregate.tradesCount,
    oosNet: row.aggregate.netProfit,
    oosPF: row.aggregate.profitFactor,
    oosMaxDD: row.aggregate.maxDrawdownPercent,
    gate: report.gate,
  }))));
  console.log(`Saved OOS cost-stress report: ${outputPath}`);
}

void main();
