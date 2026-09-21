// lib/core/research-backtest.worker.ts
// وب‌ورکر اختصاصی اجرای بکتست خارج از نخ اصلی رابط کاربری (Non-blocking Web Worker)

import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import type { TradingStyleType } from '../contracts/regimes';
import type { StrategyParameters } from '../contracts/strategy-parameters';
import type { EndOfDataPolicy } from './ports';
import { ResearchLab } from './research-lab';

type ResearchWorkerRequest = {
  type: 'RUN';
  runId: string;
  candles: Candle[];
  symbol: SymbolId;
  options: {
    initialCash?: number;
    commissionPerLot?: number;
    defaultSpreadPips?: number;
    additionalSlippagePips?: number;
    useAIReview?: boolean;
    style?: TradingStyleType | 'ALL';
    timeframe?: Timeframe;
    lookbackCandles?: number;
    riskPercent?: number;
    strategyParameters?: StrategyParameters;
    endOfDataPolicy?: EndOfDataPolicy;
  };
};

self.onmessage = (event: MessageEvent<ResearchWorkerRequest>) => {
  if (event.data.type !== 'RUN') return;
  const { runId, candles, symbol, options } = event.data;

  self.postMessage({ type: 'STARTED', runId, totalBars: candles.length });
  try {
    const result = ResearchLab.runBacktest(candles, symbol, {
      ...options,
      onProgress: (processed, total) => {
        self.postMessage({ type: 'PROGRESS', runId, processedBars: processed, totalBars: total });
      },
    });
    self.postMessage({ type: 'COMPLETE', runId, result });
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      runId,
      message: err instanceof Error ? err.message : 'Research backtest worker failed.',
    });
  }
};
