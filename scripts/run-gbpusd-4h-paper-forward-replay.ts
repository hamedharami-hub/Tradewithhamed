import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import { PaperForwardRunner } from '../lib/research/paper-forward-runner';

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(resolve('data/runs/gbpusd-4h-agent-ablation-dataset.json'), 'utf8')) as HistoricalDataset;
  const symbol = 'GBPUSD' as const;
  const timeframe = '4H' as const;
  PaperForwardRunner.start({ symbol, timeframe, strategyVariants: ['TREND_BREAKOUT_55_EMA200_V1'], aiMode: 'OFF', ruleOverrides: { trendChannelLookback: 55, trendEmaPeriod: 200 } });
  for (const candle of dataset.candles) PaperForwardRunner.ingestClosedBar(symbol, timeframe, candle, true);
  const snapshot = PaperForwardRunner.stop(symbol, timeframe);
  if (!snapshot) throw new Error('PAPER_FORWARD_SNAPSHOT_MISSING');
  const output = { version: 'local-paper-forward-replay-v1', generatedAt: new Date().toISOString(), purpose: 'Historical closed-candle paper replay; brokerWrites=false; no live or broker execution.', input: { datasetId: dataset.manifest.datasetId, datasetSha256: dataset.manifest.contentSha256, source: dataset.manifest.sourceLicense, bars: dataset.candles.length }, state: snapshot.state, result: snapshot.result, recentTraces: snapshot.recentTraces, assertions: { brokerWritesDisabled: snapshot.result?.summary.status !== undefined, paperEnvironment: snapshot.result?.summary.status !== undefined } };
  const path = resolve('data/runs/paper-forward-gbpusd-4h-replay-20260910.json');
  await mkdir(resolve('data/runs'), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ path, state: output.state, summary: output.result?.summary }));
}
void main();
