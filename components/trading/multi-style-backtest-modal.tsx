// components/trading/multi-style-backtest-modal.tsx
// مودال آزمایشگاه بک‌تست تاریخی چند سبکه همراه با اعتبارسنجی شورا و شبیه‌سازی مونت‌کارلو
// محاسبات ۱۰۰٪ کلاینت‌ساید و آفلاین، مناسب برای موبایل و لپ‌تاپ اسنپ‌دراگون

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Candle, SymbolId } from '@/lib/contracts/market';
import { TradingStyleType } from '@/lib/contracts/regimes';
import {
  BacktestReport,
  BacktestSessionFilter,
  BacktestAIMode,
} from '@/lib/contracts/backtester';
import { useBacktestWorker } from '@/hooks/use-backtest-worker';
import {
  loadYearlyDataset,
  filterCandlesByHorizon,
  TimeHorizon,
  TIME_HORIZONS,
  YearDatasetId,
  BacktestTimeframe,
  type LoadedYearlyDataset,
} from '@/lib/core/yearly-data-loader';
import {
  X,
  Play,
  BarChart3,
  Layers,
  Sparkles,
  Clock,
  ShieldAlert,
  Shield,
  Target,
  Database,
  Calendar,
  Loader2,
  Bot,
  Zap,
  Award,
  ChevronDown,
  ChevronUp,
  Sliders,
  Globe,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface MultiStyleBacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  candles: Candle[];
  symbol: SymbolId;
}

