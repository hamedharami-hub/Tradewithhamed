'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { DataProvenance } from '@/lib/contracts/provenance';
import { ReplayEngine, ReplayState } from '@/lib/replay/replay-engine';
import { SimulatedBroker } from '@/lib/core/simulated-broker';
import { calculateDeterministicRisk } from '@/lib/core/risk-calculator';
import { calculateWilderATR } from '@/lib/core/atr';
import { PracticeSession, PracticeSessionManager, MAX_ARCHIVED_SESSIONS } from '@/lib/core/practice-session';
import { PositionScalingEngine } from '@/lib/core/position-scaling-engine';
import { EnvironmentNavBar } from '@/components/navigation/environment-nav-bar';
import { ChartCanvas } from '@/components/trading/chart-canvas';
import { TimeframeResampler } from '@/lib/core/timeframe-resampler';
import { MultiTimeframeLevel } from '@/lib/contracts/monte-carlo';
import { MultiAgentOrchestratorModal } from '@/components/trading/multi-agent-orchestrator-modal';
import { MultiAgentOrchestrator } from '@/lib/core/multi-agent-orchestrator';
import { MultiAgentConfiguration } from '@/lib/contracts/multi-agent-system';
import {
  Play,
  Pause,
  StepForward,
  RotateCcw,
  BookOpen,
  ShieldCheck,
  ShieldAlert,
  Info,
  TrendingUp,
  TrendingDown,
  X,
  AlertOctagon,
  Sliders,
  PowerOff,
  AlertTriangle,
  RefreshCw,
  Archive,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Database,
  Layers,
  Clock,
  DollarSign,
  Minus,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  targetSymbol?: SymbolId;
  action: 'SWITCH_SYMBOL' | 'START_NEW_SESSION' | 'RESET_REPLAY' | 'CLOSE_ALL_POSITIONS';
}

function createInitialPracticeEngine(session: PracticeSession) {
  const broker = new SimulatedBroker(session.initialBalance, session.config.enablePartialTp);
  broker.loadState({
    accountBalance: session.accountBalance,
    accountEquity: session.accountEquity,
    orders: session.orders,
    positions: session.positions,
  });
  const replay = new ReplayEngine(session.symbol, broker, session.currentStepIndex);
  return { broker, replay, snapshot: replay.getSnapshot() };
}

