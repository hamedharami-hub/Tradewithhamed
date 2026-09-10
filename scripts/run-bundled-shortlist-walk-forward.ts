import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataWorkbench } from '../lib/core/data-workbench';
import { SYMBOL_SPECS, type SymbolId } from '../lib/contracts/market';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { createDatasetFromCandles } from '../lib/research/dataset';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { BUNDLED_HISTORICAL_DATASETS } from '../lib/research/bundled-historical-datasets';
import type { AIReviewMode, ResearchTrade, StrategyVariantId } from '../lib/research/contracts';
import { WalkForwardEvaluator } from '../lib/research/walk-forward';

interface ShortlistEntry {
  symbol: SymbolId;
  variant: StrategyVariantId;
  aiMode: AIReviewMode;
  rationaleFa: string;
  dataCaveatFa?: string;
}

const shortlist: ShortlistEntry[] = [
  {
    symbol: 'BTCUSD',
    variant: 'TREND_BREAKOUT_55_EMA200_V1',
    aiMode: 'OFF',
    rationaleFa: 'برترین نتیجهٔ اولیهٔ ماتریس D1؛ باید بدون انتخاب مجدد پارامترها در OOS بررسی شود.',
  },
  {
    symbol: 'USDJPY',
    variant: 'FVG_EQUILIBRIUM_V1',
    aiMode: 'OFF',
    rationaleFa: 'برترین نتیجهٔ اولیهٔ USDJPY با تعداد معاملهٔ کافی؛ آزمون OOS برای سنجش پایداری الزامی است.',
  },
  {
    symbol: 'XAUUSD',
    variant: 'S0_SWEEP_ONLY',
    aiMode: 'OFF',
    rationaleFa: 'برترین غربال اولیهٔ طلا؛ فقط به‌عنوان آزمون ساختاری، نه کالیبراسیون اجرای بروکر.',
    dataCaveatFa: 'منبع GC=F قرارداد آتی COMEX است و جایگزین quote بروکر XAUUSD نیست.',
  },
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
  for (const item of shortlist) {
    const descriptor = BUNDLED_HISTORICAL_DATASETS.find(dataset => dataset.symbol === item.symbol);
    if (!descriptor) throw new Error(`No bundled descriptor for ${item.symbol}`);
    const csv = await readFile(resolve(process.cwd(), `public${descriptor.url}`), 'utf8');
    const parsed = DataWorkbench.parseCSV(csv, 'D1', 0);
    const dataset = createDatasetFromCandles({
      candles: parsed.candles,
      provider: descriptor.source,
      providerSymbol: descriptor.providerSymbol,
      canonicalSymbol: item.symbol,
      instrumentLabel: descriptor.labelFa,
      timeframe: 'D1',
      rawSourcePath: descriptor.url,
      contentSha256: `bundled-${descriptor.id}`,
      sourceLicense: 'Yahoo Finance public chart data; research only.',
      importedAt: '2026-09-10T00:00:00.000Z',
    });
    const config = createBaselineResearchConfig({
      datasetId: dataset.manifest.datasetId,
      symbol: item.symbol,
      timeframe: 'D1',
      experimentId: `EXP-WF-SHORTLIST-${item.symbol}-20260910`,
    });
    config.strategyVariants = [item.variant];
    config.aiModes = [item.aiMode];
    config.warmupBars = 220;
    config.costModel = {
      ...config.costModel,
      spreadPips: SYMBOL_SPECS[item.symbol].typicalSpreadPips,
      commissionPerLotRoundTrip: SYMBOL_SPECS[item.symbol].commissionPerLot,
    };

    const trainBars = Math.max(900, Math.floor(dataset.candles.length * 0.45));
    const testBars = Math.max(180, Math.floor(dataset.candles.length * 0.12));
    const result = WalkForwardEvaluator.run(dataset, config, { trainBars, testBars, stepBars: testBars, purgeBars: config.entryExpiryBars });
    const aggregate = metric(result.outOfSampleTrades, config.initialCash);
    const profitableFolds = result.folds.filter(fold => fold.outOfSampleSummary.netProfit > 0).length;
    const gate = aggregate.tradesCount >= 30
      && aggregate.profitFactor >= 1.1
      && profitableFolds >= Math.ceil(result.folds.length * 0.5)
      && aggregate.maxDrawdownPercent <= 12
      ? 'PROMOTE_TO_COST_STRESS'
      : 'HOLD_FOR_MORE_DATA_OR_RULE_REVIEW';
    reports.push({
      symbol: item.symbol,
      variant: item.variant,
      aiMode: item.aiMode,
      rationaleFa: item.rationaleFa,
      dataCaveatFa: item.dataCaveatFa || null,
      dataset: dataset.manifest,
      gatePolicy: 'at least 30 closed OOS trades, aggregate PF >= 1.10, at least half of folds profitable, and OOS max DD <= 12%',
      gate,
      aggregate,
      profitableFolds,
      totalFolds: result.folds.length,
      walkForward: result,
    });
  }
  const output = {
    version: 'bundled-shortlist-walk-forward-v1',
    generatedAt: new Date().toISOString(),
    purpose: 'Read-only OOS validation of fixed, previously shortlisted D1 candidates. No optimization, broker, exchange, or order-writing API was called.',
    reports,
  };
  const outputPath = resolve(process.cwd(), 'data/runs/bundled-shortlist-walk-forward-20260910.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.table(reports.map(report => ({
    symbol: report.symbol,
    variant: report.variant,
    folds: report.totalFolds,
    profitableFolds: report.profitableFolds,
    oosTrades: report.aggregate.tradesCount,
    oosNet: report.aggregate.netProfit,
    oosPF: report.aggregate.profitFactor,
    oosMaxDD: report.aggregate.maxDrawdownPercent,
    gate: report.gate,
  })));
  console.log(`Saved shortlist walk-forward report: ${outputPath}`);
}

void main();
