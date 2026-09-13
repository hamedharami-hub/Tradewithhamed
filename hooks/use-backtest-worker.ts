'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '@/lib/contracts/market';
import type { BacktestConfig, BacktestReport } from '@/lib/contracts/backtester';

export function useBacktestWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [progress, setProgress] = useState<{ completedBars: number; totalBars: number } | null>(null);
  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setProgress(null);
  }, []);
  useEffect(() => cancel, [cancel]);

  const run = useCallback((candles: Candle[], config: Partial<BacktestConfig>) => new Promise<BacktestReport>((resolve, reject) => {
    cancel();
    const worker = new Worker(new URL('../lib/core/backtest.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ type: string; completedBars?: number; totalBars?: number; report?: BacktestReport; message?: string }>) => {
      const message = event.data;
      if (message.type === 'PROGRESS' || message.type === 'STARTED') setProgress({ completedBars: message.completedBars || 0, totalBars: message.totalBars || candles.length });
      if (message.type === 'COMPLETE' && message.report) { worker.terminate(); workerRef.current = null; setProgress(null); resolve(message.report); }
      if (message.type === 'ERROR') { worker.terminate(); workerRef.current = null; setProgress(null); reject(new Error(message.message)); }
    };
    worker.onerror = () => { worker.terminate(); workerRef.current = null; setProgress(null); reject(new Error('اجرای بک‌تست در Worker ناموفق بود.')); };
    worker.postMessage({ type: 'RUN', candles, config });
  }), [cancel]);
  return { run, cancel, progress };
}
