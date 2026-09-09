import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CTraderDemoGateway } from '../lib/gateway/ctrader-gateway';
import { PaperForwardRunner } from '../lib/research/paper-forward-runner';
import type { Candle, SymbolId, Timeframe } from '../lib/contracts/market';

const symbol = (process.env.MONITOR_SYMBOL || 'GBPUSD').toUpperCase() as SymbolId;
const timeframe = (process.env.MONITOR_TIMEFRAME || '5M') as Timeframe;
const durationMs = Number(process.env.MONITOR_DURATION_MS || 30 * 24 * 60 * 60 * 1000);
const reportPath = resolve(process.env.MONITOR_REPORT || 'data/runs/stage8-30d/gbpusd-monitor-report.jsonl');
const gateway = CTraderDemoGateway.getInstance();
const bars = { start: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 };
let lastReportDay = '';

function bucket(timestamp: number): number { return Math.floor(timestamp / (5 * 60_000)) * (5 * 60_000); }
function session(timestamp: number): string { const hour = new Date(timestamp).getUTCHours(); return hour <= 6 ? 'ASIA' : hour <= 11 ? 'LONDON' : hour <= 16 ? 'NEW_YORK' : 'OFF_HOURS'; }
async function emit(report: Record<string, unknown>): Promise<void> { await mkdir(dirname(reportPath), { recursive: true }); await appendFile(reportPath, `${JSON.stringify(report)}\n`, 'utf8'); console.log(JSON.stringify(report)); }

async function main(): Promise<void> {
  const status = gateway.start();
  if (status.state === 'DISABLED') {
    await emit({ version: 'stage8-monitor-v1', status: 'BLOCKED', brokerWrites: false, source: 'CTRADER_READ_ONLY', symbol, timeframe, checkedAt: new Date().toISOString(), gateway: status, reason: status.lastError || 'MISSING_CTRADER_CONFIGURATION', nextStep: 'Set CTRADER_CLIENT_ID, CTRADER_ACCESS_TOKEN and CTRADER_ACCOUNT_ID for a Demo account.' });
    process.exitCode = 2;
    return;
  }
  PaperForwardRunner.start({ symbol, timeframe, aiMode: 'DETERMINISTIC_COUNCIL' });
  await emit({ version: 'stage8-monitor-v1', status: 'STARTED', brokerWrites: false, source: 'CTRADER_READ_ONLY', symbol, timeframe, startedAt: new Date().toISOString(), durationMs, gateway: status });
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    const quote = gateway.getQuotes()[symbol];
    if (quote) {
      const start = bucket(quote.timestamp);
      if (!bars.start) Object.assign(bars, { start, open: (quote.bid + quote.ask) / 2, high: (quote.bid + quote.ask) / 2, low: (quote.bid + quote.ask) / 2, close: (quote.bid + quote.ask) / 2, volume: 1 });
      else if (start === bars.start) { const mid = (quote.bid + quote.ask) / 2; bars.high = Math.max(bars.high, mid); bars.low = Math.min(bars.low, mid); bars.close = mid; bars.volume++; }
      else if (start > bars.start) {
        const candle: Candle = { timestamp: bars.start, open: bars.open, high: bars.high, low: bars.low, close: bars.close, volume: bars.volume, isClosed: true };
        PaperForwardRunner.ingestClosedBar(symbol, timeframe, candle, true);
        Object.assign(bars, { start, open: (quote.bid + quote.ask) / 2, high: (quote.bid + quote.ask) / 2, low: (quote.bid + quote.ask) / 2, close: (quote.bid + quote.ask) / 2, volume: 1 });
      }
      const day = new Date(quote.timestamp).toISOString().slice(0, 10);
      if (day !== lastReportDay) { lastReportDay = day; const snapshot = PaperForwardRunner.getSnapshot(symbol, timeframe); await emit({ version: 'stage8-monitor-v1', status: 'DAILY', brokerWrites: false, source: 'CTRADER_READ_ONLY', dateUtc: day, symbol, timeframe, gateway: gateway.getStatus(), paper: snapshot?.state, performance: snapshot?.result?.summary, sessionBreakdown: snapshot?.result?.analysis?.SESSION_UTC, dayBreakdown: snapshot?.result?.analysis?.DAY_OF_WEEK_UTC, regimeBreakdown: snapshot?.result?.analysis?.REGIME }); }
    }
    if (Date.now() - startedAt >= durationMs) { clearInterval(timer); gateway.stop(); const snapshot = PaperForwardRunner.getSnapshot(symbol, timeframe); await emit({ version: 'stage8-monitor-v1', status: 'COMPLETED', brokerWrites: false, completedAt: new Date().toISOString(), paper: snapshot?.state, performance: snapshot?.result?.summary, sessionBreakdown: snapshot?.result?.analysis?.SESSION_UTC }); }
  }, 60_000);
  process.on('SIGINT', () => { clearInterval(timer); gateway.stop(); });
}
void main();
