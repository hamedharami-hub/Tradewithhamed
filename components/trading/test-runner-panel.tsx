'use client';

import React, { useState, useEffect } from 'react';
import { Play, CheckCircle2, XCircle, RefreshCw, Terminal } from 'lucide-react';

interface TestResultItem {
  name: string;
  passed: boolean;
  details: string;
}

interface TestSuiteResponse {
  status: 'SUCCESS' | 'FAILURE';
  totalTests: number;
  passedTests: number;
  suite: string;
  results: TestResultItem[];
  error?: string;
}

export const TestRunnerPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [testSuite, setTestSuite] = useState<TestSuiteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunTime, setLastRunTime] = useState<string | null>(null);

  const runTests = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/verify-tests', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
        },
      });

      if (!res.ok) {
        throw new Error(`پاسخ سرور ناموفق بود (کد وضعیت ${res.status})`);
      }

      const data = (await res.json()) as TestSuiteResponse;
      setTestSuite(data);
      setLastRunTime(new Date().toLocaleTimeString('fa-IR'));
    } catch (err) {
      setError((err as Error).message || 'خطا در ارتباط با سرور آزمون‌ها');
    } finally {
      setIsRunning(false);
    }
  };

  // بارگذاری خودکار اولیه به شکل async
  useEffect(() => {
    let isMounted = true;
    const fetchInitialTests = async () => {
      try {
        const res = await fetch('/api/verify-tests', {
          method: 'GET',
          cache: 'no-store',
        });
        if (res.ok && isMounted) {
          const data = (await res.json()) as TestSuiteResponse;
          setTestSuite(data);
          setLastRunTime(new Date().toLocaleTimeString('fa-IR'));
        }
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message || 'خطا در ارتباط با سرور آزمون‌ها');
        }
      }
    };

    fetchInitialTests();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div id="test-runner-container" className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      {/* سربرگ پنل تست‌ها */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-zinc-100">آزمون‌های خودکار راستی‌آزمایی (مراحل ۱ تا ۶)</h2>
          {testSuite && (
            <span
              id="tests-status-badge"
              className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                testSuite.status === 'SUCCESS'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}
            >
              {testSuite.passedTests} / {testSuite.totalTests} PASS
            </span>
          )}
        </div>

        <button
          id="run-tests-action-btn"
          type="button"
          onClick={runTests}
          disabled={isRunning}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-950/40"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>در حال اجرای تست‌ها...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>اجرای آزمون‌های جامع پایش سلامت ({testSuite ? testSuite.totalTests : '۶۰'})</span>
            </>
          )}
        </button>
      </div>

      {lastRunTime && (
        <div className="text-[10px] text-zinc-500 flex items-center justify-between px-1">
          <span>آخرین اجرای موفق: {lastRunTime}</span>
          <span className="text-emerald-500/80 font-mono">100% Deterministic</span>
        </div>
      )}

      {error && (
        <div id="test-runner-error" className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* لیست نتایج آزمون‌ها */}
      {testSuite ? (
        <div id="test-results-list" className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {testSuite.results.map((test, idx) => (
            <div
              key={idx}
              id={`test-item-${idx}`}
              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                test.passed
                  ? 'bg-zinc-950/80 border-zinc-800/80 text-zinc-300'
                  : 'bg-rose-950/40 border-rose-900 text-rose-300'
              }`}
            >
              {test.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-bold font-mono text-[11px] text-zinc-200">{test.name}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{test.details}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded-lg flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>در حال دریافت وضعیت اولیه آزمون‌ها...</span>
        </div>
      )}
    </div>
  );
};
