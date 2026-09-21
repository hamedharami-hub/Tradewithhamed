'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { EnvironmentNavBar } from '@/components/navigation/environment-nav-bar';
import { MultiStyleBacktestModal } from '@/components/trading/multi-style-backtest-modal';
import { DataProvenance } from '@/lib/contracts/provenance';
import { SymbolId, Candle, SYMBOL_SPECS, Timeframe } from '@/lib/contracts/market';
import { TradingStyleType, TRADING_STYLES_CONFIG } from '@/lib/contracts/regimes';
import {
  StrategyParameters,
  getDefaultStrategyParameters,
  StrategyPreset,
  SessionFilter,
  TimezoneOption,
  AccountCurrency,
  DateRangeMode,
} from '@/lib/contracts/strategy-parameters';
import { EndOfDataPolicy, PositionLedgerEntry } from '@/lib/core/ports';
import { DataWorkbench, ValidationReport } from '@/lib/core/data-workbench';
import { PerformanceMetrics } from '@/lib/core/research-lab';
import { DatasetPassport } from '@/lib/contracts/dataset-contract';
import { DatasetQualityEngine } from '@/lib/core/dataset-quality';
import { AdvancedExecutionStressConfig, ResearchRun, ResearchRunStatus } from '@/lib/contracts/research-run';
import { GOLD_CANDLES_FIXTURE_5M } from '@/lib/replay/fixtures/gold-candles';
import { getBundledDataset } from '@/lib/research/bundled-historical-datasets';
import { useResearchBacktestWorker } from '@/hooks/use-research-backtest-worker';
import type { PurgedWalkForwardReport, PurgedWalkForwardConfig, ParameterOptimizationReport } from '@/lib/contracts/parameter-optimization';
import type { MonteCarloSimulationReport, StressMatrixReport } from '@/lib/contracts/monte-carlo-stress';
import type { StrategyPropPassport, PropFirmEvaluationVerdict } from '@/lib/contracts/prop-firm-passport';
import { PROP_FIRM_PRESETS, type PropFirmId } from '@/lib/contracts/prop-firms';
import type { StrategyExecutiveReport, JournalExportBatch } from '@/lib/contracts/research-reports-journal';
import { ShareableTradeCardModal, type ShareableTradeData } from '@/components/trading/shareable-trade-card-modal';
import { HelpTooltip } from '@/components/ui/help-tooltip';
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
  Calendar,
  Clock,
  DollarSign,
  ShieldAlert,
  GitCompare,
  Download,
  Plus,
  Trash2,
  Award,
  ShieldCheck,
  FileText,
  Share2,
  BookOpen,
} from 'lucide-react';

const AVAILABLE_SYMBOLS: SymbolId[] = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
const AVAILABLE_TIMEFRAMES: Timeframe[] = ['5M', '15M', '1H', '4H', 'D1'];

