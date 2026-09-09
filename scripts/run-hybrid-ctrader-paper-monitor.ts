import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CTraderDemoGateway } from '../lib/gateway/ctrader-gateway';
import { PaperForwardRunner } from '../lib/research/paper-forward-runner';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';
import { reviewWithProvider, type AdvisoryProviderKind } from '../lib/ai/advisory-provider';
import type { Candle, SymbolId, Timeframe } from '../lib/contracts/market';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../lib/contracts/multi-agent-system';

const symbols = (process.env.MONITOR_SYMBOLS || 'GBPUSD').split(',').map(value => value.trim().toUpperCase() as SymbolId);
const timeframe = (process.env.MONITOR_TIMEFRAME || '5M') as Timeframe;
const durationMs = Number(process.env.MONITOR_DURATION_MS || 30 * 24 * 60 * 60 * 1000);
const provider = (process.env.MONITOR_ANALYST_PROVIDER || 'DETERMINISTIC') as AdvisoryProviderKind;
const reportPath = resolve(process.env.MONITOR_REPORT || 'data/runs/stage5-hybrid-monitor/events.jsonl');
const gateway = CTraderDemoGateway.getInstance();
const bars = new Map<SymbolId, { start: number; open: number; high: number; low: number; close: number; volume: number }>();
const history = new Map<SymbolId, Candle[]>();
const config = { ...DEFAULT_MULTI_AGENT_CONFIG, analystEngineId: provider === 'WEBLLM' ? 'smollm2-360m-analyst' : DEFAULT_MULTI_AGENT_CONFIG.analystEngineId };

function bucket(ts: number): number { const size = timeframe === '1M' ? 60_000 : timeframe === '5M' ? 300_000 : 900_000; return Math.floor(ts / size) * size; }
async function emit(event: Record<string, unknown>): Promise<void> { await mkdir(dirname(reportPath), { recursive: true }); await appendFile(reportPath, `${JSON.stringify(event)}\n`, 'utf8'); console.log(JSON.stringify(event)); }

async function processClosedBar(symbol: SymbolId, candle: Candle): Promise<void> {
  const snapshot = PaperForwardRunner.ingestClosedBar(symbol, timeframe, candle, false);
  const candles = history.get(symbol) || [];
  candles.push(candle);
  if (candles.length > 500) candles.shift();
  history.set(symbol, candles);
  if (candles.length < 140) return;
  const candidate = evaluateResearchStrategy(candles, symbol, timeframe, 'S0_SWEEP_FVG');
  if (!candidate) return;
  const review = await reviewWithProvider(provider, { candidate, config });
  await emit({ version: 'stage5-hybrid-monitor-v1', status: 'CANDIDATE_REVIEWED', brokerWrites: false, source: 'CTRADER_READ_ONLY', symbol, timeframe, candleTimestamp: candle.timestamp, candidateId: candidate.id, scanner: 'DETERMINISTIC_S0_SWEEP_FVG', analystProvider: provider, advisoryStatus: review.status, approved: review.approved, latencyMs: review.latencyMs, reasonCodes: review.reasonCodes, paperState: snapshot.state });
}

async function main(): Promise<void> {
  if (provider === 'WEBLLM') {
    await emit({ version: 'stage5-hybrid-monitor-v1', status: 'BLOCKED', brokerWrites: false, reason: 'WEBLLM_BROWSER_GPU_RUNTIME_REQUIRED', nextStep: 'Run the browser WebGPU monitor on a GPU host; Node worker cannot host WebLLM.' });
    process.exitCode = 2; return;
  }
  const status = gateway.start();
  if (status.state === 'DISABLED') {
    await emit({ version: 'stage5-hybrid-monitor-v1', status: 'BLOCKED', brokerWrites: false, source: 'CTRADER_READ_ONLY', reason: status.lastError || 'MISSING_CTRADER_CONFIGURATION', required: ['CTRADER_CLIENT_ID', 'CTRADER_ACCESS_TOKEN', 'CTRADER_ACCOUNT_ID'] });
    process.exitCode = 2; return;
  }
  for (const symbol of symbols) { PaperForwardRunner.start({ symbol, timeframe, aiMode: provider === 'ONLINE' ? 'ONLINE_ADVISORY' : 'DETERMINISTIC_COUNCIL' }); }
  await emit({ version: 'stage5-hybrid-monitor-v1', status: 'STARTED', brokerWrites: false, source: 'CTRADER_READ_ONLY', symbols, timeframe, analystProvider: provider, gateway: status });
  const startedAt = Date.now();
  const timer = setInterval(async () => {
    const quotes = gateway.getQuotes();
    for (const symbol of symbols) {
      const quote = quotes[symbol]; if (!quote) continue;
      const mid = (quote.bid + quote.ask) / 2; const start = bucket(quote.timestamp); const current = bars.get(symbol);
      if (!current) { bars.set(symbol, { start, open: mid, high: mid, low: mid, close: mid, volume: 1 }); continue; }
      if (start === current.start) { current.high = Math.max(current.high, mid); current.low = Math.min(current.low, mid); current.close = mid; current.volume++; continue; }
      if (start < current.start) continue;
      await processClosedBar(symbol, { timestamp: current.start, open: current.open, high: current.high, low: current.low, close: current.close, volume: current.volume, isClosed: true });
      bars.set(symbol, { start, open: mid, high: mid, low: mid, close: mid, volume: 1 });
    }
    if (Date.now() - startedAt >= durationMs) { clearInterval(timer); gateway.stop(); await emit({ version: 'stage5-hybrid-monitor-v1', status: 'COMPLETED', brokerWrites: false, completedAt: new Date().toISOString() }); }
  }, 1000);
  process.on('SIGINT', () => { clearInterval(timer); gateway.stop(); });
}
void main();