function PracticePageContent() {
  // ۱. مقداردهی اولیه نشست تمرینی از حافظه محلی یا ایجاد نشست تازه
  const [session, setSession] = useState<PracticeSession>(() => {
    const loaded = PracticeSessionManager.loadActiveSession();
    if (loaded) return loaded;
    const fresh = PracticeSessionManager.createNewSession('XAUUSD', 10000);
    PracticeSessionManager.saveActiveSession(fresh);
    return fresh;
  });

  // راه‌اندازی اولیه موتور بروکر و ریپلی اختصاصی این نشست
  const [engineState] = useState(() => createInitialPracticeEngine(session));
  const brokerRef = useRef<SimulatedBroker>(engineState.broker);
  const replayRef = useRef<ReplayEngine>(engineState.replay);
  const [replayState, setReplayState] = useState<ReplayState>(() => engineState.snapshot);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(1000);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');

  // کنترل راهنمای گام‌به‌گام بالا
  const [isGuideOpen, setIsGuideOpen] = useState(true);

  // تب جهت معامله در فرم معامله (خرید یا فروش)
  const [tradeDirection, setTradeDirection] = useState<'BUY' | 'SELL'>('BUY');

  // باز یا بسته بودن پنل آرشیو نشست‌ها
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<PracticeSession[]>(() =>
    PracticeSessionManager.loadArchivedSessions()
  );

  // مودال تأیید برای تغییر نماد، ریست، شروع نشست جدید یا بستن همه معاملات
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  const [isCouncilModalOpen, setIsCouncilModalOpen] = useState(false);
  const [multiAgentConfig, setMultiAgentConfig] = useState<MultiAgentConfiguration>(() =>
    MultiAgentOrchestrator.loadConfiguration()
  );

  // وضعیت اعتبارسنجی و ثبت واقعی ذخیره‌سازی محلی
  const [storageStatus, setStorageStatus] = useState<'SAVED' | 'ERROR'>('SAVED');
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);

  // تابع یکپارچه ذخیره‌سازی نشست فعال با اعتبارسنجی قطعی خروجی
  const persistSession = useCallback((updated: PracticeSession, actionName?: string) => {
    setSession(updated);
    const res = PracticeSessionManager.saveActiveSession(updated);
    if (res.success) {
      setStorageStatus('SAVED');
      setLastSaveTime(new Date().toLocaleTimeString('fa-IR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } else {
      setStorageStatus('ERROR');
      const errText = res.error || 'خطا در ذخیره‌سازی نشست در مرورگر.';
      setExecutionMessage(`هشدار ذخیره‌سازی: داده‌های ${actionName || 'نشست'} در حافظه محلی ذخیره نشد (${errText}).`);
    }
    return res;
  }, []);

  const provenance: DataProvenance = useMemo(() => ({
    originType: 'SAMPLE_FIXTURE',
    originLabelFa: 'نمونه آزمایشی داخلی (Fixtures)',
    datasetId: `fixture-${session.symbol.toLowerCase()}-5m`,
    symbol: session.symbol,
    timeframe: '5M',
    timezone: 'UTC',
    lastReceivedAt: session.lastMarketTimestamp || session.createdAt,
    freshnessStatus: 'FRESH',
    stalenessThresholdMs: 300_000,
    isVerifiedRealData: false,
    notesFa: `نشست ${session.sessionId}؛ اجرای آفلاین و ایزوله در مرورگر بدون ارتباط خارجی.`,
  }), [session.symbol, session.lastMarketTimestamp, session.createdAt, session.sessionId]);

  // گام به جلو در ریپلی و هماهنگ‌سازی وضعیت با نشست
  const handleStepForward = useCallback(() => {
    const replay = replayRef.current;
    const broker = brokerRef.current;
    if (!replay || !broker) return;

    const nextSnapshot = replay.stepForward();
    const brokerState = broker.getState();
    setReplayState(nextSnapshot);

    const updated: PracticeSession = {
      ...session,
      currentStepIndex: nextSnapshot.currentStepIndex,
      accountBalance: brokerState.accountBalance,
      accountEquity: brokerState.accountEquity,
      orders: brokerState.orders,
      positions: brokerState.positions,
      lastMarketTimestamp: nextSnapshot.visibleCandles[nextSnapshot.visibleCandles.length - 1]?.timestamp,
    };
    persistSession(updated, 'گام کندل');

    if (nextSnapshot.currentStepIndex >= nextSnapshot.totalSteps - 1) {
      setIsPlaying(false);
    }
  }, [session, persistSession]);

  // کنترل بازپخش خودکار کندل‌ها (بدون فراخوانی مضاعف در StrictMode)
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      handleStepForward();
    }, speedMs);
    return () => clearInterval(timer);
  }, [isPlaying, speedMs, handleStepForward]);

  // قیمت و کندل جاری بازار
  const lastCandle = replayState.visibleCandles[replayState.visibleCandles.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : session.symbol === 'XAUUSD' ? 2650 : 1.085;
  const candleTimeFormatted = lastCandle
    ? new Date(lastCandle.timestamp).toLocaleTimeString('fa-IR', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  // بررسی رسیدن به انتهای دیتای نمونه
  const isEndOfData = replayState.currentStepIndex >= replayState.totalSteps - 1;

  // محاسبه پویای نوسان (Wilder ATR) از کندل‌های بسته قابل مشاهده
  const atrValues = useMemo(() => calculateWilderATR(replayState.visibleCandles, 14), [replayState.visibleCandles]);
  const currentAtr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
  const isAtrReady = currentAtr !== null && currentAtr > 0;

  const macroLevels: MultiTimeframeLevel[] = useMemo(() => {
    if (!replayState.visibleCandles || replayState.visibleCandles.length === 0) return [];
    return TimeframeResampler.extractMultiTimeframeLevels(replayState.visibleCandles, session.symbol);
  }, [replayState.visibleCandles, session.symbol]);

  // پیش‌نمایش ریسک متناسب با جهت انتخابی کاربر
  const currentRiskPreview = useMemo(() => {
    if (!isAtrReady || !currentAtr) return null;
    const slDist = currentAtr * 1.2;
    const tpDist = slDist * 2.0;
    const dec = session.symbol === 'XAUUSD' ? 2 : session.symbol === 'USDJPY' ? 3 : 5;

    const entry = currentPrice;
    const sl = tradeDirection === 'BUY' ? Number((entry - slDist).toFixed(dec)) : Number((entry + slDist).toFixed(dec));
    const tp = tradeDirection === 'BUY' ? Number((entry + tpDist).toFixed(dec)) : Number((entry - tpDist).toFixed(dec));

    const result = calculateDeterministicRisk({
      symbol: session.symbol,
      direction: tradeDirection,
      entryPrice: entry,
      stopLossPrice: sl,
      takeProfitPrice: tp,
      accountEquity: session.accountEquity,
      riskPercentage: session.config.selectedRiskPercent,
    });

    return {
      ...result,
      entryPrice: entry,
      stopLossPrice: sl,
      takeProfitPrice: tp,
    };
  }, [session.symbol, tradeDirection, currentPrice, currentAtr, isAtrReady, session.accountEquity, session.config.selectedRiskPercent]);

  // ارزیابی شورا در حالت پیشرفته
  const councilResult = useMemo(() => {
    return MultiAgentOrchestrator.evaluateCandidate(replayState.activeCandidate, multiAgentConfig, {
      environment: 'PRACTICE',
      dataProvenance: provenance.originLabelFa,
    });
  }, [replayState.activeCandidate, multiAgentConfig, provenance.originLabelFa]);

  // ثبت معامله تمرینی با اعتبارسنجی قطعی
  const handleExecuteTrade = () => {
    if (isEndOfData) {
      setExecutionMessage('خطا: به انتهای داده‌های نمونه رسیده‌اید. ثبت معاملهٔ جدید مسدود است. لطفاً ریپلی را مجدداً آغاز کنید یا نشست جدید شروع کنید.');
      return;
    }

    if (session.isFreezeNewEntries) {
      setExecutionMessage('خطا: ثبت ورودهای جدید متوقف است. برای ثبت معامله، ابتدا دکمه «توقف سفارش جدید» را خاموش کنید.');
      return;
    }

    if (!isAtrReady || !currentAtr) {
      setExecutionMessage('خطا: تعداد کندل‌های بسته برای محاسبه نوسان (ATR) کافی نیست. لطفاً چند کندل به جلو بروید.');
      return;
    }

    const broker = brokerRef.current;
    if (!broker) return;

    try {
      const slDist = currentAtr * 1.2;
      const tpDist = slDist * 2.0;
      const dec = session.symbol === 'XAUUSD' ? 2 : session.symbol === 'USDJPY' ? 3 : 5;

      const entry = currentPrice;
      const sl = tradeDirection === 'BUY' ? Number((entry - slDist).toFixed(dec)) : Number((entry + slDist).toFixed(dec));
      const tp = tradeDirection === 'BUY' ? Number((entry + tpDist).toFixed(dec)) : Number((entry - tpDist).toFixed(dec));

      // اعتبارسنجی مجدد ریسک بر مبنای آخرین اکوئیتی حساب
      const riskResult = calculateDeterministicRisk({
        symbol: session.symbol,
        direction: tradeDirection,
        entryPrice: entry,
        stopLossPrice: sl,
        takeProfitPrice: tp,
        accountEquity: broker.getState().accountEquity,
        riskPercentage: session.config.selectedRiskPercent,
      });

      if (!riskResult.isValid || riskResult.adjustedVolumeLots <= 0) {
        setExecutionMessage(`سفارش مجاز نیست: ${riskResult.explanation || 'حجم معامله مجاز نیست.'}`);
        return;
      }

      const lots = riskResult.adjustedVolumeLots;

      const { position } = broker.createMarketBracketOrder(
        session.symbol,
        tradeDirection,
        lots,
        entry,
        sl,
        tp,
        {
          candleTimestamp: lastCandle?.timestamp,
          sessionId: session.sessionId,
        }
      );

      const updatedBrokerState = broker.getState();
      const updatedSession: PracticeSession = {
        ...session,
        accountBalance: updatedBrokerState.accountBalance,
        accountEquity: updatedBrokerState.accountEquity,
        orders: updatedBrokerState.orders,
        positions: updatedBrokerState.positions,
        currentStepIndex: replayRef.current?.getCurrentStepIndex() ?? session.currentStepIndex,
        lastMarketTimestamp: lastCandle?.timestamp,
      };

      persistSession(updatedSession, 'ثبت معامله');

      setExecutionMessage(
        `معامله تمرینی ${tradeDirection === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'} با حجم ${lots} لات در قیمت ${entry} با موفقیت ثبت شد (شناسه: ${position.id}).`
      );
    } catch (err) {
      setExecutionMessage(`خطا در ثبت معامله: ${(err as Error).message}`);
    }
  };

  // بستن دستی یک پوزیشن معین
  const handleCloseSinglePosition = (positionId: string) => {
    const broker = brokerRef.current;
    if (!broker) return;

    const res = broker.closePosition(positionId, currentPrice, 'MANUAL', lastCandle?.timestamp);
    if (res.success) {
      const updatedBrokerState = broker.getState();
      const updatedSession: PracticeSession = {
        ...session,
        accountBalance: updatedBrokerState.accountBalance,
        accountEquity: updatedBrokerState.accountEquity,
        orders: updatedBrokerState.orders,
        positions: updatedBrokerState.positions,
      };
      persistSession(updatedSession, 'بستن معامله');
      setExecutionMessage(`معامله به شناسه ${positionId} با موفقیت بسته شد (سود/زیان خالص: $${res.netRealizedPnl}).`);
    }
  };

  // توقف ورودهای جدید (Freeze New Entries)
  const handleToggleFreeze = () => {
    const nextFreeze = !session.isFreezeNewEntries;
    const updated: PracticeSession = {
      ...session,
      isFreezeNewEntries: nextFreeze,
    };
    persistSession(updated, 'تغییر وضعیت فریز');
    setExecutionMessage(
      nextFreeze
        ? 'حالت «توقف سفارش جدید» فعال شد: پوزیشن‌های باز جاری حفظ می‌شوند، اما ورود جدید مسدود است.'
        : 'حالت «توقف سفارش جدید» غیرفعال شد: امکان ورود معامله تمرینی مجدداً فراهم است.'
    );
  };

  // درخواست بستن همه پوزیشن‌ها با تأییدیه
  const handleRequestCloseAll = () => {
    const openCount = session.positions.filter(p => p.isOpen).length;
    if (openCount === 0) {
      setExecutionMessage('هیچ معاملهٔ بازی برای بستن وجود ندارد.');
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'بستن همه معاملات باز',
      message: `آیا از بستن فوری تمامی ${openCount} معاملهٔ باز در قیمت لحظه‌ای جاری (${currentPrice}) اطمینان دارید؟ سود یا زیان شناور آنها بلافاصله در موجودی حساب تسویه خواهد شد.`,
      action: 'CLOSE_ALL_POSITIONS',
    });
  };

  // آغاز یا تغییر نماد با هماهنگی کامل نشست
  const executeNewSessionOrReset = (newSymbol: SymbolId) => {
    setIsPlaying(false);

    // ۱. بایگانی نشست فعلی با بررسی صریح نتیجه و سقف ظرفیت
    const archiveResult = PracticeSessionManager.archiveSession(session);
    if (!archiveResult.success) {
      // در صورت بروز خطا یا تکمیل ظرفیت، نشست جاری حفظ شده و شروع نشست تازه لغو می‌شود
      setExecutionMessage(archiveResult.error || 'خطا در بایگانی نشست قبلی. نشست جاری حفظ شد و نشست جدید آغاز نشد.');
      return;
    }

    setArchivedSessions(PracticeSessionManager.loadArchivedSessions());

    // ۲. ایجاد نشست تازه
    const fresh = PracticeSessionManager.createNewSession(newSymbol, 10000, session.config);
    const saveResult = PracticeSessionManager.saveActiveSession(fresh);
    if (!saveResult.success) {
      setExecutionMessage(saveResult.error || 'خطا در ذخیره نشست جدید.');
      return;
    }

    // ۳. بازنشانی موتورها
    const newBroker = new SimulatedBroker(fresh.initialBalance, fresh.config.enablePartialTp);
    brokerRef.current = newBroker;
    replayRef.current = new ReplayEngine(newSymbol, newBroker, fresh.currentStepIndex);

    setSession(fresh);
    setReplayState(replayRef.current.getSnapshot());
    setExecutionMessage(`نشست تمرینی جدید برای نماد ${newSymbol} با بالانس اولیه ۱۰۰۰۰ دلار آغاز شد.`);
  };

  // حذف انتخابی یک نشست از آرشیو با تصمیم صریح کاربر
  const handleDeleteArchivedSession = (sessionId: string) => {
    const deleted = PracticeSessionManager.deleteArchivedSession(sessionId);
    if (deleted) {
      setArchivedSessions(PracticeSessionManager.loadArchivedSessions());
      setExecutionMessage(`نشست با شناسه ${sessionId} با موفقیت از آرشیو حذف شد.`);
    }
  };

  // تغییر نماد
  const handleRequestSymbolChange = (newSymbol: SymbolId) => {
    if (newSymbol === session.symbol) return;
    const openCount = session.positions.filter(p => p.isOpen).length;

    setConfirmModal({
      isOpen: true,
      title: 'تغییر نماد و پایان نشست جاری',
      message: openCount > 0
        ? `نشست جاری روی نماد ${session.symbol} دارای ${openCount} معاملهٔ باز است. از آنجا که هر نشست تک‌نمادی است، تغییر نماد نیازمند بایگانی نشست فعلی است. آیا مایلید این نشست را بایگانی کرده و نشست تازه‌ای روی ${newSymbol} آغاز کنید؟`
        : `آیا مایلید نشست فعلی بایگانی شده و نشست تازه‌ای روی نماد ${newSymbol} آغاز گردد؟`,
      targetSymbol: newSymbol,
      action: 'SWITCH_SYMBOL',
    });
  };

  // شروع نشست جدید (همواره با تأیید صریح کاربر)
  const handleRequestNewSession = () => {
    const openCount = session.positions.filter(p => p.isOpen).length;
    setConfirmModal({
      isOpen: true,
      title: 'شروع نشست جدید',
      message: openCount > 0
        ? `این نشست دارای ${openCount} معاملهٔ باز است. شروع نشست جدید سوابق فعلی را در آرشیو بایگانی کرده و حسابی تازه با ۱۰۰۰۰ دلار ایجاد می‌کند. آیا ادامه می‌دهید؟`
        : 'شروع نشست جدید سوابق فعلی را در آرشیو بایگانی کرده و حسابی تازه با ۱۰۰۰۰ دلار ایجاد می‌کند. آیا ادامه می‌دهید؟',
      targetSymbol: session.symbol,
      action: 'START_NEW_SESSION',
    });
  };

  // بازنشانی ریپلی
  const handleRequestResetReplay = () => {
    const openCount = session.positions.filter(p => p.isOpen).length;
    if (openCount > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'شروع مجدد ریپلی',
        message: `عقب‌بردن ریپلی با حفظ معاملات باز نشست ممنوع است زیرا نشست دارای ${openCount} معاملهٔ باز است. آیا مایلید این نشست بایگانی شده و ریپلی از ابتدا آغاز گردد؟`,
        targetSymbol: session.symbol,
        action: 'RESET_REPLAY',
      });
      return;
    }
    executeNewSessionOrReset(session.symbol);
  };

  const handleConfirmModalAction = () => {
    if (!confirmModal) return;
    if (confirmModal.action === 'CLOSE_ALL_POSITIONS') {
      const broker = brokerRef.current;
      if (broker) {
        PositionScalingEngine.triggerPanicKillSwitch(broker, 'MANUAL_PANIC', lastCandle?.timestamp);
        const updatedBrokerState = broker.getState();
        const updatedSession: PracticeSession = {
          ...session,
          accountBalance: updatedBrokerState.accountBalance,
          accountEquity: updatedBrokerState.accountEquity,
          orders: updatedBrokerState.orders,
          positions: updatedBrokerState.positions,
        };
        persistSession(updatedSession, 'بستن همه معاملات');
        setExecutionMessage('تمام معاملات باز با موفقیت بسته شدند.');
      }
      setConfirmModal(null);
      return;
    }

    const targetSymbol = confirmModal.targetSymbol || session.symbol;
    setConfirmModal(null);
    executeNewSessionOrReset(targetSymbol);
  };

  const handleCancelModal = () => {
    setConfirmModal(null);
  };

  // تنظیم درصد ریسک
  const handleRiskChange = (riskPercent: number) => {
    const updated: PracticeSession = {
      ...session,
      config: {
        ...session.config,
        selectedRiskPercent: riskPercent,
      },
    };
    persistSession(updated, 'تغییر سقف ریسک');
  };

  const openPositions = session.positions.filter(p => p.isOpen);
  const closedPositions = session.positions.filter(p => !p.isOpen);

  // محاسبه سود/زیان شناور کل معاملات باز
  const totalFloatingPnl = Number(openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0).toFixed(2));

  return (
    <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none overflow-x-hidden w-full max-w-full" dir="rtl">
      {/* ناوبار سراسری محیط‌ها */}
      <EnvironmentNavBar
        currentEnv="PRACTICE"
        provenance={provenance}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4 overflow-x-hidden">
        {/* پیام‌های سیستمی */}
        {executionMessage && (
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-xs flex items-center justify-between gap-2 text-cyan-300 shadow-sm animate-in fade-in">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{executionMessage}</span>
            </div>
            <button onClick={() => setExecutionMessage(null)} className="text-zinc-400 hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* بنر راهنمای گام‌به‌گام برای کاربران غیرتخصصی */}
        {isGuideOpen && (
          <div className="bg-[#121726] border border-[#232d44] rounded-2xl p-4 text-xs space-y-3 shadow-md relative animate-in fade-in">
            <div className="flex items-center justify-between border-b border-[#1c2438] pb-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <BookOpen className="w-4 h-4" />
                <span>راهنمای سریع: مراحل انجام اولین معاملهٔ تمرینی</span>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 text-[11px] flex items-center gap-1 bg-[#182032] px-2 py-1 rounded-lg border border-[#232e48]"
                title="بستن این راهنما (از دکمه راهنما در بالا مجدداً باز می‌شود)"
              >
                <span>بستن راهنما</span>
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-zinc-300">
              <div className="bg-[#161d30] p-2.5 rounded-xl border border-[#202940] space-y-1">
                <span className="text-amber-400 font-bold block">۱. بررسی نمودار</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  کندل‌های قیمت را روی چارت ببینید و جهت حرکت بازار فرضی را بسنجید.
                </p>
              </div>

              <div className="bg-[#161d30] p-2.5 rounded-xl border border-[#202940] space-y-1">
                <span className="text-amber-400 font-bold block">۲. انتخاب ریسک و حدود</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  در فرم معامله، درصد ریسک را انتخاب کنید؛ حد ضرر و حجم خودکار محاسبه می‌شوند.
                </p>
              </div>

              <div className="bg-[#161d30] p-2.5 rounded-xl border border-[#202940] space-y-1">
                <span className="text-amber-400 font-bold block">۳. ثبت معاملهٔ تمرینی</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  جهت خرید یا فروش را انتخاب کرده و دکمه «ثبت معاملهٔ تمرینی» را بزنید.
                </p>
              </div>

              <div className="bg-[#161d30] p-2.5 rounded-xl border border-[#202940] space-y-1">
                <span className="text-amber-400 font-bold block">۴. جلو بردن کندل‌ها</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  دکمه «کندل بعد» یا «پخش» را بزنید تا زمان بازار پیش برود و معامله با استاپ یا تارگت برخورد کند.
                </p>
              </div>

              <div className="bg-[#161d30] p-2.5 rounded-xl border border-[#202940] space-y-1">
                <span className="text-amber-400 font-bold block">۵. مشاهده دفتر معاملات</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  پس از بسته شدن پوزیشن، نتیجه، سود/زیان خالص و قیمت واقعی خروج را در جدول ببینید.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ۱. نوار هویت محیط */}
        <div className="bg-[#101420] border border-[#1b2234] px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-zinc-200">
                تمرین با دادهٔ نمونه — حساب مجازی — بدون ارسال به بروکر
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <div className="bg-[#151b2a] px-2.5 py-1 rounded-xl border border-[#222a3d] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-zinc-400 font-sans">نماد:</span>
              <span className="font-bold text-zinc-200">{session.symbol}</span>
            </div>

            <div className="bg-[#151b2a] px-2.5 py-1 rounded-xl border border-[#222a3d] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-zinc-400 font-sans">تایم‌فریم:</span>
              <span className="font-bold text-zinc-200">۵ دقیقه‌ای (5M)</span>
            </div>

            <div className="bg-[#151b2a] px-2.5 py-1 rounded-xl border border-[#222a3d] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-zinc-400 font-sans">زمان کندل:</span>
              <span suppressHydrationWarning className="font-bold text-zinc-200">{candleTimeFormatted} UTC</span>
            </div>

            <div className="bg-[#151b2a] px-2.5 py-1 rounded-xl border border-[#222a3d] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-zinc-400 font-sans">نشست:</span>
              <span data-testid="session-id-badge" suppressHydrationWarning className="font-bold text-purple-300">{session.sessionId}</span>
            </div>

            {!isGuideOpen && (
              <button
                onClick={() => setIsGuideOpen(true)}
                className="px-2.5 py-1 bg-[#182030] hover:bg-[#202c44] text-amber-300 rounded-xl border border-amber-500/30 flex items-center gap-1 font-sans text-xs font-bold transition-all"
                title="نمایش راهنمای مراحل معامله"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>راهنما</span>
              </button>
            )}
          </div>
        </div>

        {/* ۲. خلاصهٔ حساب */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* سرمایه آغاز نشست */}
          <div className="bg-[#101420] border border-[#1b2234] p-3.5 rounded-2xl space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>سرمایهٔ آغاز نشست</span>
              <DollarSign className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="text-lg font-bold font-mono text-zinc-200">
              ${session.initialBalance.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-500 leading-tight">
              سرمایه اولیه پایه در شروع این نشست
            </div>
          </div>

          {/* موجودی پس از معاملات بسته‌شده */}
          <div className="bg-[#101420] border border-[#1b2234] p-3.5 rounded-2xl space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>موجودی نقدشده (بالانس / Balance)</span>
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-lg font-bold font-mono text-cyan-400">
              ${session.accountBalance.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-500 leading-tight">
              سرمایه تثبیت‌شده پس از تسویه معاملات بسته‌شده
            </div>
          </div>

          {/* ارزش فعلی حساب */}
          <div className="bg-[#101420] border border-[#1b2234] p-3.5 rounded-2xl space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>ارزش فعلی حساب (اکوئیتی / Equity)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400">
              ${session.accountEquity.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-500 leading-tight">
              کل سرمایه لحظه‌ای با احتساب سود/زیان باز
            </div>
          </div>

          {/* سودوزیان معاملات باز */}
          <div className="bg-[#101420] border border-[#1b2234] p-3.5 rounded-2xl space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>سودوزیان شناور معاملات باز</span>
              {totalFloatingPnl > 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : totalFloatingPnl < 0 ? (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              ) : (
                <Minus className="w-4 h-4 text-zinc-500" />
              )}
            </div>
            <div className={`text-lg font-bold font-mono flex items-center gap-1 ${
              totalFloatingPnl > 0
                ? 'text-emerald-400'
                : totalFloatingPnl < 0
                ? 'text-rose-400'
                : 'text-zinc-400'
            }`}>
              <span>{totalFloatingPnl > 0 ? `+$${totalFloatingPnl}` : totalFloatingPnl < 0 ? `-$${Math.abs(totalFloatingPnl)}` : '$0.00'}</span>
              <span className="text-[10px] font-sans font-normal text-zinc-500">
                ({openPositions.length} معامله باز)
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 leading-tight">
              سود یا زیان غیرنقدی پوزیشن‌های فعال جاری
            </div>
          </div>

          {/* وضعیت ذخیره‌سازی */}
          <div className="bg-[#101420] border border-[#1b2234] p-3.5 rounded-2xl space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-zinc-400 text-xs">
              <span>وضعیت ذخیره‌سازی</span>
              <Database className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-sm font-bold text-zinc-200 mt-1 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${storageStatus === 'SAVED' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              <span>{storageStatus === 'SAVED' ? 'ذخیره روی مرورگر' : 'خطای ذخیره‌سازی'}</span>
              {lastSaveTime && storageStatus === 'SAVED' && (
                <span className="text-[10px] text-zinc-500 font-mono">({lastSaveTime})</span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 leading-tight">
              {storageStatus === 'SAVED'
                ? 'ایزوله و نسخه‌دار (بدون نشت داده به دمو یا پژوهش)'
                : 'هشدار: آخرین تغییرات در حافظه محلی ذخیره نشد.'}
            </div>
          </div>
        </div>

        {/* ۳. نمودار و کنترل بازپخش */}
        <div className="bg-[#101420] border border-[#1d2436] p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
          {/* انتخاب نماد تک‌نشستی */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">نماد معامله:</span>
            {(['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'] as SymbolId[]).map(s => (
              <button
                key={s}
                onClick={() => handleRequestSymbolChange(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  session.symbol === s
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'bg-[#181f30] text-zinc-300 hover:bg-[#202940]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* کلیدهای پخش و کنترل ریپلی */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
              title={isPlaying ? 'متوقف کردن حرکت خودکار کندل‌ها' : 'پخش خودکار کندل‌ها'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'توقف بازپخش' : 'پخش کندل‌ها'}</span>
            </button>

            <button
              onClick={handleStepForward}
              disabled={isPlaying || isEndOfData}
              className="px-3.5 py-2 rounded-xl bg-[#181f30] hover:bg-[#222a40] text-zinc-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all border border-[#28324a]"
              title="جلو بردن یک کندل ۵ دقیقه‌ای"
            >
              <StepForward className="w-4 h-4" />
              <span>کندل بعد</span>
            </button>

            {/* انتخاب سرعت بازپخش */}
            <div className="flex items-center bg-[#141926] p-1 rounded-xl border border-[#202738] text-[11px]">
              <span className="text-zinc-500 px-1.5">سرعت:</span>
              {[
                { label: '1x', ms: 1000 },
                { label: '2x', ms: 500 },
                { label: '4x', ms: 250 },
              ].map(sp => (
                <button
                  key={sp.ms}
                  onClick={() => setSpeedMs(sp.ms)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                    speedMs === sp.ms
                      ? 'bg-amber-500 text-black'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleRequestResetReplay}
              className="p-2 rounded-xl bg-[#181f30] hover:bg-[#222a40] text-zinc-300 transition-all border border-[#28324a]"
              title="شروع مجدد ریپلی از ابتدا"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handleRequestNewSession}
              className="px-3 py-1.5 rounded-xl bg-[#182030] hover:bg-[#222c42] text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-[#283550] transition-all"
              title="شروع نشست تازه با حساب ۱۰۰۰۰ دلاری و بایگانی نشست جاری"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>شروع نشست جدید</span>
            </button>

            <div className="text-xs text-zinc-400 font-mono bg-[#141926] px-3 py-1.5 rounded-xl border border-[#202738]">
              کندل {replayState.currentStepIndex + 1} از {replayState.totalSteps}
            </div>
          </div>
        </div>

        {/* هشدار اتمام دیتای ریپلی */}
        {isEndOfData && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs flex items-center justify-between gap-3 text-amber-300 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>پایان داده‌های نمونه:</strong> به آخرین کندل موجود در این مجموعه داده رسیدید. برای ادامه تمرین، می‌توانید ریپلی را مجدداً آغاز کرده یا یک نشست جدید شروع کنید.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRequestResetReplay}
                className="px-3 py-1 rounded-lg bg-amber-500 text-black font-bold text-xs hover:bg-amber-400 transition-all"
              >
                شروع مجدد ریپلی
              </button>
            </div>
          </div>
        )}

        {/* چارت کندل‌استیک با داده‌های هماهنگ با موتور تمرین */}
        <div data-testid="chart-container" className="bg-[#0e121c] border border-[#1b2234] rounded-2xl p-3 overflow-hidden shadow-lg w-full max-w-full">
          <ChartCanvas
            candles={replayState.visibleCandles}
            symbol={session.symbol}
            macroLevels={macroLevels}
            activeCandidate={replayState.activeCandidate}
          />
        </div>

        {/* ۴. فرم معامله (Trade Form) */}
        <div className="bg-[#0f131f] border border-[#222a3d] rounded-2xl p-4 shadow-xl space-y-3 w-full max-w-full">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f273b] pb-3">
            {/* انتخاب جهت معامله */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTradeDirection('BUY')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  tradeDirection === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-[#181f30] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>خرید (BUY)</span>
              </button>

              <button
                onClick={() => setTradeDirection('SELL')}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  tradeDirection === 'SELL'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-[#181f30] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                <span>فروش (SELL)</span>
              </button>
            </div>

            {/* سقف ریسک قابل ویرایش */}
            <div className="flex flex-wrap items-center gap-3 bg-[#141926] p-2 rounded-xl border border-[#232d40]">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400 font-medium">سقف ریسک:</span>
                <span className="text-xs font-bold text-cyan-400 font-mono">{session.config.selectedRiskPercent}%</span>
                <span className="text-[10px] bg-cyan-950/60 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800">
                  قابل ویرایش
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[0.1, 0.15, 0.2, 0.25].map(r => (
                  <button
                    key={r}
                    onClick={() => handleRiskChange(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                      session.config.selectedRiskPercent === r
                        ? 'bg-cyan-500 text-black'
                        : 'bg-[#1b2234] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>

            {/* دکمه‌های کنترل ورود و بستن همه */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleFreeze}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  session.isFreezeNewEntries
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-[#181f30] text-zinc-400 hover:text-zinc-200 border-[#28324a]'
                }`}
                title="پوزیشن‌های موجود باز می‌مانند، اما ورود جدید متوقف می‌شود"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>{session.isFreezeNewEntries ? 'ورودها متوقف است' : 'توقف سفارش جدید'}</span>
              </button>

              <button
                onClick={handleRequestCloseAll}
                disabled={openPositions.length === 0}
                className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-40 text-rose-300 text-xs font-bold flex items-center gap-1.5 border border-rose-800 transition-all"
                title="بستن فوری تمامی معاملات باز"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>بستن همه ({openPositions.length})</span>
              </button>
            </div>
          </div>

          {/* مقادیر فرم: تفکیک فیلدهای ویرایشی و محاسبه‌شده */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <div className="bg-[#141926] p-2 rounded-xl border border-[#21293a] space-y-0.5">
              <div className="text-zinc-500 text-[10px] flex items-center justify-between">
                <span>قیمت ورود:</span>
                <span className="text-[9px] text-zinc-500 font-sans">محاسبه‌شده</span>
              </div>
              <div className="font-mono font-bold text-zinc-200 text-sm">
                ${currentPrice}
              </div>
            </div>

            <div className="bg-[#141926] p-2 rounded-xl border border-[#21293a] space-y-0.5">
              <div className="text-zinc-500 text-[10px] flex items-center justify-between">
                <span>حد ضرر (SL):</span>
                <span className="text-[9px] text-zinc-500 font-sans">بر مبنای نوسان</span>
              </div>
              <div className="font-mono font-bold text-rose-400 text-sm">
                ${currentRiskPreview?.stopLossPrice ?? '—'}
              </div>
            </div>

            <div className="bg-[#141926] p-2 rounded-xl border border-[#21293a] space-y-0.5">
              <div className="text-zinc-500 text-[10px] flex items-center justify-between">
                <span>حد سود (TP):</span>
                <span className="text-[9px] text-zinc-500 font-sans">نسبت 1:2</span>
              </div>
              <div className="font-mono font-bold text-emerald-400 text-sm">
                ${currentRiskPreview?.takeProfitPrice ?? '—'}
              </div>
            </div>

            <div className="bg-[#141926] p-2 rounded-xl border border-[#21293a] space-y-0.5">
              <div className="text-zinc-500 text-[10px] flex items-center justify-between">
                <span>حجم محاسبه‌شده:</span>
                <span className="text-[9px] text-cyan-400 font-sans">سقف ریسک</span>
              </div>
              <div className="font-mono font-bold text-cyan-400 text-sm">
                {currentRiskPreview?.adjustedVolumeLots ? `${currentRiskPreview.adjustedVolumeLots} Lot` : '—'}
              </div>
            </div>

            <div className="bg-[#141926] p-2 rounded-xl border border-[#21293a] space-y-0.5">
              <div className="text-zinc-500 text-[10px] flex items-center justify-between">
                <span>هزینهٔ تخمینی کارمزد:</span>
                <span className="text-[9px] text-zinc-500 font-sans">$6 هر لات</span>
              </div>
              <div className="font-mono font-bold text-zinc-300 text-sm">
                ${currentRiskPreview?.commissionEstimated ?? '—'}
              </div>
            </div>

            <div className="bg-[#141926] p-2 rounded-xl border border-[#21293a] space-y-0.5">
              <div className="text-zinc-500 text-[10px] flex items-center justify-between">
                <span>ریسک دلاری:</span>
                <span className="text-[9px] text-zinc-500 font-sans">زیان حداکثر</span>
              </div>
              <div className="font-mono font-bold text-amber-400 text-sm">
                ${currentRiskPreview?.plannedRiskAmount ?? '—'}
              </div>
            </div>
          </div>

          {/* پیام راهنما یا خطای مانع ثبت در فرم */}
          {isEndOfData ? (
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>پایان داده‌های نمونه: به آخرین کندل رسیده‌اید. امکان ثبت معاملهٔ جدید مسدود است.</span>
            </div>
          ) : session.isFreezeNewEntries ? (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 shrink-0" />
              <span>ورود سفارش‌های جدید متوقف است. برای ثبت معامله، حالت توقف را خاموش کنید.</span>
            </div>
          ) : !isAtrReady ? (
            <div className="p-2.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl text-xs text-zinc-400 flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-amber-400" />
              <span>تعداد کندل‌های بسته برای محاسبه نوسان کافی نیست (حداقل ۱۵ کندل نیاز است). با کلیک روی «کندل بعد» چارت را پیش ببرید.</span>
            </div>
          ) : currentRiskPreview && !currentRiskPreview.isValid ? (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>سفارش با پارامترهای جاری مجاز نیست: {currentRiskPreview.explanation}</span>
            </div>
          ) : null}

          {/* دکمه اصلی ثبت معامله */}
          <div className="pt-1">
            <button
              onClick={handleExecuteTrade}
              disabled={isEndOfData || session.isFreezeNewEntries || !currentRiskPreview?.isValid}
              className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-xl transition-all ${
                tradeDirection === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white'
              }`}
            >
              {tradeDirection === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>
                {isEndOfData
                  ? 'پایان داده‌ها — ثبت معامله غیرفعال است'
                  : `ثبت معاملهٔ تمرینی ${tradeDirection === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'}${
                      currentRiskPreview?.isValid ? ` — حجم: ${currentRiskPreview.adjustedVolumeLots} لات` : ''
                    }`}
              </span>
            </button>
          </div>
        </div>

        {/* ۵. جدول معاملات باز (Open Positions) */}
        <div className="bg-[#101420] border border-[#1d2436] rounded-2xl p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-zinc-200">معاملات باز فعال</h2>
              <span className="text-xs text-zinc-500">({openPositions.length} معامله در جریان)</span>
            </div>

            {openPositions.length > 0 && (
              <button
                onClick={handleRequestCloseAll}
                className="px-3 py-1 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold border border-rose-800 transition-all flex items-center gap-1.5"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>بستن همه معاملات ({openPositions.length})</span>
              </button>
            )}
          </div>

          {openPositions.length === 0 ? (
            <div className="py-6 text-center space-y-1.5 text-zinc-500">
              <Info className="w-7 h-7 mx-auto text-zinc-600" />
              <p className="text-xs font-bold text-zinc-400">در حال حاضر هیچ معاملهٔ بازی در این نشست وجود ندارد.</p>
              <p className="text-[11px] text-zinc-500">
                از فرم معامله در بالا برای ثبت یک پوزیشن خرید یا فروش استفاده کنید تا بلافاصله در این جدول ظاهر شود.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#1f2638] text-zinc-400">
                    <th className="py-2 px-3">نماد</th>
                    <th className="py-2 px-3">جهت</th>
                    <th className="py-2 px-3">حجم (فعلی / اولیه)</th>
                    <th className="py-2 px-3">قیمت ورود</th>
                    <th className="py-2 px-3">قیمت لحظه‌ای</th>
                    <th className="py-2 px-3">حد ضرر (SL)</th>
                    <th className="py-2 px-3">حد سود (TP)</th>
                    <th className="py-2 px-3">سود/زیان شناور</th>
                    <th className="py-2 px-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171e2e] font-mono">
                  {openPositions.map(p => (
                    <tr key={p.id} className="hover:bg-[#141926]">
                      <td className="py-2.5 px-3 font-bold text-zinc-200">{p.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {p.direction === 'BUY' ? 'خرید' : 'فروش'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">
                        {p.volumeLots} {p.initialVolumeLots && p.initialVolumeLots !== p.volumeLots ? `(${p.initialVolumeLots})` : ''} Lot
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">{p.entryPrice}</td>
                      <td className="py-2.5 px-3 text-cyan-300 font-bold">{p.currentPrice}</td>
                      <td className="py-2.5 px-3 text-rose-400">{p.stopLoss}</td>
                      <td className="py-2.5 px-3 text-emerald-400">{p.takeProfit}</td>
                      <td className={`py-2.5 px-3 font-bold ${p.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.unrealizedPnl >= 0 ? `+$${p.unrealizedPnl}` : `-$${Math.abs(p.unrealizedPnl)}`}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <button
                          onClick={() => handleCloseSinglePosition(p.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/70 text-rose-300 text-[11px] font-bold border border-rose-800 transition-all"
                          title="بستن این معامله در قیمت لحظه‌ای"
                        >
                          بستن معامله
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ۶. تاریخچهٔ بستهشده (Closed Trades History) */}
        <div className="bg-[#101420] border border-[#1d2436] rounded-2xl p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-200">دفتر معاملات نشست جاری</h2>
              <span className="text-xs text-zinc-500">(فقط معاملات تسویه‌شده در این نشست)</span>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              {closedPositions.length} معامله بسته شده
            </span>
          </div>

          {closedPositions.length === 0 ? (
            <div className="py-6 text-center space-y-1.5 text-zinc-500">
              <Info className="w-7 h-7 mx-auto text-zinc-600" />
              <p className="text-xs font-bold text-zinc-400">هنوز هیچ معامله‌ای در این نشست تمرینی بسته نشده است.</p>
              <p className="text-[11px] text-zinc-500">
                پس از برخورد پوزیشن با حد سود (TP)، حد ضرر (SL) یا بستن دستی، مشخصات واقعی خروج در این جدول ثبت خواهد شد.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#1f2638] text-zinc-400">
                    <th className="py-2 px-3">زمان ورود</th>
                    <th className="py-2 px-3">زمان خروج</th>
                    <th className="py-2 px-3">نماد</th>
                    <th className="py-2 px-3">جهت</th>
                    <th className="py-2 px-3">حجم</th>
                    <th className="py-2 px-3">قیمت ورود</th>
                    <th className="py-2 px-3">قیمت واقعی خروج</th>
                    <th className="py-2 px-3">علت خروج</th>
                    <th className="py-2 px-3">کارمزد</th>
                    <th className="py-2 px-3">سود/زیان خالص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171e2e] font-mono">
                  {closedPositions.map(p => {
                    const openTimeStr = p.openedAt
                      ? new Date(p.openedAt).toLocaleTimeString('fa-IR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
                      : 'ثبت نشده';
                    const closeTimeStr = p.closedAt
                      ? new Date(p.closedAt).toLocaleTimeString('fa-IR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
                      : 'ثبت نشده';

                    return (
                      <tr key={p.id} className="hover:bg-[#141926]">
                        <td className="py-2.5 px-3 text-zinc-400 text-[11px]">{openTimeStr}</td>
                        <td className="py-2.5 px-3 text-zinc-400 text-[11px]">{closeTimeStr}</td>
                        <td className="py-2.5 px-3 font-bold text-zinc-200">{p.symbol}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {p.direction === 'BUY' ? 'خرید' : 'فروش'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300">{p.volumeLots} Lot</td>
                        <td className="py-2.5 px-3 text-zinc-300">{p.entryPrice}</td>
                        <td className="py-2.5 px-3 font-bold text-cyan-300">
                          {p.exitPrice !== undefined ? p.exitPrice : p.currentPrice}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-[11px]">
                          {p.closeReason === 'TP' ? (
                            <span className="text-emerald-400">تارگت سود (TP)</span>
                          ) : p.closeReason === 'SL' ? (
                            <span className="text-rose-400">حد ضرر (SL)</span>
                          ) : p.closeReason === 'PARTIAL_TP' ? (
                            <span className="text-cyan-400">خروج پله‌ای</span>
                          ) : p.closeReason === 'SESSION_ENDED' ? (
                            <span className="text-zinc-500">پایان نشست (بایگانی)</span>
                          ) : (
                            <span className="text-zinc-300">خروج دستی</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400">${p.commissionPaid}</td>
                        <td className={`py-2.5 px-3 font-bold ${p.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.realizedPnl >= 0 ? `+$${p.realizedPnl}` : `-$${Math.abs(p.realizedPnl)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ۷. آرشیو نشست‌ها (Sessions Archive) */}
        <div className="bg-[#101420] border border-[#1d2436] rounded-2xl p-4 space-y-3 shadow-md">
          <div
            data-testid="archive-toggle-btn"
            onClick={() => setIsArchiveOpen(!isArchiveOpen)}
            className="flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-zinc-200">آرشیو نشست‌های پیشین</h2>
              <span className="text-xs text-zinc-500 font-mono">
                ({archivedSessions.length} از سقف {MAX_ARCHIVED_SESSIONS} نشست)
              </span>
            </div>
            <button className="text-zinc-400 hover:text-zinc-200 p-1">
              {isArchiveOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {isArchiveOpen && (
            <div className="pt-2 border-t border-[#1b2234] space-y-2 animate-in fade-in">
              {archivedSessions.length >= MAX_ARCHIVED_SESSIONS && (
                <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    سقف ظرفیت بایگانی ({MAX_ARCHIVED_SESSIONS} نشست) پر شده است. جهت امنیت داده‌ها، نشست‌های قدیمی به صورت خودکار حذف نمی‌شوند؛ برای ثبت نشست‌های تازه، می‌توانید موارد غیرضروری را حذف نمایید.
                  </span>
                </div>
              )}

              {archivedSessions.length === 0 ? (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  هنوز نشستی بایگانی نشده است. با کلیک روی «شروع نشست جدید»، نشست فعلی به این بخش منتقل می‌شود.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table data-testid="archive-table" className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-[#1f2638] text-zinc-400">
                        <th className="py-2 px-3">شناسه نشست</th>
                        <th className="py-2 px-3">تاریخ ایجاد</th>
                        <th className="py-2 px-3">نماد</th>
                        <th className="py-2 px-3">موجودی نهایی</th>
                        <th className="py-2 px-3">تعداد کل معاملات</th>
                        <th className="py-2 px-3">معاملات پایان‌یافته</th>
                        <th className="py-2 px-3">یادداشت</th>
                        <th className="py-2 px-3 text-center">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#171e2e] font-mono">
                      {archivedSessions.map(arch => (
                        <tr key={arch.sessionId} className="hover:bg-[#141926]">
                          <td className="py-2.5 px-3 text-purple-300 font-bold">{arch.sessionId}</td>
                          <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                            {new Date(arch.createdAt).toLocaleDateString('fa-IR')}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-200 font-bold">{arch.symbol}</td>
                          <td className="py-2.5 px-3 text-cyan-400 font-bold">${arch.accountBalance.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-zinc-300">{arch.positions.length}</td>
                          <td className="py-2.5 px-3 text-zinc-400">
                            {arch.discardedOpenPositionsCount > 0 ? `${arch.discardedOpenPositionsCount} پوزیشن` : '۰'}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-[11px] text-zinc-400">{arch.archiveNoteFa || '—'}</td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteArchivedSession(arch.sessionId);
                              }}
                              className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded text-[10px] border border-rose-800 transition-all flex items-center gap-1 mx-auto"
                              title="حذف این نشست از آرشیو با تصمیم صریح شما"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* حالت پیشرفته: بازرسی شورا و تنظیمات تخصصی */}
        {viewMode === 'ADVANCED' && (
          <div className="bg-[#121624] border border-purple-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300">
                <Sliders className="w-4 h-4" />
                <h3 className="text-xs font-bold">بخش پیشرفته: فیلترهای استراتژی و بازرسی شورا</h3>
              </div>
              <button
                onClick={() => setIsCouncilModalOpen(true)}
                className="px-3 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded-lg text-xs font-bold border border-purple-500/40 transition-all"
              >
                تنظیم قواعد شورا
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-300">
              <div className="bg-[#161c2c] p-2.5 rounded-xl border border-[#232c42]">
                <span className="text-zinc-500 text-[11px] block">امتیاز انطباق با قوانین (نه احتمال برد):</span>
                <span className="text-base font-bold text-purple-400 font-mono mt-0.5 block">
                  {councilResult.councilConsensus?.alphaConsensusScore ?? 0}٪
                </span>
                <span className="text-[10px] text-zinc-500 block mt-1">
                  صرفاً تطابق آماری با چک‌لیست استراتژی، بدون تضمین سود
                </span>
              </div>

              <div className="bg-[#161c2c] p-2.5 rounded-xl border border-[#232c42]">
                <span className="text-zinc-500 text-[11px] block">وضعیت وتوی منتقد:</span>
                <span className={`text-xs font-bold mt-1 block ${councilResult.councilConsensus?.vetoTriggered ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {councilResult.councilConsensus?.vetoTriggered ? 'توقف معامله توسط منتقد' : 'بدون وتوی فعال (نیازمند انطباق کامل)'}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-1">
                  توجه: «نبود وتو» به معنای تأیید صددرصدی سودآوری نیست.
                </span>
              </div>

              <div className="bg-[#161c2c] p-2.5 rounded-xl border border-[#232c42]">
                <span className="text-zinc-500 text-[11px] block">پوزیشن‌های باز فعال:</span>
                <span className="text-base font-bold text-cyan-400 font-mono mt-0.5 block">
                  {openPositions.length} معامله
                </span>
                <span className="text-[10px] text-zinc-500 block mt-1">
                  پوزیشن‌های جاری در حافظه شبیه‌ساز این نشست
                </span>
              </div>
            </div>

            {/* کارت‌های ۴ ایجنت شورا */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-[#1e2535]">
              {[councilResult.scannerReview, councilResult.analystReview, councilResult.criticReview, councilResult.judgeReview].map(rev => (
                <div key={rev.agentRole} className="p-3 bg-[#0d1017] border border-[#1e2535] rounded-xl space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200">{rev.roleTitleFa}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      rev.verdict === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' : rev.verdict === 'REJECTED' ? 'bg-rose-500/20 text-rose-300' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {rev.verdictTitleFa}
                    </span>
                  </div>

                  <div className="space-y-0.5 text-[10px] text-zinc-400">
                    <div>
                      <span className="text-zinc-500">موتور درخواستی:</span> <span className="font-mono text-zinc-300">{rev.requestedEngineId}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">موتور اجراشده:</span> <span className="font-mono text-cyan-300">{rev.executedEngineId}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">روش اجرا:</span>
                      <span className="px-1.5 py-0.2 rounded bg-[#161c28] text-amber-300 font-sans text-[9px]">
                        {rev.executionStatusFa}
                      </span>
                    </div>
                    {rev.isFallback && (
                      <div className="text-[9px] text-amber-400/90 leading-tight bg-amber-950/30 p-1 rounded border border-amber-900/40 mt-1">
                        ⚠️ {rev.fallbackReasonFa}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] text-zinc-400 pt-1 border-t border-[#171d2a] flex items-center justify-between">
                    <span className="text-zinc-500">انطباق با چک‌لیست:</span>
                    <span className="font-mono text-purple-300 font-bold">{Math.round(rev.confidence * 100)}٪</span>
                  </div>
                </div>
              ))}
            </div>

            {/* سلب مسئولیت مشورتی شورا */}
            <div className="p-2.5 bg-[#0e121a] border border-[#1b2230] rounded-xl text-[10px] text-zinc-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="leading-relaxed">
                <strong>ماهیت مشورتی:</strong> تحلیل‌های شورا بر مبنای تطبیق ریاضی شروط استراتژی محاسبه شده و صرفاً جنبهٔ مشورتی دارند؛ این خروجی‌ها هیچ‌گونه تضمین سود یا پیش‌بینی قطعی روند آینده نیستند.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* مودال تأیید تغییر نماد / ریست / شروع نشست جدید / بستن همه */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121624] border border-[#232d44] rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-zinc-100">{confirmModal.title}</h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {confirmModal.message}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1f2638]">
              <button
                onClick={handleCancelModal}
                className="px-4 py-2 rounded-xl bg-[#1b2234] hover:bg-[#252e46] text-zinc-300 text-xs font-bold transition-all"
              >
                انصراف (بدون تغییر)
              </button>
              <button
                onClick={handleConfirmModalAction}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md"
              >
                {confirmModal.action === 'CLOSE_ALL_POSITIONS' ? 'تأیید و بستن معاملات' : 'تأیید و بایگانی نشست'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال تنظیمات شورا در حالت پیشرفته */}
      <MultiAgentOrchestratorModal
        isOpen={isCouncilModalOpen}
        onClose={() => setIsCouncilModalOpen(false)}
        config={multiAgentConfig}
        onSaveConfig={(newCfg) => {
          setMultiAgentConfig(newCfg);
          MultiAgentOrchestrator.saveConfiguration(newCfg);
        }}
      />
    </main>
  );
}

const emptySubscribe = () => () => {};

export default function PracticePage() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isClient) {
    return (
      <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col items-center justify-center font-sans select-none overflow-x-hidden w-full max-w-full" dir="rtl">
        <div className="text-center space-y-3 p-8">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-400">در حال بارگذاری محیط تمرین...</p>
        </div>
      </main>
    );
  }

  return <PracticePageContent />;
}

