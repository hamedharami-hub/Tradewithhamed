import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import { PaperForwardRunner } from '../lib/research/paper-forward-runner';

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(resolve('data/runs/gbpusd-4h-agent-ablation-dataset.json'), 'utf8')) as HistoricalDataset;
  const end = dataset.candles.at(-1)?.timestamp || 0;
  const start = end - 30 * 24 * 60 * 60_000;
  const warmup = dataset.candles.filter(candle => candle.timestamp < start).slice(-140);
  const evaluation = dataset.candles.filter(candle => candle.timestamp >= start && candle.timestamp <= end);
  const candles = [...warmup, ...evaluation];
  const symbol = 'GBPUSD' as const;
  const timeframe = '4H' as const;
  PaperForwardRunner.start({ symbol, timeframe, strategyVariants: ['TREND_BREAKOUT_55_EMA200_V1'], aiMode: 'OFF', ruleOverrides: { trendChannelLookback: 55, trendEmaPeriod: 200 } });
  const daily: Array<{ dateUtc: string; acceptedBars: number; signals?: number; trades?: number; netPnl?: number; brokerWrites: false }> = [];
  let lastDate = '';
  for (const candle of candles) {
    const snapshot = PaperForwardRunner.ingestClosedBar(symbol, timeframe, candle, true);
    const date = new Date(candle.timestamp).toISOString().slice(0, 10);
    if (date !== lastDate && date >= new Date(start).toISOString().slice(0, 10)) {
      lastDate = date;
      daily.push({ dateUtc: date, acceptedBars: snapshot.state.acceptedBars, signals: snapshot.result?.summary.totalSignals, trades: snapshot.result?.summary.totalTrades, netPnl: snapshot.result?.summary.netProfit, brokerWrites: false });
    }
  }
  const snapshot = PaperForwardRunner.stop(symbol, timeframe);
  if (!snapshot) throw new Error('PAPER_FORWARD_SNAPSHOT_MISSING');
  const output = { version: 'historical-30d-paper-replay-v1', generatedAt: new Date().toISOString(), liveFeed: false, brokerWrites: false, liveTrading: false, source: { datasetId: dataset.manifest.datasetId, sourceLicense: dataset.manifest.sourceLicense, endTimestamp: end, startTimestamp: start, warmupBars: warmup.length, evaluationBars: evaluation.length }, state: snapshot.state, performance: snapshot.result?.summary, daily, warnings: ['این replay از دادهٔ تاریخی ساخته شده و Paper-Forward زنده نیست.', 'هیچ broker یا exchange API فراخوانی نشده است.'] };
  const path = resolve('data/runs/paper-forward-gbpusd-4h-historical-30d-20260910.json');
  await mkdir(resolve('data/runs'), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ path, source: output.source, performance: output.performance, dailyRows: daily.length, brokerWrites: false, liveFeed: false }));
}
void main();
