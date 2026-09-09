import type { Candle } from '@/lib/contracts/market';
import { MultiStyleEngine } from '../multi-style-engine';
import { ResearchLab } from '../research-lab';
import { HISTORICAL_DATASET_CATALOG } from '@/lib/research/dataset-catalog';

export interface ResearchDeskTestResult {
  name: string;
  passed: boolean;
  details: string;
}

function trendCandles(count = 280): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = 1.1 + index * 0.00012;
    const close = open + 0.00008;
    return {
      timestamp: 1_700_000_000_000 + index * 900_000,
      open,
      high: close + 0.0001,
      low: open - 0.0001,
      close,
      volume: 100 + index,
      isClosed: true,
    };
  });
}

export function runResearchDeskSuite(): ResearchDeskTestResult[] {
  const results: ResearchDeskTestResult[] = [];
  const symbolSet = new Set(HISTORICAL_DATASET_CATALOG.map(item => item.symbol));
  results.push({
    name: 'Dataset catalog exposes all supported symbols with explicit availability',
    passed: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD'].every(symbol => symbolSet.has(symbol as never))
      && HISTORICAL_DATASET_CATALOG.some(item => item.symbol === 'BTCUSD' && item.status === 'IMPORT_REQUIRED'),
    details: `symbols=${[...symbolSet].join(',')}`,
  });

  const candles = trendCandles();
  const evaluation = MultiStyleEngine.evaluate(candles, 'EURUSD', 'TREND_BREAKOUT');
  results.push({
    name: 'Trend breakout emits only the selected breakout style',
    passed: evaluation.candidate !== null
      && evaluation.candidate.style === 'TREND_BREAKOUT'
      && evaluation.candidate.createdAtTimestamp === candles[candles.length - 1].timestamp,
    details: evaluation.candidate ? `${evaluation.candidate.style}/${evaluation.candidate.id}` : 'no candidate',
  });

  const backtest = ResearchLab.runBacktest(candles, 'EURUSD', {
    style: 'TREND_BREAKOUT',
    timeframe: '15M',
    lookbackCandles: 240,
  });
  results.push({
    name: 'Research desk backtest returns a local simulated ledger and equity curve',
    passed: backtest.metrics.equityCurve.length > 1 && backtest.trades.every(trade => trade.environment === 'BACKTEST'),
    details: `trades=${backtest.trades.length}; equityPoints=${backtest.metrics.equityCurve.length}`,
  });

  return results;
}
