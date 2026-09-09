import type { Candle } from '@/lib/contracts/market';
import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { PaperForwardLedger } from '../paper-forward-ledger';

export interface PaperForwardLedgerTestResult { name: string; passed: boolean; details: string; }

const baseTimestamp = 1_800_000_000_000;
function candle(index: number, open: number, high: number, low: number, close: number): Candle {
  return { timestamp: baseTimestamp + index * 60_000, open, high, low, close, volume: 10, isClosed: true };
}

function candidate(): StrategyCandidate {
  return {
    id: 'candidate-1',
    strategyName: 'S0_SWEEP_FVG',
    symbol: 'EURUSD',
    timeframe: '1M',
    direction: 'BUY',
    createdAtTimestamp: baseTimestamp,
    expiresAtTimestamp: baseTimestamp + 10 * 60_000,
    entryPrice: 1.1,
    stopLossPrice: 1.098,
    takeProfitPrice: 1.104,
    riskRewardRatio: 2,
    evidenceIds: { sweepId: 'sweep-1', fvgId: 'fvg-1' },
    rationale: 'test candidate',
    status: 'PENDING_CONFIRMATION',
  };
}

export function runPaperForwardLedgerTests(): PaperForwardLedgerTestResult[] {
  const ledger = new PaperForwardLedger({ symbol: 'EURUSD', timeframe: '1M', volumeLots: 0.01, initialCash: 10_000 });
  ledger.approve(candidate());
  const opened = ledger.processClosedCandle(candle(1, 1.1002, 1.101, 1.1, 1.1008));
  const closed = ledger.processClosedCandle(candle(2, 1.1008, 1.1045, 1.1004, 1.104));
  const trades = ledger.getTrades();
  const summary = ledger.getSummary();

  const pessimistic = new PaperForwardLedger({ symbol: 'EURUSD', timeframe: '1M' });
  pessimistic.approve({ ...candidate(), id: 'candidate-2' });
  pessimistic.processClosedCandle(candle(1, 1.1, 1.101, 1.099, 1.1));
  pessimistic.processClosedCandle(candle(2, 1.1, 1.105, 1.097, 1.1));
  const pessimisticTrade = pessimistic.getTrades()[0];

  return [
    { name: 'paper ledger fills only after the signal candle', passed: trades[0]?.openedTimestamp === candle(1, 0, 0, 0, 0).timestamp, details: `opened=${trades[0]?.openedTimestamp}` },
    { name: 'paper ledger records a local take-profit close with PnL', passed: closed.some(event => event.status === 'PAPER_TRADE_CLOSED' && event.paperTrade.closeReason === 'TP') && (trades[0]?.realizedPnl || 0) > 0, details: `pnl=${trades[0]?.realizedPnl}; reason=${trades[0]?.closeReason}` },
    { name: 'paper ledger marks every trade as local-only with zero broker writes', passed: opened.every(event => event.brokerWrites === false && event.paperTrade.brokerWrites === false) && trades.every(trade => trade.environment === 'PAPER_LIVE'), details: `environment=${trades[0]?.environment}; brokerWrites=${trades[0]?.brokerWrites}` },
    { name: 'same-bar stop and target follows the pessimistic stop-loss policy', passed: pessimisticTrade?.closeReason === 'SL', details: `reason=${pessimisticTrade?.closeReason}` },
    { name: 'paper ledger summary includes PnL and drawdown without open broker state', passed: summary.totalTrades === 1 && summary.netPnl > 0 && summary.openPositions === 0 && summary.brokerWrites === false, details: JSON.stringify(summary) },
  ];
}
