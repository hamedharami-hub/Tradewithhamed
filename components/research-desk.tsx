'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  FileUp,
  FlaskConical,
  Gauge,
  Info,
  Layers3,
  LineChart,
  LoaderCircle,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  StepForward,
  Upload,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { ChartCanvas } from '@/components/trading/chart-canvas';
import { AVAILABLE_OFFLINE_MODELS } from '@/lib/ai/browser-offline-ai';
import { AGENT_ROLES_INFO, type AgentRole } from '@/lib/contracts/multi-agent-system';
import { SYMBOL_SPECS, type Candle, type SymbolId, type Timeframe } from '@/lib/contracts/market';
import { TRADING_STYLES_CONFIG, type TradingStyleType } from '@/lib/contracts/regimes';
import { DataWorkbench } from '@/lib/core/data-workbench';
import { MultiStyleEngine } from '@/lib/core/multi-style-engine';
import { ResearchLab, type PerformanceMetrics } from '@/lib/core/research-lab';
import { EURUSD_CANDLES_FIXTURE_5M } from '@/lib/replay/fixtures/eurusd-candles';
import { GOLD_CANDLES_FIXTURE_5M } from '@/lib/replay/fixtures/gold-candles';
import {
  DATASET_IMPORT_GUIDANCE_FA,
  datasetsForSymbol,
  formatDatasetDateRange,
  type HistoricalDatasetCatalogItem,
} from '@/lib/research/dataset-catalog';
import { bundledDatasetForSymbol, bundledIntradayDatasetForSymbol } from '@/lib/research/bundled-historical-datasets';
import { createDatasetFromCandles } from '@/lib/research/dataset';
import { createBaselineResearchConfig } from '@/lib/research/default-config';
import { ResearchExperimentEngine } from '@/lib/research/experiment-engine';
import type { AIReviewMode, ResearchExperimentResult, StrategyVariantId } from '@/lib/research/contracts';

type DeskMode = 'BACKTEST' | 'REPLAY' | 'PAPER';

interface PaperTicket {
  id: string;
  createdAt: number;
  symbol: SymbolId;
  style: TradingStyleType;
  direction: 'BUY' | 'SELL';
  entry: number;
  stop: number;
  target: number;
  status: 'PENDING_REPLAY';
}

