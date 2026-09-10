import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateAcceptanceGate, type AcceptanceGateInput } from '../lib/research/acceptance-gate';

type Stage25 = { reports: Array<{ symbol: string; timeframe: string; baseline: { oosNetProfit: number; oosTrades: number }; optimized: { oosNetProfit: number; oosTrades: number; folds: Array<{ trainSummary: { netProfit: number }; outOfSampleSummary: { netProfit: number; totalTrades: number; profitFactor: number; maxDrawdownPercent: number } }>; costStress: Array<{ scenario: string; totalNetProfit: number; totalTrades: number }> } }> };
type Stage24 = { reports: Array<{ symbol: string; timeframe: string; scenario: string; variant: string; totalTrades: number; netProfit: number; profitFactor: number; maxDrawdownPercent: number }> };

async function load<T>(path: string): Promise<T> { return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as T; }

async function main(): Promise<void> {
  const stage25 = await load<Stage25>('data/runs/stage25-independent-walk-forward.json');
  const stage24 = await load<Stage24>('data/runs/stage24-robustness-matrix.json');
  const inputs: AcceptanceGateInput[] = stage25.reports.map(report => {
    const folds = report.optimized.folds.map(fold => ({ trainNetProfit: fold.trainSummary.netProfit, oosNetProfit: fold.outOfSampleSummary.netProfit, oosTrades: fold.outOfSampleSummary.totalTrades, oosProfitFactor: fold.outOfSampleSummary.profitFactor, oosMaxDrawdownPercent: fold.outOfSampleSummary.maxDrawdownPercent, stressNetProfits: [] }));
    return { candidateId: `${report.symbol}-${report.timeframe}-OPT`, symbol: report.symbol, timeframe: report.timeframe, baseline: report.baseline, optimized: { oosNetProfit: report.optimized.oosNetProfit, oosTrades: report.optimized.oosTrades, oosProfitFactor: Math.min(...folds.map(fold => fold.oosProfitFactor || 0)), oosMaxDrawdownPercent: Math.max(...folds.map(fold => fold.oosMaxDrawdownPercent || 0)), stressNetProfits: report.optimized.costStress.map(item => item.totalNetProfit) }, folds };
  });
  for (const symbol of ['GBPUSD', 'USDJPY']) {
    const rows = stage24.reports.filter(row => row.symbol === symbol && row.timeframe === '4H' && row.variant === 'OPTIMIZED');
    const base = rows.find(row => row.scenario === 'BASE');
    inputs.push({ candidateId: `${symbol}-4H-TRANSFERRED`, symbol, timeframe: '4H', optimized: { oosNetProfit: base?.netProfit ?? 0, oosTrades: base?.totalTrades ?? 0, oosProfitFactor: base?.profitFactor ?? 0, oosMaxDrawdownPercent: base?.maxDrawdownPercent ?? 99, stressNetProfits: rows.map(row => row.netProfit) }, folds: [] });
  }
  const results = inputs.map(input => evaluateAcceptanceGate(input));
  const output = { stage: 26, version: 'acceptance-gate-v1', generatedAt: new Date().toISOString(), thresholds: results[0]?.thresholds, results, warnings: ['PAPER_FORWARD_ELIGIBLE فقط به معنای مجاز بودن برای Paper-Forward تاریخی read-only است و مجوز live trading نیست.', 'GBPUSD و USDJPY در این gate فقط portability دارند و تا اجرای WF مستقل، برای eligibility کامل کافی نیستند.', 'مدل هزینهٔ BTCUSD هنوز broker-specific نیست.'] };
  const outputPath = resolve(process.cwd(), 'data/runs/stage26-acceptance-gate.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ event: 'DONE', outputPath, results: results.map(result => ({ candidateId: result.candidateId, status: result.status, score: result.score })) }));
}
void main();
