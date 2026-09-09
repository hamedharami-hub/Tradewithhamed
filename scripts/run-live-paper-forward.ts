import { CTraderDemoGateway } from '../lib/gateway/ctrader-gateway';
import { PaperForwardRunner } from '../lib/research/paper-forward-runner';
import type { Candle, SymbolId, Timeframe } from '../lib/contracts/market';

const symbols = (process.env.PAPER_SYMBOLS || 'GBPUSD').split(',').map(value => value.trim().toUpperCase() as SymbolId);
const durationMs = Number(process.env.PAPER_DURATION_MS || 0);
const timeframe = (process.env.PAPER_TIMEFRAME || '1M') as Timeframe;
const ruleOverrides = {
  stopLossAtrBuffer: Number(process.env.PAPER_STOP_LOSS_ATR_BUFFER || 0.2),
  targetRiskReward: Number(process.env.PAPER_TARGET_RR || 2),
  entryExpiryBars: Number(process.env.PAPER_EXPIRY_BARS || 12),
  minSweepPenetrationAtr: Number(process.env.PAPER_MIN_SWEEP_ATR || 0.1),
  minFvgSizeAtr: Number(process.env.PAPER_MIN_FVG_ATR || 0.3),
};
const gateway = CTraderDemoGateway.getInstance();

type BarState = { start: number; open: number; high: number; low: number; close: number; volume: number };
const bars = new Map<SymbolId, BarState>();

function minuteStart(timestamp: number): number { return Math.floor(timestamp / 60_000) * 60_000; }
function ingest(symbol: SymbolId, quote: { bid: number; ask: number; timestamp: number }): void {
  const mid = (quote.bid + quote.ask) / 2;
  const start = minuteStart(quote.timestamp);
  const current = bars.get(symbol);
  if (!current) { bars.set(symbol, { start, open: mid, high: mid, low: mid, close: mid, volume: 1 }); return; }
  if (start === current.start) { current.high = Math.max(current.high, mid); current.low = Math.min(current.low, mid); current.close = mid; current.volume++; return; }
  if (start < current.start) return;
  const candle: Candle = { timestamp: current.start, open: current.open, high: current.high, low: current.low, close: current.close, volume: current.volume, isClosed: true };
  void PaperForwardRunner.ingestClosedBarWithAgents(symbol, timeframe, candle);
  bars.set(symbol, { start, open: mid, high: mid, low: mid, close: mid, volume: 1 });
}

async function main(): Promise<void> {
  const status = gateway.start();
  if (status.state === 'DISABLED') throw new Error(`LIVE_PAPER_NOT_STARTED: ${status.lastError || 'cTrader Gateway configuration is missing.'}`);
  for (const symbol of symbols) PaperForwardRunner.start({ symbol, timeframe, aiMode: 'AGENTIC_OFFLINE', ruleOverrides });
  console.log(JSON.stringify({ mode: 'PAPER_FORWARD', brokerWrites: false, source: 'CTRADER_READ_ONLY', symbols, timeframe, ruleOverrides, status }));
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const quotes = gateway.getQuotes();
    for (const symbol of symbols) { const quote = quotes[symbol]; if (quote) ingest(symbol, quote); }
    if (durationMs > 0 && Date.now() - startedAt >= durationMs) { clearInterval(timer); gateway.stop(); process.exit(0); }
  }, 1000);
  process.on('SIGINT', () => { clearInterval(timer); gateway.stop(); process.exit(0); });
}
void main();
