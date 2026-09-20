'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { DataProvenance } from '@/lib/contracts/provenance';
import { ReplayEngine, ReplayState } from '@/lib/replay/replay-engine';
import { SimulatedBroker } from '@/lib/core/simulated-broker';
import { calculateDeterministicRisk } from '@/lib/core/risk-calculator';
import { calculateWilderATR } from '@/lib/core/atr';
import { PracticeSession, PracticeSessionManager } from '@/lib/core/practice-session';
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
} from 'lucide-react';

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  targetSymbol?: SymbolId;
  action: 'SWITCH_SYMBOL' | 'START_NEW_SESSION' | 'RESET_REPLAY';
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

export default function PracticePage() {
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

  // مودال تأیید برای تغییر نماد، ریست یا شروع نشست جدید
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  const [isCouncilModalOpen, setIsCouncilModalOpen] = useState(false);
  const [multiAgentConfig, setMultiAgentConfig] = useState<MultiAgentConfiguration>(() =>
    MultiAgentOrchestrator.loadConfiguration()
  );

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

    setSession(prev => {
      const updated: PracticeSession = {
        ...prev,
        currentStepIndex: nextSnapshot.currentStepIndex,
        accountBalance: brokerState.accountBalance,
        accountEquity: brokerState.accountEquity,
        orders: brokerState.orders,
        positions: brokerState.positions,
        lastMarketTimestamp: nextSnapshot.visibleCandles[nextSnapshot.visibleCandles.length - 1]?.timestamp,
      };
      const saveRes = PracticeSessionManager.saveActiveSession(updated);
      if (!saveRes.success && saveRes.error) {
        setExecutionMessage(saveRes.error);
      }
      return updated;
    });

    if (nextSnapshot.currentStepIndex >= nextSnapshot.totalSteps - 1) {
      setIsPlaying(false);
    }
  }, []);

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

  // محاسبه پویای نوسان (Wilder ATR) از کندل‌های بسته قابل مشاهده
  const atrValues = useMemo(() => calculateWilderATR(replayState.visibleCandles, 14), [replayState.visibleCandles]);
  const currentAtr = atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
  const isAtrReady = currentAtr !== null && currentAtr > 0;

  const macroLevels: MultiTimeframeLevel[] = useMemo(() => {
    if (!replayState.visibleCandles || replayState.visibleCandles.length === 0) return [];
    return TimeframeResampler.extractMultiTimeframeLevels(replayState.visibleCandles, session.symbol);
  }, [replayState.visibleCandles, session.symbol]);

  // پیش‌نمایش ریسک برای خرید (BUY)
  const buyRiskPreview = useMemo(() => {
    if (!isAtrReady || !currentAtr) return null;
    const slDist = currentAtr * 1.2;
    const tpDist = slDist * 2.0;
    const dec = session.symbol === 'XAUUSD' ? 2 : session.symbol === 'USDJPY' ? 3 : 5;
    return calculateDeterministicRisk({
      symbol: session.symbol,
      direction: 'BUY',
      entryPrice: currentPrice,
      stopLossPrice: Number((currentPrice - slDist).toFixed(dec)),
      takeProfitPrice: Number((currentPrice + tpDist).toFixed(dec)),
      accountEquity: session.accountEquity,
      riskPercentage: session.config.selectedRiskPercent,
    });
  }, [session.symbol, currentPrice, currentAtr, isAtrReady, session.accountEquity, session.config.selectedRiskPercent]);

  // پیش‌نمایش ریسک برای فروش (SELL)
  const sellRiskPreview = useMemo(() => {
    if (!isAtrReady || !currentAtr) return null;
    const slDist = currentAtr * 1.2;
    const tpDist = slDist * 2.0;
    const dec = session.symbol === 'XAUUSD' ? 2 : session.symbol === 'USDJPY' ? 3 : 5;
    return calculateDeterministicRisk({
      symbol: session.symbol,
      direction: 'SELL',
      entryPrice: currentPrice,
      stopLossPrice: Number((currentPrice + slDist).toFixed(dec)),
      takeProfitPrice: Number((currentPrice - tpDist).toFixed(dec)),
      accountEquity: session.accountEquity,
      riskPercentage: session.config.selectedRiskPercent,
    });
  }, [session.symbol, currentPrice, currentAtr, isAtrReady, session.accountEquity, session.config.selectedRiskPercent]);

  // ارزیابی شورا در حالت پیشرفته
  const councilResult = useMemo(() => {
    return MultiAgentOrchestrator.evaluateCandidate(replayState.activeCandidate, multiAgentConfig, {
      environment: 'PRACTICE',
      dataProvenance: provenance.originLabelFa,
    });
  }, [replayState.activeCandidate, multiAgentConfig, provenance.originLabelFa]);

  // ثبت معامله تمرینی با اعتبارسنجی مستقل و حذف کامل فال‌بک
  const handleExecuteTrade = (direction: 'BUY' | 'SELL') => {
    if (session.isFreezeNewEntries) {
      setExecutionMessage('خطا: ثبت ورودهای جدید متوقف است. برای ثبت معامله، ابتدا حالت توقف سفارش جدید را غیرفعال کنید.');
      return;
    }

    if (!isAtrReady || !currentAtr) {
      setExecutionMessage('خطا: تعداد کندل‌های بسته برای محاسبه نوسان (ATR) کافی نیست. لطفاً چند کندل جلوتر بروید.');
      return;
    }

    const broker = brokerRef.current;
    if (!broker) return;

    try {
      const slDist = currentAtr * 1.2;
      const tpDist = slDist * 2.0;
      const dec = session.symbol === 'XAUUSD' ? 2 : session.symbol === 'USDJPY' ? 3 : 5;

      const entry = currentPrice;
      const sl = direction === 'BUY' ? Number((entry - slDist).toFixed(dec)) : Number((entry + slDist).toFixed(dec));
      const tp = direction === 'BUY' ? Number((entry + tpDist).toFixed(dec)) : Number((entry - tpDist).toFixed(dec));

      // اعتبارسنجی مجدد قطعی ریسک بر مبنای آخرین اکوئیتی حساب
      const riskResult = calculateDeterministicRisk({
        symbol: session.symbol,
        direction,
        entryPrice: entry,
        stopLossPrice: sl,
        takeProfitPrice: tp,
        accountEquity: broker.getState().accountEquity,
        riskPercentage: session.config.selectedRiskPercent,
      });

      // رد قطعی بدون هیچ‌گونه فال‌بک به حداقل لات در صورت عدم اعتبار
      if (!riskResult.isValid || riskResult.adjustedVolumeLots <= 0) {
        setExecutionMessage(`سفارش لغو شد: ${riskResult.explanation || 'حجم معامله مجاز نیست.'}`);
        return;
      }

      const lots = riskResult.adjustedVolumeLots;

      const { position } = broker.createMarketBracketOrder(
        session.symbol,
        direction,
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

      setSession(updatedSession);
      PracticeSessionManager.saveActiveSession(updatedSession);

      setExecutionMessage(
        `معامله تمرینی ${direction === 'BUY' ? 'خرید' : 'فروش'} با حجم ${lots} لات در قیمت ${entry} (استاپ: ${sl}، تارگت: ${tp}) در حساب مجازی ثبت شد (شناسه: ${position.id}).`
      );
    } catch (err) {
      setExecutionMessage(`خطا در ثبت معامله: ${(err as Error).message}`);
    }
  };

  // توقف ورودهای جدید (Freeze New Entries)
  const handleToggleFreeze = () => {
    const nextFreeze = !session.isFreezeNewEntries;
    const updated: PracticeSession = {
      ...session,
      isFreezeNewEntries: nextFreeze,
    };
    setSession(updated);
    PracticeSessionManager.saveActiveSession(updated);
    setExecutionMessage(
      nextFreeze
        ? 'حالت «توقف سفارش جدید» فعال شد: پوزیشن‌های باز جاری حفظ می‌شوند، اما ورود جدید مسدود است.'
        : 'حالت «توقف سفارش جدید» غیرفعال شد: امکان ورود معامله تمرینی مجدداً فراهم است.'
    );
  };

  // بستن فوری کلیه پوزیشن‌ها (Panic Close All)
  const handleCloseAllPositions = () => {
    const broker = brokerRef.current;
    if (!broker) return;

    const openCount = broker.getState().positions.filter(p => p.isOpen).length;
    if (openCount === 0) {
      setExecutionMessage('هیچ پوزیشن بازی برای بستن وجود ندارد.');
      return;
    }
    if (!confirm(`آیا از بستن فوری تمامی ${openCount} پوزیشن باز در قیمت جاری اطمینان دارید؟`)) return;

    PositionScalingEngine.triggerPanicKillSwitch(broker, 'MANUAL_PANIC');
    const updatedBrokerState = broker.getState();
    const updatedSession: PracticeSession = {
      ...session,
      accountBalance: updatedBrokerState.accountBalance,
      accountEquity: updatedBrokerState.accountEquity,
      orders: updatedBrokerState.orders,
      positions: updatedBrokerState.positions,
    };
    setSession(updatedSession);
    PracticeSessionManager.saveActiveSession(updatedSession);
    setExecutionMessage(`تمام ${openCount} پوزیشن باز با کلید خروج اضطراری بسته شدند.`);
  };

  // آغاز یا تغییر نماد با کنترل و هماهنگی کامل نشست
  const executeNewSessionOrReset = (newSymbol: SymbolId) => {
    setIsPlaying(false);

    // ۱. بایگانی نشست فعلی
    PracticeSessionManager.archiveSession(session);

    // ۲. ایجاد نشست تازه
    const fresh = PracticeSessionManager.createNewSession(newSymbol, 10000, session.config);
    PracticeSessionManager.saveActiveSession(fresh);

    // ۳. بازنشانی موتورها
    const newBroker = new SimulatedBroker(fresh.initialBalance, fresh.config.enablePartialTp);
    brokerRef.current = newBroker;
    replayRef.current = new ReplayEngine(newSymbol, newBroker, fresh.currentStepIndex);

    setSession(fresh);
    setReplayState(replayRef.current.getSnapshot());
    setExecutionMessage(`نشست تمرینی جدید برای نماد ${newSymbol} با بالانس اولیه ۱۰۰۰۰ دلار آغاز شد.`);
  };

  // تغییر نماد
  const handleRequestSymbolChange = (newSymbol: SymbolId) => {
    if (newSymbol === session.symbol) return;
    const openCount = session.positions.filter(p => p.isOpen).length;

    if (openCount > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'تغییر نماد و پایان نشست جاری',
        message: `نشست جاری روی نماد ${session.symbol} دارای ${openCount} معاملهٔ باز است. از آنجا که هر نشست تک‌نمادی است، تغییر نماد نیازمند بایگانی نشست فعلی است. آیا مایلید این نشست را بایگانی کرده و نشست تازه‌ای روی ${newSymbol} آغاز کنید؟`,
        targetSymbol: newSymbol,
        action: 'SWITCH_SYMBOL',
      });
      return;
    }

    executeNewSessionOrReset(newSymbol);
  };

  // شروع نشست جدید
  const handleRequestNewSession = () => {
    const openCount = session.positions.filter(p => p.isOpen).length;
    if (openCount > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'شروع نشست جدید',
        message: `این نشست دارای ${openCount} معاملهٔ باز است. شروع نشست جدید سوابق فعلی را بایگانی کرده و حسابی تازه با ۱۰۰۰۰ دلار ایجاد می‌کند. آیا ادامه می‌دهید؟`,
        targetSymbol: session.symbol,
        action: 'START_NEW_SESSION',
      });
      return;
    }
    executeNewSessionOrReset(session.symbol);
  };

  // بازنشانی ریپلی
  const handleRequestResetReplay = () => {
    const openCount = session.positions.filter(p => p.isOpen).length;
    if (openCount > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'شروع مجدد ریپلی',
        message: `عقب‌بردن ریپلی با حفظ معاملات باز نشست ممنوع است زیرا نشست دارای ${openCount} معاملهٔ باز است. آیا مایلید این نشست بایگانی شده و از ابتدا آغاز گردد؟`,
        targetSymbol: session.symbol,
        action: 'RESET_REPLAY',
      });
      return;
    }
    executeNewSessionOrReset(session.symbol);
  };

  const handleConfirmModalAction = () => {
    if (!confirmModal) return;
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
    setSession(updated);
    PracticeSessionManager.saveActiveSession(updated);
  };

  const openPositions = session.positions.filter(p => p.isOpen);
  const closedPositions = session.positions.filter(p => !p.isOpen);

  return (
    <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none" dir="rtl">
      <EnvironmentNavBar
        currentEnv="PRACTICE"
        provenance={provenance}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4">
        {/* نوار اطلاعات نشست فعال */}
        <div className="bg-[#101420] border border-[#1b2234] px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-zinc-400">شناسه نشست:</span>
            <span className="font-mono text-zinc-200 font-bold">{session.sessionId}</span>
          </div>

          <div className="flex items-center gap-4 font-mono">
            <div>
              <span className="text-zinc-400 ml-1.5 font-sans">بالانس:</span>
              <span className="text-zinc-200 font-bold">${session.accountBalance.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-zinc-400 ml-1.5 font-sans">اکوئیتی:</span>
              <span className="text-cyan-400 font-bold">${session.accountEquity.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRequestNewSession}
              className="px-3 py-1.5 rounded-xl bg-[#182030] hover:bg-[#222c42] text-zinc-300 font-bold flex items-center gap-1.5 border border-[#283550] transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>شروع نشست جدید</span>
            </button>
          </div>
        </div>

        {/* پیام‌های سیستمی */}
        {executionMessage && (
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-xs flex items-center justify-between gap-2 text-cyan-300 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{executionMessage}</span>
            </div>
            <button onClick={() => setExecutionMessage(null)} className="text-zinc-400 hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* نوار ابزار کنترل بازپخش کندل و انتخاب نماد */}
        <div className="bg-[#101420] border border-[#1d2436] p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
          {/* انتخاب نماد تک‌نشستی */}
          <div className="flex items-center gap-2">
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

          {/* کلیدهای پخش ریپلی */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'توقف بازپخش' : 'پخش کندل‌ها'}</span>
            </button>

            <button
              onClick={handleStepForward}
              disabled={isPlaying}
              className="px-3.5 py-2 rounded-xl bg-[#181f30] hover:bg-[#222a40] text-zinc-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all border border-[#28324a]"
            >
              <StepForward className="w-4 h-4" />
              <span>کندل بعد</span>
            </button>

            <button
              onClick={handleRequestResetReplay}
              className="p-2 rounded-xl bg-[#181f30] hover:bg-[#222a40] text-zinc-300 transition-all border border-[#28324a]"
              title="شروع مجدد ریپلی از ابتدا"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="text-xs text-zinc-400 font-mono bg-[#141926] px-3 py-1.5 rounded-xl border border-[#202738]">
              کندل {replayState.currentStepIndex + 1} از {replayState.totalSteps}
            </div>

            {/* وضعیت پویای ATR */}
            <div className="text-xs font-mono bg-[#141926] px-3 py-1.5 rounded-xl border border-[#202738] flex items-center gap-1">
              <span className="text-zinc-500">ATR:</span>
              <span className={isAtrReady ? 'text-amber-400 font-bold' : 'text-zinc-500'}>
                {isAtrReady ? currentAtr?.toFixed(session.symbol === 'XAUUSD' ? 2 : session.symbol === 'USDJPY' ? 3 : 5) : 'در انتظار'}
              </span>
            </div>
          </div>
        </div>

        {/* چارت و داک معامله */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-[#0e121c] border border-[#1b2234] rounded-2xl p-3 overflow-hidden shadow-lg">
            <ChartCanvas
              candles={replayState.visibleCandles}
              symbol={session.symbol}
              macroLevels={macroLevels}
              activeCandidate={replayState.activeCandidate}
            />
          </div>

          {/* داک معامله ساده با برچسب‌های کنش‌محور */}
          <div className="bg-[#0f131f] border border-[#222a3d] rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* تنظیم ریسک با توضیحات */}
            <div className="flex items-center gap-3 bg-[#141926] p-2 rounded-xl border border-[#232d40]">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400 font-medium">سقف ریسک:</span>
                <span className="text-xs font-bold text-cyan-400 font-mono">{session.config.selectedRiskPercent}%</span>
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
              <span className="text-[10px] text-zinc-400 font-mono mr-auto">
                حجم خرید: {buyRiskPreview?.adjustedVolumeLots ?? '—'} Lot | فروش: {sellRiskPreview?.adjustedVolumeLots ?? '—'} Lot
              </span>
            </div>

            {/* دکمه‌های کنش‌محور خرید و فروش */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExecuteTrade('BUY')}
                disabled={session.isFreezeNewEntries || !buyRiskPreview?.isValid}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
                title={buyRiskPreview?.isValid ? `ثبت خرید با حجم ${buyRiskPreview.adjustedVolumeLots} لات` : buyRiskPreview?.explanation || 'محاسبه ریسک آماده نیست'}
              >
                <TrendingUp className="w-4 h-4" />
                <span>خرید (BUY) {buyRiskPreview?.isValid ? `(${buyRiskPreview.adjustedVolumeLots}L)` : ''}</span>
              </button>

              <button
                onClick={() => handleExecuteTrade('SELL')}
                disabled={session.isFreezeNewEntries || !sellRiskPreview?.isValid}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
                title={sellRiskPreview?.isValid ? `ثبت فروش با حجم ${sellRiskPreview.adjustedVolumeLots} لات` : sellRiskPreview?.explanation || 'محاسبه ریسک آماده نیست'}
              >
                <TrendingDown className="w-4 h-4" />
                <span>فروش (SELL) {sellRiskPreview?.isValid ? `(${sellRiskPreview.adjustedVolumeLots}L)` : ''}</span>
              </button>
            </div>

            {/* دو اقدام اضطراری مجزا و مشخص */}
            <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-r border-[#20293d] pt-2 sm:pt-0 sm:pr-3">
              <button
                onClick={handleToggleFreeze}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
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
                onClick={handleCloseAllPositions}
                disabled={openPositions.length === 0}
                className="px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-40 text-rose-300 text-xs font-bold flex items-center gap-1.5 border border-rose-800 transition-all"
                title="بستن فوری تمامی معاملات باز در قیمت جاری"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>بستن فوری همه ({openPositions.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* حالت پیشرفته: بازرسی قواعد شورا و تنظیمات عمیق */}
        {viewMode === 'ADVANCED' && (
          <div className="bg-[#121624] border border-purple-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300">
                <Sliders className="w-4 h-4" />
                <h3 className="text-xs font-bold">بخش پیشرفته: فیلترهای استراتژی و قواعد ورود</h3>
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
                  میزان تطابق ستاپ جاری با شروط اسکنر، تحلیل‌گر و منتقد
                </span>
              </div>

              <div className="bg-[#161c2c] p-2.5 rounded-xl border border-[#232c42]">
                <span className="text-zinc-500 text-[11px] block">وضعیت وتوی منتقد:</span>
                <span className={`text-xs font-bold mt-1 block ${councilResult.councilConsensus?.vetoTriggered ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {councilResult.councilConsensus?.vetoTriggered ? 'توقف معامله توسط منتقد' : 'بدون وتو (تأیید قواعد)'}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-1">
                  {councilResult.councilConsensus?.vetoReasonFa || 'قواعد ریسک و رژیم بازار تأیید هستند'}
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

            {/* کارت‌های ۴ ایجنت شورا با شناسنامه شفاف */}
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

        {/* دفتر معاملات و بررسی عملکرد این نشست */}
        <div className="bg-[#101420] border border-[#1d2436] rounded-2xl p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-200">دفتر معاملات نشست جاری</h2>
              <span className="text-[10px] text-zinc-500">(فقط معاملات این نشست تمرینی)</span>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              {closedPositions.length} معامله بسته شده
            </span>
          </div>

          {closedPositions.length === 0 ? (
            <div className="py-10 text-center space-y-2 text-zinc-500">
              <Info className="w-8 h-8 mx-auto text-zinc-600" />
              <p className="text-xs font-bold text-zinc-400">هنوز هیچ معامله‌ای در این نشست تمرینی بسته نشده است.</p>
              <p className="text-[11px] text-zinc-500 max-w-md mx-auto leading-relaxed">
                با دکمه‌های «خرید» یا «فروش» در داک بالا معامله باز کنید. پس از برخورد با حد سود (TP) یا حد ضرر (SL)، سوابق و قیمت دقیق خروج در این جدول نمایش می‌یابد.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#1f2638] text-zinc-400">
                    <th className="py-2 px-3">جهت</th>
                    <th className="py-2 px-3">حجم</th>
                    <th className="py-2 px-3">قیمت ورود</th>
                    <th className="py-2 px-3">قیمت واقعی خروج</th>
                    <th className="py-2 px-3">حد ضرر</th>
                    <th className="py-2 px-3">حد سود</th>
                    <th className="py-2 px-3">سود/زیان</th>
                    <th className="py-2 px-3">علت خروج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171e2e] font-mono">
                  {closedPositions.map(p => (
                    <tr key={p.id} className="hover:bg-[#141926]">
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {p.direction === 'BUY' ? 'خرید' : 'فروش'}
                        </span>
                      </td>
                      <td className="py-2 px-3">{p.volumeLots} Lot</td>
                      <td className="py-2 px-3">{p.entryPrice}</td>
                      <td className="py-2 px-3 font-bold text-cyan-300">
                        {p.exitPrice !== undefined ? p.exitPrice : p.currentPrice}
                      </td>
                      <td className="py-2 px-3 text-rose-400">{p.stopLoss}</td>
                      <td className="py-2 px-3 text-emerald-400">{p.takeProfit}</td>
                      <td className={`py-2 px-3 font-bold ${p.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${p.realizedPnl}
                      </td>
                      <td className="py-2 px-3 font-sans text-[11px] text-zinc-400">
                        {p.closeReason === 'TP'
                          ? 'تارگت سود (TP)'
                          : p.closeReason === 'SL'
                          ? 'حد ضرر (SL)'
                          : p.closeReason === 'SESSION_ENDED'
                          ? 'پایان نشست (بایگانی)'
                          : 'خروج دستی'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* مودال تأیید تغییر نماد / ریست / شروع نشست جدید */}
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
                تأیید و بایگانی نشست
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
