'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { EnvironmentNavBar } from '@/components/navigation/environment-nav-bar';
import { MultiStyleBacktestModal } from '@/components/trading/multi-style-backtest-modal';
import { DataProvenance } from '@/lib/contracts/provenance';
import { SymbolId, Candle, SYMBOL_SPECS, Timeframe } from '@/lib/contracts/market';
import { TradingStyleType, TRADING_STYLES_CONFIG } from '@/lib/contracts/regimes';
import {
  StrategyParameters,
  getDefaultStrategyParameters,
  StrategyPreset,
} from '@/lib/contracts/strategy-parameters';
import { EndOfDataPolicy } from '@/lib/core/ports';
import { DataWorkbench, ValidationReport } from '@/lib/core/data-workbench';
import { PerformanceMetrics } from '@/lib/core/research-lab';
import { GOLD_CANDLES_FIXTURE_5M } from '@/lib/replay/fixtures/gold-candles';
import { getBundledDataset } from '@/lib/research/bundled-historical-datasets';
import { useResearchBacktestWorker } from '@/hooks/use-research-backtest-worker';
import {
  FlaskConical,
  Database,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Play,
  Upload,
  Info,
  RotateCcw,
  XCircle,
  SlidersHorizontal,
  Layers,
  Activity,
  Zap,
} from 'lucide-react';

const AVAILABLE_SYMBOLS: SymbolId[] = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
const AVAILABLE_TIMEFRAMES: Timeframe[] = ['5M', '15M', '1H', '4H', 'D1'];