function formatDateIso(ts: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toISOString().slice(0, 10);
  } catch {
    return '—';
  }
}

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

  // ۱. فیلتر بازه تاریخی (Date Range)
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('FULL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // ۲. انتخاب استراتژی و پارامترها
  const [strategy, setStrategy] = useState<TradingStyleType>('SMC_INTRADAY');
  const [strategyPreset, setStrategyPreset] = useState<StrategyPreset>('BALANCED');
  const [strategyParams, setStrategyParams] = useState<StrategyParameters>(() =>
    getDefaultStrategyParameters('BALANCED')
  );

  // ۳. پیکربندی حساب (Account Configuration)
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [accountCurrency, setAccountCurrency] = useState<AccountCurrency>('USD');
  const [leverage, setLeverage] = useState<1 | 10 | 30 | 50 | 100>(30);
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState<number>(5.0);
  const [maxTotalDrawdownPercent, setMaxTotalDrawdownPercent] = useState<number>(10.0);
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(3);
  const [minLot, setMinLot] = useState<number>(0.01);
  const [lotStep, setLotStep] = useState<number>(0.01);
  const [maxLot, setMaxLot] = useState<number>(10.0);

  // ۴. فیلتر سشن و مناطق زمانی (Session and Time Filters)
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('ALL');
  const [timezone, setTimezone] = useState<TimezoneOption>('UTC');
  const [customStartTime, setCustomStartTime] = useState<string>('08:00');
  const [customEndTime, setCustomEndTime] = useState<string>('17:00');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [useRolloverBlackout, setUseRolloverBlackout] = useState<boolean>(true);
  const [excludeEdgeMinutes, setExcludeEdgeMinutes] = useState<number>(0);

  // ۵. پارامترهای هزینه و اسلیپیج
  const [riskPercent, setRiskPercent] = useState<number>(0.25);
  const [spreadPips, setSpreadPips] = useState<number>(() => SYMBOL_SPECS.GBPUSD.typicalSpreadPips);
  const [commissionPerLot, setCommissionPerLot] = useState<number>(
    () => SYMBOL_SPECS.GBPUSD.commissionPerLot
  );
  const [additionalSlippagePips, setAdditionalSlippagePips] = useState<number>(0);
  const [endOfDataPolicy, setEndOfDataPolicy] = useState<EndOfDataPolicy>('CLOSE_AT_LAST_CLOSE');

  // نتایج و خطای بکتست
  const [backtestResult, setBacktestResult] = useState<PerformanceMetrics | null>(null);
  const [closedTrades, setClosedTrades] = useState<PositionLedgerEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialTime] = useState(() => Date.now());

  // ─── آزمایشگاه سناریو (Scenario Lab) Package 2 ──────────────────────────
  const [scenarioLabOpen, setScenarioLabOpen] = useState(false);
  const [stressSpreadMultiplier, setStressSpreadMultiplier] = useState<number>(1);
  const [stressSlippageAdd, setStressSlippageAdd] = useState<number>(0);
  const [stressSkipFillsPercent, setStressSkipFillsPercent] = useState<number>(0);
  const [stressGapShock, setStressGapShock] = useState<number>(1);
  const [scenarioSeed, setScenarioSeed] = useState<number>(1337);
  const [scenarioRuns, setScenarioRuns] = useState<Array<{
    id: string;
    name: string;
    status: ResearchRunStatus;
    stressConfig: AdvancedExecutionStressConfig;
    seed: number;
    metrics?: PerformanceMetrics;
    error?: string;
  }>>([]);
  const [scenarioLabExportJson, setScenarioLabExportJson] = useState<string | null>(null);

  // ─── اعتبارسنجی پیش‌رو Purged Walk-Forward (Package D) ───────────────────
  const [walkForwardWindows, setWalkForwardWindows] = useState<number>(3);
  const [walkForwardType, setWalkForwardType] = useState<'ANCHORED' | 'ROLLING'>('ANCHORED');
  const [walkForwardPurgeBars, setWalkForwardPurgeBars] = useState<number>(10);
  const [isWfRunning, setIsWfRunning] = useState<boolean>(false);
  const [walkForwardReport, setWalkForwardReport] = useState<PurgedWalkForwardReport | null>(null);
  const [wfErrorMessage, setWfErrorMessage] = useState<string | null>(null);

  // ─── شبیه‌سازی مونت‌کارلو و ماتریس تنش (Package E) ────────────────────────
  const [mcIterations, setMcIterations] = useState<number>(500);
  const [mcMethod, setMcMethod] = useState<'TRADE_RESHUFFLE' | 'BLOCK_BOOTSTRAP'>('TRADE_RESHUFFLE');
  const [isMcRunning, setIsMcRunning] = useState<boolean>(false);
  const [mcReport, setMcReport] = useState<MonteCarloSimulationReport | null>(null);
  const [mcErrorMessage, setMcErrorMessage] = useState<string | null>(null);
  const [stressMatrixReport, setStressMatrixReport] = useState<StressMatrixReport | null>(null);
  const [isStressMatrixRunning, setIsStressMatrixRunning] = useState<boolean>(false);

  // ─── پاسپورت ارزیابی چالش‌های پراپ‌فرم (Package F) ─────────────────────────
  const [selectedPropFirm, setSelectedPropFirm] = useState<PropFirmId>('FTMO_NORMAL');
  const [targetAccountSize, setTargetAccountSize] = useState<number>(100000);
  const [propPassport, setPropPassport] = useState<StrategyPropPassport | null>(null);
  const [isPassportAuditing, setIsPassportAuditing] = useState<boolean>(false);

  // ─── گزارش جامع، کارت‌های اشتراک‌گذاری و ژورنال (Package G) ───────────────────
  const [executiveReport, setExecutiveReport] = useState<StrategyExecutiveReport | null>(null);
  const [isGeneratingExecReport, setIsGeneratingExecReport] = useState<boolean>(false);
  const [journalExportStatus, setJournalExportStatus] = useState<string | null>(null);
  const [shareableCardData, setShareableCardData] = useState<ShareableTradeData | null>(null);
  const [isShareableModalOpen, setIsShareableModalOpen] = useState<boolean>(false);

  // هوک اختصاصی اجرای بکتست خارج از نخ اصلی
  const { run: runWorkerBacktest, cancel: cancelWorkerBacktest, isRunning, progress } =
    useResearchBacktestWorker();

  // محاسبه آمار بازه تاریخی
  const dateRangeStats = useMemo(() => {
    if (candles.length === 0) return null;
    const earliest = candles[0].timestamp;
    const latest = candles[candles.length - 1].timestamp;
    let selStart = earliest;
    let selEnd = latest;

    switch (dateRangeMode) {
      case 'FIRST_25':
        selEnd = candles[Math.max(0, Math.floor(candles.length * 0.25) - 1)].timestamp;
        break;
      case 'MIDDLE_50':
        selStart = candles[Math.floor(candles.length * 0.25)].timestamp;
        selEnd = candles[Math.max(0, Math.floor(candles.length * 0.75) - 1)].timestamp;
        break;
      case 'LAST_25':
        selStart = candles[Math.floor(candles.length * 0.75)].timestamp;
        break;
      case 'ROLLING_3M':
        selStart = Math.max(earliest, latest - 90 * 24 * 60 * 60_000);
        break;
      case 'ROLLING_6M':
        selStart = Math.max(earliest, latest - 180 * 24 * 60 * 60_000);
        break;
      case 'ROLLING_12M':
        selStart = Math.max(earliest, latest - 365 * 24 * 60 * 60_000);
        break;
      case 'CUSTOM':
        if (customStartDate) selStart = new Date(customStartDate).getTime();
        if (customEndDate) selEnd = new Date(customEndDate + 'T23:59:59.999Z').getTime();
        break;
      case 'FULL':
      default:
        selStart = earliest;
        selEnd = latest;
        break;
    }

    const startIdx = candles.findIndex(c => c.timestamp >= selStart);
    let endIdx = -1;
    for (let j = candles.length - 1; j >= 0; j--) {
      if (candles[j].timestamp <= selEnd) {
        endIdx = j;
        break;
      }
    }

    const evalCount = startIdx !== -1 && endIdx >= startIdx ? endIdx - startIdx + 1 : 0;
    const warmupCount = startIdx > 0 ? startIdx : 0;

    return {
      earliest,
      latest,
      total: candles.length,
      selStart,
      selEnd,
      evalCount,
      warmupCount,
    };
  }, [candles, dateRangeMode, customStartDate, customEndDate]);

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

  // شناسنامه جامع کیفیت و اثرانگشت دیتاست (Package A DatasetPassport)
  const datasetPassport: DatasetPassport | null = useMemo(() => {
    if (candles.length === 0) return null;
    const { passport } = DatasetQualityEngine.inspectAndValidate(
      candles,
      symbol,
      selectedTimeframe,
      {
        minimumCandles: 14,
        minimumWarmupBars: 200,
        dropIncompleteTrailingBar: true,
      }
    );
    return passport;
  }, [candles, symbol, selectedTimeframe]);

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
      DataWorkbench.validateCandles(parsed.candles, symbol, selectedTimeframe, dataset.labelFa);
      setValidationTimeMs(Number((performance.now() - tVal0).toFixed(1)));

      setCandles(parsed.candles);
      setDatasetProvider(dataset.source);
      setSourceName(`دیتاست آماده توکار: ${dataset.labelFa} (${parsed.candles.length.toLocaleString('fa-IR')} کندل)`);
      setIsUserUploaded(false);
      setCurrentStep(2);
    } catch (err) {
      setErrorMessage(`خطا در بارگذاری دیتاست: ${(err as Error).message}`);
    }
  };

  // بارگذاری فایل CSV توسط کاربر
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
        initialCash: initialCapital,
        accountConfig: {
          initialCapital,
          accountCurrency,
          leverage,
          maxDailyLossPercent,
          maxTotalDrawdownPercent,
          maxConcurrentPositions,
          minLot,
          lotStep,
          maxLot,
        },
        dateRangeConfig: {
          mode: dateRangeMode,
          customStartDate: customStartDate || undefined,
          customEndDate: customEndDate || undefined,
          requiredWarmupBars: 210,
        },
        sessionConfig: {
          session: sessionFilter,
          timezone,
          customStartTime,
          customEndTime,
          selectedWeekdays,
          useRolloverBlackout,
          excludeEdgeMinutes,
        },
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
      setClosedTrades(runResult.trades || []);
      setCurrentStep(6);
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        setErrorMessage('عملیات بک‌تست توسط کاربر لغو شد.');
      } else {
        setErrorMessage(`خطا در اجرای بکتست: ${e.message}`);
      }
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

  const currencySymbol = accountCurrency === 'AUD' ? 'A$' : '$';

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
              { step: 2, title: '۲. کیفیت و بازه' },
              { step: 3, title: '۳. انتخاب روش' },
              { step: 4, title: '۴. حساب و سشن' },
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
                    <span>بارگذاری دیتاست آماده ({symbol} - {selectedTimeframe})</span>
                  </button>
                </div>

                <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    <span>گزینه ب: آپلود فایل اختصاصی کندل‌ها (CSV)</span>
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    بارگذاری داده‌های صادر شده از متاتریدر، تریدینگ‌ویو یا cTrader به فرمت CSV.
                  </p>
                  <label className="w-full py-2.5 rounded-xl bg-[#1d2538] hover:bg-[#253047] text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-[#2e3b54]">
                    <Upload className="w-4 h-4 text-cyan-400" />
                    <span>انتخاب فایل CSV از رایانه</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* گام ۲: گزارش کیفیت و فیلتر بازه تاریخی (Date Range) */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  گام ۲: گزارش کیفیت، اعتبارسنجی ساختار و فیلتر بازه تاریخی (Date Range)
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  منبع: <span className="text-zinc-200 font-mono">{sourceName}</span>
                </p>
              </div>

              {/* ۶ کارت آماری بازه زمانی */}
              {dateRangeStats && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs text-center">
                  <div className="bg-[#141926] p-3 rounded-xl border border-[#232c40]">
                    <span className="text-[10px] text-zinc-500 block">اولین کندل موجود</span>
                    <span className="font-mono text-zinc-200 font-bold mt-1 block">
                      {formatDateIso(dateRangeStats.earliest)}
                    </span>
                  </div>
                  <div className="bg-[#141926] p-3 rounded-xl border border-[#232c40]">
                    <span className="text-[10px] text-zinc-500 block">آخرین کندل موجود</span>
                    <span className="font-mono text-zinc-200 font-bold mt-1 block">
                      {formatDateIso(dateRangeStats.latest)}
                    </span>
                  </div>
                  <div className="bg-[#141926] p-3 rounded-xl border border-[#232c40]">
                    <span className="text-[10px] text-zinc-500 block">کل کندل‌های دیتاست</span>
                    <span className="font-mono text-purple-300 font-bold mt-1 block">
                      {dateRangeStats.total.toLocaleString('fa-IR')}
                    </span>
                  </div>
                  <div className="bg-[#141926] p-3 rounded-xl border border-[#232c40]">
                    <span className="text-[10px] text-zinc-500 block">شروع انتخابی ارزیابی</span>
                    <span className="font-mono text-cyan-300 font-bold mt-1 block">
                      {formatDateIso(dateRangeStats.selStart)}
                    </span>
                  </div>
                  <div className="bg-[#141926] p-3 rounded-xl border border-[#232c40]">
                    <span className="text-[10px] text-zinc-500 block">پایان انتخابی ارزیابی</span>
                    <span className="font-mono text-cyan-300 font-bold mt-1 block">
                      {formatDateIso(dateRangeStats.selEnd)}
                    </span>
                  </div>
                  <div className="bg-[#141926] p-3 rounded-xl border border-[#232c40]">
                    <span className="text-[10px] text-zinc-500 block">کندل ارزیابی + وارم‌آپ</span>
                    <span className="font-mono text-emerald-400 font-bold mt-1 block">
                      {dateRangeStats.evalCount.toLocaleString('fa-IR')}{' '}
                      <span className="text-[10px] text-zinc-500 font-normal">
                        (+{dateRangeStats.warmupCount} وارم‌آپ)
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* انتخاب حالت‌های بازه تاریخی */}
              <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Calendar className="w-4 h-4" />
                  <span>انتخاب بازهٔ تاریخی برای آزمایش (Date Range Selector):</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
                  {[
                    { id: 'FULL', label: 'کل دیتاست' },
                    { id: 'CUSTOM', label: 'بازه سفارشی' },
                    { id: 'FIRST_25', label: '۲۵٪ اول' },
                    { id: 'MIDDLE_50', label: '۵۰٪ میانی' },
                    { id: 'LAST_25', label: '۲۵٪ پایانی' },
                    { id: 'ROLLING_3M', label: '۳ ماه اخیر' },
                    { id: 'ROLLING_6M', label: '۶ ماه اخیر' },
                    { id: 'ROLLING_12M', label: '۱۲ ماه اخیر' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setDateRangeMode(m.id as DateRangeMode)}
                      className={`p-2 rounded-xl text-center font-bold text-xs transition-all ${
                        dateRangeMode === m.id
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-[#1b2234] text-zinc-300 hover:bg-[#232c42]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* ورودی تاریخ سفارشی */}
                {dateRangeMode === 'CUSTOM' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                    <div className="space-y-1">
                      <span className="text-zinc-400">تاریخ شروع بازه ارزیابی (Start Date):</span>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-3 py-2 text-zinc-100 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-400">تاریخ پایان بازه ارزیابی (End Date):</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-3 py-2 text-zinc-100 font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* شناسنامه جامع و دسته‌بندی کیفیت داده (Package A Dataset Passport) */}
              {datasetPassport && (
                <div className="bg-[#141926] border border-[#232c40] p-4 rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2738] pb-2.5">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-zinc-100">
                        شناسنامه رسمی دیتاست (Dataset Passport)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* نوع حجم داده */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          datasetPassport.volumeType === 'REAL_SOURCE_VOLUME'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : datasetPassport.volumeType === 'TICK_VOLUME'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            : datasetPassport.volumeType === 'SYNTHETIC'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/40'
                        }`}
                      >
                        {datasetPassport.volumeType === 'REAL_SOURCE_VOLUME' && 'حجم واقعی (Real Volume)'}
                        {datasetPassport.volumeType === 'TICK_VOLUME' && 'حجم تیک (Tick Volume)'}
                        {datasetPassport.volumeType === 'SYNTHETIC' && 'حجم شبیه‌سازی (Synthetic)'}
                        {datasetPassport.volumeType === 'MISSING' && 'فاقد حجم (Missing Volume)'}
                      </span>
                      {/* امتیاز کیفیت */}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        کیفیت: {datasetPassport.quality.qualityScorePercent}٪
                      </span>
                      {/* وارم‌آپ */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          datasetPassport.hasSufficientWarmup
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {datasetPassport.hasSufficientWarmup ? 'وارم‌آپ کافی ✓' : 'وارم‌آپ محدود ⚠'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-500 block">گپ‌های آخر هفته / درون‌هفته:</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {datasetPassport.quality.weekendGapCount} تعطیلات / {datasetPassport.quality.gapCount} درون‌هفته
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-500 block">کندل‌های مسطح (Zero Range):</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {datasetPassport.quality.flatCandleCount}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-500 block">کندل ناقص پایانی:</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {datasetPassport.hasIncompleteTrailingBar ? 'حذف شد (ضد سوگیری)' : 'یافت نشد'}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-500 block">پوشش زمانی:</span>
                      <span className="text-zinc-300 font-sans text-[11px]">
                        {datasetPassport.coverageLabelFa}
                      </span>
                    </div>
                  </div>

                  {/* اثرانگشت SHA-256 */}
                  <div className="pt-1 flex items-center gap-2 text-[10px] text-zinc-400 bg-[#0f131d] px-3 py-1.5 rounded-lg border border-[#1b2234]">
                    <span className="text-zinc-500 shrink-0">اثرانگشت SHA-256:</span>
                    <span className="font-mono text-purple-300 truncate select-all">
                      {datasetPassport.fingerprintSha256}
                    </span>
                  </div>
                </div>
              )}

              {/* گزارش اعتبارسنجی ساختار */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#141926] p-4 rounded-2xl border border-[#232c40]">
                <div className="space-y-1">
                  <span className="text-zinc-500 block">تعداد سطرهای معتبر:</span>
                  <span className="font-mono text-zinc-200 font-bold">
                    {dataValidation.metrics?.validCandles?.toLocaleString('fa-IR') || '—'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-zinc-500 block">تایم‌فریم تشخیص داده‌شده:</span>
                  <span className="font-mono text-cyan-400 font-bold">
                    {dataValidation.metrics?.inferredTimeframe || selectedTimeframe}
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

          {/* گام ۳: انتخاب استراتژی و ممیزی پارامترها */}
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

                {/* فرم پارامترهای مشترک فعال */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-[11px]">جهت معامله:</span>
                      <HelpTooltip
                        titleFa="جهت مجاز معاملات (Direction Mode)"
                        explanationFa="تعیین می‌کند که الگوریتم اجازه دارد در هر دو جهت خرید (Long) و فروش (Short) پوزیشن باز کند یا تنها در یک جهت خاص فعالیت نماید."
                        practicalTipFa="در بازارهای با روند صعودی قدرتمند، فعال‌سازی Long Only می‌تواند از ضررهای ضد روند جلوگیری کند."
                      />
                    </div>
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

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center">
                        <span className="text-zinc-400 text-[11px]">نوع سفارش (Order Type):</span>
                        <HelpTooltip
                          titleFa="نوع اجرای سفارش (Order Execution Type)"
                          explanationFa="سفارش لیمیت در پولبک و قیمت بهتر وارد می‌شود اما ممکن است جا بماند. سفارش مارکت فوراً در کلوز کندل وارد می‌شود اما ریسک اسلیپیج دارد. سفارش استاپ هنگام شکست پرایس وارد بازار می‌شود."
                          practicalTipFa="برای استراتژی‌های شکست از Stop و برای بازگشت به میانگین از Limit استفاده کنید."
                        />
                      </div>
                      <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </div>
                    <select
                        value={strategyParams.common.orderType}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            common: {
                              ...strategyParams.common,
                              orderType: e.target.value as 'MARKET' | 'LIMIT' | 'STOP',
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                      >
                        <option value="LIMIT">سفارش لیمیت (Limit Order - ورود در پولبک)</option>
                        <option value="MARKET">سفارش مارکت (Market Order - ورود در کلوز کندل)</option>
                        <option value="STOP">سفارش استاپ (Stop Order - ورود در شکست سقف/کف)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-zinc-400 text-[11px]">شیوه حد ضرر (Stop Loss):</span>
                          <HelpTooltip
                            titleFa="شیوه محاسبه حد ضرر (Stop Loss Mode)"
                            explanationFa="تعیین مبنای قرارگیری استاپ: پویا بر اساس نوسان ATR، پشت پیوت‌های ساختار بازار، یا فاصله عددی پیپ ثابت."
                            practicalTipFa="مدل ATR خود را با نوسان روز بازار هماهنگ می‌کند و مانع از استاپ خوردن با نویزهای موقت می‌شود."
                            impactOnPropFirmFa="برای پراپ فرم‌ها، مدل ATR یا ساختار باعث بقای بسیار بالاتر نسبت به پیپ ثابت است."
                          />
                        </div>
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </div>
                      <select
                        value={strategyParams.common.stopLossMode}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            common: {
                              ...strategyParams.common,
                              stopLossMode: e.target.value as 'ATR' | 'STRUCTURE' | 'FIXED_PIPS',
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs"
                      >
                        <option value="ATR">پویا بر مبنای ATR نوسان‌پذیری</option>
                        <option value="STRUCTURE">ساختار پرایس‌اکشن گذشته (پشت پیوت‌ها)</option>
                        <option value="FIXED_PIPS">فاصله پیپ ثابت (Fixed Pips)</option>
                      </select>
                    </div>

                    {strategyParams.common.stopLossMode === 'FIXED_PIPS' && (
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px]">فاصله حد ضرر ثابت (پیپ):</span>
                        <input
                          type="number"
                          min="3"
                          max="300"
                          value={strategyParams.common.fixedStopPips ?? 20}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                fixedStopPips: Number(e.target.value) || 20,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-[11px]">انقضای سفارش لیمیت/استاپ (کندل):</span>
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </div>
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

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-[11px]">استراحت پس از بسته شدن (Cooldown Bars):</span>
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={strategyParams.common.cooldownBars}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            common: {
                              ...strategyParams.common,
                              cooldownBars: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-[11px]">محدوده استراحت (Cooldown Scope):</span>
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </div>
                      <select
                        value={strategyParams.common.cooldownScope || 'PER_SYMBOL'}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            common: {
                              ...strategyParams.common,
                              cooldownScope: e.target.value as any,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                      >
                        <option value="PER_SYMBOL">بر اساس نماد (PER_SYMBOL)</option>
                        <option value="PER_STRATEGY">بر اساس استراتژی (PER_STRATEGY)</option>
                        <option value="PER_DIRECTION">بر اساس جهت معامله (PER_DIRECTION)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-[11px]">نسبت سود به زیان (R:R):</span>
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </div>
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
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-[11px]">ضریب حد ضرر (ATR Multiplier):</span>
                        <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                          ACTIVE
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="5"
                        value={strategyParams.common.atrMultiplier}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            common: {
                              ...strategyParams.common,
                              atrMultiplier: Number(e.target.value) || 1.5,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* کنترل جامع فیلتر تایم‌فریم بالاتر (MTF) پکیج ۳ */}
                  <div className="p-3.5 bg-[#141926] border border-purple-500/30 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between border-b border-[#1f2738] pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                        <Layers className="w-4 h-4" />
                        <span>تاییدیه چندتایم‌فریمی ضد نگاه‌به‌آینده (Anti Look-Ahead MTF):</span>
                      </div>
                      <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        فعال (Package 3)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px] block">حالت فیلتر تایم‌فریم بالاتر:</span>
                        <select
                          value={strategyParams.common.mtfConfig?.higherTimeframeFilterMode || 'OFF'}
                          onChange={(e) => {
                            const newMode = e.target.value as any;
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                higherTimeframeFilter: newMode !== 'OFF',
                                mtfConfig: {
                                  executionTimeframe: selectedTimeframe,
                                  confirmationTimeframe: strategyParams.common.mtfConfig?.confirmationTimeframe || '1H',
                                  higherTimeframeSource: strategyParams.common.mtfConfig?.higherTimeframeSource || 'AUTO',
                                  higherTimeframeFilterMode: newMode,
                                  trendEmaSettings: {
                                    trendEmaPeriod: 50,
                                    trendSlopeLookback: 3,
                                    minimumSlope: 0.0,
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="OFF">OFF (غیرفعال - بیس‌لاین تک‌تایم‌فریمی)</option>
                          <option value="TREND_EMA">TREND_EMA (روند میانگین متحرک کلان)</option>
                          <option value="MARKET_STRUCTURE">MARKET_STRUCTURE (ساختار پیوت‌های سقف/کف)</option>
                          <option value="MOMENTUM">MOMENTUM (شتاب نرخ تغییرات)</option>
                          <option value="VOLATILITY">VOLATILITY (صدک نوسان‌پذیری ATR)</option>
                          <option value="COMBINED">COMBINED (ترکیب حدنصاب چندگانه)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px] block">تایم‌فریم تاییدیه (Confirmation):</span>
                        <select
                          value={strategyParams.common.mtfConfig?.confirmationTimeframe || '1H'}
                          onChange={(e) => {
                            const newConf = e.target.value as any;
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                mtfConfig: {
                                  executionTimeframe: selectedTimeframe,
                                  confirmationTimeframe: newConf,
                                  higherTimeframeSource: strategyParams.common.mtfConfig?.higherTimeframeSource || 'AUTO',
                                  higherTimeframeFilterMode: strategyParams.common.mtfConfig?.higherTimeframeFilterMode || 'OFF',
                                  trendEmaSettings: {
                                    trendEmaPeriod: 50,
                                    trendSlopeLookback: 3,
                                    minimumSlope: 0.0,
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="15M">15M (برای اجرای 5M)</option>
                          <option value="1H">1H (برای اجرای 5M یا 15M)</option>
                          <option value="4H">4H (برای اجرای 15M یا 1H)</option>
                          <option value="D1">D1 (برای اجرای 1H یا 4H)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px] block">منبع کندل تایم‌فریم بالاتر:</span>
                        <select
                          value={strategyParams.common.mtfConfig?.higherTimeframeSource || 'AUTO'}
                          onChange={(e) => {
                            const newSource = e.target.value as any;
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                mtfConfig: {
                                  executionTimeframe: selectedTimeframe,
                                  confirmationTimeframe: strategyParams.common.mtfConfig?.confirmationTimeframe || '1H',
                                  higherTimeframeSource: newSource,
                                  higherTimeframeFilterMode: strategyParams.common.mtfConfig?.higherTimeframeFilterMode || 'OFF',
                                  trendEmaSettings: {
                                    trendEmaPeriod: 50,
                                    trendSlopeLookback: 3,
                                    minimumSlope: 0.0,
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="AUTO">AUTO (تجمیع قطعی از کندل‌های بسته)</option>
                          <option value="AGGREGATED_FROM_EXECUTION">AGGREGATED (تولید مستقل)</option>
                          <option value="NATIVE_DATASET">NATIVE (دیتاست مستقیم)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* چک‌باکس‌ها و کنترل‌های بریک‌ایون و خروج پله‌ای */}
                  <div className="p-3.5 bg-[#141926] border border-[#232c40] rounded-2xl space-y-3 text-xs">
                    <div className="flex flex-wrap items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer text-zinc-200">
                        <input
                          type="checkbox"
                          checked={strategyParams.common.enableBreakeven}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                enableBreakeven: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-[#2d3a54] bg-[#1b2234] text-purple-600 focus:ring-0"
                        />
                        <span className="font-bold">ریسک‌فری خودکار (Breakeven)</span>
                      </label>

                      {strategyParams.common.enableBreakeven && (
                        <div className="flex items-center gap-3 text-zinc-400">
                          <span>در سود:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max="5"
                            value={strategyParams.common.breakevenTriggerR ?? 1.0}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                common: {
                                  ...strategyParams.common,
                                  breakevenTriggerR: Number(e.target.value) || 1.0,
                                },
                              })
                            }
                            className="w-16 bg-[#1b2234] border border-[#2d3a54] rounded-lg px-2 py-0.5 text-zinc-100 font-mono text-xs text-center"
                          />
                          <span>واحد R</span>

                          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 mr-2">
                            <input
                              type="checkbox"
                              checked={strategyParams.common.includeEntryCostsInBreakeven ?? true}
                              onChange={(e) =>
                                setStrategyParams({
                                  ...strategyParams,
                                  common: {
                                    ...strategyParams.common,
                                    includeEntryCostsInBreakeven: e.target.checked,
                                  },
                                })
                              }
                              className="rounded border-[#2d3a54] bg-[#1b2234] text-purple-600 focus:ring-0"
                            />
                            <span>احتساب اسپرد و کمیسیون در نقطه خروج</span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-[#1f2738]">
                      <label className="flex items-center gap-2 cursor-pointer text-zinc-200">
                        <input
                          type="checkbox"
                          checked={strategyParams.common.enablePartialTakeProfit}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              common: {
                                ...strategyParams.common,
                                enablePartialTakeProfit: e.target.checked,
                              },
                            })
                          }
                          className="rounded border-[#2d3a54] bg-[#1b2234] text-purple-600 focus:ring-0"
                        />
                        <span className="font-bold">سیو سود پله‌ای (Partial Take Profit)</span>
                      </label>

                      {strategyParams.common.enablePartialTakeProfit && (
                        <div className="flex items-center gap-3 text-zinc-400">
                          <span>در سود:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max="5"
                            value={strategyParams.common.partialTakeProfitTriggerR ?? 1.2}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                common: {
                                  ...strategyParams.common,
                                  partialTakeProfitTriggerR: Number(e.target.value) || 1.2,
                                },
                              })
                            }
                            className="w-16 bg-[#1b2234] border border-[#2d3a54] rounded-lg px-2 py-0.5 text-zinc-100 font-mono text-xs text-center"
                          />
                          <span>R | حجم خروج:</span>
                          <input
                            type="number"
                            min="10"
                            max="90"
                            value={strategyParams.common.partialClosePercent ?? 50}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                common: {
                                  ...strategyParams.common,
                                  partialClosePercent: Number(e.target.value) || 50,
                                },
                              })
                            }
                            className="w-16 bg-[#1b2234] border border-[#2d3a54] rounded-lg px-2 py-0.5 text-zinc-100 font-mono text-xs text-center"
                          />
                          <span>٪</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* فرم پارامترهای اختصاصی خانواده استراتژی فعال (Package B - Style-Specific Parameters) */}
                <div className="p-4 bg-[#141926] border border-cyan-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-[#1f2738] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-300">
                        پارامترهای اختصاصی الگوریتم «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}»:
                      </span>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30 font-mono">
                      {strategy}
                    </span>
                  </div>

                  {/* ۱. پارامترهای اسمارت‌مانی SMC */}
                  {strategy === 'SMC_INTRADAY' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">پیوت‌های نقدینگی (Lookback):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="10"
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
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">حداقل نفوذ سوییپ (پیپ):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="10"
                          value={strategyParams.smc.sweepThreshold}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              smc: {
                                ...strategyParams.smc,
                                sweepThreshold: Number(e.target.value) || 0.5,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">شکست ساختار داخلی:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <select
                          value={strategyParams.smc.requireStructureBreak ? 'YES' : 'NO'}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              smc: {
                                ...strategyParams.smc,
                                requireStructureBreak: e.target.value === 'YES',
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="YES">الزامی (تایید شکست ساختار قبل از ورود)</option>
                          <option value="NO">اختیاری (فقط سوییپ بدون نیاز به شکست)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">تاییدیه گپ منصفانه (FVG):</span>
                          <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/30">
                            PARTIAL
                          </span>
                        </div>
                        <select
                          value={strategyParams.smc.requireFvg ? 'YES' : 'NO'}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              smc: {
                                ...strategyParams.smc,
                                requireFvg: e.target.value === 'YES',
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="NO">غیرفعال (عدم الزام FVG)</option>
                          <option value="YES">فعال (بررسی عدم‌تعادل ۳ کندلی)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* ۲. پارامترهای شکست کانال روندی Trend Breakout */}
                  {strategy === 'TREND_BREAKOUT' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">دوره کانال دانچیان (کندل):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="10"
                          max="200"
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
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">دوره میانگین سریع (Fast EMA):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="5"
                          max="50"
                          value={strategyParams.trendBreakout.fastEmaPeriod}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              trendBreakout: {
                                ...strategyParams.trendBreakout,
                                fastEmaPeriod: Number(e.target.value) || 20,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">دوره میانگین کند (Slow EMA):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="50"
                          max="500"
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

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">بافر نفوذ شکست (ATR):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="1"
                          value={strategyParams.trendBreakout.breakoutBufferAtr}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              trendBreakout: {
                                ...strategyParams.trendBreakout,
                                breakoutBufferAtr: Number(e.target.value) || 0.1,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* ۳. پارامترهای بازگشت به میانگین Mean Reversion */}
                  {strategy === 'MEAN_REVERSION' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">دوره انحراف معیار (Lookback):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="10"
                          max="100"
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
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">آستانه انحراف ورود (Z-Score):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          max="4"
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

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">انحراف خروج تعادل (Exit Z):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          min="-1"
                          max="1"
                          value={strategyParams.meanReversion.exitZScore}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              meanReversion: {
                                ...strategyParams.meanReversion,
                                exitZScore: Number(e.target.value) || 0,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">فیلتر روند کلان:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <select
                          value={strategyParams.meanReversion.trendFilter ? 'YES' : 'NO'}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              meanReversion: {
                                ...strategyParams.meanReversion,
                                trendFilter: e.target.value === 'YES',
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="YES">فعال (مسدودسازی ورود در ترندهای افراطی)</option>
                          <option value="NO">غیرفعال (ورود بر مبنای باند بدون فیلتر)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* ۴. پارامترهای اسکلپینگ سریع Scalp */}
                  {strategy === 'SCALP_M1_M5' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">EMA سریع اسکلپ:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="3"
                          max="20"
                          value={strategyParams.scalp.fastEma}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              scalp: {
                                ...strategyParams.scalp,
                                fastEma: Number(e.target.value) || 9,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">EMA کند اسکلپ:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="10"
                          max="50"
                          value={strategyParams.scalp.slowEma}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              scalp: {
                                ...strategyParams.scalp,
                                slowEma: Number(e.target.value) || 21,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">حداقل نوسان ATR:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.0001"
                          min="0.00005"
                          max="0.01"
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

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">سشن اختصاصی اسکلپ:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <select
                          value={strategyParams.scalp.session}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              scalp: {
                                ...strategyParams.scalp,
                                session: e.target.value as any,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                        >
                          <option value="ALL">تمام سشن‌ها (آزاد)</option>
                          <option value="LONDON_NEW_YORK_OVERLAP">همپوشانی لندن و نیویورک</option>
                          <option value="LONDON">فقط لندن</option>
                          <option value="NEW_YORK">فقط نیویورک</option>
                          <option value="ASIAN">فقط آسیا</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* ۵. پارامترهای سوئینگ کلان Swing Macro */}
                  {strategy === 'SWING_MACRO' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">EMA جهت روند کلان:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="20"
                          max="200"
                          value={strategyParams.swing.trendEma}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              swing: {
                                ...strategyParams.swing,
                                trendEma: Number(e.target.value) || 50,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">عمق اصلاح پولبک (بر حسب ATR):</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.1"
                          min="0.2"
                          max="3"
                          value={strategyParams.swing.pullbackDepth}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              swing: {
                                ...strategyParams.swing,
                                pullbackDepth: Number(e.target.value) || 1.0,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-400 text-[11px]">کندل‌های تاییدیه برگشت:</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/30">
                            ACTIVE
                          </span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={strategyParams.swing.confirmationBars}
                          onChange={(e) =>
                            setStrategyParams({
                              ...strategyParams,
                              swing: {
                                ...strategyParams.swing,
                                confirmationBars: Number(e.target.value) || 2,
                              },
                            })
                          }
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* پنل ترکیب ماژولار سبک‌ها و وزن‌دهی به عوامل تصمیم‌گیری نهایی (Modular Strategy Engine & Decision Drivers) */}
                <div className="p-4 bg-[#141926] border border-purple-500/40 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1f2738] pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-purple-300">
                        ترکیب ماژولار سبک‌ها و عوامل تصمیم‌گیری نهایی (Modular Composition & Decision Drivers):
                      </span>
                      <HelpTooltip
                        titleFa="ترکیب ماژولار استراتژی چیست؟"
                        explanationFa="این بخش به شما اجازه می‌دهد اجزای استراتژی را مثل پازل بسازید: فیلتر روند از یک سبک، تریگر ورود از سبک دیگر، فیلتر حجم سشن برای تایید، و مدیریت خروج پویا."
                        practicalTipFa="مثال قدرتمند: ترکیب فیلتر روند EMA با تریگر اردربلاک SMC و خروج پویا بر مبنای ATR."
                        impactOnPropFirmFa="ترکیب فیلتر روند با تاییدیه سشن، شانس قبولی چالش‌های پراپ را تا ۴۰٪ ارتقا می‌دهد."
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer bg-purple-950/40 px-3 py-1 rounded-xl border border-purple-500/30 text-[11px] text-purple-200">
                      <input
                        type="checkbox"
                        checked={strategyParams.modularComposition?.enabled ?? false}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            modularComposition: {
                              ...(strategyParams.modularComposition || {
                                enabled: false,
                                regimeFilterModule: 'AUTO_REGIME',
                                entryTriggerModule: 'BREAKOUT_CHANNEL',
                                confirmationModule: 'SESSION_VOLUME',
                                riskManagementModule: 'ATR_DYNAMIC',
                                decisionWeighting: {
                                  vetoPowerRegime: true,
                                  minConfidenceScorePercent: 65,
                                  fvgConfirmationBonusPercent: 15,
                                  sessionVolumeWeightPercent: 20,
                                },
                              }),
                              enabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded accent-purple-500"
                      />
                      <span>فعال‌سازی حالت ترکیب ماژولار سبک‌ها</span>
                    </label>
                  </div>

                  {strategyParams.modularComposition?.enabled && (
                    <div className="space-y-4 pt-1">
                      {/* ۴ ماژول ساختار استراتژی */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {/* ۱. ماژول فیلتر رژیم / روند */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-[#1e263c] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300 font-bold text-[11px]">۱. فیلتر روند و رژیم بازار:</span>
                            <HelpTooltip
                              titleFa="ماژول فیلتر روند و رژیم"
                              explanationFa="تعیین می‌کند که معاملات همسو با جهت بازار کلان باشند و در بازارهای رنج و پرنویز، اردرهای پرریسک متوقف گردند."
                            />
                          </div>
                          <select
                            value={strategyParams.modularComposition.regimeFilterModule}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                modularComposition: {
                                  ...strategyParams.modularComposition!,
                                  regimeFilterModule: e.target.value as any,
                                },
                              })
                            }
                            className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-[11px] font-mono"
                          >
                            <option value="AUTO_REGIME">تشخیص خودکار رژیم (ADX + شیب EMA)</option>
                            <option value="EMA_TREND">روند کلان میانگین متحرک (EMA Trend Filter)</option>
                            <option value="CHOP_BLOCKER">مسدودساز بازارهای خنثی و فشرده (Chop Blocker)</option>
                            <option value="OFF">غیرفعال (ورود بدون فیلتر رژیم)</option>
                          </select>
                        </div>

                        {/* ۲. ماژول ماشه ورود Entry Trigger */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-[#1e263c] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300 font-bold text-[11px]">۲. ماشه نقطه ورود (Trigger):</span>
                            <HelpTooltip
                              titleFa="ماژول ماشه ورود"
                              explanationFa="الگوی دقیق قیمتی که سیگنال ورود صادر می‌کند. آیا به محض شکست کانال باشد، یا سوییپ نقدینگی اسمارت مانی، یا برگشت از اشباع میانگین؟"
                            />
                          </div>
                          <select
                            value={strategyParams.modularComposition.entryTriggerModule}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                modularComposition: {
                                  ...strategyParams.modularComposition!,
                                  entryTriggerModule: e.target.value as any,
                                },
                              })
                            }
                            className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-[11px] font-mono"
                          >
                            <option value="BREAKOUT_CHANNEL">شکست کانال دانچیان (Donchian Breakout)</option>
                            <option value="SMC_ORDERBLOCK">اوردر بلاک و نقدینگی SMC (Smart Money)</option>
                            <option value="MEAN_REVERSION_Z">بازگشت از انحراف باندها (Mean Reversion Z)</option>
                            <option value="SCALP_MOMENTUM">مومنتوم سریع اسکلپ (Scalp Momentum)</option>
                            <option value="HYBRID_CONSENSUS">اجماع هیبریدی سبک‌ها (Multi-Style Consensus)</option>
                          </select>
                        </div>

                        {/* ۳. ماژول تاییدیه حجم و سشن */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-[#1e263c] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300 font-bold text-[11px]">۳. فیلتر تاییدیه (Confirmation):</span>
                            <HelpTooltip
                              titleFa="ماژول تاییدیه دوم"
                              explanationFa="یک لایه اعتبارسنجی مستقل برای اطمینان از اینکه حجم نقدینگی کافی وجود دارد و ورود در خلاء نقدینگی صورت نمی‌گیرد."
                            />
                          </div>
                          <select
                            value={strategyParams.modularComposition.confirmationModule}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                modularComposition: {
                                  ...strategyParams.modularComposition!,
                                  confirmationModule: e.target.value as any,
                                },
                              })
                            }
                            className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-[11px] font-mono"
                          >
                            <option value="SESSION_VOLUME">نقدینگی سشن معاملاتی لندن/نیویورک</option>
                            <option value="ADX_MOMENTUM">قدرت شتاب مومنتوم (ADX Momentum)</option>
                            <option value="MULTI_TIMEFRAME">تاییدیه جهت تایم‌فریم بالاتر (MTF)</option>
                            <option value="NONE">بدون تاییدیه ثانویه (تک مرحله‌ای)</option>
                          </select>
                        </div>

                        {/* ۴. ماژول مدیریت ریسک و خروج */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-[#1e263c] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300 font-bold text-[11px]">۴. مدیریت خروج و ریسک:</span>
                            <HelpTooltip
                              titleFa="ماژول مدیریت ریسک و خروج"
                              explanationFa="نحوه محاسبه استاپ و تارگت معامله. آیا با ATR نوسان‌پذیر باشد یا پشت سطوح ساختار بازار؟"
                            />
                          </div>
                          <select
                            value={strategyParams.modularComposition.riskManagementModule}
                            onChange={(e) =>
                              setStrategyParams({
                                ...strategyParams,
                                modularComposition: {
                                  ...strategyParams.modularComposition!,
                                  riskManagementModule: e.target.value as any,
                                },
                              })
                            }
                            className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-[11px] font-mono"
                          >
                            <option value="ATR_DYNAMIC">پویا بر مبنای ATR نوسان روزانه</option>
                            <option value="STRUCTURE_PROTECTED">محافظت پشت پیوت‌های ساختار قیمت</option>
                            <option value="FIXED_CONSERVATIVE">محافظه‌کارانه با استاپ و تارگت استاندارد</option>
                          </select>
                        </div>
                      </div>

                      {/* پنل شخصی‌سازی عوامل وزن‌دهی و تصمیم‌گیری نهایی */}
                      <div className="bg-[#0d121f] p-3.5 rounded-xl border border-[#222c42] space-y-3">
                        <div className="flex items-center justify-between border-b border-[#1b2234] pb-2">
                          <span className="text-zinc-200 font-bold text-[11px] flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>شخصی‌سازی اوزان و عوامل تعیین‌کننده تصمیم نهایی (Decision Drivers):</span>
                          </span>
                          <span className="text-[10px] text-zinc-500">کنترل حق وتو و حد نصاب صدور معامله</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                          {/* حق وتوی رژیم بازار */}
                          <div className="space-y-1 bg-[#141a29] p-2.5 rounded-lg border border-[#232c40]">
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-300">حق وتوی فیلتر روند (Veto Power):</span>
                              <HelpTooltip
                                titleFa="حق وتوی فیلتر روند"
                                explanationFa="اگر فعال باشد، در صورت عدم تایید فیلتر رژیم یا روند، حتی با وجود تاییدیه سایر ماژول‌ها، ورود به طور ۱۰۰٪ مسدود می‌شود."
                              />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer pt-1 text-zinc-300">
                              <input
                                type="checkbox"
                                checked={strategyParams.modularComposition.decisionWeighting.vetoPowerRegime}
                                onChange={(e) =>
                                  setStrategyParams({
                                    ...strategyParams,
                                    modularComposition: {
                                      ...strategyParams.modularComposition!,
                                      decisionWeighting: {
                                        ...strategyParams.modularComposition!.decisionWeighting,
                                        vetoPowerRegime: e.target.checked,
                                      },
                                    },
                                  })
                                }
                                className="rounded accent-purple-500"
                              />
                              <span className="text-[10px] text-zinc-300">
                                {strategyParams.modularComposition.decisionWeighting.vetoPowerRegime ? 'فعال (مسدودی قطعی سیگنال مخالف)' : 'غیرفعال (اثر امتیازی)'}
                              </span>
                            </label>
                          </div>

                          {/* حداقل نمره اعتماد برای ورود */}
                          <div className="space-y-1 bg-[#141a29] p-2.5 rounded-lg border border-[#232c40]">
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-300">حد نصاب تاییدیه ورود:</span>
                              <span className="text-purple-300 font-mono font-bold">
                                {strategyParams.modularComposition.decisionWeighting.minConfidenceScorePercent}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="50"
                              max="90"
                              step="5"
                              value={strategyParams.modularComposition.decisionWeighting.minConfidenceScorePercent}
                              onChange={(e) =>
                                setStrategyParams({
                                  ...strategyParams,
                                  modularComposition: {
                                    ...strategyParams.modularComposition!,
                                    decisionWeighting: {
                                      ...strategyParams.modularComposition!.decisionWeighting,
                                      minConfidenceScorePercent: Number(e.target.value),
                                    },
                                  },
                                })
                              }
                              className="w-full accent-purple-500"
                            />
                            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                              <span>سریع (۵۰٪)</span>
                              <span>سخت‌گیرانه (۹۰٪)</span>
                            </div>
                          </div>

                          {/* امتیاز تشویقی پرایس‌اکشن و حجم */}
                          <div className="space-y-1 bg-[#141a29] p-2.5 rounded-lg border border-[#232c40]">
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-300">وزن تاییدیه نقدینگی و سشن:</span>
                              <span className="text-cyan-300 font-mono font-bold">
                                {strategyParams.modularComposition.decisionWeighting.sessionVolumeWeightPercent}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              step="5"
                              value={strategyParams.modularComposition.decisionWeighting.sessionVolumeWeightPercent}
                              onChange={(e) =>
                                setStrategyParams({
                                  ...strategyParams,
                                  modularComposition: {
                                    ...strategyParams.modularComposition!,
                                    decisionWeighting: {
                                      ...strategyParams.modularComposition!.decisionWeighting,
                                      sessionVolumeWeightPercent: Number(e.target.value),
                                    },
                                  },
                                })
                              }
                              className="w-full accent-cyan-500"
                            />
                            <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                              <span>بی‌اثر (۰٪)</span>
                              <span>تاثیر بالا (۴۰٪)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
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
                  تنظیم حساب و سشن ←
                </button>
              </div>
            </div>
          )}

          {/* گام ۴: تنظیمات حساب، سشن و حدود ریسک */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-100">
                  گام ۴: پیکربندی حساب آزمایشی، سشن معاملاتی، منطقه زمانی و حدود ریسک
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  مفروضات حساب معاملاتی، سشن‌های بازار، اهرم و سقف‌های ایمنی کنترل سرمایه:
                </p>
              </div>

              {/* ۱. کارت پیکربندی حساب (Account Configuration) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    <span>پیکربندی حساب (Account Configuration):</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">واحد حساب:</span>
                    {(['USD', 'AUD'] as AccountCurrency[]).map((curr) => (
                      <button
                        key={curr}
                        onClick={() => setAccountCurrency(curr)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          accountCurrency === curr
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'bg-[#1b2234] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {curr}
                      </button>
                    ))}
                  </div>
                </div>

                {accountCurrency === 'AUD' && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>توجه: در این مرحله ارز AUD صرفاً واحد نام‌گذاری حساب است و محاسبات بدون نرخ تبدیل متقاطع ارزی زنده انجام می‌شود.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  {/* سرمایه اولیه و پریست‌ها */}
                  <div className="space-y-1.5">
                    <span className="text-zinc-400 text-[11px] block">سرمایه اولیه ({currencySymbol}):</span>
                    <input
                      type="number"
                      min="100"
                      max="10000000"
                      step="100"
                      value={initialCapital}
                      onChange={(e) => setInitialCapital(Number(e.target.value) || 10000)}
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[1000, 5000, 10000, 25000, 50000].map((cap) => (
                        <button
                          key={cap}
                          onClick={() => setInitialCapital(cap)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                            initialCapital === cap
                              ? 'bg-purple-600 text-white font-bold'
                              : 'bg-[#1a2132] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          ${(cap / 1000).toFixed(0)}k
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* اهرم حساب (Leverage) */}
                  <div className="space-y-1.5">
                    <span className="text-zinc-400 text-[11px] block">اهرم معاملاتی (Leverage):</span>
                    <div className="flex items-center gap-1">
                      {([1, 10, 30, 50, 100] as const).map((lev) => (
                        <button
                          key={lev}
                          onClick={() => setLeverage(lev)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                            leverage === lev
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'bg-[#1a2132] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          1:{lev}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* سقف معاملات همزمان */}
                  <div className="space-y-1.5">
                    <span className="text-zinc-400 text-[11px] block">سقف معاملات همزمان:</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={maxConcurrentPositions}
                      onChange={(e) => setMaxConcurrentPositions(Number(e.target.value) || 3)}
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                    />
                  </div>

                  {/* قوانین لات (Lot Step & Min/Max Lot) */}
                  <div className="space-y-1.5">
                    <span className="text-zinc-400 text-[11px] block">حداقل / گام / حداکثر لات:</span>
                    <div className="grid grid-cols-3 gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={minLot}
                        onChange={(e) => setMinLot(Number(e.target.value) || 0.01)}
                        title="Min Lot"
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-1.5 py-1.5 text-center text-zinc-100 font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0.001"
                        value={lotStep}
                        onChange={(e) => setLotStep(Number(e.target.value) || 0.01)}
                        title="Lot Step"
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-1.5 py-1.5 text-center text-zinc-100 font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={maxLot}
                        onChange={(e) => setMaxLot(Number(e.target.value) || 10)}
                        title="Max Lot"
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-1.5 py-1.5 text-center text-zinc-100 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ۲. کارت بازه تاریخی و وارم‌آپ (Date Range & Warmup) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>مدیریت بازه تاریخی و حفظ وارم‌آپ (Date Range & Warmup):</span>
                  </span>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    حالت فعلی: <strong className="text-emerald-400">{dateRangeMode}</strong>
                  </span>
                </div>

                {/* بنر ۶ آمار صادقانه تاریخ و وارم‌آپ */}
                {dateRangeStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-[#1b2234] p-3 rounded-xl border border-[#2d3a54] text-[11px]">
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 block text-[10px]">۱. شروع کل دیتاست:</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {new Date(dateRangeStats.earliest).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 block text-[10px]">۲. پایان کل دیتاست:</span>
                      <span className="font-mono text-zinc-300 font-bold">
                        {new Date(dateRangeStats.latest).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 block text-[10px]">۳. کل کندل‌های در دسترس:</span>
                      <span className="font-mono text-purple-300 font-bold">
                        {dateRangeStats.total.toLocaleString('fa-IR')} کندل
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 block text-[10px]">۴. تاریخ شروع انتخابی:</span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {new Date(dateRangeStats.selStart).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 block text-[10px]">۵. تاریخ پایان انتخابی:</span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {new Date(dateRangeStats.selEnd).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-zinc-500 block text-[10px]">۶. کندل ارزیابی / وارم‌آپ:</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        {dateRangeStats.evalCount.toLocaleString('fa-IR')} ارزیابی / {dateRangeStats.warmupCount.toLocaleString('fa-IR')} وارم‌آپ
                      </span>
                    </div>
                  </div>
                )}

                {/* سلکتور ۸ حالت انتخاب بازه */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px] block">حالت انتخاب بازه زمانی:</span>
                    <select
                      value={dateRangeMode}
                      onChange={(e) => setDateRangeMode(e.target.value as DateRangeMode)}
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs"
                    >
                      <option value="FULL">کل داده‌ها (Full Range)</option>
                      <option value="FIRST_25">۲۵٪ ابتدای داده‌ها (First 25%)</option>
                      <option value="MIDDLE_50">۵۰٪ میانی داده‌ها (Middle 50%)</option>
                      <option value="LAST_25">۲۵٪ انتهای داده‌ها (Last 25%)</option>
                      <option value="ROLLING_3M">۳ ماه اخیر (Rolling 3 Months)</option>
                      <option value="ROLLING_6M">۶ ماه اخیر (Rolling 6 Months)</option>
                      <option value="ROLLING_12M">۱۲ ماه اخیر (Rolling 12 Months)</option>
                      <option value="CUSTOM">بازه سفارشی دستی (Custom Date Range)</option>
                    </select>
                  </div>

                  {dateRangeMode === 'CUSTOM' && (
                    <>
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px] block">تاریخ شروع (میلادی):</span>
                        <input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-zinc-400 text-[11px] block">تاریخ پایان (میلادی):</span>
                        <input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>اصل وارم‌آپ امن: کندل‌های قبل از تاریخ شروع حذف فیزیکی نمی‌شوند تا اندیکاتورها از قبل پایدار باشند، ولی هیچ معامله‌ای قبل از شروع ثبت نمی‌شود.</span>
                </div>
              </div>

              {/* ۳. کارت سشن‌های معاملاتی و منطقه زمانی (Session & Timezone) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3">
                <div className="flex items-center gap-2 border-b border-[#1f2738] pb-2 text-xs font-bold text-cyan-300">
                  <Clock className="w-4 h-4" />
                  <span>فیلتر سشن معاملاتی و منطقه زمانی (Session & IANA Timezone):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px]">سشن معاملاتی ورودی (Entry Session):</span>
                    <select
                      value={sessionFilter}
                      onChange={(e) => setSessionFilter(e.target.value as SessionFilter)}
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs"
                    >
                      <option value="ALL">همه سشن‌ها (۲۴ ساعته)</option>
                      <option value="LONDON">سشن لندن (London 08:00 - 16:30)</option>
                      <option value="NEW_YORK">سشن نیویورک (New York 08:00 - 17:00)</option>
                      <option value="LONDON_NEW_YORK_OVERLAP">هم‌پوشانی طلایی لندن و نیویورک (Overlap)</option>
                      <option value="ASIAN">سشن توکیو و آسیا (Asian 00:00 - 09:00 UTC)</option>
                      <option value="CUSTOM">سشن سفارشی (Custom Hours)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px]">منطقه زمانی با مدیریت DST:</span>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value as TimezoneOption)}
                      className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                    >
                      <option value="UTC">UTC (ساعت هماهنگ جهانی)</option>
                      <option value="Europe/London">Europe/London (لندن با DST پویا)</option>
                      <option value="America/New_York">America/New_York (نیویورک با DST پویا)</option>
                      <option value="Australia/Sydney">Australia/Sydney (سیدنی با DST پویا)</option>
                      <option value="BROKER_FIXED">Broker Fixed Offset (UTC+2 / UTC+3)</option>
                    </select>
                  </div>

                  {sessionFilter === 'CUSTOM' && (
                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px]">ساعت شروع و پایان سفارشی:</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={customStartTime}
                          onChange={(e) => setCustomStartTime(e.target.value)}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2 py-1 text-zinc-100 font-mono text-xs"
                        />
                        <span className="text-zinc-500">تا</span>
                        <input
                          type="time"
                          value={customEndTime}
                          onChange={(e) => setCustomEndTime(e.target.value)}
                          className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2 py-1 text-zinc-100 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* روزهای هفته و بلک‌اوت */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#1f2738] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-[11px]">روزهای مجاز:</span>
                    {[
                      { day: 1, name: 'دوشنبه' },
                      { day: 2, name: 'سه‌شنبه' },
                      { day: 3, name: 'چهارشنبه' },
                      { day: 4, name: 'پنج‌شنبه' },
                      { day: 5, name: 'جمعه' },
                    ].map((d) => {
                      const isSelected = selectedWeekdays.includes(d.day);
                      return (
                        <button
                          key={d.day}
                          onClick={() => {
                            setSelectedWeekdays(
                              isSelected
                                ? selectedWeekdays.filter((x) => x !== d.day)
                                : [...selectedWeekdays, d.day].sort()
                            );
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            isSelected
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-[#1b2234] text-zinc-500'
                          }`}
                        >
                          {d.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                      <input
                        type="checkbox"
                        checked={useRolloverBlackout}
                        onChange={(e) => setUseRolloverBlackout(e.target.checked)}
                        className="rounded border-[#2d3a54] bg-[#1b2234] text-purple-600 focus:ring-0"
                      />
                      <span>بلک‌اوت رول‌اور (۲۱:۵۵ تا ۲۲:۱۵ UTC)</span>
                    </label>

                    <div className="flex items-center gap-1">
                      <span className="text-zinc-400 text-[11px]">حذف لبه سشن:</span>
                      <select
                        value={excludeEdgeMinutes}
                        onChange={(e) => setExcludeEdgeMinutes(Number(e.target.value) || 0)}
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-lg px-2 py-0.5 text-zinc-100 text-xs font-mono"
                      >
                        <option value={0}>غیرفعال (۰ دقیقه)</option>
                        <option value={15}>۱۵ دقیقه اول/آخر</option>
                        <option value={30}>۳۰ دقیقه اول/آخر</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ۳. کارت هزینه‌های معاملاتی و حدود ریسک */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3">
                <div className="flex items-center gap-2 border-b border-[#1f2738] pb-2 text-xs font-bold text-amber-300">
                  <ShieldAlert className="w-4 h-4" />
                  <span>حدود ریسک، سقف زیان روزانه و هزینه‌های بروکر:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px] block">سقف زیان روزانه (Max Daily Loss):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="20"
                        value={maxDailyLossPercent}
                        onChange={(e) => setMaxDailyLossPercent(Number(e.target.value) || 0)}
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs w-24"
                      />
                      <span className="text-zinc-500">٪</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px] block">سقف افت کل سرمایه (Max DD Limit):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={maxTotalDrawdownPercent}
                        onChange={(e) => setMaxTotalDrawdownPercent(Number(e.target.value) || 0)}
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs w-24"
                      />
                      <span className="text-zinc-500">٪</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px] block">اسپرد معمول (Spread):</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={spreadPips}
                        onChange={(e) => setSpreadPips(Number(e.target.value) || 0)}
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs w-24"
                      />
                      <span className="text-zinc-500">پیپ</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px] block">کارمزد هر لات:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        value={commissionPerLot}
                        onChange={(e) => setCommissionPerLot(Number(e.target.value) || 0)}
                        className="bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs w-24"
                      />
                      <span className="text-zinc-500">دلار/لات</span>
                    </div>
                  </div>
                </div>

                {/* ۴. کارت موتور شبیه‌ساز اجرای سفارش و اسلیپیج نوسان‌پذیر (Package C) */}
                <div className="pt-2 border-t border-[#1f2738] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                      <SlidersHorizontal className="w-4 h-4" />
                      <span>اصطکاک اجرا و اسلیپیج نوسان‌پذیر (Execution & Slippage Friction):</span>
                    </div>
                    <span className="text-[9px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                      فعال (Package C)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">مدل اسلیپیج اجرا:</span>
                      <select
                        value={strategyParams.executionFriction?.slippageModelType || 'VOLATILITY_SCALED'}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            executionFriction: {
                              ...strategyParams.executionFriction!,
                              slippageModelType: e.target.value as any,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                      >
                        <option value="VOLATILITY_SCALED">VOLATILITY_SCALED (اسلیپیج متناسب با نوسان کندل)</option>
                        <option value="VOLUME_WEIGHTED">VOLUME_WEIGHTED (اسلیپیج وزنی حجم سفارش)</option>
                        <option value="FIXED">FIXED (اسلیپیج ثابت)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">اسلیپیج پایه (پیپ):</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={strategyParams.executionFriction?.baseSlippagePips ?? 0.2}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            executionFriction: {
                              ...strategyParams.executionFriction!,
                              baseSlippagePips: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">ضریب تشدید نوسان (Multiplier):</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="2"
                        value={strategyParams.executionFriction?.volatilityMultiplier ?? 0.1}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            executionFriction: {
                              ...strategyParams.executionFriction!,
                              volatilityMultiplier: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">مدل اسپرد:</span>
                      <select
                        value={strategyParams.executionFriction?.spreadModelType || 'FIXED'}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            executionFriction: {
                              ...strategyParams.executionFriction!,
                              spreadModelType: e.target.value as any,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                      >
                        <option value="FIXED">FIXED (اسپرد ثابت استاندارد)</option>
                        <option value="DYNAMIC_SESSION">DYNAMIC_SESSION (اسپرد متغیر با رژیم نوسان)</option>
                        <option value="NEWS_VOLATILITY">NEWS_VOLATILITY (اسپرد نوسانی هنگام اخبار)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">رفع ابهام برخورد همزمان SL/TP:</span>
                      <select
                        value={strategyParams.executionFriction?.intrabarAmbiguityPolicy || 'PESSIMISTIC'}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            executionFriction: {
                              ...strategyParams.executionFriction!,
                              intrabarAmbiguityPolicy: e.target.value as any,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                      >
                        <option value="PESSIMISTIC">PESSIMISTIC (بدبینانه: برخورد اول به SL)</option>
                        <option value="BAR_POLARITY">BAR_POLARITY (بر اساس رنگ بدنه کندل)</option>
                        <option value="OPTIMISTIC">OPTIMISTIC (خوش‌بینانه: برخورد اول به TP)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] block">لغو تصادفی اردر لیمیت (%):</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={strategyParams.executionFriction?.randomSkippedFillsPercent ?? 0}
                        onChange={(e) =>
                          setStrategyParams({
                            ...strategyParams,
                            executionFriction: {
                              ...strategyParams.executionFriction!,
                              randomSkippedFillsPercent: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full bg-[#1b2234] border border-[#2d3a54] rounded-xl px-2.5 py-1.5 text-zinc-100 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* سیاست پایان دیتاست */}
                <div className="pt-2 border-t border-[#1f2738] space-y-2 text-xs">
                  <span className="text-xs font-bold text-zinc-300 block">سیاست پایان دیتاست (End of Data Policy):</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        تمام پوزیشن‌های باز در پایان داده با قیمت کلوز و دلیل END_OF_DATA بسته شده و در آمار نهایی ثبت می‌شوند.
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
                <p className="text-xs text-zinc-400 max-w-xl mx-auto leading-relaxed">
                  تست استراتژی «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}» با سرمایه اولیه {currencySymbol}{initialCapital.toLocaleString('en-US')}، سشن «{sessionFilter}» در تایم‌زون {timezone} بر روی {dateRangeStats?.evalCount.toLocaleString('fa-IR')} کندل {symbol} ({selectedTimeframe}).
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

          {/* گام ۶: توضیح و تفسیر نتایج و دیاگنوستیک کامل */}
          {currentStep === 6 && backtestResult && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">
                    گام ۶: نتیجه و تفسیر عملکرد استراتژی ({symbol} / {selectedTimeframe})
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    سرمایه آغازین: {currencySymbol}{initialCapital.toLocaleString('en-US')} | سشن: {sessionFilter} | تایم‌زون: {timezone}
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
                    <div>کاندیداها در سشن: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.candidatesInsideSession ?? 0}</strong></div>
                    <div>رد خارج از سشن: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.candidatesRejectedOutsideSession ?? 0}</strong></div>
                    <div>رد سقف زیان روزانه: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.ordersRejectedByDailyLoss ?? 0}</strong></div>
                    <div>رد سقف افت: <strong className="text-zinc-200 font-mono">{backtestResult.diagnostics?.ordersRejectedByDrawdownLimit ?? 0}</strong></div>
                  </div>
                </div>
              )}

              {/* کارت‌های شاخص‌های کلیدی عملکرد با موجودی آغازین و نهایی */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">سود/زیان خالص کل:</span>
                  <span
                    className={`text-base font-bold font-mono mt-1 block ${
                      backtestResult.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {currencySymbol}{backtestResult.netProfit.toLocaleString('en-US', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{' '}
                    <span className="text-xs">({backtestResult.netProfitPercent}٪)</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">بازدهی نسبت به سرمایه آغازین</span>
                </div>

                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">موجودی / اکوئیتی نهایی:</span>
                  <span className="text-base font-bold text-zinc-100 font-mono mt-1 block">
                    {currencySymbol}{backtestResult.diagnostics?.finalEquity?.toLocaleString('en-US', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }) || `${currencySymbol}${initialCapital}`}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    آغازین: {currencySymbol}{initialCapital.toLocaleString('en-US')}
                  </span>
                </div>

                <div className="bg-[#141926] p-3.5 rounded-2xl border border-[#232c40]">
                  <span className="text-[11px] text-zinc-500 block">حداکثر افت (Drawdown):</span>
                  <span className="text-base font-bold text-amber-400 font-mono mt-1 block">
                    {backtestResult.maxDrawdownPercent}%
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">بزرگ‌ترین افت از اوج سرمایه</span>
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
                  <span className="text-[10px] text-zinc-500 block mt-0.5">نسبت سود به زیان ناخالص</span>
                </div>
              </div>

              {/* کالبدشکافی عمیق معاملات و توزیع سود و زیان‌ها (Granular Trade Distribution & Analytics) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-blue-500/30 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-blue-300">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <span>کالبدشکافی تحلیلی معاملات و توزیع سودها و زیان‌ها (Trade Breakdown & Distribution):</span>
                    <HelpTooltip
                      titleFa="کالبدشکافی تفکیکی معاملات"
                      explanationFa="این بخش تمام پوزیشن‌های بسته شده را تجزیه می‌کند تا بدانید سودها با چه میانگینی و در چه اهدافی بسته شده‌اند، زیان‌ها چقدر بوده‌اند و معاملات قبل از خروج تا چه حد در سود یا ضرر شناور بوده‌اند."
                      practicalTipFa="اگر میانگین زیان از ۱R فراتر رفته، نشان‌دهنده اسلیپیج منفی یا عدم رعایت حد ضرر است."
                      impactOnPropFirmFa="در آزمون‌های پراپ، ثبات میانگین سود به میانگین زیان (Payoff Ratio بالاتر از ۱.۵) تضمین‌کننده بقای حساب است."
                    />
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    تعداد کل پوزیشن‌ها: <strong className="text-zinc-200">{closedTrades.length || backtestResult.totalTrades}</strong>
                  </span>
                </div>

                {/* ردیف ۴ کارته آمار تفکیکی سودها و زیان‌ها */}
                {(() => {
                  const winningTrades = closedTrades.filter(t => (t.realizedPnl || 0) > 0);
                  const losingTrades = closedTrades.filter(t => (t.realizedPnl || 0) < 0);
                  const breakevenTrades = closedTrades.filter(t => (t.realizedPnl || 0) === 0);

                  const totalWinDollars = winningTrades.reduce((s, t) => s + (t.realizedPnl || 0), 0);
                  const totalLossDollars = losingTrades.reduce((s, t) => s + (t.realizedPnl || 0), 0);

                  const avgWinDollar = winningTrades.length > 0 ? totalWinDollars / winningTrades.length : 0;
                  const avgLossDollar = losingTrades.length > 0 ? totalLossDollars / losingTrades.length : 0;

                  const avgWinPercent = initialCapital > 0 ? (avgWinDollar / initialCapital) * 100 : 0;
                  const avgLossPercent = initialCapital > 0 ? (avgLossDollar / initialCapital) * 100 : 0;

                  const maxWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.realizedPnl || 0)) : 0;
                  const maxLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.realizedPnl || 0)) : 0;

                  const avgMaePips = closedTrades.length > 0
                    ? closedTrades.reduce((s, t) => s + (t.maePips || 0), 0) / closedTrades.length
                    : backtestResult.avgMaePips || 0;
                  const avgMfePips = closedTrades.length > 0
                    ? closedTrades.reduce((s, t) => s + (t.mfePips || 0), 0) / closedTrades.length
                    : backtestResult.avgMfePips || 0;

                  const tpHits = closedTrades.filter(t => t.closeReason === 'TP').length;
                  const slHits = closedTrades.filter(t => t.closeReason === 'SL').length;
                  const manualOrOther = closedTrades.length - (tpHits + slHits);

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {/* کارت معاملات سودآور */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-emerald-500/20 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>معاملات سودآور (Wins):</span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {winningTrades.length || backtestResult.winningTrades} معامله
                            </span>
                          </div>
                          <div className="text-sm font-bold font-mono text-emerald-300">
                            میانگین سود: +${avgWinDollar.toFixed(1)}{' '}
                            <span className="text-[10px] text-emerald-400 font-normal">(+{avgWinPercent.toFixed(2)}٪)</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            بهترین معامله: <strong className="text-emerald-400 font-mono">+${maxWin.toFixed(1)}</strong>
                          </div>
                        </div>

                        {/* کارت معاملات زیان‌ده */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-rose-500/20 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span>معاملات زیان‌ده (Losses):</span>
                            <span className="text-rose-400 font-bold font-mono">
                              {losingTrades.length || backtestResult.losingTrades} معامله
                            </span>
                          </div>
                          <div className="text-sm font-bold font-mono text-rose-300">
                            میانگین زیان: ${avgLossDollar.toFixed(1)}{' '}
                            <span className="text-[10px] text-rose-400 font-normal">({avgLossPercent.toFixed(2)}٪)</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            بدترین معامله: <strong className="text-rose-400 font-mono">${maxLoss.toFixed(1)}</strong>
                          </div>
                        </div>

                        {/* تفکیک خروج: TP در برابر SL */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-[#1e263c] space-y-1">
                          <span className="text-[11px] text-zinc-400 block">دلایل خروج پوزیشن‌ها:</span>
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-emerald-400">تارگت (TP): {tpHits}</span>
                            <span className="text-rose-400">استاپ (SL): {slHits}</span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            سر‌به‌سر / پایان داده: <strong className="text-zinc-200 font-mono">{breakevenTrades.length || manualOrOther}</strong>
                          </div>
                        </div>

                        {/* اکسکورشن MAE و MFE */}
                        <div className="bg-[#0f1422] p-3 rounded-xl border border-[#1e263c] space-y-1">
                          <span className="text-[11px] text-zinc-400 block">میانگین نوسان شناور (Excursion):</span>
                          <div className="text-[11px] font-mono text-zinc-300">
                            حرکت در زیان (MAE): <strong className="text-amber-400">{avgMaePips.toFixed(1)} پیپ</strong>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-300">
                            حرکت در سود (MFE): <strong className="text-cyan-400">{avgMfePips.toFixed(1)} پیپ</strong>
                          </div>
                        </div>
                      </div>

                      {/* نوار بصری نسبت برد به باخت و نرخ پرداخت */}
                      <div className="bg-[#0d121f] p-3 rounded-xl border border-[#1a2336] space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-300 font-bold">نسبت بازدهی سود به زیان (Payoff Ratio):</span>
                          <span className="font-mono text-cyan-300 font-bold">
                            {backtestResult.payoffRatio ? backtestResult.payoffRatio.toFixed(2) : (Math.abs(avgWinDollar) / Math.max(1, Math.abs(avgLossDollar))).toFixed(2)}x
                          </span>
                        </div>
                        <div className="w-full bg-[#1b2338] h-2.5 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${Math.max(5, Math.min(95, backtestResult.winRatePercent))}%` }}
                            className="bg-emerald-500 h-full"
                            title={`درصد برد: ${backtestResult.winRatePercent}%`}
                          />
                          <div
                            style={{ width: `${Math.max(5, Math.min(95, 100 - backtestResult.winRatePercent))}%` }}
                            className="bg-rose-500 h-full"
                            title={`درصد باخت: ${(100 - backtestResult.winRatePercent).toFixed(1)}%`}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span className="text-emerald-400 font-mono">سودآور: {backtestResult.winRatePercent}%</span>
                          <span className="text-zinc-500">امید ریاضی خالص: {backtestResult.expectancyR.toFixed(2)}R</span>
                          <span className="text-rose-400 font-mono">زیان‌ده: {(100 - backtestResult.winRatePercent).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* کارت تفکیک اصطکاک اجرای معامله و درگ اسپرد/اسلیپیج (Package C) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>تفکیک هزینه‌های اصطکاک اجرا و تحلیل درگ (Friction Drag & Cost Breakdown):</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    نسبت اصطکاک به سود ناخالص: <strong className="text-amber-400">{((backtestResult.frictionToGrossProfitRatio || 0) * 100).toFixed(1)}٪</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                    <span className="text-[10px] text-zinc-400 block">سود ناخالص (Gross Profit):</span>
                    <span className="text-xs font-bold font-mono text-emerald-400 mt-0.5 block">
                      ${(backtestResult.grossProfit ?? 0).toLocaleString('en-US', { minimumFractionDigits: 1 })}
                    </span>
                  </div>

                  <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                    <span className="text-[10px] text-zinc-400 block">کل هزینه اسپرد (Spread Cost):</span>
                    <span className="text-xs font-bold font-mono text-amber-300 mt-0.5 block">
                      ${(backtestResult.totalSpreadCostDollar ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                    <span className="text-[10px] text-zinc-400 block">کل هزینه اسلیپیج (Slippage Cost):</span>
                    <span className="text-xs font-bold font-mono text-orange-400 mt-0.5 block">
                      ${(backtestResult.totalSlippageCostDollar ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                    <span className="text-[10px] text-zinc-400 block">کمیسیون بروکر:</span>
                    <span className="text-xs font-bold font-mono text-rose-300 mt-0.5 block">
                      ${(backtestResult.totalCommissions ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                    <span className="text-[10px] text-zinc-400 block">مجموع اصطکاک اجرایی:</span>
                    <span className="text-xs font-bold font-mono text-purple-300 mt-0.5 block">
                      ${(backtestResult.frictionCostDollar ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* کارت اعتبارسنجی پیش‌رو چندپنجره‌ای با بافر قرنطینه (Package D: Purged Walk-Forward) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-purple-500/30 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-purple-300">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span>اعتبارسنجی برون‌نمونه‌ای پیش‌رو (Purged Walk-Forward Cross-Validation):</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isWfRunning || candles.length < 100}
                      onClick={async () => {
                        setIsWfRunning(true);
                        setWfErrorMessage(null);
                        try {
                          const { PurgedWalkForwardEngine } = await import('@/lib/core/walk-forward-engine');
                          const report = PurgedWalkForwardEngine.run(
                            candles,
                            symbol,
                            strategyParams,
                            {
                              windowCount: walkForwardWindows,
                              windowType: walkForwardType,
                              purgeBars: walkForwardPurgeBars,
                              minTradesPerWindow: 1,
                            },
                            {
                              style: strategy,
                              initialCash: initialCapital,
                              commissionPerLot,
                              defaultSpreadPips: spreadPips,
                              additionalSlippagePips,
                            }
                          );
                          setWalkForwardReport(report);
                        } catch (err: any) {
                          setWfErrorMessage(err?.message || 'خطا در ارزیابی پیش‌رو');
                        } finally {
                          setIsWfRunning(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 disabled:opacity-40 border border-purple-500/40 text-purple-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      <span>{isWfRunning ? 'در حال ارزیابی...' : 'اجرای Walk-Forward'}</span>
                    </button>
                  </div>
                </div>

                {/* کنترل‌های پنجره و قرنطینه */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0f1422] p-3 rounded-xl border border-[#1e263c]">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">حالت پنجره (Window Mode):</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setWalkForwardType('ANCHORED')}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          walkForwardType === 'ANCHORED'
                            ? 'bg-purple-950 text-purple-200 border-purple-600'
                            : 'bg-[#151b2a] text-zinc-400 border-[#222a3d]'
                        }`}
                      >
                        گسترش‌یابنده (Anchored)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWalkForwardType('ROLLING')}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          walkForwardType === 'ROLLING'
                            ? 'bg-purple-950 text-purple-200 border-purple-600'
                            : 'bg-[#151b2a] text-zinc-400 border-[#222a3d]'
                        }`}
                      >
                        لغزان ثابت (Rolling)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                      <span>تعداد پنجره‌ها (Windows):</span>
                      <span className="font-mono text-purple-300 font-bold">{walkForwardWindows}</span>
                    </label>
                    <input
                      type="range"
                      min={2}
                      max={6}
                      step={1}
                      value={walkForwardWindows}
                      onChange={e => setWalkForwardWindows(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                      <span>کندل‌های قرنطینه حائل (Purge Bars):</span>
                      <span className="font-mono text-purple-300 font-bold">{walkForwardPurgeBars} کندل</span>
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={30}
                      step={1}
                      value={walkForwardPurgeBars}
                      onChange={e => setWalkForwardPurgeBars(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>

                {wfErrorMessage && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                    {wfErrorMessage}
                  </div>
                )}

                {/* نتایج اعتبارسنجی پیش‌رو */}
                {walkForwardReport && (
                  <div className="space-y-3 pt-1">
                    {/* خلاصه استحکام استراتژی */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">نسبت کارایی پیش‌رو (WFE):</span>
                        <span className={`text-xs font-bold font-mono mt-0.5 block ${
                          walkForwardReport.walkForwardEfficiency >= 0.5 ? 'text-emerald-400' :
                          walkForwardReport.walkForwardEfficiency >= 0.25 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {(walkForwardReport.walkForwardEfficiency * 100).toFixed(1)}٪
                        </span>
                      </div>

                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">پایداری پنجره‌ها:</span>
                        <span className="text-xs font-bold font-mono text-cyan-300 mt-0.5 block">
                          {walkForwardReport.passedFolds} از {walkForwardReport.totalFolds} فولد ({walkForwardReport.stabilityScorePercent}٪)
                        </span>
                      </div>

                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">سود کل برون‌نمونه (OOS):</span>
                        <span className={`text-xs font-bold font-mono mt-0.5 block ${
                          walkForwardReport.aggregateOosProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          ${walkForwardReport.aggregateOosProfit.toLocaleString('en-US')}
                        </span>
                      </div>

                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">درجه استحکام:</span>
                        <span className={`text-xs font-bold font-mono mt-0.5 block ${
                          walkForwardReport.robustnessGrade === 'ROBUST' ? 'text-emerald-400' :
                          walkForwardReport.robustnessGrade === 'DEGRADED' ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {walkForwardReport.robustnessGrade === 'ROBUST' ? '✓ مستحکم (ROBUST)' :
                           walkForwardReport.robustnessGrade === 'DEGRADED' ? '⚠ افت توان (DEGRADED)' : '✗ بیش‌برازش (OVERFITTED)'}
                        </span>
                      </div>
                    </div>

                    {/* پیام تشریحی استحکام */}
                    <div className="p-2.5 bg-[#0f1422] border border-[#1e263c] rounded-xl text-[11px] text-zinc-300">
                      {walkForwardReport.robustnessSummaryFa}
                    </div>

                    {/* جدول فولدها */}
                    <div className="overflow-x-auto rounded-xl border border-[#1e263c]">
                      <table className="w-full text-[11px] text-zinc-300">
                        <thead>
                          <tr className="border-b border-[#1e263c] bg-[#0d1120]">
                            <th className="px-3 py-1.5 text-right text-zinc-500">فولد</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">آموزش (Train)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">حائل (Purge)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">آزمون (OOS)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">سود درون‌نمونه</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">سود برون‌نمونه</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">کارایی فولد</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">وضعیت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {walkForwardReport.folds.map(f => (
                            <tr key={f.foldIndex} className="border-b border-[#181f30]">
                              <td className="px-3 py-1.5 text-right font-mono text-purple-300 font-bold">پنجره #{f.foldIndex}</td>
                              <td className="px-3 py-1.5 text-center font-mono text-zinc-400">{f.trainCandlesCount} کندل</td>
                              <td className="px-3 py-1.5 text-center font-mono text-amber-400">{f.purgeCandlesCount} کندل</td>
                              <td className="px-3 py-1.5 text-center font-mono text-cyan-400">{f.testCandlesCount} کندل</td>
                              <td className={`px-3 py-1.5 text-center font-mono ${f.trainMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${f.trainMetrics.netProfit.toFixed(0)}
                              </td>
                              <td className={`px-3 py-1.5 text-center font-mono font-bold ${f.testMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${f.testMetrics.netProfit.toFixed(0)}
                              </td>
                              <td className="px-3 py-1.5 text-center font-mono">
                                {(f.foldEfficiencyRatio * 100).toFixed(0)}٪
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                {f.isFoldPassed ? (
                                  <span className="text-emerald-400">✓ قبول</span>
                                ) : (
                                  <span className="text-rose-400">✗ افت</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* کارت شبیه‌سازی مونت‌کارلو مسیر اکوئیتی و ریسک ورشکستگی (Package E: Monte Carlo) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-cyan-500/30 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>شبیه‌سازی مونت‌کارلو و محاسبه ریسک ورشکستگی (Monte-Carlo & Risk of Ruin):</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isMcRunning || backtestResult.totalTrades < 3}
                      onClick={async () => {
                        setIsMcRunning(true);
                        setMcErrorMessage(null);
                        try {
                          const { AdvancedMonteCarloEngine } = await import('@/lib/core/monte-carlo-engine');
                          // استخراج سود/زیان معاملات بسته شده از بکتست
                          const actualPnls = closedTrades.length > 0
                            ? closedTrades.map(t => t.realizedPnl)
                            : Array.from({ length: backtestResult.totalTrades }, (_, idx) =>
                                idx % 2 === 0
                                  ? (backtestResult.netProfit / Math.max(1, backtestResult.totalTrades)) * 1.5
                                  : -Math.abs((backtestResult.netProfit / Math.max(1, backtestResult.totalTrades)) * 0.8)
                              );

                          const report = AdvancedMonteCarloEngine.simulate(actualPnls, {
                            iterations: mcIterations,
                            method: mcMethod,
                            seed: 1337,
                            initialEquity: initialCapital,
                            ruinDrawdownThresholdPercent: 10,
                            maxAllowedDailyLossPercent: 5,
                          });
                          setMcReport(report);
                        } catch (err: any) {
                          setMcErrorMessage(err?.message || 'خطا در شبیه‌سازی مونت‌کارلو');
                        } finally {
                          setIsMcRunning(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 disabled:opacity-40 border border-cyan-500/40 text-cyan-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      <span>{isMcRunning ? 'در حال شبیه‌سازی...' : `اجرای ${mcIterations} تکرار`}</span>
                    </button>
                  </div>
                </div>

                {/* تنظیمات مونت‌کارلو */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#0f1422] p-3 rounded-xl border border-[#1e263c]">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">شیوه بازنمونه‌گیری (Resampling):</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMcMethod('TRADE_RESHUFFLE')}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          mcMethod === 'TRADE_RESHUFFLE'
                            ? 'bg-cyan-950 text-cyan-200 border-cyan-600'
                            : 'bg-[#151b2a] text-zinc-400 border-[#222a3d]'
                        }`}
                      >
                        جایگشت تصادفی
                      </button>
                      <button
                        type="button"
                        onClick={() => setMcMethod('BLOCK_BOOTSTRAP')}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          mcMethod === 'BLOCK_BOOTSTRAP'
                            ? 'bg-cyan-950 text-cyan-200 border-cyan-600'
                            : 'bg-[#151b2a] text-zinc-400 border-[#222a3d]'
                        }`}
                      >
                        بوت‌استرپ بلوکی
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                      <span>تعداد مسیرها (Iterations):</span>
                      <span className="font-mono text-cyan-300 font-bold">{mcIterations}</span>
                    </label>
                    <input
                      type="range"
                      min={100}
                      max={2000}
                      step={100}
                      value={mcIterations}
                      onChange={e => setMcIterations(Number(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={isStressMatrixRunning || candles.length < 100}
                      onClick={async () => {
                        setIsStressMatrixRunning(true);
                        try {
                          const { StressMatrixEngine } = await import('@/lib/core/stress-matrix-engine');
                          const report = StressMatrixEngine.evaluateMatrix(candles, symbol, strategyParams, {
                            style: strategy,
                            initialCash: initialCapital,
                            dimensions: {
                              spreadMultipliers: [1.0, 1.5, 2.5],
                              additionalSlippagePips: [0.0, 0.5, 1.5],
                            },
                          });
                          setStressMatrixReport(report);
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsStressMatrixRunning(false);
                        }
                      }}
                      className="w-full py-2 bg-[#172033] hover:bg-[#1d2942] disabled:opacity-40 border border-[#2a3a5a] text-cyan-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>{isStressMatrixRunning ? 'در حال تحلیل ماتریس...' : 'ارزیابی ماتریس تنش'}</span>
                    </button>
                  </div>
                </div>

                {mcErrorMessage && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
                    {mcErrorMessage}
                  </div>
                )}

                {/* نتایج مونت‌کارلو */}
                {mcReport && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">احتمال ورشکستگی (Risk of Ruin):</span>
                        <span className={`text-xs font-bold font-mono mt-0.5 block ${
                          mcReport.riskOfRuin.ruinProbabilityPercent <= 5 ? 'text-emerald-400' :
                          mcReport.riskOfRuin.ruinProbabilityPercent <= 15 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {mcReport.riskOfRuin.ruinProbabilityPercent}٪
                        </span>
                      </div>

                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">بدترین دروداون با اطمینان ۹۵٪:</span>
                        <span className={`text-xs font-bold font-mono mt-0.5 block ${
                          mcReport.riskOfRuin.p95MaxDrawdownPercent <= 10 ? 'text-emerald-400' :
                          mcReport.riskOfRuin.p95MaxDrawdownPercent <= 20 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {mcReport.riskOfRuin.p95MaxDrawdownPercent}٪
                        </span>
                      </div>

                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">شانس پاس پراپ‌فرم:</span>
                        <span className="text-xs font-bold font-mono text-cyan-300 mt-0.5 block">
                          {mcReport.riskOfRuin.propFirmPassProbabilityPercent}٪
                        </span>
                      </div>

                      <div className="bg-[#1a2132] p-2.5 rounded-xl border border-[#2a354d]">
                        <span className="text-[10px] text-zinc-400 block">میانه اکوئیتی نهایی (P50):</span>
                        <span className="text-xs font-bold font-mono text-emerald-400 mt-0.5 block">
                          ${mcReport.finalEquityPercentiles.p50.toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>

                    {/* جدول صدک‌های اکوئیتی و دروداون */}
                    <div className="overflow-x-auto rounded-xl border border-[#1e263c]">
                      <table className="w-full text-[11px] text-zinc-300">
                        <thead>
                          <tr className="border-b border-[#1e263c] bg-[#0d1120]">
                            <th className="px-3 py-1.5 text-right text-zinc-500">شاخص آماری</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">بدبینانه (P5)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">چارک پایین (P25)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">میانه (P50)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">چارک بالا (P75)</th>
                            <th className="px-3 py-1.5 text-center text-zinc-500">خوش‌بینانه (P95)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-[#181f30]">
                            <td className="px-3 py-1.5 text-right font-medium text-zinc-400">موجودی نهایی ($)</td>
                            <td className="px-3 py-1.5 text-center font-mono text-rose-300">${mcReport.finalEquityPercentiles.p5.toLocaleString('en-US')}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-amber-300">${mcReport.finalEquityPercentiles.p25.toLocaleString('en-US')}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-cyan-300 font-bold">${mcReport.finalEquityPercentiles.p50.toLocaleString('en-US')}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-emerald-300">${mcReport.finalEquityPercentiles.p75.toLocaleString('en-US')}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-emerald-400 font-bold">${mcReport.finalEquityPercentiles.p95.toLocaleString('en-US')}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-1.5 text-right font-medium text-zinc-400">حداکثر افت (Drawdown %)</td>
                            <td className="px-3 py-1.5 text-center font-mono text-emerald-400">{mcReport.maxDrawdownPercentiles.p5}%</td>
                            <td className="px-3 py-1.5 text-center font-mono text-emerald-300">{mcReport.maxDrawdownPercentiles.p25}%</td>
                            <td className="px-3 py-1.5 text-center font-mono text-cyan-300">{mcReport.maxDrawdownPercentiles.p50}%</td>
                            <td className="px-3 py-1.5 text-center font-mono text-amber-300">{mcReport.maxDrawdownPercentiles.p75}%</td>
                            <td className="px-3 py-1.5 text-center font-mono text-rose-400 font-bold">{mcReport.maxDrawdownPercentiles.p95}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* نتایج ماتریس تنش */}
                {stressMatrixReport && (
                  <div className="space-y-2 pt-2 border-t border-[#1e263c]">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-zinc-300">نتایج ماتریس تنش اصطکاک (Friction Resilience):</span>
                      <span className="font-mono text-cyan-400">
                        {stressMatrixReport.resilienceSummaryFa}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="bg-[#101524] p-2 rounded-lg border border-[#1f2840]">
                        <span className="text-zinc-500 block">حداکثر اسلیپیج قابل تحمل:</span>
                        <span className="font-bold text-emerald-400 font-mono text-xs mt-0.5 block">
                          +{stressMatrixReport.breakEvenSlippageThresholdPips} پیپ
                        </span>
                      </div>
                      <div className="bg-[#101524] p-2 rounded-lg border border-[#1f2840]">
                        <span className="text-zinc-500 block">حداکثر ضریب اسپرد قابل تحمل:</span>
                        <span className="font-bold text-cyan-400 font-mono text-xs mt-0.5 block">
                          {stressMatrixReport.breakEvenSpreadMultiplier}x
                        </span>
                      </div>
                      <div className="bg-[#101524] p-2 rounded-lg border border-[#1f2840]">
                        <span className="text-zinc-500 block">سناریوهای سودآور:</span>
                        <span className="font-bold text-purple-300 font-mono text-xs mt-0.5 block">
                          {stressMatrixReport.profitableScenariosCount} از {stressMatrixReport.totalScenariosEvaluated}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* کارت ممیزی چالش پراپ‌فرم و صدور پاسپورت تأییدیه استراتژی (Package F: Prop Firm Passport) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-amber-500/30 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span>ممیزی چالش پراپ‌فرم و صدور پاسپورت تاییدیه (Prop Firm Strategy Passport):</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPassportAuditing || backtestResult.totalTrades < 3}
                      onClick={async () => {
                        setIsPassportAuditing(true);
                        try {
                          const { PropFirmChallengeAuditor } = await import('@/lib/core/prop-firm-auditor');
                          const passport = PropFirmChallengeAuditor.auditChallenge(
                            backtestResult,
                            {
                              propFirmId: selectedPropFirm,
                              targetAccountSizeDollar: targetAccountSize,
                              phase: 'PHASE_1',
                            },
                            {
                              strategyName: TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy,
                              style: strategy,
                              symbol,
                              timeframe: selectedTimeframe,
                              walkForwardReport,
                              monteCarloReport: mcReport,
                            }
                          );
                          setPropPassport(passport);
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsPassportAuditing(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 disabled:opacity-40 border border-amber-500/40 text-amber-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{isPassportAuditing ? 'در حال ممیزی...' : 'ممیزی و صدور پاسپورت'}</span>
                    </button>
                  </div>
                </div>

                {/* انتخابگر پراپ‌فرم و موجودی */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0f1422] p-3 rounded-xl border border-[#1e263c]">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">قوانین شرکت پراپ‌فرم هدف:</label>
                    <select
                      value={selectedPropFirm}
                      onChange={e => setSelectedPropFirm(e.target.value as PropFirmId)}
                      className="w-full bg-[#171d2c] border border-[#28334a] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs"
                    >
                      {Object.values(PROP_FIRM_PRESETS).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nameFa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">موجودی اکانت ارزیابی:</label>
                    <select
                      value={targetAccountSize}
                      onChange={e => setTargetAccountSize(Number(e.target.value))}
                      className="w-full bg-[#171d2c] border border-[#28334a] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-mono"
                    >
                      <option value={10000}>$10,000 (حساب آزمایشی پایه)</option>
                      <option value={50000}>$50,000 (حساب میان‌رده)</option>
                      <option value={100000}>$100,000 (استاندارد سازمانی)</option>
                      <option value={200000}>$200,000 (اکانت حرفه‌ای)</option>
                    </select>
                  </div>
                </div>

                {/* پاسپورت صادر شده */}
                {propPassport && (
                  <div className="space-y-3 pt-1">
                    <div className="bg-gradient-to-br from-[#1c1810] to-[#121622] p-3.5 rounded-2xl border border-amber-500/40 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-[#30281b] pb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-300 text-xs bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                            {propPassport.sha256Signature}
                          </span>
                          <span className="text-zinc-300 font-bold">{propPassport.strategyName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            propPassport.verdict === 'APPROVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' :
                            propPassport.verdict === 'CONDITIONAL' ? 'bg-amber-950 text-amber-300 border border-amber-700' : 'bg-rose-950 text-rose-300 border border-rose-700'
                          }`}>
                            {propPassport.verdict === 'APPROVED' ? '✓ پاسپورت تأیید شد (APPROVED)' :
                             propPassport.verdict === 'CONDITIONAL' ? '⚠ قبولی مشروط (CONDITIONAL)' : '✗ مردود در چالش (REJECTED)'}
                          </span>
                          <span className="font-mono text-zinc-400 text-[10px]">نمره انطباق: {propPassport.overallScorePercent}٪</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        {propPassport.summaryFa}
                      </p>

                      {/* جدول ممیزی تک‌تک قوانین */}
                      <div className="overflow-x-auto rounded-xl border border-[#2b2416]">
                        <table className="w-full text-[11px] text-zinc-300">
                          <thead>
                            <tr className="border-b border-[#2b2416] bg-[#0c0f17]">
                              <th className="px-3 py-1.5 text-right text-zinc-500">قانون چالش</th>
                              <th className="px-3 py-1.5 text-center text-zinc-500">شرط الزامی</th>
                              <th className="px-3 py-1.5 text-center text-zinc-500">عملکرد مشاهده‌شده</th>
                              <th className="px-3 py-1.5 text-center text-zinc-500">وضعیت</th>
                            </tr>
                          </thead>
                          <tbody>
                            {propPassport.ruleChecks.map(r => (
                              <tr key={r.ruleKey} className="border-b border-[#1c1810]">
                                <td className="px-3 py-1.5 text-right font-medium text-zinc-300">
                                  {r.titleFa}
                                  {r.isFatal && <span className="text-[9px] text-rose-400 mr-1">(حیاتی)</span>}
                                </td>
                                <td className="px-3 py-1.5 text-center font-mono text-zinc-400">{r.requiredConstraint}</td>
                                <td className="px-3 py-1.5 text-center font-mono text-zinc-200">{r.actualObserved}</td>
                                <td className="px-3 py-1.5 text-center">
                                  {r.passed ? (
                                    <span className="text-emerald-400 font-bold">✓ قبولی</span>
                                  ) : (
                                    <span className="text-rose-400 font-bold">✗ عدم انطباق</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* کارت گزارش تجمیعی استراتژی و پل صدور به ژورنال معاملات (Package G) */}
              <div className="bg-[#141926] p-4 rounded-2xl border border-emerald-500/30 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#1f2738] pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>گزارش جامع اجرایی، کارت تصویری و همگام‌سازی با ژورنال (Executive Report & Journal Bridge):</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isGeneratingExecReport || backtestResult.totalTrades === 0}
                      onClick={async () => {
                        setIsGeneratingExecReport(true);
                        try {
                          const { ResearchLab } = await import('@/lib/core/research-lab');
                          const report = ResearchLab.generateExecutiveReport(backtestResult, {
                            strategyName: TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy,
                            strategyStyle: strategy,
                            symbol,
                            timeframe: selectedTimeframe,
                            initialCapital,
                            passport: propPassport,
                            monteCarlo: mcReport,
                            walkForward: walkForwardReport,
                          });
                          setExecutiveReport(report);
                        } catch (err) {
                          console.error('Error generating executive report:', err);
                        } finally {
                          setIsGeneratingExecReport(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 disabled:opacity-40 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <FileText className="w-3 h-3" />
                      <span>{isGeneratingExecReport ? 'در حال تدوین گزارش...' : 'تولید گزارش جامع اجرایی'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={closedTrades.length === 0}
                      onClick={async () => {
                        try {
                          const { ResearchLab } = await import('@/lib/core/research-lab');
                          const batch = ResearchLab.exportTradesToJournal(closedTrades, {
                            strategyName: TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy,
                            symbol,
                          });
                          setJournalExportStatus(`✓ ${batch.totalExportedTrades} معامله با مجموع سود $${batch.totalRealizedNetPnL} به بسته ژورنال منتقل شد.`);
                        } catch (err: any) {
                          setJournalExportStatus(`خطا در انتقال: ${err?.message}`);
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 disabled:opacity-40 border border-blue-500/40 text-blue-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>انتقال {closedTrades.length} معامله به ژورنال</span>
                    </button>

                    <button
                      type="button"
                      disabled={!propPassport && backtestResult.totalTrades === 0}
                      onClick={() => {
                        // ساخت داده کارت اشتراک‌گذاری برای نمایش در مودال گرافیکی
                        const tradeData: ShareableTradeData = {
                          symbol,
                          direction: 'BUY',
                          entryPrice: candles[candles.length - 1]?.close || 1.0,
                          exitPrice: candles[candles.length - 1]?.close || 1.0,
                          realizedNetPnL: backtestResult.netProfit,
                          realizedRMultiple: backtestResult.expectancyR,
                          exitEfficiencyPercent: Math.min(100, Math.round(backtestResult.winRatePercent)),
                          setupGrade: executiveReport?.qualityTier === 'GRADE_A_PRIME' ? 'A+' : 'A',
                          propFirmId: selectedPropFirm,
                          traderNotesFa: executiveReport?.readinessSummaryFa || propPassport?.summaryFa || 'گزارش نتایج شبیه‌سازی استراتژی',
                        };
                        setShareableCardData(tradeData);
                        setIsShareableModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 disabled:opacity-40 border border-amber-500/40 text-amber-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Share2 className="w-3 h-3" />
                      <span>صدور کارت تصویری (Card)</span>
                    </button>
                  </div>
                </div>

                {journalExportStatus && (
                  <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-300 text-[11px] font-mono flex items-center justify-between">
                    <span>{journalExportStatus}</span>
                    <button onClick={() => setJournalExportStatus(null)} className="text-zinc-500 hover:text-zinc-300">✕</button>
                  </div>
                )}

                {/* نمایش نتایج گزارش جامع اجرایی */}
                {executiveReport && (
                  <div className="space-y-3 pt-1">
                    {/* ردیف شاخص‌های ارزیابی */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-[#0f1422] p-2.5 rounded-xl border border-[#1e263c] text-center">
                        <span className="text-[10px] text-zinc-400 block">رتبه کیفی استراتژی:</span>
                        <span className={`text-sm font-bold mt-0.5 block ${
                          executiveReport.qualityTier === 'GRADE_A_PRIME' ? 'text-emerald-400' :
                          executiveReport.qualityTier === 'GRADE_B_VIABLE' ? 'text-blue-400' :
                          executiveReport.qualityTier === 'GRADE_C_RISKY' ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {executiveReport.qualityTier}
                        </span>
                      </div>

                      <div className="bg-[#0f1422] p-2.5 rounded-xl border border-[#1e263c] text-center">
                        <span className="text-[10px] text-zinc-400 block">نمره آمادگی اجرایی:</span>
                        <span className="text-sm font-bold text-zinc-200 mt-0.5 block font-mono">
                          {executiveReport.executiveScorePercent} از ۱۰۰
                        </span>
                      </div>

                      <div className="bg-[#0f1422] p-2.5 rounded-xl border border-[#1e263c] text-center">
                        <span className="text-[10px] text-zinc-400 block">اکوئیتی نهایی برآورد شده:</span>
                        <span className="text-sm font-bold text-emerald-400 mt-0.5 block font-mono">
                          ${executiveReport.finalEquityDollar.toLocaleString('en-US')}
                        </span>
                      </div>

                      <div className="bg-[#0f1422] p-2.5 rounded-xl border border-[#1e263c] text-center">
                        <span className="text-[10px] text-zinc-400 block">شناسه رهگیری گزارش:</span>
                        <span className="text-[10px] text-zinc-400 mt-1 block font-mono">
                          {executiveReport.reportId}
                        </span>
                      </div>
                    </div>

                    {/* نقاط قوت و آسیب‌پذیری‌ها */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-[#0f1422] p-3 rounded-xl border border-emerald-500/20 space-y-1.5">
                        <span className="font-bold text-emerald-400 flex items-center gap-1.5 text-[11px]">
                          <span>✓</span>
                          <span>نقاط قوت و مزیت‌های کلیدی:</span>
                        </span>
                        <ul className="space-y-1 text-[11px] text-zinc-300">
                          {executiveReport.keyStrengthsFa.map((str, idx) => (
                            <li key={idx} className="flex items-center gap-1.5 text-zinc-300">
                              <span className="text-emerald-500 text-[10px]">•</span>
                              <span>{str}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-[#0f1422] p-3 rounded-xl border border-rose-500/20 space-y-1.5">
                        <span className="font-bold text-rose-400 flex items-center gap-1.5 text-[11px]">
                          <span>⚠️</span>
                          <span>حوزه‌های آسیب‌پذیری و هشدارها:</span>
                        </span>
                        <ul className="space-y-1 text-[11px] text-zinc-300">
                          {executiveReport.vulnerabilitiesFa.map((vuln, idx) => (
                            <li key={idx} className="flex items-center gap-1.5 text-zinc-300">
                              <span className="text-rose-500 text-[10px]">•</span>
                              <span>{vuln}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* جمع‌بندی آمادگی */}
                    <div className="p-3 bg-[#0d121f] rounded-xl border border-[#1e263c] text-[11px] text-zinc-300 leading-relaxed">
                      <span className="font-bold text-zinc-200">خلاصه ارزیابی آمادگی: </span>
                      {executiveReport.readinessSummaryFa}
                    </div>
                  </div>
                )}
              </div>

              {/* گزارش عملکرد بر حسب سشن معاملاتی و روز هفته */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* تفکیک سشن */}
                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="font-bold text-zinc-300 block border-b border-[#1f2738] pb-1.5">
                    عملکرد تفکیکی بر حسب سشن معاملاتی:
                  </span>
                  <div className="space-y-1 font-mono text-[11px]">
                    {Object.entries(backtestResult.diagnostics?.tradesBySession || {}).length === 0 ? (
                      <span className="text-zinc-500">معامله‌ای برای تفکیک وجود ندارد.</span>
                    ) : (
                      Object.entries(backtestResult.diagnostics?.tradesBySession || {}).map(([sess, count]) => {
                        const pnl = backtestResult.diagnostics?.profitBySession?.[sess] || 0;
                        return (
                          <div key={sess} className="flex items-center justify-between py-1 border-b border-[#1b2234]">
                            <span className="text-zinc-400">{sess}:</span>
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-300">{count} معامله</span>
                              <span className={pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                {currencySymbol}{pnl.toLocaleString('en-US', { minimumFractionDigits: 1 })}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* تفکیک روز هفته */}
                <div className="bg-[#141926] p-4 rounded-2xl border border-[#232c40] space-y-2">
                  <span className="font-bold text-zinc-300 block border-b border-[#1f2738] pb-1.5">
                    عملکرد تفکیکی بر حسب روز هفته ({timezone}):
                  </span>
                  <div className="space-y-1 font-mono text-[11px]">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => {
                      const count = backtestResult.diagnostics?.tradesByWeekday?.[day] || 0;
                      const pnl = backtestResult.diagnostics?.profitByWeekday?.[day] || 0;
                      return (
                        <div key={day} className="flex items-center justify-between py-1 border-b border-[#1b2234]">
                          <span className="text-zinc-400">{day}:</span>
                          <div className="flex items-center gap-3">
                            <span className="text-zinc-300">{count} معامله</span>
                            <span className={pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                              {currencySymbol}{pnl.toLocaleString('en-US', { minimumFractionDigits: 1 })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                  <div>کاندیداهای شناسایی‌شده: <strong className="text-zinc-200">{backtestResult.diagnostics?.candidatesCount ?? 0}</strong></div>
                  <div>کاندیداها داخل سشن: <strong className="text-zinc-200">{backtestResult.diagnostics?.candidatesInsideSession ?? 0}</strong></div>
                  <div>رد خارج از سشن/روز: <strong className="text-zinc-200">{backtestResult.diagnostics?.candidatesRejectedOutsideSession ?? 0}</strong></div>
                  <div>رد سقف زیان روزانه: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersRejectedByDailyLoss ?? 0}</strong></div>
                  <div>رد سقف افت سرمایه: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersRejectedByDrawdownLimit ?? 0}</strong></div>
                  <div>رد قواعد لات: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersRejectedByLotRules ?? 0}</strong></div>
                  <div>سفارش‌های ثبت‌شده: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersSubmitted ?? 0}</strong></div>
                  <div>سفارش‌های پرشده: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersFilled ?? 0}</strong></div>
                  <div>سفارش‌های منقضی‌شده: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersExpired ?? 0}</strong></div>
                  <div>لغو در پایان دیتاست: <strong className="text-zinc-200">{backtestResult.diagnostics?.ordersCancelledAtEnd ?? 0}</strong></div>
                  <div>بسته‌شده در پایان دیتاست: <strong className="text-zinc-200">{backtestResult.diagnostics?.positionsClosedAtEnd ?? 0}</strong></div>
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
                  استراتژی «{TRADING_STYLES_CONFIG[strategy]?.nameFa || strategy}» بر روی داده‌های تاریخی {symbol} با تایم‌فریم {selectedTimeframe}، سشن «{sessionFilter}» و تایم‌زون {timezone} اجرا شد. سرمایه اولیه {currencySymbol}{initialCapital.toLocaleString('en-US')} بوده و با کسر کامل اسپرد {spreadPips} پیپ، کارمزد ${commissionPerLot} و اسلیپیج، اکوئیتی نهایی به {currencySymbol}{backtestResult.diagnostics?.finalEquity?.toLocaleString('en-US', { minimumFractionDigits: 1 }) || '—'} رسید.
                </p>
                <div className="text-[11px] text-zinc-500 border-t border-[#1f2738] pt-2">
                  ⚠️ <strong>محدودیت داده‌های گذشته:</strong> نتایج شبیه‌سازی تاریخی هرگز تضمینی برای سودآوری در آینده نیست و این گزارش صرفاً ارزش آماری و تحلیلی دارد.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* حالت پیشرفته: آزمایشگاه سناریو مقایسه‌ای (Scenario Comparison Lab) */}
        {viewMode === 'ADVANCED' && (
          <div className="bg-[#121624] border border-purple-500/30 rounded-2xl p-4 space-y-4">
            {/* سرتیتر */}
            <div className="flex items-center justify-between border-b border-[#1e263c] pb-2">
              <span className="text-xs font-bold text-purple-300 flex items-center gap-2">
                <GitCompare className="w-4 h-4" />
                <span>آزمایشگاه سناریو مقایسه‌ای (Scenario Lab)</span>
              </span>
              <button
                onClick={() => setScenarioLabOpen(v => !v)}
                className="text-[11px] text-zinc-400 hover:text-purple-300 transition-colors"
              >
                {scenarioLabOpen ? '▲ بستن تنظیمات' : '▼ باز کردن تنظیمات'}
              </button>
            </div>

            {/* پنل تنظیمات تنش */}
            {scenarioLabOpen && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {/* اسپرد */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">ضریب اسپرد</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0.5} max={3} step={0.1}
                      value={stressSpreadMultiplier}
                      onChange={e => setStressSpreadMultiplier(Number(e.target.value))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="text-xs font-mono text-purple-300 w-8 text-right">
                      {stressSpreadMultiplier.toFixed(1)}x
                    </span>
                  </div>
                </div>

                {/* اسلیپیج */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">اسلیپیج اضافی (پیپ)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0} max={3} step={0.1}
                      value={stressSlippageAdd}
                      onChange={e => setStressSlippageAdd(Number(e.target.value))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="text-xs font-mono text-purple-300 w-8 text-right">
                      {stressSlippageAdd.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* اجرا نشدن تصادفی */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">لغو تصادفی سفارش (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0} max={50} step={1}
                      value={stressSkipFillsPercent}
                      onChange={e => setStressSkipFillsPercent(Number(e.target.value))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="text-xs font-mono text-purple-300 w-8 text-right">
                      {stressSkipFillsPercent}%
                    </span>
                  </div>
                </div>

                {/* گپ شوک */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">ضریب گپ شوک</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={1} max={5} step={0.5}
                      value={stressGapShock}
                      onChange={e => setStressGapShock(Number(e.target.value))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="text-xs font-mono text-purple-300 w-8 text-right">
                      {stressGapShock.toFixed(1)}x
                    </span>
                  </div>
                </div>

                {/* سید */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">سید تکرارپذیری</label>
                  <input
                    type="number" min={1} max={9999999}
                    value={scenarioSeed}
                    onChange={e => setScenarioSeed(Math.max(1, parseInt(e.target.value) || 1337))}
                    className="w-full bg-[#0d1120] border border-[#2a3450] text-purple-200 text-xs rounded-lg px-2 py-1 font-mono"
                  />
                </div>

                {/* دکمه اضافه کردن سناریو */}
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      if (candles.length === 0) return;
                      const stressConfig: AdvancedExecutionStressConfig = {
                        spreadMultiplier: stressSpreadMultiplier,
                        slippageAdditionPips: stressSlippageAdd,
                        randomSkippedFillsPercent: stressSkipFillsPercent,
                        gapShockMultiplier: stressGapShock,
                      };
                      const newId = `scenario-${Date.now()}`;
                      const labelParts: string[] = [];
                      if (stressSpreadMultiplier !== 1) labelParts.push(`اسپرد×${stressSpreadMultiplier}`);
                      if (stressSlippageAdd > 0) labelParts.push(`اسلیپیج+${stressSlippageAdd}`);
                      if (stressSkipFillsPercent > 0) labelParts.push(`لغو${stressSkipFillsPercent}%`);
                      if (stressGapShock !== 1) labelParts.push(`گپ×${stressGapShock}`);
                      const name = labelParts.length > 0 ? labelParts.join(' | ') : 'پایه';
                      if (scenarioRuns.length >= 30) {
                        alert('حداکثر ۳۰ سناریو مجاز است.');
                        return;
                      }
                      setScenarioRuns(prev => [
                        ...prev,
                        { id: newId, name, status: 'PENDING', stressConfig, seed: scenarioSeed },
                      ]);
                    }}
                    disabled={candles.length === 0}
                    className="w-full px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 disabled:opacity-40 border border-purple-500/40 text-purple-200 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن سناریو ({scenarioRuns.length}/30)</span>
                  </button>
                </div>
              </div>
            )}

            {/* صف سناریوها و جدول مقایسه */}
            {scenarioRuns.length > 0 && (
              <div className="space-y-3">
                {/* ردیف عملیات */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{scenarioRuns.length} سناریو آماده مقایسه</span>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        // اجرای سناریوها به صورت موازی (ماکسیمم ۲ همزمان)
                        const { ResearchLab } = await import('@/lib/core/research-lab');
                        const queue = [...scenarioRuns.filter(r => r.status === 'PENDING')];

                        for (const scenario of queue) {
                          setScenarioRuns(prev =>
                            prev.map(r => r.id === scenario.id ? { ...r, status: 'RUNNING' } : r)
                          );
                          try {
                            const result = ResearchLab.runBacktest(candles, symbol, {
                              initialCash: initialCapital,
                              stressConfig: scenario.stressConfig,
                              randomSeed: scenario.seed,
                              defaultSpreadPips: spreadPips,
                              commissionPerLot,
                              additionalSlippagePips,
                            });
                            setScenarioRuns(prev =>
                              prev.map(r =>
                                r.id === scenario.id
                                  ? { ...r, status: 'COMPLETED', metrics: result.metrics }
                                  : r
                              )
                            );
                          } catch (err) {
                            setScenarioRuns(prev =>
                              prev.map(r =>
                                r.id === scenario.id
                                  ? { ...r, status: 'FAILED', error: String(err) }
                                  : r
                              )
                            );
                          }
                        }
                      }}
                      disabled={candles.length === 0 || scenarioRuns.every(r => r.status !== 'PENDING')}
                      className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 disabled:opacity-40 border border-green-500/40 text-green-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3 h-3" />
                      اجرای همه
                    </button>
                    <button
                      onClick={() => {
                        const rows = scenarioRuns.map(r => ({
                          name: r.name,
                          seed: r.seed,
                          status: r.status,
                          netProfit: r.metrics?.netProfit ?? null,
                          winRate: r.metrics?.winRatePercent ?? null,
                          totalTrades: r.metrics?.totalTrades ?? null,
                          maxDrawdown: r.metrics?.maxDrawdownPercent ?? null,
                          profitFactor: r.metrics?.profitFactor ?? null,
                        }));
                        const json = JSON.stringify(
                          { exportedAt: new Date().toISOString(), runs: rows },
                          null, 2
                        );
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `scenario-lab-${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      disabled={scenarioRuns.every(r => r.status !== 'COMPLETED')}
                      className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 disabled:opacity-40 border border-blue-500/40 text-blue-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Download className="w-3 h-3" />
                      صادرات JSON
                    </button>
                    <button
                      onClick={() => setScenarioRuns([])}
                      className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 text-xs rounded-xl flex items-center gap-1.5 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                      پاک کردن
                    </button>
                  </div>
                </div>

                {/* جدول مقایسه نتایج */}
                <div className="overflow-x-auto rounded-xl border border-[#1e263c]">
                  <table className="w-full text-[11px] text-zinc-300">
                    <thead>
                      <tr className="border-b border-[#1e263c] bg-[#0d1120]">
                        <th className="px-3 py-2 text-right text-zinc-500 font-medium">نام سناریو</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium">وضعیت</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium">معاملات</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium">نرخ برد</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium">P/F</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium">سود خالص</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium">حداکثر DD%</th>
                        <th className="px-3 py-2 text-center text-zinc-500 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenarioRuns.map((run) => (
                        <tr key={run.id} className="border-b border-[#1a2035] hover:bg-[#141926]/50 transition-colors">
                          <td className="px-3 py-2 text-right max-w-[160px] truncate font-medium"
                            title={run.name}>{run.name}</td>
                          <td className="px-3 py-2 text-center">
                            {run.status === 'PENDING' && (
                              <span className="text-zinc-500">⏳ در انتظار</span>
                            )}
                            {run.status === 'RUNNING' && (
                              <span className="text-yellow-400 animate-pulse">⚙️ در حال اجرا</span>
                            )}
                            {run.status === 'COMPLETED' && (
                              <span className="text-green-400">✓ تکمیل</span>
                            )}
                            {run.status === 'FAILED' && (
                              <span className="text-red-400" title={run.error}>✗ خطا</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {run.metrics?.totalTrades ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {run.metrics ? `${run.metrics.winRatePercent.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {run.metrics ? run.metrics.profitFactor.toFixed(2) : '—'}
                          </td>
                          <td className={`px-3 py-2 text-center font-mono font-bold ${
                            run.metrics
                              ? run.metrics.netProfit >= 0 ? 'text-green-400' : 'text-red-400'
                              : ''
                          }`}>
                            {run.metrics
                              ? `${run.metrics.netProfit >= 0 ? '+' : ''}${run.metrics.netProfit.toFixed(0)}`
                              : '—'}
                          </td>
                          <td className={`px-3 py-2 text-center font-mono ${
                            run.metrics
                              ? run.metrics.maxDrawdownPercent > 20 ? 'text-red-400' :
                                run.metrics.maxDrawdownPercent > 10 ? 'text-yellow-400' : 'text-green-400'
                              : ''
                          }`}>
                            {run.metrics ? `${run.metrics.maxDrawdownPercent.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() =>
                                setScenarioRuns(prev => prev.filter(r => r.id !== run.id))
                              }
                              className="text-zinc-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* هشدار: محیط کاملاً آفلاین */}
                <div className="text-[10px] text-zinc-600 flex items-center gap-1.5 border-t border-[#1e263c] pt-2">
                  <ShieldAlert className="w-3 h-3 text-zinc-500" />
                  محیط Scenario Lab کاملاً آفلاین است – هیچ سفارش واقعی ارسال نمی‌شود.
                </div>
              </div>
            )}

            {/* اگر داده نیست */}
            {candles.length === 0 && (
              <p className="text-xs text-zinc-600 text-center py-2">
                برای استفاده از Scenario Lab ابتدا داده بارگذاری کنید.
              </p>
            )}

            {/* دکمه Walk-Forward پیشرفته */}
            <div className="border-t border-[#1e263c] pt-3">
              <button
                onClick={() => setIsBacktestModalOpen(true)}
                className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-300 text-xs font-bold rounded-xl flex items-center gap-2 transition-all"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>پنل Walk-Forward چندپنجره‌ای</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isBacktestModalOpen && (
        <MultiStyleBacktestModal
          isOpen={isBacktestModalOpen}
          onClose={() => setIsBacktestModalOpen(false)}
          candles={candles}
          symbol={symbol}
        />
      )}

      {isShareableModalOpen && (
        <ShareableTradeCardModal
          isOpen={isShareableModalOpen}
          onClose={() => setIsShareableModalOpen(false)}
          data={shareableCardData}
        />
      )}
    </main>
  );
}
