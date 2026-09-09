import type { SymbolId, Timeframe } from '@/lib/contracts/market';
import type { LocalPaperTrade } from './paper-forward-ledger';

export interface Stage8Event {
  status?: string;
  timestamp?: string;
  brokerWrites?: boolean;
  symbol?: SymbolId;
  timeframe?: Timeframe;
  analystProvider?: string;
  paperTrade?: LocalPaperTrade;
  [key: string]: unknown;
}

export interface BootstrapInterval {
  iterations: number;
  seed: number;
  mean: number;
  lower95: number;
  upper95: number;
  probabilityPositive: number;
}

export interface Stage8Slice {
  key: string;
  trades: number;
  wins: number;
  winRatePercent: number;
  netPnl: number;
  maxDrawdownPercent: number;
}

export interface Stage8Analysis {
  version: 'stage8-paper-forward-analysis-v1';
  eventCount: number;
  brokerWrites: number;
  feedGaps: number;
  reconnects: number;
  candidateReviews: number;
  approvals: number;
  closedTrades: number;
  sampleStatus: 'INSUFFICIENT_SAMPLE' | 'EXPLORATORY_ONLY';
  netPnl: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  bootstrap: BootstrapInterval;
  bySymbol: Stage8Slice[];
  byTimeframe: Stage8Slice[];
  byProvider: Stage8Slice[];
  bySessionUtc: Stage8Slice[];
  byWeekdayUtc: Stage8Slice[];
  warnings: string[];
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223 | 0;
    return (state >>> 0) / 4294967296;
  };
}

function quantile(values: number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function bootstrapPnl(values: number[], iterations = 10_000, seed = 20260909): BootstrapInterval {
  if (!values.length) return { iterations, seed, mean: 0, lower95: 0, upper95: 0, probabilityPositive: 0 };
  const random = rng(seed);
  const means: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0;
    for (let index = 0; index < values.length; index++) sum += values[Math.floor(random() * values.length)];
    means.push(sum / values.length);
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    iterations,
    seed,
    mean: round(mean, 4),
    lower95: round(quantile(means, 0.025), 4),
    upper95: round(quantile(means, 0.975), 4),
    probabilityPositive: round(means.filter(value => value > 0).length / means.length, 4),
  };
}

function sessionUtc(timestamp: number): 'ASIA' | 'LONDON' | 'LONDON_NEW_YORK_OVERLAP' | 'NEW_YORK' | 'OFF_HOURS' {
  const hour = new Date(timestamp).getUTCHours();
  if (hour <= 6) return 'ASIA';
  if (hour <= 11) return 'LONDON';
  if (hour <= 16) return 'LONDON_NEW_YORK_OVERLAP';
  if (hour <= 20) return 'NEW_YORK';
  return 'OFF_HOURS';
}

function weekdayUtc(timestamp: number): string {
  return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(timestamp).getUTCDay()];
}

function slice(key: string, trades: LocalPaperTrade[]): Stage8Slice {
  const closed = trades.filter(trade => !trade.isOpen && Number.isFinite(trade.realizedPnl));
  const wins = closed.filter(trade => (trade.realizedPnl || 0) > 0).length;
  const pnls = closed.map(trade => trade.realizedPnl || 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const pnl of pnls) {
    equity += pnl;
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100);
  }
  return {
    key,
    trades: closed.length,
    wins,
    winRatePercent: closed.length ? round((wins / closed.length) * 100, 1) : 0,
    netPnl: round(pnls.reduce((sum, value) => sum + value, 0)),
    maxDrawdownPercent: round(maxDrawdown),
  };
}

function grouped(trades: LocalPaperTrade[], keyFor: (trade: LocalPaperTrade) => string): Stage8Slice[] {
  const groups = new Map<string, LocalPaperTrade[]>();
  for (const trade of trades) {
    const key = keyFor(trade);
    const group = groups.get(key) || [];
    group.push(trade);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => slice(key, group));
}

export function analyzeStage8Events(events: Stage8Event[]): Stage8Analysis {
  const closedTrades = events
    .filter(event => event.status === 'PAPER_TRADE_CLOSED' && event.paperTrade && event.paperTrade.isOpen === false)
    .map(event => event.paperTrade!)
    .sort((left, right) => (left.closedTimestamp || 0) - (right.closedTimestamp || 0));
  const pnls = closedTrades.map(trade => trade.realizedPnl || 0);
  const total = slice('TOTAL', closedTrades);
  const brokerWrites = events.filter(event => event.brokerWrites === true || event.payloadType === 2106 || event.orderSubmitted === true || event.executionSent === true).length;
  const feedGaps = events.filter(event => event.status === 'FEED_GAP').length;
  const reconnects = events.filter(event => event.status === 'RECONNECT' || event.status === 'GATEWAY_DEGRADED').length;
  const candidateReviews = events.filter(event => event.status === 'CANDIDATE_REVIEWED').length;
  const approvals = events.filter(event => event.status === 'CANDIDATE_APPROVED').length;
  const sampleStatus = closedTrades.length < 30 ? 'INSUFFICIENT_SAMPLE' : 'EXPLORATORY_ONLY';
  return {
    version: 'stage8-paper-forward-analysis-v1',
    eventCount: events.length,
    brokerWrites,
    feedGaps,
    reconnects,
    candidateReviews,
    approvals,
    closedTrades: closedTrades.length,
    sampleStatus,
    netPnl: total.netPnl,
    winRatePercent: total.winRatePercent,
    maxDrawdownPercent: total.maxDrawdownPercent,
    bootstrap: bootstrapPnl(pnls),
    bySymbol: grouped(closedTrades, trade => trade.symbol),
    byTimeframe: grouped(closedTrades, trade => trade.timeframe),
    byProvider: grouped(closedTrades, trade => {
      const match = events.find(event => event.paperTrade?.paperTradeId === trade.paperTradeId);
      return typeof match?.analystProvider === 'string' ? match.analystProvider : 'UNSPECIFIED';
    }),
    bySessionUtc: grouped(closedTrades, trade => sessionUtc(trade.openedTimestamp)),
    byWeekdayUtc: grouped(closedTrades, trade => weekdayUtc(trade.openedTimestamp)),
    warnings: [
      brokerWrites > 0 ? 'BROKER_WRITES_NONZERO_RESULT_INVALID' : 'brokerWrites=0',
      sampleStatus === 'INSUFFICIENT_SAMPLE' ? 'Fewer than 30 closed paper trades: not eligible for promotion.' : 'At least 30 trades still does not authorize promotion.',
      'Bootstrap quantifies sampling uncertainty and does not replace independent OOS validation.',
    ],
  };
}
