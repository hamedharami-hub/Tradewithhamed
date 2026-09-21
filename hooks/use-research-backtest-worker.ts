'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import type { TradingStyleType } from '@/lib/contracts/regimes';
import type { StrategyParameters } from '@/lib/contracts/strategy-parameters';
import type { EndOfDataPolicy, PositionLedgerEntry } from '@/lib/core/ports';
import type { PerformanceMetrics } from '@/lib/core/research-lab';
import { ResearchLab } from '@/lib/core/research-lab';

export interface ResearchBacktestProgress {
  runId: string;
  processedBars: number;
  totalBars: number;
  percent: number;
}

export function useResearchBacktestWorker() {
  const workerRef = useRef<Worker | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ResearchBacktestProgress | null>(null);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    activeRunIdRef.current = null;
    setIsRunning(false);
    setProgress(null);
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (
      candles: Candle[],
      symbol: SymbolId,
      options: {
        initialCash?: number;
        commissionPerLot?: number;
        defaultSpreadPips?: number;
        additionalSlippagePips?: number;
        style?: TradingStyleType | 'ALL';
        timeframe?: Timeframe;
        riskPercent?: number;
        strategyParameters?: StrategyParameters;
        endOfDataPolicy?: EndOfDataPolicy;
      }
    ): Promise<{ metrics: PerformanceMetrics; trades: PositionLedgerEntry[]; runId: string }> => {
      cancel();
      const runId = `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeRunIdRef.current = runId;
      setIsRunning(true);
      setProgress({ runId, processedBars: 0, totalBars: candles.length, percent: 0 });

      return new Promise((resolve, reject) => {
        // فال‌بک امن در صورت عدم دسترسی به Worker (محیط‌های تست، نود یا SSR)
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
          try {
            const res = ResearchLab.runBacktest(candles, symbol, options);
            setIsRunning(false);
            setProgress(null);
            resolve({ ...res, runId });
          } catch (err) {
            setIsRunning(false);
            setProgress(null);
            reject(err);
          }
          return;
        }

        try {
          const worker = new Worker(new URL('../lib/core/research-backtest.worker.ts', import.meta.url), {
            type: 'module',
          });
          workerRef.current = worker;

          worker.onmessage = (
            event: MessageEvent<{
              type: string;
              runId: string;
              processedBars?: number;
              totalBars?: number;
              result?: { metrics: PerformanceMetrics; trades: PositionLedgerEntry[] };
              message?: string;
            }>
          ) => {
            const data = event.data;
            // بررسی تطابق runId جهت جلوگیری از بازنویسی نتیجه توسط تسک قدیمی
            if (data.runId !== activeRunIdRef.current) return;

            if (data.type === 'STARTED' || data.type === 'PROGRESS') {
              const processed = data.processedBars || 0;
              const total = data.totalBars || candles.length;
              const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
              setProgress({ runId, processedBars: processed, totalBars: total, percent: pct });
            } else if (data.type === 'COMPLETE' && data.result) {
              worker.terminate();
              workerRef.current = null;
              activeRunIdRef.current = null;
              setIsRunning(false);
              setProgress(null);
              resolve({ ...data.result, runId });
            } else if (data.type === 'ERROR') {
              worker.terminate();
              workerRef.current = null;
              activeRunIdRef.current = null;
              setIsRunning(false);
              setProgress(null);
              reject(new Error(data.message || 'خطا در اجرای بکتست پس‌زمینه.'));
            }
          };

          worker.onerror = () => {
            if (activeRunIdRef.current === runId) {
              worker.terminate();
              workerRef.current = null;
              activeRunIdRef.current = null;
              setIsRunning(false);
              setProgress(null);
              reject(new Error('اجرای محاسبات در Web Worker ناموفق بود.'));
            }
          };

          worker.postMessage({
            type: 'RUN',
            runId,
            candles,
            symbol,
            options,
          });
        } catch (workerInitErr) {
          // فال‌بک در صورت عدم امکان ساخت شیء Worker
          try {
            const res = ResearchLab.runBacktest(candles, symbol, options);
            setIsRunning(false);
            setProgress(null);
            resolve({ ...res, runId });
          } catch (err) {
            setIsRunning(false);
            setProgress(null);
            reject(err);
          }
        }
      });
    },
    [cancel]
  );

  return { run, cancel, isRunning, progress };
}
