import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseYahooChartPayload } from '../lib/research/dataset';
import { PaperForwardRunner } from '../lib/research/paper-forward-runner';
import type { YahooChartPayload } from '../lib/research/dataset';

const symbol = 'GBPUSD' as const;
const timeframe = '5M' as const;
const outputPath = process.env.PAPER_REPORT || 'data/runs/paper-forward/gbpusd-yahoo-live-v1.json';
const range = process.env.PAPER_RANGE || '5d';
const endpoint = `https://query2.finance.yahoo.com/v8/finance/chart/GBPUSD=X?range=${range}&interval=5m&events=history`;

async function fetchBars(): Promise<ReturnType<typeof parseYahooChartPayload>> {
  const response = await fetch(endpoint, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!response.ok) throw new Error(`PUBLIC_FEED_HTTP_${response.status}`);
  const payload = await response.json() as YahooChartPayload;
  const candles = parseYahooChartPayload(payload);
  const currentBucket = Math.floor(Date.now() / (5 * 60_000)) * (5 * 60_000);
  return candles.filter(candle => candle.timestamp < currentBucket);
}

async function main(): Promise<void> {
  const bars = await fetchBars();
  if (bars.length < 140) throw new Error(`INSUFFICIENT_CLOSED_BARS:${bars.length}`);
  PaperForwardRunner.start({ symbol, timeframe, strategyVariants: ['S0_SWEEP_FVG'], aiMode: 'DETERMINISTIC_COUNCIL' });
  for (const candle of bars) PaperForwardRunner.ingestClosedBar(symbol, timeframe, candle, true);
  const snapshot = PaperForwardRunner.getSnapshot(symbol, timeframe);
  const latestBar = bars.at(-1);
  const report = {
    version: 'public-live-paper-forward-v1',
    mode: 'PAPER_FORWARD',
    brokerWrites: false,
    brokerExecution: 'DISABLED',
    source: 'Yahoo Finance chart API, GBPUSD=X',
    sourceUrl: endpoint,
    symbol,
    timeframe,
    fetchedAt: new Date().toISOString(),
    closedBarsFed: bars.length,
    latestClosedBar: latestBar ? new Date(latestBar.timestamp).toISOString() : null,
    state: snapshot?.state || null,
    performance: snapshot?.result?.summary || null,
    recentTraceCount: snapshot?.recentTraces.length || 0,
    warnings: [
      'این فید عمومی برای Paper-Forward پژوهشی است و جایگزین quote دقیق broker نیست.',
      'Yahoo ممکن است rate-limit یا delay داشته باشد؛ timestamp و provider باید قبل از نتیجه‌گیری بررسی شود.',
      'هیچ endpoint سفارش، token بروکر یا مسیر cTrader در این اجرا استفاده نشده است.',
      'نتیجهٔ فعلی snapshot از دادهٔ زندهٔ اخیر است، نه ارزیابی چندروزهٔ پایدار.',
    ],
  };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
void main();
