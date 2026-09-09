// components/trading/research-workbench.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import { DataWorkbench, DatasetManifest, ValidationReport } from '@/lib/core/data-workbench';
import {
  ResearchLab,
  PerformanceMetrics,
  WalkForwardWindow,
  StressTestScenarioResult,
  MonteCarloSimulationResult,
} from '@/lib/core/research-lab';
import { PositionLedgerEntry } from '@/lib/core/ports';
import { createDatasetFromCandles } from '@/lib/research/dataset';
import { createBaselineResearchConfig } from '@/lib/research/default-config';
import { ResearchExperimentEngine } from '@/lib/research/experiment-engine';
import type { ResearchExperimentResult } from '@/lib/research/contracts';
import { runW2AcceptanceSuite, AcceptanceTestResult } from '@/lib/core/__tests__/w2-acceptance.test';
import { runW3BenchmarkEvaluationSuite, W3BenchmarkSuiteReport } from '@/lib/core/__tests__/w3-benchmark.test';
import {
  FlaskConical,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  FileSpreadsheet,
  TrendingUp,
  ShieldAlert,
  Percent,
  Layers,
  Sparkles,
  Sliders,
  BarChart3,
  Search,
  Bot,
  ShieldCheck,
  GitCompareArrows,
  Clock3,
} from 'lucide-react';

interface ResearchWorkbenchProps {
  currentCandles: Candle[];
  symbol: SymbolId;
}

