import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../lib/contracts/multi-agent-system';
import type { Candle, SymbolId, Timeframe } from '../lib/contracts/market';
import { reviewWithProvider, type AdvisoryProviderKind } from '../lib/ai/advisory-provider';
import { ReadOnlyCTraderClient, getReadOnlyCTraderConfig, type ReadOnlyQuote } from '../lib/gateway/readonly-ctrader';
import { PaperForwardLedger } from '../lib/research/paper-forward-ledger';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';

const provider = (process.env.MONITOR_ANALYST_PROVIDER || 'DETERMINISTIC').trim().toUpperCase() as AdvisoryProviderKind;
const timeframe = (process.env.MONITOR_TIMEFRAME || '1M').trim().toUpperCase() as Timeframe;
const durationMs = Number(process.env.MONITOR_DURATION_MS || 30 * 24 * 60 * 60 * 1000);
const startedAt = new Date();
const reportPath = resolve(process.env.MONITOR_REPORT || `data/runs/stage8-paper-forward/${provider.toLowerCase()}-${startedAt.toISOString().replace(/[:.]/g, '-')}-events.jsonl`);
const timeframeMs: Record<Extract<Timeframe, '1M' | '5M'>, number> = { '1M': 60_000, '5M': 300_000 };

if (timeframe !== '1M' && timeframe !== '5M') throw new Error('STAGE8_MONITOR_TIMEFRAME_MUST_BE_1M_OR_5M');
if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('STAGE8_MONITOR_DURATION_INVALID');

const bucketMs = timeframeMs[timeframe];
type BarState = { start: number; open: number; high: number; low: number; close: number; volume: number };
const bars = new Map<SymbolId, BarState>();
const history = new Map<SymbolId, Candle[]>();
const ledgers = new Map<SymbolId, PaperForwardLedger>();
let stopped = false;
let lastDailyKey = '';
let client: ReadOnlyCTraderClient | null = null;
let completionTimer: ReturnType<typeof setTimeout> | null = null;

