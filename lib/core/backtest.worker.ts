import type { Candle } from '../contracts/market';
import type { BacktestConfig } from '../contracts/backtester';
import { MultiStyleBacktester } from './multi-style-backtester';

type WorkerRequest = { type: 'RUN'; candles: Candle[]; config: Partial<BacktestConfig> };
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'RUN') return;
  const { candles, config } = event.data;
  self.postMessage({ type: 'STARTED', totalBars: candles.length });
  try {
    const report = MultiStyleBacktester.runBacktest(candles, config, (completedBars, totalBars) => {
      self.postMessage({ type: 'PROGRESS', completedBars, totalBars });
    });
    self.postMessage({ type: 'COMPLETE', report });
  } catch (error) {
    self.postMessage({ type: 'ERROR', message: error instanceof Error ? error.message : 'Backtest worker failed.' });
  }
};