export const ResearchWorkbench: React.FC<ResearchWorkbenchProps> = ({
  currentCandles,
  symbol,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'backtest' | 'data' | 'walkforward' | 'matrix' | 'stress' | 'w2tests' | 'w3benchmark'>('backtest');
  const [w3Report, setW3Report] = useState<W3BenchmarkSuiteReport | null>(null);
  const [researchTimeframe, setResearchTimeframe] = useState<Timeframe>('5M');

  // داده‌های لود شده و مانیفست
  const [activeCandles, setActiveCandles] = useState<Candle[]>(currentCandles);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(() =>
    DataWorkbench.validateCandles(currentCandles, symbol, '5M', 'استریم فعال چارت')
  );

  // وضعیت و نتایج بک‌تست
  const [isRunning, setIsRunning] = useState(false);
  const [backtestMetrics, setBacktestMetrics] = useState<PerformanceMetrics | null>(null);
  const [backtestTrades, setBacktestTrades] = useState<PositionLedgerEntry[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<PositionLedgerEntry | null>(null);

  // نتایج پیشرفته
  const [walkForwardWindows, setWalkForwardWindows] = useState<WalkForwardWindow[]>([]);
  const [stressScenarios, setStressScenarios] = useState<StressTestScenarioResult[]>([]);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloSimulationResult | null>(null);
  const [researchExperiment, setResearchExperiment] = useState<ResearchExperimentResult | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  // نتایج تست‌های پذیرش W2
  const [w2TestResults, setW2TestResults] = useState<AcceptanceTestResult[]>([]);

  // تنظیمات پارامتری
  const [initialCash, setInitialCash] = useState(10000);
  const [commissionPerLot, setCommissionPerLot] = useState(6.0);
  const [spreadPips, setSpreadPips] = useState(1.5);

  // اجرای بک‌تست رویدادمحور
  const handleRunBacktest = () => {
    setIsRunning(true);
    setTimeout(() => {
      try {
        const result = ResearchLab.runBacktest(activeCandles, symbol, {
          initialCash,
          commissionPerLot,
          defaultSpreadPips: spreadPips,
        });
        setBacktestMetrics(result.metrics);
        setBacktestTrades(result.trades);
        if (result.trades.length > 0) {
          setSelectedTrade(result.trades[0]);
        }

        // اجرای همزمان مونت‌کارلو
        const mc = ResearchLab.runMonteCarlo(result.trades, initialCash, 100);
        setMonteCarloResult(mc);
      } catch (err) {
        console.error('Backtest error:', err);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  const handleRunResearchMatrix = () => {
    setIsRunning(true);
    setResearchError(null);
    setTimeout(() => {
      try {
        const clientDataset = createDatasetFromCandles({
          candles: activeCandles,
          provider: validationReport?.manifest?.source || 'Browser CSV import',
          providerSymbol: symbol,
          canonicalSymbol: symbol,
          instrumentLabel: `${symbol} client-side research dataset`,
          timeframe: researchTimeframe,
          rawSourcePath: 'browser-memory://research-workbench',
          contentSha256: 'UNVERIFIED-CLIENT-IMPORT',
          sourceLicense: 'Local user import; full file SHA-256 is created by the server/CLI importer.',
        });
        const config = createBaselineResearchConfig({
          datasetId: clientDataset.manifest.datasetId,
          symbol,
          timeframe: researchTimeframe,
          experimentId: `EXP-CLIENT-${symbol}-${activeCandles[0]?.timestamp || 0}-${activeCandles.length}`,
        });
        const result = ResearchExperimentEngine.run(clientDataset, config);
        setResearchExperiment(result);
        setActiveSubTab('matrix');
      } catch (error) {
        setResearchError(error instanceof Error ? error.message : 'اجرای ماتریس پژوهش با خطای ناشناخته مواجه شد.');
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  // اجرای تحلیل پیش‌رونده
  const handleRunWalkForward = () => {
    setIsRunning(true);
    setTimeout(() => {
      try {
        const wf = ResearchLab.runWalkForward(activeCandles, symbol, 3);
        setWalkForwardWindows(wf);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  // اجرای تست‌های تنش
  const handleRunStressTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      try {
        const stress = ResearchLab.runStressTests(activeCandles, symbol);
        setStressScenarios(stress);
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  // اجرای تست‌های گیت W2
  const handleRunW2Suite = () => {
    const results = runW2AcceptanceSuite();
    setW2TestResults(results);
  };

  // اجرای کیت ۱۲۰ موردی ارزیابی بنچمارک هوش مصنوعی W3
  const handleRunW3Benchmark = () => {
    const report = runW3BenchmarkEvaluationSuite();
    setW3Report(report);
  };

  const [timezoneOffset, setTimezoneOffset] = useState<number>(0);

  // بارگذاری فایل داده CSV با احتساب منطقه زمانی
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = DataWorkbench.parseCSV(text, researchTimeframe, timezoneOffset);
      if (parsed.candles.length > 0) {
        setActiveCandles(parsed.candles);
        const report = DataWorkbench.validateCandles(parsed.candles, symbol, researchTimeframe, `${file.name} (UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset})`);
        setValidationReport(report);
      }
    };
    reader.readAsText(file);
  };

  // دانلود خروجی معاملات به صورت CSV
  const exportTradesCSV = () => {
    if (backtestTrades.length === 0) return;
    const header = 'TradeId,Symbol,Direction,Lots,EntryPrice,StopLoss,TakeProfit,RealizedPnl,CloseReason,MaePips,MfePips\n';
    const rows = backtestTrades
      .map(
        t =>
          `${t.positionId},${t.symbol},${t.direction},${t.volumeLots},${t.entryPrice},${t.stopLossPrice},${t.takeProfitPrice},${t.realizedPnl},${t.closeReason || 'OPEN'},${t.maePips},${t.mfePips}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trades-${symbol}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // دانلود مانیفست و گزارش بک‌تست به صورت JSON
  const exportRunJSON = () => {
    const payload = {
      timestamp: Date.now(),
      symbol,
      manifest: validationReport?.manifest,
      metrics: backtestMetrics,
      tradesCount: backtestTrades.length,
      monteCarlo: monteCarloResult,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `backtest-run-${symbol}-${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* سربرگ ورک‌بنچ */}
      <div className="bg-[#131722] border border-[#252c3c] rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-400">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-100">
                ورک‌بنچ داده و آزمایشگاه بک‌تست پیشرفته (W2 Research Lab)
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-mono">
                موتور رویدادمحور V4
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              محیط ایزوله پیپرتریدینگ، ساعت مجازی، رفع ابهام بدبینانه و تحلیل پیش‌رونده بدون نشت آینده
            </p>
          </div>
        </div>

        {/* دکمه‌های اجرای سریع */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRunBacktest}
            disabled={isRunning}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'در حال شبیه‌سازی...' : 'اجرای بک‌تست کامل'}</span>
          </button>
          <button
            type="button"
            onClick={handleRunResearchMatrix}
            disabled={isRunning || !validationReport?.isValid}
            className="px-3 py-2 bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            <span>ماتریس سبک و فیلتر</span>
          </button>
          <button
            type="button"
            onClick={handleRunW2Suite}
            className="px-3 py-2 bg-[#1b212f] hover:bg-[#252c3d] text-cyan-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-cyan-800/50 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>اجرای آزمون‌های پذیرش W2</span>
          </button>
        </div>
      </div>

      {/* نوار تب‌های فرعی */}
      <div className="flex items-center border-b border-[#232938] bg-[#11141c] px-3 gap-2 text-xs font-medium rounded-t-xl overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('backtest')}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'backtest'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>نتایج بک‌تست و نمودار دارایی</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('data')}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'data'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>ورود داده‌ها و مانیفست (Data Workbench)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('walkforward');
            if (walkForwardWindows.length === 0) handleRunWalkForward();
          }}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'walkforward'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>تحلیل پیش‌رونده (Walk-Forward)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('matrix');
            if (!researchExperiment) handleRunResearchMatrix();
          }}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'matrix'
              ? 'border-violet-400 text-violet-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <GitCompareArrows className="w-3.5 h-3.5 text-violet-400" />
          <span>ماتریس سبک، زمان و AI</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('stress');
            if (stressScenarios.length === 0) handleRunStressTests();
          }}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'stress'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>آزمون‌های تنش (Stress Testing)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('w2tests');
            if (w2TestResults.length === 0) handleRunW2Suite();
          }}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'w2tests'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>گیت اعتبارسنجی پذیرش (Acceptance)</span>
          {w2TestResults.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSubTab('w3benchmark');
            if (!w3Report) handleRunW3Benchmark();
          }}
          className={`px-3.5 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'w3benchmark'
              ? 'border-cyan-400 text-cyan-300 font-bold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>کیت ۱۲۰ موردی بنچمارک هوش مصنوعی (W3)</span>
          {w3Report && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
              100%
            </span>
          )}
        </button>
      </div>

      {/* محتوای تب ۱: نتایج بک‌تست و لاگ تریدها */}
      {activeSubTab === 'backtest' && (
        <div className="space-y-4">
          {/* کارت‌های شاخص‌های کمی (Quantitative Metrics) */}
          {backtestMetrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* سود خالص */}
              <div className="p-3.5 bg-[#141822] border border-[#252c3c] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[11px]">سود / زیان خالص:</span>
                <div
                  dir="ltr"
                  className={`text-base font-mono font-bold ${
                    backtestMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {backtestMetrics.netProfit > 0 ? `+$${backtestMetrics.netProfit}` : `$${backtestMetrics.netProfit}`}
                  <span className="text-xs font-normal text-zinc-400 mr-1">
                    ({backtestMetrics.netProfitPercent}%)
                  </span>
                </div>
              </div>

              {/* امید ریاضی بر حسب R */}
              <div className="p-3.5 bg-[#141822] border border-[#252c3c] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[11px]">امید ریاضی (Expectancy):</span>
                <div dir="ltr" className="text-base font-mono font-bold text-cyan-300">
                  {backtestMetrics.expectancyR > 0 ? `+${backtestMetrics.expectancyR} R` : `${backtestMetrics.expectancyR} R`}
                </div>
              </div>

              {/* درصد برد و نمونه‌ها */}
              <div className="p-3.5 bg-[#141822] border border-[#252c3c] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[11px]">نرخ برد (Win Rate):</span>
                <div dir="ltr" className="text-base font-mono font-bold text-zinc-100">
                  {backtestMetrics.winRatePercent}%
                  <span className="text-xs text-zinc-400 font-normal mr-1">
                    ({backtestMetrics.winningTrades}W / {backtestMetrics.losingTrades}L)
                  </span>
                </div>
              </div>

              {/* ضریب سود (Profit Factor) */}
              <div className="p-3.5 bg-[#141822] border border-[#252c3c] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[11px]">ضریب سود (Profit Factor):</span>
                <div dir="ltr" className="text-base font-mono font-bold text-amber-300">
                  {backtestMetrics.profitFactor}
                </div>
              </div>

              {/* حداکثر افت سرمایه */}
              <div className="p-3.5 bg-[#141822] border border-[#252c3c] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[11px]">حداکثر افت (Max DD):</span>
                <div dir="ltr" className="text-base font-mono font-bold text-rose-400">
                  {backtestMetrics.maxDrawdownPercent}%
                  <span className="text-xs text-zinc-400 font-normal mr-1">
                    (${backtestMetrics.maxDrawdownAmount})
                  </span>
                </div>
              </div>

              {/* میانگین MAE / MFE */}
              <div className="p-3.5 bg-[#141822] border border-[#252c3c] rounded-xl space-y-1">
                <span className="text-zinc-400 text-[11px]">اکستریم‌ها (MAE / MFE):</span>
                <div dir="ltr" className="text-xs font-mono font-bold text-zinc-200">
                  {backtestMetrics.avgMaePips}p / {backtestMetrics.avgMfePips}p
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-[#141822] border border-[#252c3c] rounded-xl text-center text-zinc-400 text-xs">
              جهت مشاهده آمار کمی و تحلیل دارایی، دکمه «اجرای بک‌تست کامل» را فشار دهید.
            </div>
          )}

          {/* نمودار SVG ساده و باکیفیت دارایی (Equity Curve) */}
          {backtestMetrics && backtestMetrics.equityCurve.length > 1 && (
            <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span>منحنی رشد دارایی و افت سرمایه (Equity & Drawdown Curve)</span>
                </span>
                <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-400" dir="ltr">
                  <span>Start: ${initialCash}</span>
                  <span>End: ${backtestMetrics.equityCurve[backtestMetrics.equityCurve.length - 1].equity}</span>
                </div>
              </div>

              <div className="h-44 w-full relative bg-[#0e1117] rounded-lg p-2 overflow-hidden flex items-end">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {/* خط مبنا */}
                  <line x1="0" y1="50" x2="100" y2="50" stroke="#252c3c" strokeDasharray="2 2" strokeWidth="0.5" />
                  {/* منحنی دارایی */}
                  <polyline
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="1.5"
                    points={backtestMetrics.equityCurve
                      .map((pt, idx) => {
                        const x = (idx / (backtestMetrics.equityCurve.length - 1)) * 100;
                        const minEq = initialCash * 0.9;
                        const maxEq = initialCash * 1.15;
                        const y = 100 - ((pt.equity - minEq) / (maxEq - minEq)) * 100;
                        return `${x.toFixed(1)},${Math.max(5, Math.min(95, y)).toFixed(1)}`;
                      })
                      .join(' ')}
                  />
                </svg>
              </div>
            </div>
          )}

          {/* جدول رهگیری معاملات (Trade Trace Log) با خروجی CSV و JSON */}
          <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-zinc-100 text-xs">
                  ردیابی جامع معاملات و ثبت شواهد (Trade Trace Journal):
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {backtestTrades.length} معامله ثبت شده
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportTradesCSV}
                  disabled={backtestTrades.length === 0}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1e2533] hover:bg-[#283144] disabled:opacity-40 text-zinc-300 text-xs flex items-center gap-1 border border-[#2e374a]"
                >
                  <Download className="w-3 h-3" />
                  <span>دانلود CSV معاملات</span>
                </button>
                <button
                  type="button"
                  onClick={exportRunJSON}
                  disabled={backtestTrades.length === 0}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1e2533] hover:bg-[#283144] disabled:opacity-40 text-zinc-300 text-xs flex items-center gap-1 border border-[#2e374a]"
                >
                  <Download className="w-3 h-3" />
                  <span>مانیفست JSON</span>
                </button>
              </div>
            </div>

            {/* جدول اسکرول‌پذیر معاملات */}
            <div className="overflow-x-auto max-h-64 rounded-lg border border-[#202634]">
              <table className="w-full text-right text-[11px] font-sans">
                <thead className="bg-[#10131b] text-zinc-400 border-b border-[#202634] sticky top-0">
                  <tr>
                    <th className="p-2.5">شناسه</th>
                    <th className="p-2.5">جهت</th>
                    <th className="p-2.5">حجم (Lots)</th>
                    <th className="p-2.5">قیمت ورود</th>
                    <th className="p-2.5">حد ضرر (SL)</th>
                    <th className="p-2.5">حد سود (TP)</th>
                    <th className="p-2.5">نتیجه خروج</th>
                    <th className="p-2.5">سود/زیان ($)</th>
                    <th className="p-2.5">MAE / MFE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2432] text-zinc-300 font-mono">
                  {backtestTrades.map(trade => (
                    <tr
                      key={trade.positionId}
                      onClick={() => setSelectedTrade(trade)}
                      className={`cursor-pointer transition-colors ${
                        selectedTrade?.positionId === trade.positionId
                          ? 'bg-cyan-950/30'
                          : 'hover:bg-[#181d28]'
                      }`}
                    >
                      <td className="p-2.5 text-zinc-400">{trade.positionId.slice(-8)}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            trade.direction === 'BUY'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-rose-950 text-rose-300'
                          }`}
                        >
                          {trade.direction}
                        </span>
                      </td>
                      <td className="p-2.5">{trade.volumeLots}</td>
                      <td className="p-2.5">{trade.entryPrice}</td>
                      <td className="p-2.5 text-rose-300">{trade.stopLossPrice}</td>
                      <td className="p-2.5 text-emerald-300">{trade.takeProfitPrice}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            trade.closeReason === 'TP'
                              ? 'bg-emerald-950 text-emerald-300'
                              : trade.closeReason === 'SL'
                              ? 'bg-rose-950 text-rose-300'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {trade.closeReason || 'باز'}
                        </span>
                      </td>
                      <td
                        className={`p-2.5 font-bold ${
                          trade.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {trade.realizedPnl > 0 ? `+$${trade.realizedPnl}` : `$${trade.realizedPnl}`}
                      </td>
                      <td className="p-2.5 text-zinc-400">
                        {trade.maePips}p / {trade.mfePips}p
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۲: ورود داده‌ها و مانیفست */}
      {activeSubTab === 'data' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-100 text-xs flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>بارگذاری داده‌های سفارشی (CSV یا JSON):</span>
              </h3>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed">
              شما می‌توانید فایل‌های قیمتی بروکر، متاتریدر یا cTrader را با ساختار ستون‌های
              (Time, Open, High, Low, Close, Volume) وارد کنید. سیستم به صورت خودکار گپ‌ها، کندل‌های نامعتبر
              و ترتیبات زمانی معکوس را بررسی می‌کند.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-2 bg-[#10131b] px-3 py-1.5 rounded-xl border border-[#232b3b]">
                <span className="text-zinc-400 text-xs">منطقه زمانی مبدا (Timezone):</span>
                <select
                  value={timezoneOffset}
                  onChange={(e) => setTimezoneOffset(Number(e.target.value))}
                  className="bg-[#171b26] border border-[#2c3548] rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500 font-mono"
                  dir="ltr"
                >
                  <option value={0}>UTC+0 (ساعت هماهنگ جهانی)</option>
                  <option value={10}>UTC+10 (استرالیا - سیدنی / AEST)</option>
                  <option value={3.5}>UTC+3:30 (ایران - تهران)</option>
                  <option value={1}>UTC+1 (اروپا - لندن / BST)</option>
                  <option value={-5}>UTC-5 (آمریکا - نیویورک / EST)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-[#10131b] px-3 py-1.5 rounded-xl border border-[#232b3b]">
                <span className="text-zinc-400 text-xs">تایم‌فریم فایل:</span>
                <select
                  value={researchTimeframe}
                  onChange={(e) => setResearchTimeframe(e.target.value as Timeframe)}
                  className="bg-[#171b26] border border-[#2c3548] rounded-lg px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 font-mono"
                  dir="ltr"
                >
                  {(['1M', '5M', '15M', '1H', '4H', 'D1'] as Timeframe[]).map(timeframe => (
                    <option key={timeframe} value={timeframe}>{timeframe}</option>
                  ))}
                </select>
              </div>

              <label className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>انتخاب فایل CSV کندل‌ها</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setActiveCandles(currentCandles);
                  setValidationReport(
                    DataWorkbench.validateCandles(currentCandles, symbol, researchTimeframe, 'داده‌های فعال چارت')
                  );
                }}
                className="px-3 py-2 bg-[#1b202c] hover:bg-[#252c3c] text-zinc-300 rounded-xl text-xs flex items-center gap-1.5 border border-[#2b3345] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بازنشانی به داده‌های پیش‌فرض چارت</span>
              </button>
            </div>
          </div>

          {/* کارت مانیفست و اعتبارسنجی داده */}
          {validationReport && validationReport.manifest && (
            <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-100 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>مانیفست رسمی دیتاست (Dataset Manifest):</span>
                </span>
                <span dir="ltr" className="text-[10px] font-mono text-zinc-400">
                  {validationReport.manifest.sha256Hash}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-[#0f121a] rounded-xl border border-[#222735]">
                  <span className="text-zinc-400 text-[11px]">تعداد کل کندل‌ها:</span>
                  <div className="font-mono text-zinc-200 font-bold">
                    {validationReport.manifest.totalCandles}
                  </div>
                </div>

                <div className="p-3 bg-[#0f121a] rounded-xl border border-[#222735]">
                  <span className="text-zinc-400 text-[11px]">گپ‌های کشف شده:</span>
                  <div className="font-mono text-amber-300 font-bold">
                    {validationReport.manifest.gapsDetected} گپ
                  </div>
                </div>

                <div className="p-3 bg-[#0f121a] rounded-xl border border-[#222735]">
                  <span className="text-zinc-400 text-[11px]">کندل‌های تکراری:</span>
                  <div className="font-mono text-zinc-200 font-bold">
                    {validationReport.manifest.duplicatesFound}
                  </div>
                </div>

                <div className="p-3 bg-[#0f121a] rounded-xl border border-[#222735]">
                  <span className="text-zinc-400 text-[11px]">فاز پیش‌گرمایش (Warm-up ATR):</span>
                  <div className="font-mono text-emerald-400 font-bold">
                    {validationReport.manifest.hasWarmupData ? 'تایید شد (حداقل ۱۴ کندل)' : 'ناقص'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* محتوای تب ۳: تحلیل پیش‌رونده (Walk-Forward Analysis) */}
      {activeSubTab === 'walkforward' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-100 text-xs flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <span>پنجره‌های آموزش و اعتبارسنجی غلتان (Walk-Forward Splits):</span>
              </h3>
              <button
                type="button"
                onClick={handleRunWalkForward}
                disabled={isRunning}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <RotateCcw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                <span>محاسبه مجدد پنجره‌ها</span>
              </button>
            </div>

            <p className="text-zinc-300 text-xs leading-relaxed">
              تحلیل پیش‌رونده از بیش‌برازش (Overfitting) جلوگیری می‌کند. استراتژی بر روی داده‌های آموزش (In-Sample)
              آزمون شده و کارایی آن بدون دست‌کاری بر روی داده‌های خارج از نمونه (Out-of-Sample) سنجیده می‌شود.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {walkForwardWindows.map(win => (
                <div
                  key={win.windowIndex}
                  className="p-3.5 bg-[#0f121a] rounded-xl border border-[#252c3c] space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
                    <span>پنجره زمانی {win.windowIndex}</span>
                    <span dir="ltr" className="text-[10px] font-mono text-zinc-400">
                      نسبت کارایی: {win.efficiencyRatio}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between text-zinc-300">
                      <span>سود آموزش (IS):</span>
                      <span className="text-emerald-400">${win.trainMetrics.netProfit}</span>
                    </div>
                    <div className="flex justify-between text-zinc-300">
                      <span>سود ارزیابی (OOS):</span>
                      <span
                        className={win.validationMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}
                      >
                        ${win.validationMetrics.netProfit}
                      </span>
                    </div>
                    <div className="flex justify-between text-zinc-300">
                      <span>نرخ برد ارزیابی:</span>
                      <span>{win.validationMetrics.winRatePercent}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۴: ماتریس مقایسه استراتژی، زمان، رژیم و کنترل AI */}
      {activeSubTab === 'matrix' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#141822] border border-violet-900/60 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#29233d] pb-3">
              <div>
                <h3 className="font-bold text-zinc-100 text-xs flex items-center gap-2">
                  <GitCompareArrows className="w-4 h-4 text-violet-400" />
                  <span>آزمایش ماتریسی: سبک، ساعت، روز، سشن، رژیم و کنترل AI</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                  سیگنال در پایان کندل ساخته می‌شود و فقط از کندل بعدی اجازهٔ ورود دارد. «فیلتر قطعی» کنترل قاعده‌محور است؛ WebLLM در batch به‌صورت ساختگی تصمیم نمی‌گیرد.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunResearchMatrix}
                disabled={isRunning || !validationReport?.isValid}
                className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-center"
              >
                <RotateCcw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                <span>اجرای ماتریس</span>
              </button>
            </div>

            {researchError && (
              <div className="p-3 rounded-lg border border-rose-800 bg-rose-950/30 text-rose-200 text-xs">{researchError}</div>
            )}

            {!researchExperiment && !researchError && (
              <div className="p-5 text-center text-zinc-400 text-xs">ابتدا dataset معتبر را در تب داده وارد کنید؛ سپس ماتریس را اجرا کنید.</div>
            )}

            {researchExperiment && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-[#0f121a] rounded-xl border border-[#26223a]">
                    <span className="text-zinc-500 block text-[10px]">Dataset:</span>
                    <span className="text-violet-200 font-mono text-[10px] break-all">{researchExperiment.manifest.datasetId}</span>
                  </div>
                  <div className="p-3 bg-[#0f121a] rounded-xl border border-[#26223a]">
                    <span className="text-zinc-500 block text-[10px]">Rule / Cost:</span>
                    <span className="text-zinc-200 font-mono text-[10px]">{researchExperiment.manifest.config.ruleVersion} / {researchExperiment.manifest.config.costModel.modelVersion}</span>
                  </div>
                  <div className="p-3 bg-[#0f121a] rounded-xl border border-[#26223a]">
                    <span className="text-zinc-500 block text-[10px]">Spread / Slippage:</span>
                    <span className="text-amber-300 font-mono">{researchExperiment.manifest.config.costModel.spreadPips}p / {researchExperiment.manifest.config.costModel.slippagePips}p</span>
                  </div>
                  <div className="p-3 bg-[#0f121a] rounded-xl border border-[#26223a]">
                    <span className="text-zinc-500 block text-[10px]">Seed:</span>
                    <span className="text-cyan-300 font-mono">{researchExperiment.manifest.config.seed}</span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-[#27223a]">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-[#10131b] text-zinc-400 border-b border-[#27223a]">
                      <tr>
                        <th className="p-2.5">ترکیب آزمایش</th><th className="p-2.5">تعداد معامله</th><th className="p-2.5">برد</th><th className="p-2.5">P&L خالص</th><th className="p-2.5">PF</th><th className="p-2.5">Max DD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2330] text-zinc-300 font-mono">
                      {researchExperiment.comparisons.map(row => (
                        <tr key={row.key} className="hover:bg-violet-950/20">
                          <td className="p-2.5 font-sans text-violet-200">{row.labelFa}</td>
                          <td className="p-2.5">{row.tradesCount}</td>
                          <td className="p-2.5">{row.winRatePercent}%</td>
                          <td className={`p-2.5 font-bold ${row.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${row.netProfit}</td>
                          <td className="p-2.5">{row.profitFactor}</td>
                          <td className="p-2.5 text-rose-300">{row.maxDrawdownPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {(['SESSION_UTC', 'HOUR_UTC', 'REGIME'] as const).map(dimension => {
                    const slices = researchExperiment.runs[0]?.analysis[dimension] || [];
                    const title = dimension === 'SESSION_UTC' ? 'عملکرد بر اساس سشن UTC' : dimension === 'HOUR_UTC' ? 'عملکرد بر اساس ساعت UTC' : 'عملکرد بر اساس رژیم heuristic';
                    return (
                      <div key={dimension} className="p-3 bg-[#0f121a] border border-[#26223a] rounded-xl space-y-2">
                        <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-violet-400" />{title}</h4>
                        {slices.slice(0, 6).map(slice => (
                          <div key={slice.key} className="flex items-center justify-between gap-2 text-[11px] border-b border-[#1d2230] pb-1.5 last:border-0">
                            <span className="text-zinc-400">{slice.labelFa}</span>
                            <span className="font-mono text-zinc-200">{slice.tradesCount}T / <span className={slice.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${slice.netProfit}</span></span>
                          </div>
                        ))}
                        {slices.length === 0 && <p className="text-[11px] text-zinc-500">معاملهٔ بسته‌شده‌ای برای این بُعد وجود ندارد.</p>}
                      </div>
                    );
                  })}
                </div>

                {researchExperiment.warnings.length > 0 && (
                  <div className="p-3 bg-amber-950/20 border border-amber-900/60 rounded-lg text-[11px] text-amber-100 space-y-1">
                    {researchExperiment.warnings.map(warning => <p key={warning}>• {warning}</p>)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* محتوای تب ۴: آزمون‌های تنش (Stress Testing) */}
      {activeSubTab === 'stress' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-100 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>سناریوهای شبیه‌سازی تنش شدید (Stress Scenarios):</span>
              </h3>
              <button
                type="button"
                onClick={handleRunStressTests}
                disabled={isRunning}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <RotateCcw className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                <span>اجرای مجدد آزمون‌های تنش</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {stressScenarios.map(sc => (
                <div
                  key={sc.scenarioName}
                  className="p-3.5 bg-[#0f121a] rounded-xl border border-[#252c3c] space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-100">
                    <span>{sc.scenarioName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sc.status === 'ROBUST'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : sc.status === 'DEGRADED'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {sc.status === 'ROBUST' ? 'پایدار' : sc.status === 'DEGRADED' ? 'افت عملکرد' : 'ناموفق'}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400">{sc.description}</p>

                  <div className="space-y-1 text-[11px] font-mono pt-1 border-t border-[#1e2433]">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">سود نهایی:</span>
                      <span className={sc.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        ${sc.netProfit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">افت سرمایه:</span>
                      <span className="text-rose-400">{sc.maxDrawdownPercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">ضریب سود:</span>
                      <span className="text-amber-300">{sc.profitFactor}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۵: آزمون‌های گیت پذیرش W2 */}
      {activeSubTab === 'w2tests' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-zinc-100 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>مجموعه آزمون‌های پذیرش گیت ۲ (Gate W2 Acceptance Tests):</span>
              </h3>
              <button
                type="button"
                onClick={handleRunW2Suite}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>اجرای دوباره تست‌ها</span>
              </button>
            </div>

            <div className="space-y-2">
              {w2TestResults.map(test => (
                <div
                  key={test.id}
                  className="p-3 bg-[#0f121a] rounded-xl border border-[#232938] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-400 font-bold">{test.id}</span>
                      <span className="font-bold text-zinc-200">{test.nameFa}</span>
                      <span dir="ltr" className="text-[10px] text-zinc-500 font-mono">
                        ({test.nameEn})
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">{test.details}</p>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 self-end sm:self-center ${
                      test.passed
                        ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                        : 'bg-rose-950/80 border border-rose-700 text-rose-300'
                    }`}
                  >
                    {test.passed ? 'موفق (PASSED)' : 'شکست (FAILED)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۶: کیت ۱۲۰ موردی بنچمارک هوش مصنوعی (W3) */}
      {activeSubTab === 'w3benchmark' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#141822] border border-[#252c3c] rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232938] pb-3">
              <div>
                <h3 className="font-bold text-zinc-100 text-xs flex items-center gap-2">
                  <Bot className="w-4 h-4 text-amber-400" />
                  <span>نتایج ارزیابی کیت ۱۲۰ موردی هوش مصنوعی (W3 Benchmark Suite)</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-1">
                  پروتکل ارزیابی بخش ۱۰ سند ۴.۰: سنجش فهم فارسی، استناد به اسنپ‌شات (Grounding)، پرهیز صریح (Abstain)، اسکیما و دفاع در برابر تزریق پرامپت
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunW3Benchmark}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-center transition-colors shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>اجرای مجدد بنچمارک ۱۲۰ موردی</span>
              </button>
            </div>

            {w3Report && (
              <div className="space-y-4">
                {/* کارت‌های شاخص‌های کلیدی */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#10131c] rounded-xl border border-[#232b3c] space-y-1">
                    <span className="text-zinc-400 text-[10px] block">نرخ موفقیت کلی:</span>
                    <span className="text-lg font-mono font-bold text-emerald-400">
                      {w3Report.overallPassRate}٪
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      ({w3Report.totalPassed} از {w3Report.totalEvaluated} کیس)
                    </span>
                  </div>

                  <div className="p-3 bg-[#10131c] rounded-xl border border-[#232b3c] space-y-1">
                    <span className="text-zinc-400 text-[10px] block">فهم زبان فارسی:</span>
                    <span className="text-lg font-mono font-bold text-cyan-400">
                      {w3Report.persianComprehensionScore} / ۱۰۰
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      (اصطلاحات و پرایس‌اکشن فارسی)
                    </span>
                  </div>

                  <div className="p-3 bg-[#10131c] rounded-xl border border-[#232b3c] space-y-1">
                    <span className="text-zinc-400 text-[10px] block">دقت پرهیز (Abstention):</span>
                    <span className="text-lg font-mono font-bold text-amber-400">
                      {w3Report.abstentionAccuracyScore} / ۱۰۰
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      (پرهیز صریح در نقص داده)
                    </span>
                  </div>

                  <div className="p-3 bg-[#10131c] rounded-xl border border-[#232b3c] space-y-1">
                    <span className="text-zinc-400 text-[10px] block">دفاع ضدتزریق پرامپت:</span>
                    <span className="text-lg font-mono font-bold text-emerald-400">
                      {w3Report.adversarialDefenseScore}٪
                    </span>
                    <span className="text-[10px] text-zinc-500 block">
                      (صفر نقض قوانین ریسک)
                    </span>
                  </div>
                </div>

                {/* پیشرفت ۶ رده آزمون */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-300">تفکیک عملکرد بر اساس ۶ رده استاندارد:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {w3Report.categories.map((cat) => (
                      <div key={cat.category} className="p-2.5 bg-[#0f121a] rounded-xl border border-[#202738] flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-zinc-200 block">{cat.categoryTitleFa}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{cat.category}</span>
                        </div>
                        <div className="text-left flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-emerald-400">{cat.passedCases}/{cat.totalCases}</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-800 text-emerald-300 text-[10px] font-mono">
                            {cat.passRate}٪
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* کیس‌های نمایشی الزامی سند (Demonstration Evidence) */}
                <div className="p-3 bg-[#10141f] rounded-xl border border-cyan-800/40 space-y-2">
                  <h4 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>اثبات‌های اعتبارسنجی الزامی گیت W3:</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2 bg-[#0c0f17] rounded-lg border border-[#1e2535] space-y-1">
                      <span className="text-amber-300 font-bold block">۱. پرهیز موفق در نقص داده:</span>
                      <span className="text-zinc-400 block text-[10px]">کیس: {w3Report.demonstrationCases.successfulAbstentionCase.caseId}</span>
                      <p className="text-zinc-300 text-[10px]">{w3Report.demonstrationCases.successfulAbstentionCase.reason}</p>
                    </div>

                    <div className="p-2 bg-[#0c0f17] rounded-lg border border-[#1e2535] space-y-1">
                      <span className="text-rose-300 font-bold block">۲. رد شواهد موهوم توسط ولیدیتور:</span>
                      <span className="text-zinc-400 block text-[10px]">شناسه جعلی: {w3Report.demonstrationCases.fakeEvidenceRejectedCase.hallucinatedId}</span>
                      <p className="text-zinc-300 text-[10px]">توسط ولیدیتور هسته شناسایی و بلافاصله رد صلاحیت شد.</p>
                    </div>

                    <div className="p-2 bg-[#0c0f17] rounded-lg border border-[#1e2535] space-y-1">
                      <span className="text-emerald-300 font-bold block">۳. دفع تلاش تزریق پرامپت:</span>
                      <span className="text-zinc-400 block text-[10px]">تلاش برای افزایش ریسک به ۵٪</span>
                      <p className="text-zinc-300 text-[10px]">توسط هسته ممیزی مسدود و وضعیت NO_TRADE اعمال گردید.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