const SYMBOLS: Array<{ id: SymbolId; label: string; className: string }> = [
  { id: 'XAUUSD', label: 'XAUUSD · طلا', className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  { id: 'EURUSD', label: 'EURUSD · یورو', className: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
  { id: 'GBPUSD', label: 'GBPUSD · پوند', className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  { id: 'USDJPY', label: 'USDJPY · ین', className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'BTCUSD', label: 'BTCUSD · بیت‌کوین', className: 'text-orange-300 border-orange-500/30 bg-orange-500/10' },
];

const TIMEFRAMES: Timeframe[] = ['1M', '5M', '15M', '1H', '4H', 'D1', 'W1'];

const STYLE_DESCRIPTIONS: Record<TradingStyleType, string> = {
  SCALP_M1_M5: 'بازگشت سریع میکروساختار در M1/M5؛ فقط با هزینهٔ محافظه‌کارانه و بازهٔ کوتاه.',
  SMC_INTRADAY: 'سوییپ نقدینگی و FVG روی کندل‌های بسته؛ ورود فرضی در کندل بعد و نه همان کندل.',
  TREND_BREAKOUT: 'شکست کانال ۵۵ دوره‌ای همسو با شیب EMA200 و فیلتر رژیم بازار.',
  SWING_MACRO: 'تداوم روند در تایم‌فریم بالاتر؛ برای دادهٔ H1/H4 و افق نگهداری طولانی‌تر.',
  MEAN_REVERSION: 'بازگشت از انحراف آماری فقط در رنج؛ در بازار رونددار به‌صورت پیش‌فرض مسدود است.',
};

const MODEL_CHOICES = [
  's0-deterministic',
  'deep-critic-strict',
  'smollm2-360m-mlc',
  'qwen3.5-0.8b-mlc',
  'llama-3.2-3b-instruct-mlc',
  'phi-4-mini-instruct-mlc',
];

const RESEARCH_VARIANTS: Array<{ id: StrategyVariantId; labelFa: string; descriptionFa: string }> = [
  { id: 'S0_SWEEP_ONLY', labelFa: 'S0 · سوییپ', descriptionFa: 'reclaim پس از سوییپ پیوت تاییدشده' },
  { id: 'S0_SWEEP_FVG', labelFa: 'S0 · سوییپ + FVG', descriptionFa: 'سوییپ هم‌جهت همراه شکاف ارزش منصفانه' },
  { id: 'BOS_ORDER_BLOCK_V1', labelFa: 'BOS / Order Block', descriptionFa: 'عبور ساختار و آخرین کندل مخالف' },
  { id: 'FVG_EQUILIBRIUM_V1', labelFa: 'FVG Equilibrium', descriptionFa: 'بازگشت به میانه شکاف تشکیل‌شده' },
  { id: 'MEAN_REVERSION_V1', labelFa: 'Mean Reversion', descriptionFa: 'بازگشت Z-score فقط در رنج' },
  { id: 'TREND_BREAKOUT_55_EMA200_V1', labelFa: 'Breakout 55 / EMA200', descriptionFa: 'Donchian 55 با فیلتر جهت EMA200' },
];

const BATCH_AI_MODES: Array<{ id: Extract<AIReviewMode, 'OFF' | 'DETERMINISTIC_COUNCIL'>; labelFa: string; descriptionFa: string }> = [
  { id: 'OFF', labelFa: 'بدون AI', descriptionFa: 'baseline قوانین بدون فیلتر AI' },
  { id: 'DETERMINISTIC_COUNCIL', labelFa: 'شورای قطعی', descriptionFa: 'قواعد محافظه‌کارانهٔ ریسک و رژیم' },
];

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function formatUtc(timestamp: number): string {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function fixtureFor(symbol: SymbolId): Candle[] {
  if (symbol === 'XAUUSD') return GOLD_CANDLES_FIXTURE_5M;
  if (symbol === 'EURUSD') return EURUSD_CANDLES_FIXTURE_5M;
  return [];
}

function precisionFor(symbol: SymbolId): number {
  if (symbol === 'XAUUSD' || symbol === 'BTCUSD') return 2;
  if (symbol === 'USDJPY') return 3;
  return 5;
}

export function ResearchDesk() {
  const [mode, setMode] = useState<DeskMode>('BACKTEST');
  const [symbol, setSymbol] = useState<SymbolId>('XAUUSD');
  const [baseTimeframe, setBaseTimeframe] = useState<Timeframe>('5M');
  const [targetTimeframe, setTargetTimeframe] = useState<Timeframe>('5M');
  const [strategy, setStrategy] = useState<TradingStyleType>('SMC_INTRADAY');
  const [modelId, setModelId] = useState('s0-deterministic');
  const [enabledRoles, setEnabledRoles] = useState<AgentRole[]>(['SCANNER', 'ANALYST', 'CRITIC', 'JUDGE']);
  const [baseCandles, setBaseCandles] = useState<Candle[]>(() => fixtureFor('XAUUSD'));
  const [sourceLabel, setSourceLabel] = useState('نمونهٔ آموزشی داخلی؛ برای پژوهش واقعی CSV وارد کنید');
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<HistoricalDatasetCatalogItem | null>(null);
  const [replayIndex, setReplayIndex] = useState(20);
  const [isPlaying, setIsPlaying] = useState(false);
  const [initialCash, setInitialCash] = useState(10000);
  const [spreadPips, setSpreadPips] = useState(SYMBOL_SPECS.XAUUSD.typicalSpreadPips);
  const [commission, setCommission] = useState(SYMBOL_SPECS.XAUUSD.commissionPerLot);
  const [result, setResult] = useState<PerformanceMetrics | null>(null);
  const [matrixResult, setMatrixResult] = useState<ResearchExperimentResult | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<StrategyVariantId[]>(RESEARCH_VARIANTS.map(item => item.id));
  const [selectedAiModes, setSelectedAiModes] = useState<Array<Extract<AIReviewMode, 'OFF' | 'DETERMINISTIC_COUNCIL'>>>(['OFF', 'DETERMINISTIC_COUNCIL']);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [paperTickets, setPaperTickets] = useState<PaperTicket[]>([]);

  const availableDatasets = useMemo(() => datasetsForSymbol(symbol), [symbol]);
  const activeModel = useMemo(
    () => AVAILABLE_OFFLINE_MODELS.find(model => model.id === modelId) || AVAILABLE_OFFLINE_MODELS[0],
    [modelId]
  );

  const dateFilteredCandles = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`).getTime() : -Infinity;
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`).getTime() : Infinity;
    return baseCandles.filter(candle => candle.timestamp >= start && candle.timestamp <= end);
  }, [baseCandles, startDate, endDate]);

  const workingCandles = useMemo(() => {
    if (baseTimeframe === targetTimeframe) return dateFilteredCandles;
    return DataWorkbench.aggregateCandles(dateFilteredCandles, targetTimeframe).filter(candle => candle.isClosed);
  }, [baseTimeframe, dateFilteredCandles, targetTimeframe]);

  const validation = useMemo(
    () => DataWorkbench.validateCandles(workingCandles, symbol, targetTimeframe, sourceLabel),
    [workingCandles, symbol, targetTimeframe, sourceLabel]
  );

  useEffect(() => {
    if (!isPlaying || replayIndex >= workingCandles.length) return;
    const timer = window.setInterval(() => {
      setReplayIndex(index => Math.min(index + 1, workingCandles.length));
    }, 700);
    return () => window.clearInterval(timer);
  }, [isPlaying, replayIndex, workingCandles.length]);

  const replayCandles = useMemo(
    () => workingCandles.slice(0, Math.max(0, replayIndex)),
    [workingCandles, replayIndex]
  );
  const replayEvaluation = useMemo(
    () => MultiStyleEngine.evaluate(replayCandles.slice(-240), symbol, strategy),
    [replayCandles, symbol, strategy]
  );
  const currentCandidate = replayEvaluation.candidate;
  const selectedStrategy = TRADING_STYLES_CONFIG[strategy];
  const selectedSymbol = SYMBOL_SPECS[symbol];
  const isRealData = importedFileName !== null;
  const maximumInteractiveBars = 12_000;
  const maximumMatrixBars = 30_000;
  const replayRunning = isPlaying && replayIndex < workingCandles.length;

  const resetReplaySession = (nextLength = workingCandles.length) => {
    setReplayIndex(Math.min(20, nextLength));
    setResult(null);
    setMatrixResult(null);
    setRunMessage(null);
    setIsPlaying(false);
  };

  const analysisText = useMemo(() => {
    if (workingCandles.length === 0) {
      return 'برای این نماد هنوز کندل قابل استفاده وجود ندارد. فایل CSV/OHLCV همان نماد را وارد کنید؛ هیچ دادهٔ ساختگی تولید نمی‌شود.';
    }
    if (!isRealData) {
      return 'دادهٔ نمایش داخلی است. برای تصمیم پژوهشی یا مقایسهٔ استراتژی، دادهٔ تاریخی خود را وارد و گزارش کیفیت آن را بررسی کنید.';
    }
    const regime = replayEvaluation.regime;
    const allowed = regime.recommendedStyles.includes(strategy);
    const block = regime.blockedStyles.includes(strategy);
    if (block) return `${regime.summaryFa} سبک انتخابی در این رژیم مسدود است؛ سیستم فقط NO TRADE را نمایش می‌دهد.`;
    if (allowed) return `${regime.summaryFa} سبک انتخابی با رژیم فعلی سازگار است؛ این صرفاً شرایط بررسی ستاپ فرضی است، نه دستور معامله.`;
    return `${regime.summaryFa} برای سبک انتخابی هم‌گرایی کامل دیده نمی‌شود؛ پیش از ثبت معاملهٔ کاغذی، منتقد ریسک را بررسی کنید.`;
  }, [isRealData, replayEvaluation, strategy, workingCandles.length]);

  const handleSymbolChange = (nextSymbol: SymbolId) => {
    const fixture = fixtureFor(nextSymbol);
    setSymbol(nextSymbol);
    setBaseCandles(fixture);
    setBaseTimeframe('5M');
    setTargetTimeframe('5M');
    setImportedFileName(null);
    setSelectedCatalog(null);
    setSourceLabel(
      fixture.length > 0
        ? 'نمونهٔ آموزشی داخلی؛ برای پژوهش واقعی CSV وارد کنید'
        : 'برای این نماد دادهٔ تاریخی منتقل‌شده در مرورگر وجود ندارد؛ CSV وارد کنید'
    );
    setSpreadPips(SYMBOL_SPECS[nextSymbol].typicalSpreadPips);
    setCommission(SYMBOL_SPECS[nextSymbol].commissionPerLot);
    setStartDate('');
    setEndDate('');
    resetReplaySession(fixture.length);
  };

  const handleCatalogSelect = (item: HistoricalDatasetCatalogItem) => {
    setSelectedCatalog(item);
    setBaseTimeframe(item.timeframe);
    setTargetTimeframe(item.timeframe);
    setSourceLabel(`${item.source} · ${item.id} · برای اجرای واقعی فایل CSV متناظر را وارد کنید`);
    setReplayIndex(Math.min(20, baseCandles.length));
    setResult(null);
    setIsPlaying(false);
    setRunMessage(item.status === 'IMPORT_REQUIRED' ? item.noteFa : `کاتالوگ ${formatDatasetDateRange(item)} انتخاب شد. اکنون فایل OHLCV متناظر را وارد کنید.`);
  };

  const handleLoadBundledDataset = async () => {
    const dataset = bundledDatasetForSymbol(symbol);
    if (!dataset) {
      setRunMessage('برای این نماد هنوز فایل بلندمدت آماده وجود ندارد؛ CSV/OHLCV خود را وارد کنید.');
      return;
    }
    setIsRunning(true);
    try {
      const response = await fetch(dataset.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = DataWorkbench.parseCSV(await response.text(), 'D1', 0);
      if (parsed.candles.length < 200) throw new Error('دادهٔ روزانهٔ آماده کافی نیست.');
      setBaseCandles(parsed.candles);
      setBaseTimeframe('D1');
      setTargetTimeframe('D1');
      setImportedFileName(dataset.id);
      setSourceLabel(`${dataset.labelFa} · ${dataset.source} · ${dataset.providerSymbol}`);
      setStartDate('');
      setEndDate('');
      setReplayIndex(Math.min(220, parsed.candles.length));
      setResult(null);
      setMatrixResult(null);
      setIsPlaying(false);
      setRunMessage(dataset.caveatFa || `${number.format(parsed.candles.length)} کندل روزانهٔ واقعی در مرورگر بارگذاری شد. برای ماتریس بلندمدت آماده است.`);
    } catch (error) {
      setRunMessage(`بارگذاری دادهٔ آماده ناموفق بود: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleLoadBundledIntradayDataset = async () => {
    const dataset = bundledIntradayDatasetForSymbol(symbol, baseTimeframe);
    if (!dataset) {
      setRunMessage('برای این نماد دادهٔ ۵ دقیقه‌ای آماده وجود ندارد؛ CSV معتبر خود را وارد کنید.');
      return;
    }
    setIsRunning(true);
    try {
      const response = await fetch(dataset.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = DataWorkbench.parseCSV(await response.text(), baseTimeframe, 0);
      if (parsed.candles.length < 50) throw new Error(`دادهٔ ${baseTimeframe} آماده کافی نیست.`);
      setBaseCandles(parsed.candles);
      setTargetTimeframe(baseTimeframe);
      setImportedFileName(dataset.id);
      setSourceLabel(`${dataset.labelFa} · ${dataset.source} · ${dataset.providerSymbol}`);
      setStartDate('');
      setEndDate('');
      setReplayIndex(Math.min(220, parsed.candles.length));
      setResult(null);
      setMatrixResult(null);
      setIsPlaying(false);
      setRunMessage(dataset.caveatFa || `${number.format(parsed.candles.length)} کندل ${baseTimeframe} در مرورگر بارگذاری شد.`);
    } catch (error) {
      setRunMessage(`بارگذاری دادهٔ ${baseTimeframe} ناموفق بود: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = loadEvent => {
      const text = typeof loadEvent.target?.result === 'string' ? loadEvent.target.result : '';
      const parsed = DataWorkbench.parseCSV(text, baseTimeframe, 0);
      if (parsed.candles.length === 0) {
        setRunMessage('فایل کندل قابل‌خواندن نیست. ستون‌های time/date، open، high، low و close را کنترل کنید.');
        return;
      }
      setBaseCandles(parsed.candles);
      setImportedFileName(file.name);
      setSourceLabel(`${file.name} · ورود محلی مرورگر · ${parsed.errorCount} ردیف ردشده`);
      setStartDate('');
      setEndDate('');
      setReplayIndex(Math.min(20, parsed.candles.length));
      setResult(null);
      setMatrixResult(null);
      setIsPlaying(false);
      setRunMessage(`${number.format(parsed.candles.length)} کندل از فایل وارد شد. گزارش کیفیت را پیش از بک‌تست بررسی کنید.`);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleBacktest = () => {
    if (!validation.isValid) {
      setRunMessage('اجرای بک‌تست متوقف شد: داده معتبر نیست یا Warmup کافی ندارد. خطاهای پنل کیفیت را برطرف کنید.');
      return;
    }
    if (!isRealData) {
      setRunMessage('بک‌تست پژوهشی با نمونهٔ آموزشی اجرا نمی‌شود. ابتدا CSV تاریخی همان نماد را وارد کنید.');
      return;
    }
    if (workingCandles.length > maximumInteractiveBars) {
      setRunMessage(`برای جلوگیری از قفل‌شدن مرورگر، بازهٔ تاریخ را کوچک‌تر کنید. سقف اجرای تعاملی ${number.format(maximumInteractiveBars)} کندل است.`);
      return;
    }
    setIsRunning(true);
    window.setTimeout(() => {
      try {
        const run = ResearchLab.runBacktest(workingCandles, symbol, {
          initialCash,
          commissionPerLot: commission,
          defaultSpreadPips: spreadPips,
          style: strategy,
          timeframe: targetTimeframe,
        });
        setResult(run.metrics);
        setMode('BACKTEST');
        setRunMessage(`بک‌تست ${selectedStrategy.nameFa} با ${number.format(workingCandles.length)} کندل پایان یافت. اجرای سفارش فقط در موتور شبیه‌سازی محلی بوده است.`);
      } catch (error) {
        setRunMessage(`خطای بک‌تست: ${error instanceof Error ? error.message : 'نامشخص'}`);
      } finally {
        setIsRunning(false);
      }
    }, 20);
  };

  const toggleVariant = (variant: StrategyVariantId) => {
    setSelectedVariants(current => current.includes(variant) ? current.filter(item => item !== variant) : [...current, variant]);
  };

  const toggleBatchAiMode = (aiMode: Extract<AIReviewMode, 'OFF' | 'DETERMINISTIC_COUNCIL'>) => {
    setSelectedAiModes(current => current.includes(aiMode) ? current.filter(item => item !== aiMode) : [...current, aiMode]);
  };

  const handleRunResearchMatrix = () => {
    if (!validation.isValid || !isRealData) {
      setRunMessage('ماتریس پژوهش فقط پس از بارگذاری دادهٔ واقعی و عبور گزارش کیفیت اجرا می‌شود.');
      return;
    }
    if (workingCandles.length > maximumMatrixBars) {
      setRunMessage(`برای جلوگیری از قفل مرورگر، بازه را به کمتر از ${number.format(maximumMatrixBars)} کندل کاهش دهید.`);
      return;
    }
    if (selectedVariants.length === 0 || selectedAiModes.length === 0) {
      setRunMessage('حداقل یک روش و یک حالت AI برای ماتریس انتخاب کنید.');
      return;
    }
    if (selectedAiModes.includes('DETERMINISTIC_COUNCIL') && (!enabledRoles.includes('CRITIC') || !enabledRoles.includes('JUDGE'))) {
      setRunMessage('شورای قطعی بدون نقش‌های منتقد و داور اجرا نمی‌شود؛ آن‌ها را فعال کنید یا فقط baseline بدون AI را انتخاب کنید.');
      return;
    }
    setIsRunning(true);
    window.setTimeout(() => {
      try {
        const dataset = createDatasetFromCandles({
          candles: workingCandles,
          provider: sourceLabel,
          providerSymbol: symbol,
          canonicalSymbol: symbol,
          instrumentLabel: `${symbol} browser research import`,
          timeframe: targetTimeframe,
          rawSourcePath: `browser-memory://${importedFileName || 'unknown'}`,
          contentSha256: `browser-${workingCandles.length}-${workingCandles[0]?.timestamp || 0}-${workingCandles.at(-1)?.timestamp || 0}`,
          sourceLicense: 'Local browser import or bundled public historical CSV; research use only.',
        });
        const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe: targetTimeframe, experimentId: `EXP-BROWSER-${symbol}-${targetTimeframe}-${workingCandles.at(-1)?.timestamp || 0}` });
        const matrix = ResearchExperimentEngine.run(dataset, {
          ...config,
          initialCash,
          riskPerTradePercent: 0.25,
          strategyVariants: selectedVariants,
          aiModes: selectedAiModes,
          costModel: { ...config.costModel, spreadPips, commissionPerLotRoundTrip: commission },
        });
        setMatrixResult(matrix);
        setRunMessage(`ماتریس ${matrix.runs.length} اجرای پژوهشی تکمیل شد. این نتایج comparative هستند و هیچ سفارش یا اتصال broker ایجاد نشده است.`);
      } catch (error) {
        setRunMessage(`خطای ماتریس پژوهش: ${error instanceof Error ? error.message : 'نامشخص'}`);
      } finally {
        setIsRunning(false);
      }
    }, 20);
  };

  const handleCreatePaperTicket = () => {
    if (!isRealData) {
      setRunMessage('ثبت Paper Ticket فقط پس از ورود دادهٔ واقعی مجاز است. نمونهٔ آموزشی برای تصمیم‌گیری استفاده نمی‌شود.');
      return;
    }
    if (!currentCandidate) {
      setRunMessage('در این کندل ستاپ سازگار با رژیم و سبک انتخابی دیده نمی‌شود؛ هیچ Paper Ticket ثبت نشد.');
      return;
    }
    if (!enabledRoles.includes('CRITIC') || !enabledRoles.includes('JUDGE')) {
      setRunMessage('برای ثبت فرضی، نقش‌های منتقد ریسک و داور باید فعال باشند. این کنترل عمداً fail-closed است.');
      return;
    }
    const ticket: PaperTicket = {
      id: `PAPER-${currentCandidate.createdAtTimestamp}`,
      createdAt: currentCandidate.createdAtTimestamp,
      symbol,
      style: strategy,
      direction: currentCandidate.direction,
      entry: currentCandidate.entryPrice,
      stop: currentCandidate.stopLossPrice,
      target: currentCandidate.takeProfitPrice,
      status: 'PENDING_REPLAY',
    };
    setPaperTickets(current => [ticket, ...current.filter(item => item.id !== ticket.id)]);
    setMode('PAPER');
    setRunMessage('Paper Ticket در حافظهٔ همین مرورگر ثبت شد. این عملیات هیچ سفارش، API یا broker write ایجاد نکرده است.');
  };

  const toggleRole = (role: AgentRole) => {
    setEnabledRoles(current =>
      current.includes(role) ? current.filter(item => item !== role) : [...current, role]
    );
  };

  const metricCards = result
    ? [
        { label: 'معامله', value: number.format(result.totalTrades), tone: 'text-slate-100' },
        { label: 'بازده خالص', value: `${result.netProfitPercent.toFixed(2)}%`, tone: result.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400' },
        { label: 'بیشینه افت', value: `${result.maxDrawdownPercent.toFixed(2)}%`, tone: 'text-amber-300' },
        { label: 'Profit Factor', value: result.profitFactor.toFixed(2), tone: 'text-cyan-300' },
      ]
    : [];

  return (
    <main className="min-h-screen bg-[#090d14] text-slate-100" dir="rtl">
      <div className="max-w-[1600px] mx-auto px-4 py-5 md:px-8 md:py-7 space-y-5">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#111827] via-[#0c1420] to-[#0b1820] p-5 md:p-7 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold tracking-[0.18em] uppercase">
                <Activity className="w-4 h-4" /> Hamed Research Desk · Read-only
              </div>
              <h1 className="mt-3 text-2xl md:text-4xl font-black tracking-tight">میز پژوهش بازار، نه داشبورد شلوغ</h1>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                یک جریان کار روشن: داده را انتخاب کن، کیفیت آن را ببین، مدل و روش را مشخص کن، سپس <strong className="text-slate-200">Backtest</strong>،
                <strong className="text-slate-200"> Replay</strong> یا <strong className="text-slate-200">Paper Trading محلی</strong> را اجرا کن.
                این برنامه هیچ معاملهٔ زنده، ارسال سفارش یا broker write ندارد.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[11px] shrink-0">
              {[
                { label: 'داده', value: isRealData ? 'CSV محلی' : 'نمونه آموزشی', icon: Database },
                { label: 'مدل', value: activeModel?.family || 'آفلاین', icon: Bot },
                { label: 'ایمنی', value: 'NO WRITE', icon: ShieldCheck },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-w-[92px] rounded-2xl border border-slate-700/80 bg-slate-950/40 p-3">
                    <Icon className="w-4 h-4 text-cyan-300 mx-auto mb-1" />
                    <div className="text-slate-500">{item.label}</div>
                    <div className="font-bold text-slate-200 mt-1">{item.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        <nav className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded-2xl border border-slate-800 bg-[#0e1520] p-2">
          {[
            { id: 'BACKTEST' as const, label: '۱. بک‌تست پژوهشی', text: 'نتیجه، هزینه، افت سرمایه و کیفیت داده', icon: FlaskConical },
            { id: 'REPLAY' as const, label: '۲. بازپخش بازار', text: 'کندل‌به‌کندل، بدون دیدن آینده', icon: StepForward },
            { id: 'PAPER' as const, label: '۳. دفتر کاغذی', text: 'ثبت فرضی محلی؛ بدون اتصال بروکر', icon: CircleDollarSign },
          ].map(item => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setMode(item.id)}
                className={`rounded-xl p-3 text-right transition border ${active ? 'border-cyan-400/40 bg-cyan-400/10 shadow-sm shadow-cyan-950' : 'border-transparent hover:bg-slate-800/60 text-slate-400'}`}
              >
                <div className="flex items-center gap-2 font-bold text-sm"><Icon className={`w-4 h-4 ${active ? 'text-cyan-300' : ''}`} />{item.label}</div>
                <div className="mt-1 text-[11px] pr-6 text-slate-500">{item.text}</div>
              </button>
            );
          })}
        </nav>

        <section className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 items-start">
          <aside className="space-y-4 xl:sticky xl:top-4">
            <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4 space-y-4">
              <div className="flex items-center gap-2"><Database className="w-4 h-4 text-cyan-300" /><h2 className="font-bold">۱. داده و بازهٔ زمانی</h2></div>
              <div>
                <label className="label">نماد</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {SYMBOLS.map(item => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleSymbolChange(item.id)}
                      className={`text-right rounded-xl border px-3 py-2 text-xs font-mono transition ${symbol === item.id ? item.className : 'border-slate-800 bg-slate-950/30 text-slate-400 hover:text-slate-200'}`}
                    >{item.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="label">فایل ورودی
                  <select value={baseTimeframe} onChange={event => setBaseTimeframe(event.target.value as Timeframe)} className="field mt-1">
                    {TIMEFRAMES.map(tf => <option key={tf}>{tf}</option>)}
                  </select>
                </label>
                <label className="label">تحلیل روی
                  <select value={targetTimeframe} onChange={event => setTargetTimeframe(event.target.value as Timeframe)} className="field mt-1">
                    {TIMEFRAMES.map(tf => <option key={tf}>{tf}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-700/60 bg-cyan-950/20 px-3 py-3 cursor-pointer hover:bg-cyan-950/35 transition text-xs text-cyan-200 font-bold">
                <Upload className="w-4 h-4" /> ورود فایل CSV / OHLCV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
              </label>
              <button type="button" onClick={handleLoadBundledDataset} disabled={isRunning || !bundledDatasetForSymbol(symbol)} className="w-full secondary-button disabled:opacity-40">
                <Database className="w-4 h-4" /> بارگذاری دادهٔ روزانهٔ بلندمدت آماده
              </button>
              <button type="button" onClick={handleLoadBundledIntradayDataset} disabled={isRunning || !bundledIntradayDatasetForSymbol(symbol, baseTimeframe)} className="w-full secondary-button disabled:opacity-40">
                <Database className="w-4 h-4" /> بارگذاری دادهٔ {baseTimeframe} سال ۲۰۲۴
              </button>
              <p className="-mt-2 text-[10px] leading-5 text-slate-500">برای EURUSD، GBPUSD و USDJPY دادهٔ ۱M، ۵M، ۱۵M، ۱H، ۴H، D1 و W1 سال ۲۰۲۴ داخل اپ قرار گرفته است. این داده عمومی و پژوهشی است، نه broker-match.</p>
              <p className="text-[10px] leading-5 text-slate-500">{DATASET_IMPORT_GUIDANCE_FA}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="label">شروع UTC
                  <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="field mt-1" />
                </label>
                <label className="label">پایان UTC
                  <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="field mt-1" />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4">
              <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-violet-300" /><h2 className="font-bold">کاتالوگ منتقل‌شده</h2></div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">این فهرست اطلاعات artifactهای بررسی‌شده است. انتخاب آن داده را دانلود نمی‌کند؛ فایل متناظر باید محلی وارد شود.</p>
              <div className="mt-3 max-h-56 overflow-y-auto space-y-2 pr-1">
                {availableDatasets.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => handleCatalogSelect(item)}
                    className={`w-full rounded-xl border p-2.5 text-right transition ${selectedCatalog?.id === item.id ? 'border-violet-400/50 bg-violet-400/10' : 'border-slate-800 bg-slate-950/25 hover:border-slate-700'}`}
                  >
                    <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-slate-200">{item.timeframe}</span><span className={`text-[9px] font-bold ${item.status === 'READY' ? 'text-emerald-300' : item.status === 'PARTIAL' ? 'text-amber-300' : 'text-rose-300'}`}>{item.status}</span></div>
                    <div className="mt-1 text-[10px] text-slate-400">{formatDatasetDateRange(item)} · {number.format(item.bars)} کندل</div>
                    <div className="mt-1 text-[10px] text-slate-600">{item.noteFa}</div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-2"><WandSparkles className="w-5 h-5 text-cyan-300" /><div><h2 className="font-bold">۲. روش، مدل و ایجنت‌ها</h2><p className="text-[11px] text-slate-500 mt-1">مدل AI فقط تحلیل و بازبینی می‌کند؛ قواعد و اجرای بک‌تست قطعی و قابل ممیزی هستند.</p></div></div>
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-300 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Human approval required</div>
              </div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="label mb-2">روش فعال</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(TRADING_STYLES_CONFIG) as TradingStyleType[]).map(id => {
                      const item = TRADING_STYLES_CONFIG[id];
                      const active = strategy === id;
                      return <button type="button" key={id} onClick={() => setStrategy(id)} className={`rounded-xl border p-3 text-right transition ${active ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/30 hover:border-slate-700'}`}>
                        <div className="flex justify-between gap-2"><span className="text-xs font-bold">{item.nameFa}</span><span className="font-mono text-[10px] text-cyan-300">{item.recommendedTf}</span></div>
                        <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{STYLE_DESCRIPTIONS[id]}</p>
                      </button>;
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="label">مدل تحلیل / منتقد
                    <select value={modelId} onChange={event => setModelId(event.target.value)} className="field mt-1">
                      {MODEL_CHOICES.map(id => {
                        const model = AVAILABLE_OFFLINE_MODELS.find(item => item.id === id);
                        return model ? <option value={model.id} key={model.id}>{model.name}</option> : null;
                      })}
                    </select>
                  </label>
                  <p className="rounded-xl bg-slate-950/40 border border-slate-800 p-3 text-[11px] leading-5 text-slate-400"><strong className="text-slate-200">نقش مدل:</strong> {activeModel?.descriptionFa || 'بدون مدل'} مدل قادر به ثبت سفارش یا تغییر خودکار پارامترها نیست.</p>
                  <div>
                    <div className="label mb-2">نقش‌های فعال</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(AGENT_ROLES_INFO) as AgentRole[]).map(role => {
                        const active = enabledRoles.includes(role);
                        return <button type="button" key={role} onClick={() => toggleRole(role)} className={`rounded-xl border px-3 py-2 text-right transition ${active ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-slate-800 text-slate-500'}`}>
                          <div className="text-[11px] font-bold">{AGENT_ROLES_INFO[role].nameFa.replace('ایجنت ', '')}</div>
                        </button>;
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 2xl:grid-cols-[1fr_340px] gap-5 items-start">
              <div className="space-y-4">
                <ChartCanvas symbol={symbol} candles={replayCandles} activeCandidate={currentCandidate} />
                <div className="rounded-2xl border border-slate-800 bg-[#101722] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div><div className="flex items-center gap-2"><Play className="w-4 h-4 text-cyan-300" /><h2 className="font-bold">بازپخش کنترل‌شدهٔ بازار</h2></div><p className="mt-1 text-[11px] text-slate-500">فقط کندل‌های تا لحظهٔ انتخاب‌شده به موتور نشان داده می‌شوند.</p></div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setReplayIndex(index => Math.max(1, index - 1))} className="icon-button"><ChevronRight className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setIsPlaying(value => !replayRunning)} disabled={workingCandles.length === 0} className="primary-button">{replayRunning ? 'توقف' : 'پخش'}</button>
                      <button type="button" onClick={() => setReplayIndex(index => Math.min(workingCandles.length, index + 1))} className="icon-button"><ChevronLeft className="w-4 h-4" /></button>
                      <button type="button" onClick={() => resetReplaySession()} className="icon-button" title="شروع مجدد"><RefreshCcw className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-900 overflow-hidden"><div className="h-full bg-gradient-to-l from-cyan-300 to-violet-400 transition-all" style={{ width: `${workingCandles.length ? (replayIndex / workingCandles.length) * 100 : 0}%` }} /></div>
                  <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-500"><span>{replayCandles.length ? formatUtc(replayCandles[replayCandles.length - 1].timestamp) : 'بدون داده'}</span><span>{number.format(replayIndex)} / {number.format(workingCandles.length)} کندل</span></div>
                </div>
              </div>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4">
                  <div className="flex gap-2"><Sparkles className="w-4 h-4 mt-0.5 text-violet-300" /><div><h2 className="font-bold">توضیح ساختار بازار</h2><p className="mt-2 text-xs leading-6 text-slate-400">{analysisText}</p></div></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl bg-slate-950/50 p-2.5"><div className="text-slate-500">رژیم</div><div className="mt-1 text-cyan-200 font-bold">{replayEvaluation.regime.headlineFa}</div></div>
                    <div className="rounded-xl bg-slate-950/50 p-2.5"><div className="text-slate-500">اطمینان</div><div className="mt-1 text-cyan-200 font-mono font-bold">{replayEvaluation.regime.confidence}%</div></div>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4">
                  <div className="flex items-center gap-2"><Gauge className="w-4 h-4 text-amber-300" /><h2 className="font-bold">ستاپ فعلی</h2></div>
                  {currentCandidate ? <div className="mt-3 space-y-2 text-xs"><div className="font-bold text-emerald-300">{currentCandidate.direction === 'BUY' ? 'خرید فرضی' : 'فروش فرضی'} · {currentCandidate.strategyName}</div><p className="leading-5 text-slate-400">{currentCandidate.rationale}</p><div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]"><div className="metric"><span>Entry</span>{currentCandidate.entryPrice.toFixed(precisionFor(symbol))}</div><div className="metric"><span>SL</span>{currentCandidate.stopLossPrice.toFixed(precisionFor(symbol))}</div><div className="metric"><span>TP</span>{currentCandidate.takeProfitPrice.toFixed(precisionFor(symbol))}</div></div><button type="button" onClick={handleCreatePaperTicket} className="w-full secondary-button"><Plus className="w-4 h-4" /> ثبت در دفتر کاغذی</button></div> : <div className="mt-3 rounded-xl bg-slate-950/40 p-3 text-[11px] leading-5 text-slate-500">فعلاً ستاپ واجد شرایط دیده نمی‌شود. این حالت، تصمیم درست سیستم برای جلوگیری از overtrading است.</div>}
                </section>
              </aside>
            </section>

            {runMessage && <div className={`rounded-2xl border p-3 text-xs leading-6 flex gap-2 ${runMessage.includes('خطا') || runMessage.includes('متوقف') || runMessage.includes('کوچک‌تر') ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'}`}><Info className="w-4 h-4 shrink-0 mt-0.5" />{runMessage}</div>}

            {mode === 'BACKTEST' && <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4 md:p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><div className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-cyan-300" /><h2 className="font-bold">بک‌تست با هزینه و کنترل کیفیت</h2></div><p className="mt-1 text-[11px] leading-5 text-slate-500">ورود در کندل بعد، پنجرهٔ غلتان حداکثر ۲۴۰ کندل برای منطق، و توقف اجرای تعاملی بالای {number.format(maximumInteractiveBars)} کندل.</p></div><button type="button" onClick={handleBacktest} disabled={isRunning} className="primary-button min-w-44">{isRunning ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}{isRunning ? 'در حال اجرا…' : 'اجرای Backtest'}</button></div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="label">سرمایه فرضی
                  <input type="number" min="100" value={initialCash} onChange={event => setInitialCash(Number(event.target.value))} className="field mt-1" />
                </label>
                <label className="label">اسپرد (pip)
                  <input type="number" min="0" step="0.1" value={spreadPips} onChange={event => setSpreadPips(Number(event.target.value))} className="field mt-1" />
                </label>
                <label className="label">کارمزد / lot
                  <input type="number" min="0" step="0.1" value={commission} onChange={event => setCommission(Number(event.target.value))} className="field mt-1" />
                </label>
              </div>
              <div className="mt-5 border-t border-slate-800 pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-bold text-sm text-slate-200">ماتریس مقایسهٔ روش و AI</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">هر خانه یک Backtest مستقل با ورود کندل بعدی، هزینه، روند/رژیم و خروج بدبینانه است. WebLLM یا API در batch به‌صورت ساختگی اجرا نمی‌شود؛ اینجا فقط baseline و فیلتر قطعی قابل بازتولید مقایسه می‌شوند.</p></div><button type="button" onClick={handleRunResearchMatrix} disabled={isRunning || selectedVariants.length === 0 || selectedAiModes.length === 0} className="primary-button shrink-0">{isRunning ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Layers3 className="w-4 h-4" />}{isRunning ? 'در حال اجرای ماتریس…' : `اجرای ${selectedVariants.length * selectedAiModes.length} آزمایش`}</button></div>
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div><div className="label mb-2">روش‌های واردشده در مقایسه</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{RESEARCH_VARIANTS.map(item => { const active = selectedVariants.includes(item.id); return <button type="button" key={item.id} onClick={() => toggleVariant(item.id)} className={`rounded-xl border p-2.5 text-right transition ${active ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-slate-800 bg-slate-950/30 text-slate-500'}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold">{item.labelFa}</span><span className={`text-[10px] ${active ? 'text-emerald-300' : 'text-slate-600'}`}>{active ? 'فعال' : 'خاموش'}</span></div><div className="mt-1 text-[10px] leading-5 text-slate-500">{item.descriptionFa}</div></button>; })}</div></div>
                  <div><div className="label mb-2">حالت‌های AI قابل آزمایش امروز</div><div className="space-y-2">{BATCH_AI_MODES.map(item => { const active = selectedAiModes.includes(item.id); return <button type="button" key={item.id} onClick={() => toggleBatchAiMode(item.id)} className={`w-full rounded-xl border p-3 text-right transition ${active ? 'border-violet-400/40 bg-violet-400/10 text-violet-100' : 'border-slate-800 bg-slate-950/30 text-slate-500'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{item.labelFa}</span><span className={`text-[10px] ${active ? 'text-emerald-300' : 'text-slate-600'}`}>{active ? 'فعال' : 'خاموش'}</span></div><div className="mt-1 text-[10px] leading-5 text-slate-500">{item.descriptionFa}</div></button>; })}<div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] leading-5 text-amber-100">مدل‌های WebLLM و API فقط برای review یک ستاپ با شواهد کامل هستند. در Backtest دسته‌ای، نبود یک provider واقعی به‌درستی NO TRADE تلقی می‌شود، نه نتیجهٔ شبیه‌سازی‌شده.</div></div></div>
                </div>
              </div>
              {metricCards.length > 0 ? <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">{metricCards.map(item => <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="text-[10px] text-slate-500">{item.label}</div><div className={`mt-1 text-lg font-mono font-bold ${item.tone}`}>{item.value}</div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">ابتدا دادهٔ CSV را وارد و بازهٔ مناسب را تعیین کنید. نتیجهٔ بک‌تست بدون دادهٔ واقعی نمایش داده نمی‌شود.</div>}
              {matrixResult && <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/30 p-4"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><h3 className="font-bold text-slate-200">نتایج ماتریس پژوهش</h3><p className="mt-1 text-[10px] text-slate-500">مرتب‌شده بر مبنای سود خالص؛ انتخاب نهایی فقط پس از بررسی تعداد معامله، PF، افت سرمایه و OOS معتبر است.</p></div><span className="font-mono text-[10px] text-cyan-300">{matrixResult.runs.length} run · {workingCandles.length} bars</span></div><div className="mt-3 overflow-x-auto"><table className="w-full text-right text-[11px]"><thead className="border-b border-slate-800 text-slate-500"><tr><th className="p-2">روش / AI</th><th className="p-2">معامله</th><th className="p-2">Win Rate</th><th className="p-2">Net PnL</th><th className="p-2">PF</th><th className="p-2">Holding</th><th className="p-2">Max DD</th><th className="p-2">وضعیت</th></tr></thead><tbody>{matrixResult.comparisons.map(comparison => { const run = matrixResult.runs.find(item => `${item.summary.variant}::${item.summary.aiMode}` === comparison.key); return <tr key={comparison.key} className="border-b border-slate-900"><td className="p-2 text-slate-200">{comparison.labelFa}</td><td className="p-2 font-mono">{comparison.tradesCount}</td><td className="p-2 font-mono">{comparison.winRatePercent}%</td><td className={`p-2 font-mono font-bold ${comparison.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{comparison.netProfit >= 0 ? '+' : ''}{number.format(comparison.netProfit)}</td><td className="p-2 font-mono text-cyan-200">{comparison.profitFactor.toFixed(2)}</td><td className="p-2 font-mono text-slate-300">{comparison.averageHoldingBars.toFixed(1)} bars</td><td className="p-2 font-mono text-amber-200">{comparison.maxDrawdownPercent.toFixed(2)}%</td><td className="p-2 text-slate-400">{run?.summary.status || '—'}</td></tr>; })}</tbody></table></div><div className="mt-3 grid gap-2 md:grid-cols-2">{matrixResult.warnings.slice(0, 4).map(warning => <div key={warning} className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-2 text-[10px] leading-5 text-amber-100">{warning}</div>)}</div></div>}
            </section>}

            {mode === 'REPLAY' && <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4"><div className="flex items-center gap-2"><LineChart className="w-5 h-5 text-violet-300" /><h2 className="font-bold">قواعد بازپخش</h2></div><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"><InfoCard icon={CheckCircle2} title="بدون نگاه به آینده" text="موتور فقط تا کندل جاری را دریافت می‌کند؛ کندل‌های بعدی پنهان هستند." /><InfoCard icon={CheckCircle2} title="تحلیل قابل توضیح" text="رژیم، سبک و دلیل ستاپ در پنل کنار نمودار ثبت می‌شود." /><InfoCard icon={ShieldCheck} title="فقط پژوهش" text="بازپخش هیچ API معاملاتی، سفارش یا ارتباط نوشتاری با کارگزار ندارد." /></div></section>}

            {mode === 'PAPER' && <section className="rounded-2xl border border-slate-800 bg-[#101722] p-4 md:p-5"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="flex items-center gap-2"><CircleDollarSign className="w-5 h-5 text-emerald-300" /><h2 className="font-bold">دفتر معاملات کاغذی محلی</h2></div><p className="mt-1 text-[11px] text-slate-500">برای تمرین و مشاهدهٔ replay. هیچ رکوردی به broker، cTrader یا سرور ارسال نمی‌شود.</p></div><div className="rounded-xl px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-300">{paperTickets.length} Paper Ticket</div></div>
              {paperTickets.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-right text-xs"><thead className="text-slate-500 border-b border-slate-800"><tr><th className="p-2">زمان</th><th className="p-2">نماد</th><th className="p-2">روش</th><th className="p-2">جهت</th><th className="p-2">Entry / SL / TP</th><th className="p-2">وضعیت</th></tr></thead><tbody>{paperTickets.map(ticket => <tr key={ticket.id} className="border-b border-slate-900"><td className="p-2 text-slate-400">{formatUtc(ticket.createdAt)}</td><td className="p-2 font-mono">{ticket.symbol}</td><td className="p-2">{TRADING_STYLES_CONFIG[ticket.style].nameFa}</td><td className={`p-2 font-bold ${ticket.direction === 'BUY' ? 'text-emerald-300' : 'text-rose-300'}`}>{ticket.direction}</td><td className="p-2 font-mono text-[10px]">{ticket.entry.toFixed(precisionFor(ticket.symbol))} / {ticket.stop.toFixed(precisionFor(ticket.symbol))} / {ticket.target.toFixed(precisionFor(ticket.symbol))}</td><td className="p-2 text-amber-300">{ticket.status}</td></tr>)}</tbody></table></div> : <div className="mt-4 rounded-xl border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">هنوز Paper Ticket ندارید. یک ستاپ سازگار را در بازپخش مشاهده و سپس صریحاً ثبت کنید.</div>}
            </section>}

            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <QualityCard label="منبع فعال" value={sourceLabel} icon={FileUp} tone="cyan" />
              <QualityCard label="کیفیت کندل" value={!isRealData ? 'نمونهٔ آموزشی؛ اعتبارسنجی فقط پس از ورود CSV انجام می‌شود.' : validation.isValid ? `${number.format(validation.manifest?.totalCandles || 0)} کندل قابل بررسی` : validation.errors[0] || 'نامعتبر'} icon={!isRealData || validation.isValid ? CheckCircle2 : XCircle} tone={!isRealData || validation.isValid ? 'green' : 'rose'} />
              <QualityCard label="هشدار گپ / تکرار" value={`${validation.manifest?.gapsDetected || 0} گپ · ${validation.manifest?.duplicatesFound || 0} تکرار`} icon={AlertTriangle} tone="amber" />
            </section>
          </div>
        </section>

        <footer className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-[11px] leading-6 text-slate-500 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />این ابزار برای پژوهش، backtest، replay و paper trading محلی است. عملکرد گذشته تضمین آینده نیست و هیچ‌یک از خروجی‌ها توصیهٔ شخصی سرمایه‌گذاری یا مجوز معاملهٔ زنده نیست.</footer>
      </div>
    </main>
  );
}

function InfoCard({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><Icon className="w-4 h-4 text-cyan-300" /><div className="mt-2 font-bold text-slate-200">{title}</div><p className="mt-1 text-[11px] leading-5 text-slate-500">{text}</p></div>;
}

function QualityCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ElementType; tone: 'cyan' | 'green' | 'rose' | 'amber' }) {
  const tones = { cyan: 'text-cyan-300', green: 'text-emerald-300', rose: 'text-rose-300', amber: 'text-amber-300' };
  return <div className="rounded-2xl border border-slate-800 bg-[#101722] p-3 flex gap-3"><Icon className={`w-4 h-4 shrink-0 mt-0.5 ${tones[tone]}`} /><div><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 text-xs leading-5 text-slate-300 break-words">{value}</div></div></div>;
}