async function emit(status: string, event: Record<string, unknown> = {}): Promise<void> {
  const payload = {
    version: 'stage8-readonly-paper-forward-v1',
    timestamp: new Date().toISOString(),
    status,
    brokerWrites: false,
    source: 'CTRADER_DEMO_READ_ONLY_JSON',
    analystProvider: provider,
    timeframe,
    ...event,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await appendFile(reportPath, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(JSON.stringify(payload));
}

function ledgerFor(symbol: SymbolId): PaperForwardLedger {
  const existing = ledgers.get(symbol);
  if (existing) return existing;
  const created = new PaperForwardLedger({ symbol, timeframe });
  ledgers.set(symbol, created);
  return created;
}

async function processClosedBar(symbol: SymbolId, candle: Candle): Promise<void> {
  const ledger = ledgerFor(symbol);
  for (const event of ledger.processClosedCandle(candle)) {
    await emit(event.status, { symbol, candleTimestamp: candle.timestamp, paperTrade: event.paperTrade, ...(event.reason ? { reason: event.reason } : {}) });
  }
  const candles = history.get(symbol) || [];
  candles.push(candle);
  if (candles.length > 500) candles.shift();
  history.set(symbol, candles);
  if (candles.length < 140) {
    await emit('WARMUP', { symbol, candleTimestamp: candle.timestamp, acceptedBars: candles.length, requiredBars: 140 });
    return;
  }
  const candidate = evaluateResearchStrategy(candles, symbol, timeframe, 'S0_SWEEP_FVG');
  if (!candidate) return;
  const review = await reviewWithProvider(provider, { candidate, config: DEFAULT_MULTI_AGENT_CONFIG });
  await emit('CANDIDATE_REVIEWED', {
    symbol,
    candleTimestamp: candle.timestamp,
    candidateId: candidate.id,
    scanner: 'DETERMINISTIC_S0_SWEEP_FVG',
    advisoryStatus: review.status,
    approved: review.approved,
    latencyMs: review.latencyMs,
    reasonCodes: review.reasonCodes,
    modelId: review.modelId,
  });
  if (review.approved) {
    ledger.approve(candidate);
    await emit('CANDIDATE_APPROVED', { symbol, candleTimestamp: candle.timestamp, candidateId: candidate.id, approvalSource: provider });
  }
}

async function emitDailySummary(timestamp: number): Promise<void> {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  if (day === lastDailyKey) return;
  lastDailyKey = day;
  await emit('DAILY_SUMMARY', {
    dateUtc: day,
    ledgers: [...ledgers.entries()].map(([symbol, ledger]) => ({ symbol, summary: ledger.getSummary() })),
  });
}

async function handleQuote(quote: ReadOnlyQuote): Promise<void> {
  if (stopped) return;
  const start = Math.floor(quote.timestamp / bucketMs) * bucketMs;
  const mid = (quote.bid + quote.ask) / 2;
  const current = bars.get(quote.symbol);
  if (!current) {
    bars.set(quote.symbol, { start, open: mid, high: mid, low: mid, close: mid, volume: 1 });
    await emit('FEED_STARTED', { symbol: quote.symbol, providerSymbol: quote.providerSymbol, quoteTimestamp: quote.timestamp });
    return;
  }
  if (start < current.start) return;
  if (start === current.start) {
    current.high = Math.max(current.high, mid);
    current.low = Math.min(current.low, mid);
    current.close = mid;
    current.volume++;
    return;
  }
  const missedBars = Math.max(0, Math.round((start - current.start) / bucketMs) - 1);
  if (missedBars > 0) await emit('FEED_GAP', { symbol: quote.symbol, previousBarTimestamp: current.start, quoteTimestamp: quote.timestamp, missedBars });
  await processClosedBar(quote.symbol, { timestamp: current.start, open: current.open, high: current.high, low: current.low, close: current.close, volume: current.volume, isClosed: true });
  bars.set(quote.symbol, { start, open: mid, high: mid, low: mid, close: mid, volume: 1 });
  await emitDailySummary(quote.timestamp);
}

async function stop(status: 'COMPLETED' | 'STOPPED' | 'BLOCKED', reason?: string): Promise<void> {
  if (stopped) return;
  stopped = true;
  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = null;
  client?.stop();
  await emit(status, {
    ...(reason ? { reason } : {}),
    completedAt: new Date().toISOString(),
    durationMs,
    ledgers: [...ledgers.entries()].map(([symbol, ledger]) => ({ symbol, summary: ledger.getSummary() })),
  });
}

async function main(): Promise<void> {
  if (provider === 'WEBLLM') {
    await emit('BLOCKED', { reason: 'WEBLLM_BROWSER_GPU_RUNTIME_REQUIRED', nextStep: 'Use the dedicated browser/GPU harness; this Node monitor is intentionally blocked.' });
    process.exitCode = 2;
    return;
  }
  if (!['DETERMINISTIC', 'ONLINE', 'GEMINI', 'XAI', 'HYBRID'].includes(provider)) {
    await emit('BLOCKED', { reason: 'MONITOR_ANALYST_PROVIDER_UNSUPPORTED' });
    process.exitCode = 2;
    return;
  }
  const preflight = getReadOnlyCTraderConfig();
  if (!preflight.configured || !preflight.config) {
    await emit('BLOCKED', { reason: preflight.reason || 'CTRADER_READ_ONLY_PREFLIGHT_FAILED', preflight: preflight.safetyChecks });
    process.exitCode = 2;
    return;
  }
  client = new ReadOnlyCTraderClient(preflight.config);
  client.onQuote(quote => { void handleQuote(quote).catch(error => { void stop('BLOCKED', error instanceof Error ? error.message : 'QUOTE_PROCESSING_FAILED'); process.exitCode = 2; }); });
  client.onSymbolDiscovery(symbols => { void emit('SYMBOL_DISCOVERY', { available: symbols.available, unavailable: symbols.unavailable }); });
  client.onStatus(status => {
    if (status.state === 'DEGRADED') {
      void emit('GATEWAY_DEGRADED', { gateway: status }).then(() => stop('BLOCKED', status.lastError || 'CTRADER_READ_ONLY_DEGRADED'));
      process.exitCode = 2;
    }
  });
  await emit('STARTED', { symbols: preflight.config.requestedSymbols, durationMs, reportPath, preflight: preflight.safetyChecks });
  client.start();
  completionTimer = setTimeout(() => { void stop('COMPLETED'); }, durationMs);
  const interrupt = () => { void stop('STOPPED', 'SIGINT'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
}

void main();
