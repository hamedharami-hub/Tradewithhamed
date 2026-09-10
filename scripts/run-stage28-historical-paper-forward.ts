import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

type Gate = { results: Array<{ candidateId: string; symbol: string; timeframe: string; status: string; score: number; metrics: Record<string, number>; reasonsFa: string[] }> };
type WF = { reports: Array<{ symbol: string; timeframe: string; optimized: { folds: Array<{ fold: number; trainStartTime: number; trainEndTime: number; outOfSampleStartTime: number; outOfSampleEndTime: number; selectedParameters?: Record<string, unknown>; outOfSampleSummary: { netProfit: number; totalTrades: number; profitFactor: number; maxDrawdownPercent: number } }> } }> };
async function load<T>(path: string): Promise<T> { return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as T; }

async function main(): Promise<void> {
  const gate = await load<Gate>('data/runs/stage26-acceptance-gate.json');
  const wf = await load<WF>('data/runs/stage25-independent-walk-forward.json');
  const eligible = gate.results.filter(item => item.status === 'PAPER_FORWARD_ELIGIBLE');
  const events = eligible.flatMap(candidate => {
    const report = wf.reports.find(item => item.symbol === candidate.symbol && item.timeframe === candidate.timeframe);
    return (report?.optimized.folds || []).map(fold => ({ eventType: 'HISTORICAL_PAPER_FORWARD_OOS_SUMMARY', candidateId: candidate.candidateId, symbol: candidate.symbol, timeframe: candidate.timeframe, fold: fold.fold, trainWindow: { start: fold.trainStartTime, end: fold.trainEndTime }, oosWindow: { start: fold.outOfSampleStartTime, end: fold.outOfSampleEndTime }, selectedParameters: fold.selectedParameters || null, hypothetical: true, brokerWrites: false, orderSubmitted: false, totalTrades: fold.outOfSampleSummary.totalTrades, netProfit: fold.outOfSampleSummary.netProfit, profitFactor: fold.outOfSampleSummary.profitFactor, maxDrawdownPercent: fold.outOfSampleSummary.maxDrawdownPercent, decision: 'READ_ONLY_REPLAY_SUMMARY' }));
  });
  const output = { stage: 28, version: 'historical-paper-forward-readonly-v1', generatedAt: new Date().toISOString(), eligibility: eligible, events, summary: { eligibleCandidates: eligible.length, historicalFoldEvents: events.length, brokerWrites: false, ordersSubmitted: false, liveTrading: false }, warnings: ['این artifact خلاصهٔ replay تاریخی OOS است و سفارش واقعی یا اتصال نوشتاری به broker ندارد.', 'candidate فقط بر اساس gate فعلی انتخاب شده است؛ مثبت بودن نتیجه تضمین آینده نیست.', 'BTCUSD هنوز مدل هزینهٔ broker-specific و funding ندارد.'] };
  const outputPath = resolve(process.cwd(), 'data/runs/stage28-historical-paper-forward-readonly.json');
  await mkdir(resolve(process.cwd(), 'data/runs'), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ event: 'DONE', outputPath, eligibleCandidates: eligible.length, historicalFoldEvents: events.length, brokerWrites: false }));
}
void main();
