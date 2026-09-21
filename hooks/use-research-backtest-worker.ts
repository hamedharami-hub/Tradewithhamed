'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import type { TradingStyleType } from '@/lib/contracts/regimes';
import type {
  AccountConfiguration,
  DateRangeFilterConfig,
  SessionTimezoneConfig,
  StrategyParameters,
} from '@/lib/contracts/strategy-parameters';
import type { EndOfDataPolicy, PositionLedgerEntry } from '@/lib/core/ports';
import type { PerformanceMetrics } from '@/lib/core/research-lab';
import { ResearchLab } from '@/lib/core/research-lab';

export const LARGE_DATASET_THRESHOLD = 10000;

export interface ResearchBacktestProgress {
  runId: string;
  processedBars: number;
  totalBars: number;
  percent: number;
}

export interface ResearchBacktestWorkerOptions {
  initialCash?: number;
  accountConfig?: AccountConfiguration;
  dateRangeConfig?: DateRangeFilterConfig;
  sessionConfig?: SessionTimezoneConfig;
  commissionPerLot?: number;
  defaultSpreadPips?: number;
  additionalSlippagePips?: number;
  style?: TradingStyleType | 'ALL';
  timeframe?: Timeframe;
  riskPercent?: number;
  strategyParameters?: StrategyParameters;
  endOfDataPolicy?: EndOfDataPolicy;
  htfCandles?: Candle[];
  htfTimeframe?: Timeframe;
  htfSource?: import('@/lib/contracts/strategy-parameters').HigherTimeframeSource;
}

export function useResearchBacktestWorker() {
  const workerRef = useRef<Worker | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const pendingRejectRef = useRef<((reason: Error) => void) | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ResearchBacktestProgress | null>(null);

  const cancel = useCallback(() => {
    const runId = activeRunIdRef.current;
    if (workerRef.current) {
      try {
        if (runId) {
          workerRef.current.postMessage({ type: 'CANCEL', runId });
        }
        workerRef.current.terminate();
      } catch {
        // ignore
      }
      workerRef.current = null;
    }

    if (pendingRejectRef.current) {
      const abortErr = new Error('عملیات بک‌تست لغو شد.');
      abortErr.name = 'AbortError';
      pendingRejectRef.current(abortErr);
      pendingRejectRef.current = null;
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
      options: ResearchBacktestWorkerOptions
    ): Promise<{ metrics: PerformanceMetrics; trades: PositionLedgerEntry[]; runId: string }> => {
      // لغو هرگونه اجرای فعال قبلی
      cancel();

      const runId = `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      activeRunIdRef.current = runId;
      setIsRunning(true);
      setProgress({ runId, processedBars: 0, totalBars: candles.length, percent: 0 });

      return new Promise((resolve, reject) => {
        pendingRejectRef.current = reject;

        const isLargeDataset = candles.length > LARGE_DATASET_THRESHOLD;

        // در محیط‌های فاقد Worker (تست، Node یا SSR)
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
          if (isLargeDataset) {
            setIsRunning(false);
            setProgress(null);
            pendingRejectRef.current = null;
            reject(
              new Error(
                `پردازش دیتاست‌های بزرگ (بیش از ${LARGE_DATASET_THRESHOLD.toLocaleString('fa-IR')} کندل) بدون Web Worker و بر روی ترد اصلی ممنوع است.`
              )
            );
            return;
          }

          try {
            const res = ResearchLab.runBacktest(candles, symbol, options);
            setIsRunning(false);
            setProgress(null);
            pendingRejectRef.current = null;
            resolve({ ...res, runId });
          } catch (err) {
            setIsRunning(false);
            setProgress(null);
            pendingRejectRef.current = null;
            reject(err instanceof Error ? err : new Error(String(err)));
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
            // گارد تطابق runId جهت جلوگیری از اثرگذاری تسک‌های لغوشده یا قدیمی
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
              pendingRejectRef.current = null;
              setIsRunning(false);
              setProgress(null);
              resolve({ ...data.result, runId });
            } else if (data.type === 'ERROR') {
              worker.terminate();
              workerRef.current = null;
              activeRunIdRef.current = null;
              pendingRejectRef.current = null;
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
              pendingRejectRef.current = null;
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
          if (isLargeDataset) {
            setIsRunning(false);
            setProgress(null);
            pendingRejectRef.current = null;
            reject(
              new Error(
                `امکان اجرای وب‌ورکر فراهم نشد و فال‌بک ترد اصلی برای دیتاست‌های بزرگ (بیش از ${LARGE_DATASET_THRESHOLD.toLocaleString('fa-IR')} کندل) مسدود است.`
              )
            );
            return;
          }

          // فال‌بک محدود صرفاً برای دیتاست‌های کوچک
          try {
            const res = ResearchLab.runBacktest(candles, symbol, options);
            setIsRunning(false);
            setProgress(null);
            pendingRejectRef.current = null;
            resolve({ ...res, runId });
          } catch (err) {
            setIsRunning(false);
            setProgress(null);
            pendingRejectRef.current = null;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });
    },
    [cancel]
  );

  return { run, cancel, isRunning, progress };
}