export const MultiStyleBacktestModal: React.FC<MultiStyleBacktestModalProps> = ({
  isOpen,
  onClose,
  candles,
  symbol,
}) => {
  const [customSymbol, setCustomSymbol] = useState<SymbolId | null>(null);
  const selectedSymbol = customSymbol ?? symbol;

  const [selectedYear, setSelectedYear] = useState<YearDatasetId>('2024');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('FULL_YEAR');
  const [backtestTimeframe, setBacktestTimeframe] = useState<BacktestTimeframe>('4H');
  const [yearlyCandles, setYearlyCandles] = useState<Candle[]>([]);
  const [datasetNotice, setDatasetNotice] = useState<string>('');
  const [datasetWarnings, setDatasetWarnings] = useState<string[]>([]);
  const [datasetIsSynthetic, setDatasetIsSynthetic] = useState(false);
  const [loadedDataKey, setLoadedDataKey] = useState<string>('');
  const [loadedDataset, setLoadedDataset] = useState<LoadedYearlyDataset | null>(null);
  const [datasetLoadError, setDatasetLoadError] = useState('');

  const currentDataKey = `${selectedSymbol}-${backtestTimeframe}-${timeHorizon}-${selectedYear}`;
  const isLoadingData = timeHorizon !== 'REPLAY_WINDOW' && loadedDataKey !== currentDataKey;
  const hasDatasetLoadError = timeHorizon !== 'REPLAY_WINDOW' && loadedDataKey === currentDataKey && datasetLoadError.length > 0;

  const activeCandles = useMemo(() => {
    if (timeHorizon === 'REPLAY_WINDOW') {
      return candles;
    }
    return loadedDataKey === currentDataKey ? yearlyCandles : [];
  }, [timeHorizon, candles, currentDataKey, loadedDataKey, yearlyCandles]);

  const [activeTab, setActiveTab] = useState<'QUICK' | 'ADVANCED' | 'REPORT'>('QUICK');

  const dateSpanDetails = useMemo(() => {
    if (activeCandles.length === 0) {
      return {
        jalaliRange: '',
        gregorianRange: '',
        totalDays: 0,
        candleCount: 0,
      };
    }
    const first = activeCandles[0];
    const last = activeCandles[activeCandles.length - 1];

    const jStart = new Date(first.timestamp).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
    const jEnd = new Date(last.timestamp).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });

    const gStart = new Date(first.timestamp).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const gEnd = new Date(last.timestamp).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

    const diffDays = Math.max(1, Math.round((last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24)));

    return {
      jalaliRange: `${jStart} تا ${jEnd}`,
      gregorianRange: `${gStart} — ${gEnd}`,
      totalDays: diffDays,
      candleCount: activeCandles.length,
    };
  }, [activeCandles]);

  const dateSpanInfo = dateSpanDetails.jalaliRange;

  const [style, setStyle] = useState<TradingStyleType | 'ALL'>('ALL');
  const [minCouncilScore, setMinCouncilScore] = useState<number>(70);
  const [minMcProb, setMinMcProb] = useState<number>(35);
  const [riskPercent, setRiskPercent] = useState<number>(0.5);
  const [enablePartialTp, setEnablePartialTp] = useState<boolean>(true);
  const [sessionFilter, setSessionFilter] = useState<BacktestSessionFilter>('ALL');
  const [useDynamicSpread, setUseDynamicSpread] = useState<boolean>(true);
  const [rolloverBlackout, setRolloverBlackout] = useState<boolean>(true);
  const [intraBarModel, setIntraBarModel] = useState<'PESSIMISTIC' | 'BAR_POLARITY'>('BAR_POLARITY');
  const [newsFilter, setNewsFilter] = useState<boolean>(true);
  const [adaptiveRiskScaling, setAdaptiveRiskScaling] = useState<boolean>(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const { run: runInWorker, cancel: cancelBacktest, progress } = useBacktestWorker();

  const [aiMode, setAiMode] = useState<BacktestAIMode>('AI_COUNCIL_S0');
  const [aiModelNameFa, setAiModelNameFa] = useState<string>('شورای ۴ عاملی S0 (پیش‌فرض سریع)');
  const [showVetoedList, setShowVetoedList] = useState<boolean>(false);

  // محاسبه کلاینت‌ساید آمار و توزیع معاملات بر اساس سشن‌های زمانی بازار
  const sessionBreakdown = useMemo(() => {
    if (!report || !report.trades || report.trades.length === 0) return null;

    type SessionBucket = {
      key: 'LONDON' | 'LONDON_NY_OVERLAP' | 'NEW_YORK' | 'ASIA';
      nameFa: string;
      icon: string;
      timeUtc: string;
      timeTehran: string;
      tradesCount: number;
      winsCount: number;
      winRate: number;
      netProfit: number;
    };

    const buckets: Record<'LONDON' | 'LONDON_NY_OVERLAP' | 'NEW_YORK' | 'ASIA', SessionBucket> = {
      LONDON: {
        key: 'LONDON',
        nameFa: 'سشن لندن',
        icon: '🇬🇧',
        timeUtc: '07:00 - 13:00',
        timeTehran: '10:30 تا 16:30',
        tradesCount: 0,
        winsCount: 0,
        winRate: 0,
        netProfit: 0,
      },
      LONDON_NY_OVERLAP: {
        key: 'LONDON_NY_OVERLAP',
        nameFa: 'هم‌پوشانی طلایی لندن و NY',
        icon: '⚡',
        timeUtc: '13:00 - 16:30',
        timeTehran: '16:30 تا 20:00',
        tradesCount: 0,
        winsCount: 0,
        winRate: 0,
        netProfit: 0,
      },
      NEW_YORK: {
        key: 'NEW_YORK',
        nameFa: 'سشن نیویورک',
        icon: '🇺🇸',
        timeUtc: '16:30 - 21:00',
        timeTehran: '20:00 تا 00:30',
        tradesCount: 0,
        winsCount: 0,
        winRate: 0,
        netProfit: 0,
      },
      ASIA: {
        key: 'ASIA',
        nameFa: 'سشن آسیا و اقیانوسیه',
        icon: '🇯🇵',
        timeUtc: '21:00 - 07:00',
        timeTehran: '00:30 تا 10:30',
        tradesCount: 0,
        winsCount: 0,
        winRate: 0,
        netProfit: 0,
      },
    };

    for (const trade of report.trades) {
      const date = new Date(trade.entryTimestamp);
      const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60;

      let key: 'LONDON' | 'LONDON_NY_OVERLAP' | 'NEW_YORK' | 'ASIA';
      if (hourUtc >= 7 && hourUtc < 13) {
        key = 'LONDON';
      } else if (hourUtc >= 13 && hourUtc < 16.5) {
        key = 'LONDON_NY_OVERLAP';
      } else if (hourUtc >= 16.5 && hourUtc < 21) {
        key = 'NEW_YORK';
      } else {
        key = 'ASIA';
      }

      const b = buckets[key];
      b.tradesCount++;
      if (trade.pnlDollar > 0) b.winsCount++;
      b.netProfit = Number((b.netProfit + trade.pnlDollar).toFixed(2));
    }

    for (const k of Object.keys(buckets) as Array<keyof typeof buckets>) {
      const b = buckets[k];
      b.winRate = b.tradesCount > 0 ? Math.round((b.winsCount / b.tradesCount) * 100) : 0;
    }

    const totalHoldingBars = report.trades.reduce((acc, t) => acc + (t.holdingBars || 0), 0);
    const avgHoldingBars = Math.round(totalHoldingBars / report.trades.length);

    return {
      buckets: Object.values(buckets),
      avgHoldingBars,
    };
  }, [report]);

  const handleAiModeChange = (mode: BacktestAIMode) => {
    setAiMode(mode);
    if (mode === 'AI_OFF') setAiModelNameFa('تکنیکال خالص بدون هوش مصنوعی');
    else if (mode === 'AI_COUNCIL_S0') setAiModelNameFa('شورای ۴ ایجنتی S0 (اسکنر، تحلیلگر، منتقد، داور)');
    else if (mode === 'AI_DUAL_GUARD_STRICT') setAiModelNameFa('نگهبان دوگانه نقدینگی و تله‌های قیمت');
    else if (mode === 'AI_ADAPTIVE_CONFIDENCE') setAiModelNameFa('حجم‌گذاری تطبیقی مبتنی بر اطمینان هوش مصنوعی');
  };

  type PresetId = 'SCALP_QUICK' | 'SMC_INTRADAY' | 'SWING_SAFE' | 'AI_COUNCIL' | 'ULTRA_SAFE';

  const applyPreset = (preset: PresetId) => {
    if (preset === 'SCALP_QUICK') {
      setBacktestTimeframe('5M');
      setStyle('SCALP_M1_M5');
      setAiMode('AI_COUNCIL_S0');
      setAiModelNameFa('شورای ۴ عاملی S0');
      setMinCouncilScore(70);
      setMinMcProb(35);
      setRiskPercent(0.5);
      setSessionFilter('ALL');
      setUseDynamicSpread(true);
      setRolloverBlackout(true);
      setNewsFilter(true);
      setAdaptiveRiskScaling(true);
    } else if (preset === 'SMC_INTRADAY') {
      setBacktestTimeframe('15M');
      setStyle('SMC_INTRADAY');
      setAiMode('AI_COUNCIL_S0');
      setAiModelNameFa('شورای ۴ عاملی S0');
      setMinCouncilScore(75);
      setMinMcProb(40);
      setRiskPercent(0.5);
      setSessionFilter('LONDON_NY_OVERLAP');
      setUseDynamicSpread(true);
      setRolloverBlackout(true);
      setNewsFilter(true);
      setAdaptiveRiskScaling(false);
    } else if (preset === 'SWING_SAFE') {
      setBacktestTimeframe('4H');
      setStyle('SWING_MACRO');
      setAiMode('AI_DUAL_GUARD_STRICT');
      setAiModelNameFa('سپر دوگانه هوش مصنوعی (S0 + منتقد سخت‌گیر)');
      setMinCouncilScore(75);
      setMinMcProb(45);
      setRiskPercent(0.25);
      setSessionFilter('ALL');
      setUseDynamicSpread(true);
      setRolloverBlackout(true);
      setNewsFilter(true);
      setAdaptiveRiskScaling(false);
    } else if (preset === 'AI_COUNCIL') {
      setBacktestTimeframe('15M');
      setStyle('ALL');
      setAiMode('AI_DUAL_GUARD_STRICT');
      setAiModelNameFa('سپر دوگانه هوش مصنوعی (S0 + منتقد سخت‌گیر)');
      setMinCouncilScore(75);
      setMinMcProb(40);
      setRiskPercent(0.5);
      setSessionFilter('ALL');
      setUseDynamicSpread(true);
      setRolloverBlackout(true);
      setNewsFilter(true);
      setAdaptiveRiskScaling(true);
    } else if (preset === 'ULTRA_SAFE') {
      setBacktestTimeframe('1H');
      setStyle('ALL');
      setAiMode('AI_ADAPTIVE_CONFIDENCE');
      setAiModelNameFa('حجم‌گذاری شناور بر پایه اطمینان شورا');
      setMinCouncilScore(80);
      setMinMcProb(50);
      setRiskPercent(0.25);
      setSessionFilter('LONDON_NY_OVERLAP');
      setUseDynamicSpread(true);
      setRolloverBlackout(true);
      setNewsFilter(true);
      setAdaptiveRiskScaling(true);
    }
  };

  // بارگذاری داده‌های تاریخی سالانه به صورت ناهمگام و کش‌شده
  useEffect(() => {
    if (!isOpen || timeHorizon === 'REPLAY_WINDOW') return;

    let isCancelled = false;
    loadYearlyDataset(selectedSymbol, backtestTimeframe, selectedYear)
      .then((loaded) => {
        if (isCancelled) return;
        const filtered = filterCandlesByHorizon(loaded.candles, timeHorizon, candles, selectedYear);
        setYearlyCandles(filtered);
        setDatasetNotice(`${loaded.provenance.labelFa} — ${loaded.coverage.labelFa}`);
        setDatasetWarnings([...loaded.provenance.warnings, ...loaded.quality.warnings]);
        setDatasetIsSynthetic(loaded.provenance.isSynthetic);
        setLoadedDataset(loaded);
        setDatasetLoadError('');
        setLoadedDataKey(currentDataKey);
      })
      .catch((err) => {
        if (!isCancelled) {
          setYearlyCandles([]);
          setDatasetNotice(err instanceof Error ? err.message : 'دریافت دیتاست ناموفق بود.');
          setDatasetWarnings([]);
          setDatasetIsSynthetic(false);
          setLoadedDataset(null);
          setDatasetLoadError(err instanceof Error ? err.message : 'دریافت دیتاست ناموفق بود.');
          setLoadedDataKey(currentDataKey);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, selectedSymbol, timeHorizon, backtestTimeframe, selectedYear, candles, currentDataKey]);

  const handleRunBacktest = async () => {
    setIsRunning(true);
    try {
        const res = await runInWorker(activeCandles, {
          symbol: selectedSymbol,
          timeframe: backtestTimeframe,
          style,
          minAlphaConsensusScore: minCouncilScore,
          minMonteCarloTpProbability: minMcProb,
          riskPerTradePercent: riskPercent,
          enablePartialTp,
          sessionFilter,
          useDynamicSpread,
          rolloverBlackout,
          intraBarModel,
          newsFilter,
          adaptiveRiskScaling,
          aiMode,
          aiModelNameFa,
        });
        setReport({
          ...res,
          datasetContext: timeHorizon === 'REPLAY_WINDOW'
            ? {
                mode: 'REPLAY', symbol: selectedSymbol, timeframe: backtestTimeframe, horizon: timeHorizon,
                sourceLabelFa: 'پنجرهٔ جاری ریپلی', dateRangeFa: dateSpanInfo, candleCount: activeCandles.length,
                warnings: ['این اجرا فقط پنجرهٔ ریپلی است و معادل بک‌تست سالانهٔ تاریخی نیست.'], isSynthetic: false,
              }
            : {
                mode: 'HISTORICAL', symbol: selectedSymbol, timeframe: backtestTimeframe, year: selectedYear, horizon: timeHorizon,
                sourceLabelFa: loadedDataset?.provenance.labelFa ?? datasetNotice, dateRangeFa: dateSpanInfo, candleCount: activeCandles.length,
                warnings: datasetWarnings, isSynthetic: loadedDataset?.provenance.isSynthetic ?? false,
              },
        });
        setActiveTab('REPORT');
    } catch (error) {
      setDatasetNotice(error instanceof Error ? error.message : 'بک‌تست ناموفق بود.');
    } finally { setIsRunning(false); }
  };

  const renderActionBar = (showPartialTp: boolean = true) => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#141924] p-3 rounded-2xl border border-[#232c3d]">
      {showPartialTp ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enablePartialTp}
            onChange={e => setEnablePartialTp(e.target.checked)}
            className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
          />
          <span className="text-zinc-200 text-xs font-bold">
            فعال‌سازی خروج ۵۰٪ در ۱.۲R و ریسک‌فری خودکار (فاز ۲)
          </span>
        </label>
      ) : (
        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>آماده ارسال به Worker محاسباتی کلاینت</span>
        </div>
      )}

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          onClick={handleRunBacktest}
          disabled={isRunning || isLoadingData || hasDatasetLoadError || activeCandles.length === 0}
          className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
              <span>در حال اجرا در Worker {progress ? `(${Math.round((progress.completedBars / progress.totalBars) * 100)}٪)` : ''}</span>
            </>
          ) : isLoadingData ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-cyan-200" />
              <span>در حال دریافت داده‌ها...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>اجرای فوری بک‌تست تاریخی</span>
            </>
          )}
        </button>
        {isRunning && (
          <button
            type="button"
            onClick={() => { cancelBacktest(); setIsRunning(false); }}
            className="px-4 py-2.5 rounded-xl font-bold text-amber-200 border border-amber-700 bg-amber-950/40 hover:bg-amber-900/60 transition-colors"
          >
            لغو اجرا
          </button>
        )}
      </div>
    </div>
  );

  const renderPreRunSummary = () => (
    <div className="bg-[#0b0e15] px-3.5 py-2.5 rounded-2xl border border-[#1f2638] flex flex-wrap items-center justify-between gap-2 text-[11px]">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-zinc-400 font-bold">تنظیمات آماده اجرا:</span>
        <span className="font-bold font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
          {selectedSymbol} • {backtestTimeframe}
        </span>
        <span className="text-zinc-300 font-bold">
          سبک: <span className="text-cyan-400">{style === 'ALL' ? 'همه سبک‌ها (تلفیقی)' : style}</span>
        </span>
        <span className="text-zinc-300">
          موتور AI: <span className="text-emerald-400 font-bold">{aiMode === 'AI_OFF' ? 'خاموش (تکنیکال خالص)' : aiModelNameFa}</span>
        </span>
        <span className="text-zinc-300">
          ریسک: <span className="text-amber-400 font-mono font-bold">{riskPercent}٪</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-zinc-400 font-mono text-[10px]">
        <span>{activeCandles.length.toLocaleString('fa-IR')} کندل</span>
        {useDynamicSpread && <span className="text-cyan-400">● اسپرد پویا</span>}
        {newsFilter && <span className="text-rose-400">● فیلتر خبر</span>}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="bg-[#11141c] border border-[#262f40] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* سربرگ مودال */}
        <div className="p-4 border-b border-[#202838] flex items-center justify-between bg-[#141824]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2 flex-wrap">
                <span>آزمایشگاه جامع بک‌تست تاریخی چند سبکه</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  {selectedSymbol} ({activeCandles.length.toLocaleString('fa-IR')} کندل)
                </span>
                <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-bold">
                  سال درخواستی {selectedYear} ({backtestTimeframe})
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                شبیه‌سازی کامل روی هر ۴ نماد با اسپرد پویا، اعتبارسنجی شورای هوش مصنوعی و مونت‌کارلو
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* نوار ناوبری تب‌های سه‌گانه وکتوری (راه‌اندازی سریع، تنظیمات پیشرفته، کارنامه نتایج) */}
        <div className="flex items-center justify-between px-3 sm:px-4 bg-[#141824] border-b border-[#202838] flex-wrap gap-2">
          <div className="flex items-center gap-1.5 py-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('QUICK')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'QUICK'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                  : 'bg-[#181e2b] text-zinc-400 hover:text-zinc-200 border border-[#263044]'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>راه‌اندازی سریع و هوش مصنوعی</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ADVANCED')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'ADVANCED'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                  : 'bg-[#181e2b] text-zinc-400 hover:text-zinc-200 border border-[#263044]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>تنظیمات پیشرفته و ریزساختار</span>
              <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 font-mono font-normal">
                {useDynamicSpread ? 'اسپرد' : ''} {newsFilter ? '• خبر' : ''} {rolloverBlackout ? '• بلک‌اوت' : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('REPORT')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'REPORT'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                  : report
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/80'
                  : 'bg-[#181e2b] text-zinc-500 border border-[#263044] hover:text-zinc-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>کارنامه نتایج و زمان‌ها</span>
              {report && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-500 text-black font-mono font-bold">
                  {report.summary.winRatePercent}٪
                </span>
              )}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-400 font-mono py-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{dateSpanDetails.jalaliRange ? `${dateSpanDetails.jalaliRange} (${dateSpanDetails.totalDays} روز)` : 'آماده‌سازی دیتای تاریخی'}</span>
          </div>
        </div>

        {/* بدنه محتوا اسکرول‌خور با معماری سه‌تب وکتور */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* تب ۱: راه‌اندازی سریع و هوش مصنوعی */}
          {activeTab === 'QUICK' && (
            <div className="space-y-4">
              {/* نوار پریست‌های سریع ۱-کلیکی (بک‌تست آسان و سریع) */}
              <div className="bg-[#0e121a] p-3 rounded-2xl border border-purple-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-200 font-bold flex items-center gap-1.5 text-xs">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>پریست‌های آماده و سریع (بک‌تست آسان ۱-کلیکی):</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">یک کلیک برای تنظیم فوری نماد، تایم‌فریم، شورا و فیلترها</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('SCALP_QUICK')}
                    className="px-2.5 py-1.5 rounded-xl text-center text-[11px] font-bold bg-[#141924] hover:bg-purple-950/60 text-purple-300 border border-purple-800/40 hover:border-purple-600 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>⚡</span>
                    <span>اسکلپ چابک M5</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('SMC_INTRADAY')}
                    className="px-2.5 py-1.5 rounded-xl text-center text-[11px] font-bold bg-[#141924] hover:bg-cyan-950/60 text-cyan-300 border border-cyan-800/40 hover:border-cyan-600 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>🎯</span>
                    <span>اسمارت‌مانی M15</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('SWING_SAFE')}
                    className="px-2.5 py-1.5 rounded-xl text-center text-[11px] font-bold bg-[#141924] hover:bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 hover:border-emerald-600 transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>🛡️</span>
                    <span>سوینگ ماکرو H1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('AI_COUNCIL')}
                    className="px-2.5 py-1.5 rounded-xl text-center text-[11px] font-bold bg-gradient-to-r from-purple-900/50 to-indigo-900/50 hover:from-purple-800/60 hover:to-indigo-800/60 text-indigo-200 border border-indigo-500/50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>🤖</span>
                    <span>بک‌تست شورای AI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('ULTRA_SAFE')}
                    className="px-2.5 py-1.5 rounded-xl text-center text-[11px] font-bold bg-[#141924] hover:bg-amber-950/60 text-amber-300 border border-amber-800/40 hover:border-amber-600 transition-all flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1"
                  >
                    <span>👑</span>
                    <span>ماکزیمم امنیت پراپ</span>
                  </button>
                </div>
              </div>

              {/* بخش انتخاب دامنه زمانی، دیتای تاریخی و سشن‌ها (دیدن زمان‌ها) */}
              <div className="bg-[#0c0f17] p-3.5 rounded-2xl border border-purple-900/30 space-y-3">
                <div className="flex items-center justify-between border-b border-[#1d2331] pb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-xs">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    <span>افق زمانی و دیتای تاریخی (دیدن زمان‌ها):</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {isLoadingData ? (
                      <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        در حال بارگذاری داده‌های تاریخی...
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 bg-[#141926] px-2.5 py-1 rounded-xl border border-[#232c40] flex-wrap">
                        <span className="text-zinc-400 text-[10px]">بازه فعال:</span>
                        <span className="text-cyan-300 font-bold font-sans text-[11px]">{dateSpanDetails.jalaliRange}</span>
                        <span className="text-zinc-600 text-[10px]">|</span>
                        <span className="text-zinc-400 font-mono text-[10px]" dir="ltr">{dateSpanDetails.gregorianRange}</span>
                        <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 font-mono text-[10px] font-bold">
                          {dateSpanDetails.totalDays} روز ({dateSpanDetails.candleCount.toLocaleString('fa-IR')} کندل)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {loadedDataKey === currentDataKey && datasetNotice && <p className={`text-[11px] rounded-lg px-2.5 py-2 ${datasetIsSynthetic ? 'bg-amber-950/40 text-amber-200 border border-amber-900/60' : 'bg-slate-900 text-slate-300 border border-slate-700'}`}>{datasetNotice}</p>}
                {hasDatasetLoadError && <p role="alert" className="text-[11px] rounded-lg px-2.5 py-2 bg-rose-950/40 text-rose-200 border border-rose-900/60">دیتاست تاریخی انتخاب‌شده قابل اجرا نیست؛ به پنجرهٔ ریپلی برگردید یا انتخاب دیگری انجام دهید.</p>}
                {loadedDataKey === currentDataKey && datasetWarnings.length > 0 && <ul className="text-[10px] text-amber-300 space-y-1 list-disc pr-4">{datasetWarnings.slice(0, 3).map(warning => <li key={warning}>{warning}</li>)}</ul>}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* نماد مورد آزمایش */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">نماد معاملاتی:</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'] as SymbolId[]).map(sym => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => setCustomSymbol(sym)}
                          className={`py-1.5 rounded-xl text-center font-mono text-[11px] font-bold transition-all ${
                            selectedSymbol === sym
                              ? 'bg-purple-600 text-white shadow-md'
                              : 'bg-[#151a24] text-zinc-400 hover:text-zinc-200 border border-[#232a3b]'
                          }`}
                        >
                          {sym === 'XAUUSD' ? 'GOLD' : sym.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* انتخاب سال */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">سال داده‌های تاریخی:</label>
                    <div className="grid grid-cols-2 gap-1">
                      {(['2025', '2024'] as YearDatasetId[]).map(yr => (
                        <button
                          key={yr}
                          type="button"
                          disabled={timeHorizon === 'REPLAY_WINDOW'}
                          onClick={() => setSelectedYear(yr)}
                          className={`py-1.5 rounded-xl text-center font-sans text-[11px] font-bold transition-all disabled:opacity-40 ${
                            selectedYear === yr && timeHorizon !== 'REPLAY_WINDOW'
                              ? 'bg-emerald-600 text-white shadow-md'
                              : 'bg-[#151a24] text-zinc-400 hover:text-zinc-200 border border-[#232a3b]'
                          }`}
                        >
                          {yr === '2025' ? '۲۰۲۵ (جدید)' : '۲۰۲۴'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* بازه افق زمانی وکتوری */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">افق زمانی بک‌تست:</label>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: 'FULL_YEAR', label: '📅 کل سال' },
                        { id: 'H2_6M', label: '⛅ ۶ ماه دوم' },
                        { id: 'Q4_3M', label: '🍂 پاییز Q4' },
                        { id: 'REPLAY_WINDOW', label: '🔄 ریپلی چارت' },
                      ].map(h => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setTimeHorizon(h.id as TimeHorizon)}
                          className={`py-1 rounded-lg text-center text-[10px] font-bold transition-all ${
                            timeHorizon === h.id
                              ? 'bg-purple-950 text-purple-200 border border-purple-600 shadow-sm'
                              : 'bg-[#151a24] text-zinc-400 hover:text-zinc-200 border border-[#232a3b]'
                          }`}
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* تایم‌فریم محاسباتی */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">تایم‌فریم کندل‌ها:</label>
                    <div className="grid grid-cols-7 gap-0.5">
                      {(['1M', '5M', '15M', '1H', '4H', 'D1', 'W1'] as const).map(tf => (
                        <button
                          key={tf}
                          type="button"
                          disabled={timeHorizon === 'REPLAY_WINDOW'}
                          onClick={() => setBacktestTimeframe(tf)}
                          className={`py-1.5 rounded-lg text-center font-mono text-[10px] font-bold transition-all disabled:opacity-40 ${
                            backtestTimeframe === tf && timeHorizon !== 'REPLAY_WINDOW'
                              ? 'bg-cyan-600 text-white shadow-md'
                              : 'bg-[#151a24] text-zinc-400 hover:text-zinc-200 border border-[#232a3b]'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* سشن معاملاتی و ساعات ورود وکتوری */}
                <div className="pt-2 border-t border-[#1d2331]/80 space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>فیلتر سشن معاملاتی و ساعات بازار (دیدن زمان‌ها):</span>
                    </span>
                    <span className="text-[10px] text-cyan-300 font-mono">
                      {sessionFilter === 'ALL' && '۲۴ ساعته (همه ساعات شبانه‌روز)'}
                      {sessionFilter === 'LONDON' && '10:30 تا 16:30 تهران (07:00-13:00 UTC)'}
                      {sessionFilter === 'LONDON_NY_OVERLAP' && '16:30 تا 20:00 تهران (13:00-16:30 UTC) - اوج نقدینگی'}
                      {sessionFilter === 'NEW_YORK' && '20:00 تا 00:30 بامداد تهران (16:30-21:00 UTC)'}
                      {sessionFilter === 'ASIA' && '03:30 تا 10:30 صبح تهران (00:00-07:00 UTC)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {[
                      { id: 'ALL', flag: '🌐', name: 'همه سشن‌ها', hours: '۲۴ ساعته' },
                      { id: 'LONDON', flag: '🇬🇧', name: 'لندن', hours: '10:30-16:30' },
                      { id: 'LONDON_NY_OVERLAP', flag: '⚡', name: 'هم‌پوشانی طلایی', hours: '16:30-20:00' },
                      { id: 'NEW_YORK', flag: '🇺🇸', name: 'نیویورک', hours: '20:00-00:30' },
                      { id: 'ASIA', flag: '🇯🇵', name: 'آسیا', hours: '03:30-10:30' },
                    ].map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSessionFilter(s.id as BacktestSessionFilter)}
                        className={`p-2 rounded-xl text-center transition-all border ${
                          sessionFilter === s.id
                            ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 shadow-md'
                            : 'bg-[#141926] border-[#222a3c] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1 font-bold text-[11px]">
                          <span>{s.flag}</span>
                          <span>{s.name}</span>
                        </div>
                        <div className="text-[9px] text-zinc-400 mt-0.5 font-mono">{s.hours}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* پنل ارزیابی و وتوی هوش مصنوعی (AI Backtest Engine) */}
              <div className="bg-gradient-to-br from-[#121024] to-[#0c0f18] p-3.5 rounded-2xl border border-purple-500/30 space-y-2.5">
                <div className="flex items-center justify-between border-b border-purple-900/40 pb-2">
                  <div className="flex items-center gap-2 text-purple-200 font-bold text-xs">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span>موتور هوش مصنوعی در بک‌تست (AI Evaluation & Veto Engine):</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                    aiMode === 'AI_OFF'
                      ? 'bg-zinc-900 text-zinc-400 border-zinc-700'
                      : 'bg-purple-950 text-purple-300 border-purple-700'
                  }`}>
                    {aiMode === 'AI_OFF' ? 'هوش مصنوعی خاموش' : 'هوش مصنوعی فعال'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAiModeChange('AI_OFF')}
                    className={`p-2.5 rounded-xl text-right transition-all border ${
                      aiMode === 'AI_OFF'
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-md'
                        : 'bg-[#141824] border-[#222938] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold text-[11px] text-zinc-200 flex items-center justify-between">
                      <span>خاموش (تکنیکال خالص)</span>
                      {aiMode === 'AI_OFF' && <span className="w-2 h-2 rounded-full bg-zinc-400" />}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
                      تست استراتژی صرفاً بر اساس قواعد تکنیکال بدون وتوی هوش مصنوعی
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAiModeChange('AI_COUNCIL_S0')}
                    className={`p-2.5 rounded-xl text-right transition-all border ${
                      aiMode === 'AI_COUNCIL_S0'
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-md'
                        : 'bg-[#141824] border-[#222938] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold text-[11px] text-purple-200 flex items-center justify-between">
                      <span>شورای ۴-ایجنت S0</span>
                      {aiMode === 'AI_COUNCIL_S0' && <span className="w-2 h-2 rounded-full bg-purple-400 shadow-sm" />}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
                      وتوی معاملات ضعیف بر اساس اجماع تحلیلگر، منتقد، اسکنر و داور
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAiModeChange('AI_DUAL_GUARD_STRICT')}
                    className={`p-2.5 rounded-xl text-right transition-all border ${
                      aiMode === 'AI_DUAL_GUARD_STRICT'
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-md'
                        : 'bg-[#141824] border-[#222938] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold text-[11px] text-cyan-200 flex items-center justify-between">
                      <span>نگهبان دوگانه سخت‌گیر</span>
                      {aiMode === 'AI_DUAL_GUARD_STRICT' && <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm" />}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
                      شورا + وتوی تله‌های استاپ‌هانتینگ و موانع نقدینگی ماژور
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAiModeChange('AI_ADAPTIVE_CONFIDENCE')}
                    className={`p-2.5 rounded-xl text-right transition-all border ${
                      aiMode === 'AI_ADAPTIVE_CONFIDENCE'
                        ? 'bg-purple-950/60 border-purple-500 text-white shadow-md'
                        : 'bg-[#141824] border-[#222938] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-bold text-[11px] text-emerald-200 flex items-center justify-between">
                      <span>حجم‌گذاری تطبیقی هوشمند</span>
                      {aiMode === 'AI_ADAPTIVE_CONFIDENCE' && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
                      تعدیل حجم پوزیشن (۰.۶۵R تا ۱.۰R) متناسب با اطمینان هوش مصنوعی
                    </p>
                  </button>
                </div>
              </div>

              {renderPreRunSummary()}
              {renderActionBar(true)}

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('ADVANCED')}
                  className="text-[11px] text-zinc-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  <span>نیاز به تنظیم دقیق سبک، اسلایدرهای شورا و فیلترهای ریزساختار دارید؟ رفتن به تنظیمات پیشرفته 🎛️</span>
                </button>
              </div>
            </div>
          )}

          {/* تب ۲: تنظیمات پیشرفته و ریزساختار بازار */}
          {activeTab === 'ADVANCED' && (
            <div className="space-y-4">
              {/* بنر معرفی تب پیشرفته */}
              <div className="p-3 bg-[#0d1017] rounded-2xl border border-cyan-900/30 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-cyan-300 text-xs flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <span>تنظیمات پیشرفته ریزساختار، سبک‌ها و مدیریت ریسک</span>
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    فیلترهای سخت‌گیرانه برای تریدرهای حرفه‌ای، تست قوانین پراپ‌فرم و کنترل ریزنوسانات
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('QUICK')}
                  className="px-2.5 py-1 rounded-xl bg-[#141926] text-purple-300 hover:bg-purple-950/60 border border-purple-800/40 text-[10px] font-bold transition-all flex items-center gap-1"
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>بازگشت به راه‌اندازی سریع</span>
                </button>
              </div>

              {/* پنل تنظیمات ردیف اول: سبک‌ها و فیلترهای هوشمند */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d1017] p-3.5 rounded-2xl border border-[#1d2331]">
                {/* سبک معاملاتی */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">سبک معاملاتی:</label>
                  <select
                    value={style}
                    onChange={e => setStyle(e.target.value as TradingStyleType | 'ALL')}
                    className="w-full bg-[#151a24] border border-[#2a3344] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-bold"
                  >
                    <option value="ALL">همه سبک‌ها (تلفیقی)</option>
                    <option value="SCALP_M1_M5">اسکلپ سریع M1/M5</option>
                    <option value="SMC_INTRADAY">اسمارت‌مانی دی‌تریدینگ (SMC)</option>
                    <option value="SWING_MACRO">سوینگ ساختاری H1/H4</option>
                    <option value="MEAN_REVERSION">برگشت به میانگین ۲.۵ سیگما</option>
                    <option value="TREND_BREAKOUT">شکست کانال و روند (Breakout 55/EMA200)</option>
                  </select>
                </div>

                {/* حداقل نمره شورا */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>حداقل نمره شورا:</span>
                    <span className="font-mono text-cyan-400 font-bold">{minCouncilScore}٪</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="90"
                    step="5"
                    value={minCouncilScore}
                    onChange={e => setMinCouncilScore(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* فیلتر مونت‌کارلو */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>احتمال تارگت مونت‌کارلو:</span>
                    <span className="font-mono text-purple-400 font-bold">{minMcProb}٪</span>
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="60"
                    step="5"
                    value={minMcProb}
                    onChange={e => setMinMcProb(Number(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>

                {/* ریسک در هر معامله */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>ریسک هر پوزیشن:</span>
                    <span className="font-mono text-amber-400 font-bold">{riskPercent}٪</span>
                  </label>
                  <div className="flex gap-1">
                    {[0.25, 0.5, 1.0].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRiskPercent(r)}
                        className={`flex-1 py-1 rounded-lg font-mono text-[10px] font-bold border ${
                          riskPercent === r
                            ? 'bg-amber-950 text-amber-300 border-amber-700'
                            : 'bg-[#151a24] text-zinc-400 border-[#262f40]'
                        }`}
                      >
                        {r}٪
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* پنل تنظیمات ردیف دوم: ریزساختار بازار، سشن‌ها و ابهام‌زدایی */}
              <div className="space-y-3 bg-[#0d1017] p-3.5 rounded-2xl border border-[#1d2331]">
                {/* انتخابگرهای سشن زمانی و حل ابهام درون‌کندلی */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-[#1c2331] pb-3">
                  {/* فیلتر سشن معاملاتی */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>فیلتر سشن زمانی:</span>
                    </label>
                    <select
                      value={sessionFilter}
                      onChange={e => setSessionFilter(e.target.value as BacktestSessionFilter)}
                      className="w-full bg-[#151a24] border border-[#2a3344] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-bold"
                    >
                      <option value="ALL">همه سشن‌ها (۲۴ ساعته)</option>
                      <option value="LONDON">سشن لندن (07:00-13:00 UTC)</option>
                      <option value="LONDON_NY_OVERLAP">هم‌پوشانی طلایی لندن و NY (13:00-16:30)</option>
                      <option value="NEW_YORK">سشن نیویورک عصر (16:30-21:00 UTC)</option>
                      <option value="ASIA">سشن آسیا (00:00-07:00 UTC)</option>
                    </select>
                  </div>

                  {/* مدل حل ابهام درون‌کندلی */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-400">رفع ابهام برخورد SL/TP:</label>
                    <select
                      value={intraBarModel}
                      onChange={e => setIntraBarModel(e.target.value as 'PESSIMISTIC' | 'BAR_POLARITY')}
                      className="w-full bg-[#151a24] border border-[#2a3344] rounded-xl px-2.5 py-1.5 text-zinc-100 text-xs font-bold"
                    >
                      <option value="BAR_POLARITY">قطبیت بدنه کندل (Bar Polarity - واقع‌گرایانه)</option>
                      <option value="PESSIMISTIC">سخت‌گیرانه بدبینانه (Pessimistic SL)</option>
                    </select>
                  </div>
                </div>

                {/* ۴ تاگل محافظتی و شبیه‌سازی ریزساختار در شبکه کاملاً متوازن */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {/* تاگل اسپرد متغیر پویا */}
                  <div className="flex items-center justify-between gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
                    <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                      <span className="text-[11px] text-zinc-300 font-bold">اسپرد پویای سشن‌ها</span>
                      <input
                        type="checkbox"
                        checked={useDynamicSpread}
                        onChange={e => setUseDynamicSpread(e.target.checked)}
                        className="rounded accent-cyan-500 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* تاگل فیلتر رول‌اور شبانه */}
                  <div className="flex items-center justify-between gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
                    <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                      <span className="text-[11px] text-zinc-300 font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        <span>بلک‌اوت رول‌اور</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={rolloverBlackout}
                        onChange={e => setRolloverBlackout(e.target.checked)}
                        className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* تاگل فیلتر اخبار پرریسک تقویم */}
                  <div className="flex items-center justify-between gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
                    <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                      <span className="text-[11px] text-zinc-300 font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        <span>فیلتر اخبار ماکرو</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={newsFilter}
                        onChange={e => setNewsFilter(e.target.checked)}
                        className="rounded accent-rose-500 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* تاگل ریسک تطبیقی ضد تیلت */}
                  <div className="flex items-center justify-between gap-2 bg-[#151a24] px-3 py-2 rounded-xl border border-[#262f40]">
                    <label className="flex items-center gap-2 cursor-pointer w-full justify-between">
                      <span className="text-[11px] text-zinc-300 font-bold flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ریسک ضد تیلت</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={adaptiveRiskScaling}
                        onChange={e => setAdaptiveRiskScaling(e.target.checked)}
                        className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {renderPreRunSummary()}
              {renderActionBar(true)}
            </div>
          )}

          {/* تب ۳: کارنامه تحلیلی نتایج و تحلیل زمان‌ها */}
          {activeTab === 'REPORT' && (
            <div className="space-y-4">
              {report ? (
                <div className="space-y-4">
                  {report.datasetContext && (
                    <div className={`rounded-xl border px-3 py-2 text-[11px] ${report.datasetContext.mode === 'REPLAY' || report.datasetContext.isSynthetic ? 'border-amber-800 bg-amber-950/30 text-amber-100' : 'border-cyan-800 bg-cyan-950/25 text-cyan-100'}`}>
                      <strong>دادهٔ اجراشده:</strong> {report.datasetContext.sourceLabelFa} — {report.datasetContext.dateRangeFa} — {report.datasetContext.candleCount.toLocaleString('fa-IR')} کندل ({report.datasetContext.timeframe})
                      {report.datasetContext.warnings.length > 0 && <span className="block mt-1 text-amber-200">{report.datasetContext.warnings[0]}</span>}
                    </div>
                  )}

                  {/* ویجت تحلیل عملکرد بر اساس زمان‌ها و سشن‌های بازار (دیدن زمان‌ها) */}
                  {sessionBreakdown && (
                    <div className="bg-gradient-to-br from-[#101524] to-[#0d101a] p-3.5 rounded-2xl border border-cyan-900/40 space-y-2.5 shadow-md">
                      <div className="flex items-center justify-between border-b border-[#1c2438] pb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                          <Clock className="w-4 h-4 text-cyan-400" />
                          <span>تحلیل عملکرد و وین‌ریت در زمان‌ها و سشن‌های بازار (دیدن زمان‌ها):</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          میانگین ماندگاری در معامله: <strong className="text-cyan-300">{sessionBreakdown.avgHoldingBars} کندل</strong> ({backtestTimeframe})
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {sessionBreakdown.buckets.map(b => (
                          <div
                            key={b.key}
                            className="p-2.5 rounded-xl bg-[#141926] border border-[#21293c] space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[11px] text-zinc-200 flex items-center gap-1.5">
                                <span>{b.icon}</span>
                                <span>{b.nameFa}</span>
                              </span>
                              <span className="text-[9px] text-zinc-400 font-mono">{b.tradesCount} معامله</span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-0.5 border-t border-[#1e2536]">
                              <span>ساعت تهران:</span>
                              <span>{b.timeTehran}</span>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <div className="text-[10px] text-zinc-400">
                                وین‌ریت: <strong className={`font-mono ${b.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>{b.winRate}٪</strong>
                              </div>
                              <div className={`font-mono font-bold text-xs ${b.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
                                {b.netProfit >= 0 ? `+$${b.netProfit}` : `-$${Math.abs(b.netProfit)}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* کارت‌های شاخص‌های کلیدی عملکرد */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                    <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                      <span className="text-[10px] text-zinc-400">تعداد کل معاملات</span>
                      <div className="font-mono text-base font-bold text-zinc-100">{report.summary.totalTrades}</div>
                    </div>

                    <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                      <span className="text-[10px] text-zinc-400">وین‌ریت (درصد برد)</span>
                      <div className={`font-mono text-base font-bold ${
                        report.summary.winRatePercent >= 55 ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {report.summary.winRatePercent}٪
                      </div>
                    </div>

                    <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                      <span className="text-[10px] text-zinc-400">سود خالص (دلار)</span>
                      <div className={`font-mono text-base font-bold ${
                        report.summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`} dir="ltr">
                        {report.summary.netProfit >= 0 ? `+$${report.summary.netProfit}` : `-$${Math.abs(report.summary.netProfit)}`}
                      </div>
                    </div>

                    <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                      <span className="text-[10px] text-zinc-400">پرافیت فاکتور</span>
                      <div className="font-mono text-base font-bold text-cyan-400">{report.summary.profitFactor}</div>
                    </div>

                    <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                      <span className="text-[10px] text-zinc-400">حداکثر افت سرمایه (DD)</span>
                      <div className="font-mono text-base font-bold text-rose-400">{report.summary.maxDrawdownPercent}٪</div>
                    </div>

                    <div className="bg-[#0e121a] p-2.5 rounded-xl border border-[#1e2535]">
                      <span className="text-[10px] text-zinc-400">نسبت شارپ</span>
                      <div className="font-mono text-base font-bold text-purple-400">{report.summary.sharpeRatio}</div>
                    </div>
                  </div>

                  {/* کارت تحلیلی جامع عملکرد هوش مصنوعی و سرمایه نجات‌یافته */}
                  {report.aiMetrics && (
                    <div className="p-4 bg-gradient-to-br from-[#121026] via-[#0e121d] to-[#0c0f18] rounded-2xl border border-purple-500/40 space-y-3 shadow-lg">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-900/40 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            <Bot className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-zinc-100 text-xs">
                              گزارش عملکرد ارزیابی و وتوی هوش مصنوعی ({report.aiMetrics.modelNameFa})
                            </span>
                            <p className="text-[10px] text-zinc-400">
                              مقایسه نتایج تریدها با حضور هوش مصنوعی در برابر تریدر تکنیکال سنتی
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                            نرخ وتو: {report.aiMetrics.vetoRatePercent}٪
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                        <div className="p-2.5 rounded-xl bg-[#141824] border border-[#222938]">
                          <span className="text-zinc-400 text-[10px]">کاندیدهای بررسی‌شده</span>
                          <div className="font-mono font-bold text-zinc-100 text-sm mt-0.5">
                            {report.aiMetrics.totalCandidatesGenerated}
                          </div>
                          <span className="text-[9px] text-zinc-500">
                            تأیید: {report.aiMetrics.approvedCandidatesCount} | وتو: {report.aiMetrics.vetoedCandidatesCount}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#141824] border border-emerald-900/40 bg-emerald-950/10">
                          <span className="text-emerald-400 text-[10px] font-bold">جلوگیری از ضرر حتمی (SL)</span>
                          <div className="font-mono font-bold text-emerald-300 text-sm mt-0.5">
                            {report.aiMetrics.avoidedLossesCount} معامله
                          </div>
                          <span className="text-[9px] text-emerald-500/80">سیگنال‌هایی که استاپ می‌خوردند</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#141824] border border-amber-900/40 bg-amber-950/10">
                          <span className="text-amber-400 text-[10px] font-bold">سرمایه نجات‌یافته توسط AI</span>
                          <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5" dir="ltr">
                            +${report.aiMetrics.capitalSavedDollars.toLocaleString()}
                          </div>
                          <span className="text-[9px] text-zinc-400">جلوگیری مستقیم از افت اکوئیتی</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#141824] border border-[#222938]">
                          <span className="text-zinc-400 text-[10px]">ارتقای وین‌ریت با AI</span>
                          <div className="font-mono font-bold text-cyan-300 text-sm mt-0.5">
                            {report.aiMetrics.winRateWithAI}٪ <span className="text-zinc-500 text-xs">vs</span> {report.aiMetrics.winRateWithoutAI}٪
                          </div>
                          <span className={`text-[9px] font-bold ${
                            report.aiMetrics.winRateWithAI >= report.aiMetrics.winRateWithoutAI ? 'text-emerald-400' : 'text-amber-400'
                          }`}>
                            {report.aiMetrics.winRateWithAI >= report.aiMetrics.winRateWithoutAI ? '▲ رشد نرخ برد' : 'بدون تغییر'}
                          </span>
                        </div>
                      </div>

                      {/* دکمه و آکاردئون لیست تریدهای وتوشده */}
                      {report.aiMetrics.vetoedTradesSample.length > 0 && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowVetoedList(prev => !prev)}
                            className="w-full flex items-center justify-between p-2 rounded-xl bg-[#141926] hover:bg-[#181e2e] text-zinc-300 border border-[#20283a] transition-all text-xs font-bold"
                          >
                            <span className="flex items-center gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                              <span>مشاهده نمونه سیگنال‌های وتوشده توسط هوش مصنوعی ({report.aiMetrics.vetoedTradesSample.length} مورد)</span>
                            </span>
                            {showVetoedList ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                          </button>

                          {showVetoedList && (
                            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {report.aiMetrics.vetoedTradesSample.map(vt => (
                                <div
                                  key={vt.id}
                                  className="p-2 rounded-xl bg-[#0c0f17] border border-[#1d2334] flex flex-wrap items-center justify-between gap-2 text-[10px]"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded font-bold font-mono text-[9px] ${
                                      vt.direction === 'BUY' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                                    }`}>
                                      {vt.direction}
                                    </span>
                                    <span className="text-zinc-300 font-mono">
                                      {new Date(vt.timestamp).toLocaleDateString('fa-IR')}
                                    </span>
                                    <span className="text-zinc-400 font-mono">@ {vt.entryPrice}</span>
                                    <span className="text-purple-300 font-bold">امتیاز: {vt.councilScore}٪</span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-zinc-400">{vt.vetoReasonFa}</span>
                                    <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                                      vt.hypotheticalOutcome === 'AVOIDED_LOSS'
                                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                                        : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                                    }`}>
                                      {vt.hypotheticalOutcome === 'AVOIDED_LOSS' ? '✓ نجات از استاپ‌لاس' : '✗ سود از دست رفته'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* منحنی اکوئیتی SVG */}
                  {report.equityCurve.length > 1 && (
                    <div className="p-3.5 bg-[#0e121a] rounded-2xl border border-[#1e2535] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-200">منحنی رشد سرمایه (Equity Curve)</span>
                        <span className="text-zinc-400 text-[10px]">
                          موجودی اولیه: ${report.config.initialCapital} → پایانی: ${report.equityCurve[report.equityCurve.length - 1].equity}
                        </span>
                      </div>
                      <div className="h-36 w-full relative">
                        <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                          {/* خط پایه سرمایه اولیه */}
                          <line x1="0" y1="60" x2="500" y2="60" stroke="#263042" strokeDasharray="3,3" strokeWidth="1" />
                          {/* خط منحنی اکوئیتی */}
                          {(() => {
                            const minEq = Math.min(...report.equityCurve.map(p => p.equity), report.config.initialCapital * 0.95);
                            const maxEq = Math.max(...report.equityCurve.map(p => p.equity), report.config.initialCapital * 1.05);
                            const range = maxEq - minEq || 1;
                            const points = report.equityCurve.map((p, idx) => {
                              const x = (idx / (report.equityCurve.length - 1)) * 500;
                              const y = 110 - ((p.equity - minEq) / range) * 100;
                              return `${x.toFixed(1)},${y.toFixed(1)}`;
                            }).join(' ');

                            return (
                              <polyline
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={points}
                              />
                            );
                          })()}
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* تفکیک عملکرد بر اساس رژیم بازار و دقت مونت‌کارلو */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* ارزیابی همبستگی مونت‌کارلو */}
                    <div className="p-3 bg-[#0d1017] rounded-xl border border-[#1e2535] space-y-1.5">
                      <span className="font-bold text-purple-300 flex items-center gap-1.5 text-[11px]">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>سنجش دقت پیش‌بینی موتور مونت‌کارلو</span>
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-center text-[10px] pt-1">
                        <div className="p-2 rounded-lg bg-[#141822]">
                          <span className="text-zinc-400">وین‌ریت پیش‌بینی بالا (&ge;۶۵٪)</span>
                          <div className="font-mono text-emerald-400 font-bold text-xs">
                            {report.monteCarloAccuracy.highProbWinRate}٪ ({report.monteCarloAccuracy.highProbTradesCount} معامله)
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-[#141822]">
                          <span className="text-zinc-400">وین‌ریت پیش‌بینی معمولی</span>
                          <div className="font-mono text-zinc-300 font-bold text-xs">
                            {report.monteCarloAccuracy.lowProbWinRate}٪ ({report.monteCarloAccuracy.lowProbTradesCount} معامله)
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400 pt-1">
                        {report.monteCarloAccuracy.correlationNoteFa}
                      </p>
                    </div>

                    {/* تفکیک بر اساس سبک یا رژیم */}
                    <div className="p-3 bg-[#0d1017] rounded-xl border border-[#1e2535] space-y-1.5">
                      <span className="font-bold text-cyan-300 flex items-center gap-1.5 text-[11px]">
                        <Layers className="w-3.5 h-3.5" />
                        <span>توزیع سود بر اساس رژیم‌های بازار</span>
                      </span>
                      <div className="space-y-1 pt-1 max-h-28 overflow-y-auto">
                        {Object.entries(report.regimePerformance).map(([regKey, stat]) => (
                          <div key={regKey} className="flex items-center justify-between p-1.5 rounded bg-[#131722] text-[10px]">
                            <span className="text-zinc-300 font-mono">{regKey}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-400">{stat?.tradesCount} معامله</span>
                              <span className="text-cyan-400 font-mono font-bold">{stat?.winRate}٪</span>
                              <span className={`font-mono font-bold ${
                                (stat?.netProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`} dir="ltr">
                                ${stat?.netProfit}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ارزیابی بقا و ریسک ورشکستگی مونت‌کارلو در پراپ‌فرم */}
                  {report.equityMonteCarlo && (
                    <div className="p-4 bg-gradient-to-br from-[#101420] to-[#0c1018] rounded-2xl border border-[#232c40] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1c2436] pb-2.5">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-zinc-100 text-xs">
                            تحلیل مونت‌کارلو توالی معاملات و بقا در چالش‌های پراپ‌فرم ({report.equityMonteCarlo.iterations} تکرار)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                            report.equityMonteCarlo.safetyRating === 'INSTITUTIONAL_SAFE'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : report.equityMonteCarlo.safetyRating === 'ROBUST_EDGE'
                              ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              : report.equityMonteCarlo.safetyRating === 'MODERATE_RISK'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          }`}>
                            {report.equityMonteCarlo.safetyRating === 'INSTITUTIONAL_SAFE'
                              ? 'امنیت سطح سازمانی'
                              : report.equityMonteCarlo.safetyRating === 'ROBUST_EDGE'
                              ? 'برتری آماری مستحکم'
                              : report.equityMonteCarlo.safetyRating === 'MODERATE_RISK'
                              ? 'ریسک متوسط'
                              : 'هشدار ریسک ورشکستگی'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                        <div className="p-2.5 rounded-xl bg-[#141926] border border-[#1f2638]">
                          <span className="text-zinc-400 text-[10px]">احتمال قبولی در چالش</span>
                          <div className="font-mono font-bold text-emerald-400 text-sm">
                            {report.equityMonteCarlo.riskMetrics.propFirmPassProbabilityPercent}٪
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#141926] border border-[#1f2638]">
                          <span className="text-zinc-400 text-[10px]">احتمال ورشکستگی (Ruin)</span>
                          <div className={`font-mono font-bold text-sm ${
                            report.equityMonteCarlo.riskMetrics.ruinProbabilityPercent <= 5 ? 'text-cyan-400' : 'text-rose-400'
                          }`}>
                            {report.equityMonteCarlo.riskMetrics.ruinProbabilityPercent}٪
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#141926] border border-[#1f2638]">
                          <span className="text-zinc-400 text-[10px]">دراودان سناریوی ۹۵٪</span>
                          <div className="font-mono font-bold text-amber-400 text-sm">
                            {report.equityMonteCarlo.drawdownDistribution.p95}٪
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#141926] border border-[#1f2638]">
                          <span className="text-zinc-400 text-[10px]">میانه بدترین زنجیره ضرر</span>
                          <div className="font-mono font-bold text-zinc-200 text-sm">
                            {report.equityMonteCarlo.riskMetrics.medianMaxConsecutiveLosses} معامله
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 bg-[#121622] p-2.5 rounded-xl border border-[#1e2536] leading-relaxed">
                        {report.equityMonteCarlo.summaryFa}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-16 text-center space-y-3 bg-[#0d1017] rounded-3xl border border-[#1f2638] my-2">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-zinc-200 text-sm">هنوز بک‌تستی اجرا نشده است</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    برای مشاهده نتایج، منحنی سود، ارزیابی هوش مصنوعی و تحلیل سشن‌های زمانی بازار، ابتدا از تب «راه‌اندازی سریع» یک بک‌تست اجرا کنید.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('QUICK')}
                    className="px-4 py-2 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 text-white text-xs inline-flex items-center gap-2 shadow-lg transition-all"
                  >
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>رفتن به راه‌اندازی سریع و هوش مصنوعی</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