export default function ResearchPage() {
  const [viewMode, setViewMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');
  const [isBacktestModalOpen, setIsBacktestModalOpen] = useState(false);

  // وضعیت‌های مسیر ۶ مرحله‌ای پژوهش
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [symbol, setSymbol] = useState<SymbolId>('GBPUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('15M');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [sourceName, setSourceName] = useState<string>('هنوز داده‌ای انتخاب نشده است');
  const [isUserUploaded, setIsUserUploaded] = useState(false);
  const [datasetProvider, setDatasetProvider] = useState<string>('HistData');

  // زمان‌سنجی فازهای مختلف
  const [parseTimeMs, setParseTimeMs] = useState<number | null>(null);
  const [validationTimeMs, setValidationTimeMs] = useState<number | null>(null);
  const [backtestTimeMs, setBacktestTimeMs] = useState<number | null>(null);

  // انتخاب استراتژی و پارامترها
  const [strategy, setStrategy] = useState<TradingStyleType>('SMC_INTRADAY');
  const [strategyPreset, setStrategyPreset] = useState<StrategyPreset>('BALANCED');
  const [strategyParams, setStrategyParams] = useState<StrategyParameters>(() =>
    getDefaultStrategyParameters('BALANCED')
  );

  // پارامترهای هزینه و ریسک
  const [riskPercent, setRiskPercent] = useState<number>(0.25);
  const [spreadPips, setSpreadPips] = useState<number>(() => SYMBOL_SPECS.GBPUSD.typicalSpreadPips);
  const [commissionPerLot, setCommissionPerLot] = useState<number>(
    () => SYMBOL_SPECS.GBPUSD.commissionPerLot
  );
  const [additionalSlippagePips, setAdditionalSlippagePips] = useState<number>(0);
  const [endOfDataPolicy, setEndOfDataPolicy] = useState<EndOfDataPolicy>('CLOSE_AT_LAST_CLOSE');

  // نتایج و خطای بکتست
  const [backtestResult, setBacktestResult] = useState<PerformanceMetrics | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialTime] = useState(() => Date.now());

  // هوک اختصاصی اجرای بکتست خارج از نخ اصلی
  const { run: runWorkerBacktest, cancel: cancelWorkerBacktest, isRunning, progress } =
    useResearchBacktestWorker();

  // پاکسازی نتایج و اعتبارسنجی هنگام تغییر نماد یا تایم‌فریم
  const handleSymbolChange = (newSymbol: SymbolId) => {
    setSymbol(newSymbol);
    setCandles([]);
    setBacktestResult(null);
    setErrorMessage(null);
    setParseTimeMs(null);
    setValidationTimeMs(null);
    setBacktestTimeMs(null);
    setSourceName('هنوز داده‌ای انتخاب نشده است');
    setSpreadPips(SYMBOL_SPECS[newSymbol].typicalSpreadPips);
    setCommissionPerLot(SYMBOL_SPECS[newSymbol].commissionPerLot);
    setCurrentStep(1);
  };

  const handleTimeframeChange = (newTf: Timeframe) => {
    setSelectedTimeframe(newTf);
    setCandles([]);
    setBacktestResult(null);
    setErrorMessage(null);
    setParseTimeMs(null);
    setValidationTimeMs(null);
    setBacktestTimeMs(null);
    setSourceName('هنوز داده‌ای انتخاب نشده است');
    setCurrentStep(1);
  };

  const provenance: DataProvenance = useMemo(
    () => ({
      originType: isUserUploaded
        ? 'USER_IMPORTED_CSV'
        : candles.length > 0
        ? 'BUNDLED_HISTORICAL'
        : 'SAMPLE_FIXTURE',
      originLabelFa: isUserUploaded
        ? 'دادهٔ واردشده توسط کاربر (CSV)'
        : candles.length > 0
        ? `دیتاست تاریخی آماده (${datasetProvider})`
        : 'در انتظار انتخاب داده',
      datasetId: `dataset-${symbol.toLowerCase()}-${selectedTimeframe.toLowerCase()}`,
      symbol,
      timeframe: selectedTimeframe,
      timezone: 'UTC',
      lastReceivedAt: initialTime,
      freshnessStatus: 'FRESH',
      stalenessThresholdMs: 86_400_000,
      isVerifiedRealData: candles.length > 0,
      notesFa:
        'محیط پژوهش تاریخی رویدادمحور؛ محاسبات کاملاً آفلاین؛ بدون ارسال سفارش به بروکر واقعی.',
    }),
    [isUserUploaded, candles.length, symbol, selectedTimeframe, datasetProvider, initialTime]
  );

  // اعتبارسنجی کیفیت داده
  const dataValidation: ValidationReport = useMemo(() => {
    if (candles.length === 0) {
      return {
        isValid: false,
        errors: ['هیچ کندلی بارگذاری نشده است.'],
        warnings: [],
        gapSummary: [],
      };
    }
    return DataWorkbench.validateCandles(candles, symbol, selectedTimeframe, sourceName);
  }, [candles, symbol, selectedTimeframe, sourceName]);

  // گام ۱: بارگذاری دیتای آماده بر اساس نماد و تایم‌فریم انتخابی
  const handleLoadBundledData = async () => {
    setErrorMessage(null);
    try {
      const dataset = getBundledDataset(symbol, selectedTimeframe);
      if (!dataset) {
        throw new Error(
          `دیتاست آماده برای ترکیب نماد ${symbol} و تایم‌فریم ${selectedTimeframe} موجود نیست.`
        );
      }

      const t0 = performance.now();
      const response = await fetch(dataset.url);
      if (!response.ok) {
        throw new Error(`خطای HTTP در دریافت فایل دیتاست (کد وضعیت ${response.status})`);
      }
      const text = await response.text();
      if (!text || text.trim().length === 0) {
        throw new Error('فایل دیتاست دریافت شده خالی است.');
      }

      const parsed = DataWorkbench.parseCSV(text, selectedTimeframe, 0);
      const parseDuration = Number((performance.now() - t0).toFixed(1));
      setParseTimeMs(parseDuration);

      if (parsed.candles.length < 14) {
        throw new Error(
          `تعداد کندل‌های خوانده‌شده (${parsed.candles.length}) کمتر از حداقل ۱۴ عدد است.`
        );
      }

      const tVal0 = performance.now();
      DataWorkbench.validateCandles(parsed.candles, symbol, selectedTimeframe, dataset.source);
      setValidationTimeMs(Number((performance.now() - tVal0).toFixed(1)));

      setCandles(parsed.candles);
      setDatasetProvider(dataset.source);
      setSourceName(`دیتاست آماده ${dataset.labelFa} (${parsed.candles.length.toLocaleString('fa-IR')} کندل)`);
      setIsUserUploaded(false);
      setCurrentStep(2);
    } catch (err) {
      setErrorMessage(`خطا در بارگذاری دیتاست: ${(err as Error).message}`);
    }
  };

  // گام ۱: آپلود فایل CSV اختصاصی کاربر
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);

    const t0 = performance.now();
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = typeof event.target?.result === 'string' ? event.target.result : '';
        if (!text || text.trim().length === 0) {
          setErrorMessage('فایل انتخاب‌شده خالی است.');
          return;
        }

        const parsed = DataWorkbench.parseCSV(text, selectedTimeframe, 0);
        const parseDuration = Number((performance.now() - t0).toFixed(1));
        setParseTimeMs(parseDuration);

        if (parsed.candles.length === 0) {
          setErrorMessage(
            'فایل کندل قابل خواندن نیست. ستون‌های time/date، open، high، low و close را کنترل کنید.'
          );
          return;
        }

        const tVal0 = performance.now();
        DataWorkbench.validateCandles(parsed.candles, symbol, selectedTimeframe, file.name);
        setValidationTimeMs(Number((performance.now() - tVal0).toFixed(1)));

        setCandles(parsed.candles);
        setDatasetProvider('کاربر (CSV)');
        setSourceName(`دادهٔ واردشده توسط کاربر: ${file.name} (${parsed.candles.length.toLocaleString('fa-IR')} کندل)`);
        setIsUserUploaded(true);
        setCurrentStep(2);
      } catch (err) {
        setErrorMessage(`خطا در پردازش فایل CSV: ${(err as Error).message}`);
      }
    };
    reader.onerror = () => setErrorMessage('خطا در خواندن فایل از حافظه محلی.');
    reader.readAsText(file);
    e.target.value = '';
  };

  // مدیریت پریست‌های استراتژی
  const handlePresetChange = (preset: StrategyPreset) => {
    setStrategyPreset(preset);
    setStrategyParams(getDefaultStrategyParameters(preset));
  };

  const handleResetStrategyParams = () => {
    setStrategyParams(getDefaultStrategyParameters(strategyPreset));
  };

  // گام ۵: اجرای آزمایش بک‌تست تاریخی از طریق Web Worker
  const handleRunBacktest = async () => {
    if (candles.length < 14 || !dataValidation.isValid) {
      setErrorMessage('داده‌های کافی یا معتبر برای اجرای بک‌تست وجود ندارد.');
      return;
    }

    setErrorMessage(null);
    setBacktestResult(null);
    const t0 = performance.now();

    try {
      const runResult = await runWorkerBacktest(candles, symbol, {
        initialCash: 10000,
        commissionPerLot,
        defaultSpreadPips: spreadPips,
        additionalSlippagePips,
        style: strategy,
        timeframe: selectedTimeframe,
        riskPercent,
        strategyParameters: strategyParams,
        endOfDataPolicy,
      });

      setBacktestTimeMs(Number((performance.now() - t0).toFixed(1)));
      setBacktestResult(runResult.metrics);
      setCurrentStep(6);
    } catch (err) {
      setErrorMessage(`خطا در اجرای بکتست: ${(err as Error).message}`);
    }
  };

  const handleResetWizard = () => {
    cancelWorkerBacktest();
    setCurrentStep(1);
    setCandles([]);
    setBacktestResult(null);
    setErrorMessage(null);
    setSourceName('هنوز داده‌ای انتخاب نشده است');
    setIsUserUploaded(false);
  };

  const isRunDisabled = candles.length < 14 || !dataValidation.isValid || isRunning;
  const runDisabledReason = isRunning
    ? 'محاسبات در حال انجام است'
    : candles.length < 14
    ? 'کندل‌های بارگذاری‌شده کمتر از حداقل ۱۴ عدد است'
    : !dataValidation.isValid
    ? 'کیفیت داده تأیید نشده است'
    : undefined;

  return (
    <main
      className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none"
      dir="rtl"
    >
      <EnvironmentNavBar
        currentEnv="RESEARCH"
        provenance={provenance}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4">
        {/* نوار راهنمای ۶ مرحله‌ای */}
        <div className="bg-[#101420] border border-[#1d2436] p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between border-b border-[#1b2234] pb-3 mb-4">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-purple-400" />
              <h1 className="text-sm sm:text-base font-bold text-zinc-100">
                مسیر گام‌به‌گام بررسی علمی استراتژی (Research Workflow)
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-purple-950/60 text-purple-300 border border-purple-800">
                {symbol} / {selectedTimeframe}
              </span>
            </div>
            <button
              onClick={handleResetWizard}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>شروع مجدد آزمایش</span>
            </button>
          </div>

          {/* نشانگر ۶ گام */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
            {[
              { step: 1, title: '۱. انتخاب داده' },
              { step: 2, title: '۲. بررسی کیفیت' },
              { step: 3, title: '۳. انتخاب روش' },
              { step: 4, title: '۴. هزینه و ریسک' },
              { step: 5, title: '۵. اجرای آزمایش' },
              { step: 6, title: '۶. تفسیر نتایج' },
            ].map((s) => (
              <button
                key={s.step}
                onClick={() => {
                  if (s.step < currentStep || (s.step === 2 && candles.length > 0)) {
                    setCurrentStep(s.step as 1 | 2 | 3 | 4 | 5 | 6);
                  }
                }}
                disabled={s.step > currentStep && !(s.step === 2 && candles.length > 0)}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                  currentStep === s.step
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                    : currentStep > s.step
                    ? 'bg-purple-950/40 text-purple-300 border-purple-800 hover:bg-purple-900/40'
                    : 'bg-[#151a26] text-zinc-500 border-[#222a3d] opacity-60 cursor-not-allowed'
                }`}
              >
                <span>{s.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* پیام خطا یا هشدار */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs flex items-center justify-between text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              بستن
            </button>
          </div>
        )}

        {/* محتوای گام‌های ۶‌گانه */}
        <div className="bg-[#0e121c] border border-[#1b2234] rounded-2xl p-5 shadow-xl">
          {/* گام ۱: انتخاب نماد و تایم‌فریم */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  گام ۱: انتخاب نماد، تایم‌فریم و بارگذاری دادهٔ کندل‌ها
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  نماد معاملاتی و تایم‌فریم را انتخاب کنید تا دیتاست تاریخی درون‌روزی به صورت یکپارچه
                  آماده شود:
                </p>
              </div>

              {/* انتخاب نماد */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-400 block">۱. نماد معاملاتی:</span>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SYMBOLS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSymbolChange(s)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        symbol === s
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-[#181f30] text-zinc-300 hover:bg-[#222a40]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* انتخاب تایم‌فریم */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-400 block">۲. تایم‌فریم یکپارچه (Timeframe):</span>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleTimeframeChange(tf)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                        selectedTimeframe === tf
                          ? 'bg-cyan-600 text-white shadow-md'
                          : 'bg-[#181f30] text-zinc-300 hover:bg-[#222a40]'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* کارت‌های بارگذاری دیتاست */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>گزینه الف: استفاده از دیتاست تاریخی آماده ({symbol} / {selectedTimeframe})</span>
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    دیتاست درون‌روزی استاندارد سال ۲۰۲۴ با اعتبارسنجی خودکار ساختار OHLCV.
                  </p>
                  <button
                    onClick={handleLoadBundledData}
                    disabled={isRunning}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                  >
                    <Database className="w-4 h-4" />
                    <span>بارگذاری دیتاست آماده {symbol} در تایم‌فریم {selectedTimeframe}</span>
                  </button>
                </div>

                <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>گزینه ب: بارگذاری فایل CSV اختصاصی شما</span>
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    فایل تاریخچه قیمت خود را وارد کنید (تایم‌فریم پردازش برابر {selectedTimeframe} اعمال خواهد شد).
                  </p>
                  <label className="w-full py-2.5 rounded-xl bg-[#1d2538] hover:bg-[#263148] text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-[#2d3a54] cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>انتخاب و ورود فایل CSV</span>
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* گام ۲: گزارش کیفیت و اعتبارسنجی داده */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">گام ۲: گزارش کیفیت و اعتبارسنجی داده</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  سامانه پیش از آزمایش، کیفیت، پیوستگی زمانی و عدم نگاه به آینده (Look-ahead bias) را بررسی کرده است:
                </p>
              </div>

              {/* خلاصه متادیتا و سلامت داده */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <span className="text-zinc-500 block">نماد و تایم‌فریم:</span>
                  <span className="font-bold font-mono text-purple-300">{symbol} / {selectedTimeframe}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-zinc-500 block">تعداد کندل‌های معتبر:</span>
                  <span className="font-bold font-mono text-emerald-400">
                    {dataValidation.metrics?.validCandles?.toLocaleString('fa-IR') ?? candles.length.toLocaleString('fa-IR')} کندل
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-zinc-500 block">ردیف‌های ردشده / اصلاح‌شده:</span>
                  <span className="font-bold font-mono text-amber-400">
                    {dataValidation.metrics?.rejectedRows ?? 0} ردیف
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-zinc-500 block">وضعیت نهایی اعتبارسنجی:</span>
                  <span className={`font-bold ${dataValidation.isValid ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dataValidation.isValid ? 'تأیید شده برای آزمایش' : 'نیازمند بررسی'}
                  </span>
                </div>
              </div>

              {/* هشدارها یا خطاها */}
              {dataValidation.warnings.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-xs text-amber-300">
                  <span className="font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    <span>هشدارهای کیفی (بدون مانع برای آزمایش):</span>
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90">
                    {dataValidation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {dataValidation.errors.length > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-1 text-xs text-rose-300">
                  <span className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>خطاهای بحرانی مانع از اجرا:</span>
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {dataValidation.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 rounded-xl bg-[#1a2132] text-zinc-300 text-xs font-bold"
                >
                  تغییر داده
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!dataValidation.isValid}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md"
                >
                  تأیید کیفیت و رفتن به انتخاب روش ←
                </button>
              </div>
            </div>
          )}

          {/* گام ۳: انتخاب استراتژی و پارامترها (دو سطح) */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  گام ۳: انتخاب خانواده استراتژی و تنظیم پارامترهای اختصاصی
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  سطح ۱: انتخاب سبک معاملاتی | سطح ۲: تنظیم دقیق پارامترها و پریست‌های ریسک
                </p>
              </div>

              {/* سطح ۱: انتخاب خانواده استراتژی */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  <span>سطح اول: انتخاب خانواده استراتژی</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                  {(
                    [
                      {
                        id: 'SMC_INTRADAY' as TradingStyleType,
                        title: 'اسمارت‌مانی SMC',
                        desc: 'سوییپ نقدینگی و پرایس‌اکشن S0',
                      },
                      {
                        id: 'TREND_BREAKOUT' as TradingStyleType,
                        title: 'شکست روند (Breakout)',
                        desc: 'شکست کانال هم‌جهت با EMA',
                      },
                      {
                        id: 'MEAN_REVERSION' as TradingStyleType,
                        title: 'بازگشت به میانگین',
                        desc: 'انحراف آماری از خط تعادل (Z-Score)',
                      },
                      {
                        id: 'SCALP_M1_M5' as TradingStyleType,
                        title: 'اسکلپ سریع (Scalp)',
                        desc: 'مومنتوم کوتاه‌مدت با خروج سریع',
                      },
                      {
                        id: 'SWING_MACRO' as TradingStyleType,
                        title: 'سوئینگ و کلان (Swing)',
                        desc: 'موج‌های بلندمدت با اهداف چندروزه',
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setStrategy(item.id)}
                      className={`p-3 rounded-2xl border text-right space-y-1 transition-all ${
                        strategy === item.id
                          ? 'bg-purple-600/20 border-purple-500 shadow-md ring-1 ring-purple-500'
                          : 'bg-[#141926] border-[#232c40] hover:border-[#2f3b54]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-100">{item.title}</span>
                        {strategy === item.id && <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-tight">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* سطح ۲: پریست‌ها و پارامترهای اختصاصی */}
              <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2738] pb-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-zinc-200">
                      سطح دوم: تنظیم پارامترها و پریست‌ها برای «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}»
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">پریست:</span>
                    {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as StrategyPreset[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePresetChange(p)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          strategyPreset === p
                            ? 'bg-cyan-600 text-white shadow-sm'
                            : 'bg-[#1d2538] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {p === 'CONSERVATIVE' ? 'محافظه‌کارانه' : p === 'BALANCED' ? 'متعادل' : 'تهاجمی'}
                      </button>
                    ))}
                    <button
                      onClick={handleResetStrategyParams}
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 mr-2"
                      title="بازنشانی به پیش‌فرض"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>بازنشانی</span>
                    </button>
                  </div>
                </div>

                {/* فرم پارامترهای مشترک */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px]">جهت معامله (Direction):</span>
                    <select
                      value={strategyParams.common.directionMode}
                      onChange={(e) =>
                        setStrategyParams({
                          ...strategyParams,
                          common: {
                            ...strategyParams.common,
                            directionMode: e.target.value as 'LONG_ONLY' | 'SHORT_ONLY' | 'BOTH',
                          },
                        })
                      }
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                    >
                      <option value="BOTH">دو طرفه (خرید و فروش)</option>
                      <option value="LONG_ONLY">فقط خرید (Long Only)</option>
                      <option value="SHORT_ONLY">فقط فروش (Short Only)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px]">نوع سفارش (Order Type):</span>
                    <select
                      value={strategyParams.common.orderType}
                      onChange={(e) =>
                        setStrategyParams({
                          ...strategyParams,
                          common: {
                            ...strategyParams.common,
                            orderType: e.target.value as 'MARKET' | 'LIMIT',
                          },
                        })
                      }
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                    >
                      <option value="LIMIT">سفارش لیمیت (Limit Order)</option>
                      <option value="MARKET">سفارش مارکت (Market Order)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px]">نسبت ریسک به ریوارد (R:R):</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="10"
                      value={strategyParams.common.riskRewardRatio}
                      onChange={(e) =>
                        setStrategyParams({
                          ...strategyParams,
                          common: {
                            ...strategyParams.common,
                            riskRewardRatio: Number(e.target.value) || 2.0,
                          },
                        })
                      }
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px]">مهلت انقضای سفارش (کندل):</span>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      value={strategyParams.common.expiryBars}
                      onChange={(e) =>
                        setStrategyParams({
                          ...strategyParams,
                          common: {
                            ...strategyParams.common,
                            expiryBars: Number(e.target.value) || 6,
                          },
                        })
                      }
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* پارامترهای اختصاصی وابسته به استراتژی انتخاب‌شده */}
                <div className="pt-2 border-t border-[#1f2738]/60">
                  <span className="text-[11px] font-bold text-zinc-400 block mb-2">
                    پارامترهای فنی اختصاصی الگوریتم:
                  </span>

                  {strategy === 'TREND_BREAKOUT' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">دوره کانال شکست (Channel):</span>
                        <input
                          type="number"
                          value={strategyParams.trendBreakout.channelPeriod}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              trendBreakout: {
                                ...strategyParams.trendBreakout,
                                channelPeriod: Number(e.target.value) || 55,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">دوره EMA فیلتر روند:</span>
                        <input
                          type="number"
                          value={strategyParams.trendBreakout.slowEmaPeriod}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              trendBreakout: {
                                ...strategyParams.trendBreakout,
                                slowEmaPeriod: Number(e.target.value) || 200,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {strategy === 'MEAN_REVERSION' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">دوره محاسبه میانگین (Lookback):</span>
                        <input
                          type="number"
                          value={strategyParams.meanReversion.lookbackPeriod}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              meanReversion: {
                                ...strategyParams.meanReversion,
                                lookbackPeriod: Number(e.target.value) || 20,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">آستانه Z-Score باند:</span>
                        <input
                          type="number"
                          step="0.1"
                          value={strategyParams.meanReversion.zScoreThreshold}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              meanReversion: {
                                ...strategyParams.meanReversion,
                                zScoreThreshold: Number(e.target.value) || 2.0,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {strategy === 'SMC_INTRADAY' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">تعداد پیوت‌های نقدینگی:</span>
                        <input
                          type="number"
                          value={strategyParams.smc.liquidityLookback}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              smc: {
                                ...strategyParams.smc,
                                liquidityLookback: Number(e.target.value) || 3,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">ضریب فاصله حد ضرر (ATR Multiplier):</span>
                        <input
                          type="number"
                          step="0.05"
                          value={strategyParams.common.atrMultiplier}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                atrMultiplier: Number(e.target.value) || 0.3,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {strategy === 'SCALP_M1_M5' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">حداقل نوسان مجاز (Min ATR):</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={strategyParams.scalp.minAtr}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              scalp: {
                                ...strategyParams.scalp,
                                minAtr: Number(e.target.value) || 0.0002,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {strategy === 'SWING_MACRO' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">عمق پولبک (Pullback Depth):</span>
                        <input
                          type="number"
                          step="0.1"
                          value={strategyParams.swing.pullbackDepth}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              swing: {
                                ...strategyParams.swing,
                                pullbackDepth: Number(e.target.value) || 1.5,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded-xl bg-[#1a2132] text-zinc-300 text-xs font-bold"
                >
                  بازگشت
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  تنظیم هزینه و ریسک ←
                </button>
              </div>
            </div>
          )}

          {/* گام ۴: تنظیم هزینه و ریسک */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">گام ۴: هزینه‌های معاملاتی، اسلیپیج و مدیریت ریسک</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  پیش‌فرض‌های واقع‌گرایانه برای نماد {symbol} (عدم نادیده گرفتن اسپرد، کارمزد و اسلیپیج اجرای سفارش):
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">اسپرد معمول (Spread):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={spreadPips}
                      onChange={(e) => setSpreadPips(Number(e.target.value) || 0)}
                      className="bg-[#1a2132] border border-[#28334a] rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono w-24"
                    />
                    <span className="text-xs text-zinc-500">پیپ</span>
                  </div>
                </div>

                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">کارمزد رفت‌وبرگشت (Commission):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      value={commissionPerLot}
                      onChange={(e) => setCommissionPerLot(Number(e.target.value) || 0)}
                      className="bg-[#1a2132] border border-[#28334a] rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono w-24"
                    />
                    <span className="text-xs text-zinc-500">دلار در هر لات</span>
                  </div>
                </div>

                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">اسلیپیج اضافی اجرا (Slippage):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={additionalSlippagePips}
                      onChange={(e) => setAdditionalSlippagePips(Number(e.target.value) || 0)}
                      className="bg-[#1a2132] border border-[#28334a] rounded-xl px-3 py-1.5 text-xs text-zinc-100 font-mono w-24"
                    />
                    <span className="text-xs text-zinc-500">پیپ</span>
                  </div>
                </div>

                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="text-xs text-zinc-400 block">سقف ریسک هر معامله:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-400 font-mono">{riskPercent}%</span>
                    <div className="flex items-center gap-1">
                      {[0.1, 0.25, 0.5, 1.0].map((r) => (
                        <button
                          key={r}
                          onClick={() => setRiskPercent(r)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            riskPercent === r ? 'bg-cyan-500 text-black' : 'bg-[#1a2132] text-zinc-400'
                          }`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* سیاست پایان دیتاست */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                <span className="text-xs font-bold text-zinc-300 block">سیاست پایان دیتاست (End of Data Policy):</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <button
                    onClick={() => setEndOfDataPolicy('CLOSE_AT_LAST_CLOSE')}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      endOfDataPolicy === 'CLOSE_AT_LAST_CLOSE'
                        ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500 text-white'
                        : 'bg-[#1a2132] border-[#29354d] text-zinc-400'
                    }`}
                  >
                    <div className="font-bold mb-0.5">بستن در کلوز آخرین کندل (پیش‌فرض Research)</div>
                    <div className="text-[10px] text-zinc-400">
                      تمام پوزیشن‌های باز در پایان داده با قیمت کلوز و دلیل END_OF_DATA بسته شده و در آمار سود/زیان نهایی ثبت می‌شوند.
                    </div>
                  </button>

                  <button
                    onClick={() => setEndOfDataPolicy('KEEP_OPEN_AND_EXCLUDE')}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      endOfDataPolicy === 'KEEP_OPEN_AND_EXCLUDE'
                        ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500 text-white'
                        : 'bg-[#1a2132] border-[#29354d] text-zinc-400'
                    }`}
                  >
                    <div className="font-bold mb-0.5">حفظ موقعیت‌های باز و مستثنی کردن</div>
                    <div className="text-[10px] text-zinc-400">
                      پوزیشن‌های باز در انتهای داده دست‌نخورده مانده و تنها در بخش دیاگنوستیک گزارش می‌شوند.
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 rounded-xl bg-[#1a2132] text-zinc-300 text-xs font-bold"
                >
                  بازگشت
                </button>
                <button
                  onClick={() => setCurrentStep(5)}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  آماده‌سازی برای اجرا ←
                </button>
              </div>
            </div>
          )}

          {/* گام ۵: اجرای آزمایش */}
          {currentStep === 5 && (
            <div className="space-y-5 text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto">
                <Play className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-zinc-100">آماده اجرای آزمایش بک‌تست تاریخی</h2>
                <p className="text-xs text-zinc-400 max-w-lg mx-auto leading-relaxed">
                  تست استراتژی «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}» بر روی {candles.length.toLocaleString('fa-IR')} کندل {symbol} در تایم‌فریم {selectedTimeframe}، با اسپرد {spreadPips} پیپ، کارمزد ${commissionPerLot} و ریسک {riskPercent}٪.
                </p>
              </div>

              {/* نوار پیشرفت زنده هنگام اجرا */}
              {isRunning && progress && (
                <div className="max-w-md mx-auto space-y-2 bg-[#141926] p-4 rounded-2xl border border-[#232c40]">
                  <div className="flex items-center justify-between text-xs text-zinc-300">
                    <span className="flex items-center gap-1.5 font-bold text-purple-300">
                      <Activity className="w-4 h-4 animate-spin text-purple-400" />
                      <span>پردازش رویدادمحور در Web Worker...</span>
                    </span>
                    <span className="font-mono font-bold text-cyan-400">{progress.percent}%</span>
                  </div>

                  <div className="w-full bg-[#1d2538] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-150"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                    <span>{progress.processedBars.toLocaleString('fa-IR')} کندل پردازش‌شده</span>
                    <span>از {progress.totalBars.toLocaleString('fa-IR')} کندل</span>
                  </div>

                  <button
                    onClick={cancelWorkerBacktest}
                    className="mt-2 px-4 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold inline-flex items-center gap-1 transition-all"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>لغو عملیات (Cancel)</span>
                  </button>
                </div>
              )}

              {!isRunning && (
                <div className="space-y-2">
                  <button
                    onClick={handleRunBacktest}
                    disabled={isRunDisabled}
                    className="px-8 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-2 transition-all shadow-xl hover:shadow-purple-500/25"
                  >
                    <Play className="w-4 h-4" />
                    <span>اجرای بک‌تست تاریخی در مرورگر</span>
                  </button>
                  {runDisabledReason && (
                    <div className="text-[11px] text-rose-400">{runDisabledReason}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* گام ۶: توضیح و تفسیر نتایج */}
          {currentStep === 6 && backtestResult && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">
                    گام ۶: نتیجه و تفسیر عملکرد استراتژی ({symbol} / {selectedTimeframe})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    خلاصه شفاف از عملکرد استراتژی در گذشته با احتساب دقیق هزینه‌ها و سیاست پایان داده:
                  </p>
                </div>
                <button
                  onClick={() => setCurrentStep(5)}
                  className="text-xs text-purple-400 hover:text-purple-300 font-bold"
                >
                  اجرای مجدد با پارامترهای دیگر
                </button>
              </div>

              {/* کارت ویژه در صورت صفر معامله */}
              {backtestResult.totalTrades === 0 && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2 text-xs text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                    <Info className="w-4 h-4" />
                    <span>بک‌تست با موفقیت کامل شد، اما با این تنظیمات هیچ معامله‌ای ایجاد نشد.</span>
                  </div>
                  <p className="leading-relaxed text-amber-200/90 text-xs">
                    {backtestResult.diagnostics?.zeroTradeRationale ||
                      'هیچ معاملهٔ بسته‌شده‌ای در طول بازهٔ آزمایشی ثبت نشد.'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] text-zinc-400 border-t border-amber-500/20">
                    <div>کاندیداهای شناسایی‌شده: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.candidatesCount ?? 0}</strong></div>
                    <div>سفارش‌های ارسالی: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.ordersSubmitted ?? 0}</strong></div>
                    <div>سفارش‌های منقضی‌شده: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.ordersExpired ?? 0}</strong></div>
                    <div>سفارش‌های لغوشده پایان داده: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.ordersCancelledAtEnd ?? 0}</strong></div>
                  </div>
                </div>
              )}

              {/* کارت‌های شاخص‌های کلیدی عملکرد */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">سود/زیان خالص کل:</span>
                  <span
                    className={`text-base font-bold font-mono mt-1 block ${
                      backtestResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    ${backtestResult.netProfit.toLocaleString('en-US', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">با کسر کامل کارمزد و اسپرد</span>
                </div>

                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">حداکثر افت سرمایه (Drawdown):</span>
                  <span className="text-base font-bold text-amber-400 font-mono mt-1 block">
                    {backtestResult.maxDrawdownPercent}%
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">بزرگ‌ترین کاهش موجودی از اوج</span>
                </div>

                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">تعداد معاملات / نرخ برد:</span>
                  <span className="text-base font-bold text-zinc-200 font-mono mt-1 block">
                    {backtestResult.totalTrades} معامله ({backtestResult.winRatePercent}٪)
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">درصد معاملات سودآور</span>
                </div>

                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">فاکتور سود (Profit Factor):</span>
                  <span className="text-base font-bold text-cyan-400 font-mono mt-1 block">
                    {backtestResult.profitFactor}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">نسبت مجموع سود به مجموع زیان</span>
                </div>
              </div>

              {/* گزارش دیاگنوستیک و زمان‌بندی محاسبات */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2">
                  <span className="font-bold text-zinc-300">زمان‌سنجی فازهای اجرایی و گزارش دیاگنوستیک رویدادمحور:</span>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                    {parseTimeMs !== null && <span>پارس: {parseTimeMs}ms</span>}
                    {validationTimeMs !== null && <span>اعتبارسنجی: {validationTimeMs}ms</span>}
                    {backtestTimeMs !== null && <span>بک‌تست: {backtestTimeMs}ms</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-400 font-mono">
                  <div>کاندیداهای استراتژی: <strong className="text-zinc-200">{backtestResult.diagnostics?.candidatesCount ?? 0}</strong></div>
                  <div>سفارش‌های ثبت‌شده: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersSubmitted ?? 0}</strong></div>
                  <div>سفارش‌های پرشده: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersFilled ?? 0}</strong></div>
                  <div>سفارش‌های منقضی‌شده: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersExpired ?? 0}</strong></div>
                  <div>لغو در پایان دیتاست: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersCancelledAtEnd ?? 0}</strong></div>
                  <div>بسته‌شده در پایان دیتاست: <strong className="text-zinc-200">{backtestResult.diagnostics?.positionsClosedAtEnd ?? 0}</strong></div>
                  <div>موقعیت‌های باز پایان داده: <strong className="text-zinc-200">{backtestResult.diagnostics?.positionsOpenAtEnd ?? 0}</strong></div>
                  <div>کل کارمزدهای پرداختی: <strong className="text-zinc-200">${backtestResult.totalCommissions}</strong></div>
                </div>
              </div>

              {/* خلاصه و تفسیر انسانی */}
              <div className="p-4 bg-[#141926] border border-[#232c40] rounded-2xl space-y-2 text-xs text-zinc-300">
                <div className="flex items-center gap-2 font-bold text-purple-300">
                  <Info className="w-4 h-4" />
                  <span>تفسیر نتایج به زبان ساده:</span>
                </div>
                <p className="leading-relaxed text-zinc-400">
                  استراتژی «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}» بر روی داده‌های تاریخی {symbol} با تایم‌فریم {selectedTimeframe} اجرا شد. محاسبات شامل کسر کامل اسپرد {spreadPips} پیپ و کارمزد ${commissionPerLot} بوده و خروج پایان دیتاست طبق سیاست {endOfDataPolicy === 'CLOSE_AT_LAST_CLOSE' ? 'بستن اجباری در کلوز آخرین کندل' : 'مستثنی‌سازی'} اعمال شده است.
                </p>
                <div className="text-[11px] text-zinc-500 border-t border-[#1f2738] pt-2">
                  ⚠️ <strong>محدودیت داده‌های گذشته:</strong> نتایج شبیه‌سازی تاریخی هرگز تضمینی برای سودآوری در آینده نیست و این گزارش صرفاً ارزش آماری و تحلیلی دارد.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* حالت پیشرفته: آزمایشگاه مونت‌کارلو و بهینه‌سازی پارامترها */}
        {viewMode === 'ADVANCED' && (
          <div className="bg-[#121624] border border-purple-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300">
                <Sliders className="w-4 h-4" />
                <h3 className="text-xs font-bold">بخش پیشرفته: آزمایشگاه ۱ ساله مونت‌کارلو و شبیه‌سازی ۱۰۰۰ مسیره</h3>
              </div>
              <button
                onClick={() => setIsBacktestModalOpen(true)}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                باز کردن آزمایشگاه پیشرفته مونت‌کارلو
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              دسترسی به شبیه‌سازی آماری بقا در چالش‌های پراپ‌فرم، تحلیل ماتریس شکست و توزیع صدک‌های ۹۵٪.
            </p>
          </div>
        )}
      </div>

      {/* مودال آزمایشگاه جامع ۱ ساله */}
      <MultiStyleBacktestModal
        isOpen={isBacktestModalOpen}
        onClose={() => setIsBacktestModalOpen(false)}
        candles={candles.length > 0 ? candles : GOLD_CANDLES_FIXTURE_5M}
        symbol={symbol}
      />
    </main>
  );
}
