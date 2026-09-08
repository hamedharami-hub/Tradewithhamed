'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { TradingStyleType } from '@/lib/contracts/regimes';
import { RiskPreviewResult } from '@/lib/contracts/risk';
import { TransactionalOutboxRecord } from '@/lib/contracts/execution';
import { SimulatedBroker } from '@/lib/core/simulated-broker';
import { ReplayEngine, ReplayState } from '@/lib/replay/replay-engine';
import { calculateDeterministicRisk } from '@/lib/core/risk-calculator';
import { Header, TradingEnvironment } from '@/components/trading/header';
import { ChartCanvas } from '@/components/trading/chart-canvas';
import { OrderIntentModal } from '@/components/trading/order-intent-modal';
import { OutboxExecutionCard } from '@/components/trading/outbox-execution-card';
import { TestRunnerPanel } from '@/components/trading/test-runner-panel';
import { JournalWorkbenchW5 } from '@/components/trading/journal-workbench-w5';
import { OfflineIndicator } from '@/components/trading/offline-indicator';
import { SecurityDRPanel } from '@/components/trading/security-dr-panel';
import { ExportImportModal } from '@/components/trading/export-import-modal';
import { OfflineAIManagerModal } from '@/components/trading/offline-ai-manager-modal';
import { MultiAgentOrchestratorModal } from '@/components/trading/multi-agent-orchestrator-modal';
import { MultiAgentOrchestrator } from '@/lib/core/multi-agent-orchestrator';
import {
  MultiAgentConfiguration,
  TRADING_STYLES,
  DEFAULT_MULTI_AGENT_CONFIG,
} from '@/lib/contracts/multi-agent-system';
import { ResearchWorkbench } from '@/components/trading/research-workbench';
import { LiveShadowWorkbench } from '@/components/trading/live-shadow-workbench';
import { RiskGuardianWorkbench } from '@/components/trading/risk-guardian-workbench';
import { RAGPlaybookWorkbench } from '@/components/trading/rag-playbook-workbench';
import { AVAILABLE_OFFLINE_MODELS } from '@/lib/ai/browser-offline-ai';
import { M3Tabs, ActiveTabKey } from '@/components/trading/m3-tabs';
import { SymbolReplayToolbar } from '@/components/trading/symbol-replay-toolbar';
import { SetupAnalysisCard } from '@/components/trading/setup-analysis-card';
import { InstantExecutionPad } from '@/components/trading/instant-execution-pad';
import { PositionScalingEngine } from '@/lib/core/position-scaling-engine';
import { PartialTPConfig } from '@/lib/contracts/tactical-cockpit';
import { PersistenceStorage, AppExportPayloadV1 } from '@/lib/persistence/storage';
import {
  AnalystCriticPipeline,
  OfflineAIProfileId,
  OFFLINE_AI_PROFILES,
} from '@/lib/core/analyst-critic';
import { MultiTimeframeSyncView } from '@/components/trading/multi-timeframe-sync-view';
import { MonteCarloModal } from '@/components/trading/monte-carlo-modal';
import { MultiStyleBacktestModal } from '@/components/trading/multi-style-backtest-modal';
import { SignalAlertModal } from '@/components/trading/signal-alert-modal';
import { SignalAlertDispatcher } from '@/lib/core/signal-alert-dispatcher';
import { MonteCarloSimulator } from '@/lib/core/monte-carlo-simulator';
import { TimeframeResampler } from '@/lib/core/timeframe-resampler';
import { MultiTimeframeLevel, PercentileStepPoint } from '@/lib/contracts/monte-carlo';
import { ShieldCheck, AlertCircle, X } from 'lucide-react';

const broker = new SimulatedBroker(10000);
const replayEngine = new ReplayEngine('XAUUSD', broker);

export default function TradingLabPage() {
  const [symbol, setSymbol] = useState<SymbolId>('XAUUSD');
  const [replayState, setReplayState] = useState<ReplayState>(replayEngine.getSnapshot());
  const [activeTab, setActiveTab] = useState<ActiveTabKey>('chart');
  const [viewMode, setViewMode] = useState<'auto' | 'mobile' | 'windows'>('auto');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outboxRecords, setOutboxRecords] = useState<TransactionalOutboxRecord[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockingReason, setBlockingReason] = useState<string | undefined>();
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [currentEnvironment, setCurrentEnvironment] = useState<TradingEnvironment>('BROKER_DEMO');

  // وضعیت‌های جلسه تحلیلی و بازپخش خودکار
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(1000);
  const [isSessionActive, setIsSessionActive] = useState(true);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // وضعیت مدل هوش مصنوعی آفلاین
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isMultiAgentModalOpen, setIsMultiAgentModalOpen] = useState(false);
  const [isMonteCarloModalOpen, setIsMonteCarloModalOpen] = useState(false);
  const [isBacktestModalOpen, setIsBacktestModalOpen] = useState(false);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [syncedCrosshairPrice, setSyncedCrosshairPrice] = useState<number | null>(null);
  const [multiAgentConfig, setMultiAgentConfig] = useState<MultiAgentConfiguration>(() =>
    MultiAgentOrchestrator.loadConfiguration()
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hamed_selected_ai_model_id');
        if (saved) return saved;
      } catch {}
    }
    return 's0-deterministic';
  });

  const [aiProfileId, setAiProfileId] = useState<OfflineAIProfileId>('local-offline-s0-v1');

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    try {
      localStorage.setItem('hamed_selected_ai_model_id', modelId);
    } catch {}

    const profileMap: Record<string, OfflineAIProfileId> = {
      's0-deterministic': 'local-offline-s0-v1',
      'deep-critic-strict': 'local-offline-deep-critic-v1',
      'qwen3.5-0.8b-mlc': 'qwen3.5-0.8b-mlc',
      'qwen3.5-2b-mlc': 'qwen3.5-2b-mlc',
      'qwen3.5-4b-mlc': 'qwen3.5-4b-mlc',
      'qwen3-1.7b-mlc': 'qwen3-1.7b-mlc',
      'gemma-4-e2b-litert': 'gemma-4-e2b-litert',
    };
    const profileId = profileMap[modelId] || 'local-offline-s0-v1';
    setAiProfileId(profileId);
  };

  const activeProfile = useMemo(() => {
    const foundModel = AVAILABLE_OFFLINE_MODELS.find(m => m.id === selectedModelId);
    const baseProfile = OFFLINE_AI_PROFILES.find(p => p.id === aiProfileId) || OFFLINE_AI_PROFILES[0];
    return {
      ...baseProfile,
      nameFa: foundModel ? foundModel.name : baseProfile.nameFa,
    };
  }, [selectedModelId, aiProfileId]);

  // محاسبه مستقیم ریسک قطعی
  const riskPreview: RiskPreviewResult | null = useMemo(() => {
    if (!replayState.activeCandidate) return null;
    return calculateDeterministicRisk({
      symbol: replayState.activeCandidate.symbol,
      direction: replayState.activeCandidate.direction,
      entryPrice: replayState.activeCandidate.entryPrice,
      stopLossPrice: replayState.activeCandidate.stopLossPrice,
      takeProfitPrice: replayState.activeCandidate.takeProfitPrice,
      accountEquity: broker.getState().accountEquity,
      riskPercentage: 0.25,
    });
  }, [replayState.activeCandidate]);

  // ارزیابی هوش مصنوعی ساختاریافته آفلاین در سایه
  const shadowAnalysis = useMemo(() => {
    if (!replayState.activeCandidate) return null;
    return AnalystCriticPipeline.runShadowPipeline(
      replayState.activeCandidate,
      aiProfileId
    );
  }, [replayState.activeCandidate, aiProfileId]);

  // ارزیابی خط‌لوله ۴ ایجنت هوشمند و تطابق با سبک معاملاتی
  const multiAgentResult = useMemo(() => {
    return MultiAgentOrchestrator.evaluateCandidate(
      replayState.activeCandidate,
      multiAgentConfig
    );
  }, [replayState.activeCandidate, multiAgentConfig]);

  const activeTradingStyleBadgeFa = useMemo(() => {
    const found = TRADING_STYLES.find(s => s.id === multiAgentConfig.activeTradingStyle);
    return found ? found.badgeFa : 'سبک S0';
  }, [multiAgentConfig.activeTradingStyle]);

  const currentCandlePrice = useMemo(() => {
    return (
      replayState.visibleCandles[replayState.visibleCandles.length - 1]?.close ||
      (symbol === 'XAUUSD' ? 2650 : 1.085)
    );
  }, [replayState.visibleCandles, symbol]);

  // سطوح کلان چند تایم‌فریمه از تجمیع و بازنمونه‌گیری کندل‌های واقعی
  const macroLevels: MultiTimeframeLevel[] = useMemo(() => {
    if (!replayState.visibleCandles || replayState.visibleCandles.length === 0) return [];
    return TimeframeResampler.extractMultiTimeframeLevels(replayState.visibleCandles, symbol);
  }, [replayState.visibleCandles, symbol]);

  // مخروط صدک‌های استوکاستیک مونت‌کارلو به سمت آینده روی چارت (Phase 6)
  const forwardMonteCarloCone: PercentileStepPoint[] | undefined = useMemo(() => {
    if (!currentCandlePrice) return undefined;
    const targetOffset = symbol === 'XAUUSD' ? 15 : 0.003;
    const slOffset = symbol === 'XAUUSD' ? 6 : 0.0012;
    const sim = MonteCarloSimulator.runSimulation({
      iterations: 200,
      steps: 20,
      initialPrice: currentCandlePrice,
      targetPrice: currentCandlePrice + targetOffset,
      stopLossPrice: currentCandlePrice - slOffset,
      seed: 42,
    });
    return sim.percentileCone;
  }, [currentCandlePrice, symbol]);

  const handleSaveMultiAgentConfig = (newConfig: MultiAgentConfiguration) => {
    setMultiAgentConfig(newConfig);
    MultiAgentOrchestrator.saveConfiguration(newConfig);
  };

  // واکشی رکوردهای صندوق تراکنشی
  const fetchOutbox = async () => {
    try {
      const res = await fetch('/api/orders/outbox');
      if (res.ok) {
        const data = await res.json();
        setOutboxRecords(data.records || []);
        setIsBlocked(data.isBlocked || false);
        setBlockingReason(data.blockingReason);
      }
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    const loadOutbox = async () => {
      try {
        const res = await fetch('/api/orders/outbox');
        if (res.ok && isMounted) {
          const data = await res.json();
          setOutboxRecords(data.records || []);
          setIsBlocked(data.isBlocked || false);
          setBlockingReason(data.blockingReason);
        }
      } catch {}
    };

    loadOutbox();
    const interval = setInterval(loadOutbox, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // همگام‌سازی تعداد هشدارهای خوانده‌نشده
  useEffect(() => {
    const updateCount = () => {
      setUnreadAlertsCount(SignalAlertDispatcher.getUnreadCount());
    };
    const id = requestAnimationFrame(updateCount);
    const unsubscribe = SignalAlertDispatcher.subscribe(updateCount);
    return () => {
      cancelAnimationFrame(id);
      unsubscribe();
    };
  }, []);

  // ارزیابی خودکار شرایط بازار و صدور هوشمند هشدار
  useEffect(() => {
    if (!replayState.visibleCandles || replayState.visibleCandles.length === 0) return;
    const lastCandle = replayState.visibleCandles[replayState.visibleCandles.length - 1];
    if (!lastCandle) return;

    SignalAlertDispatcher.evaluateMarketState({
      symbol,
      timeframe: '5M',
      currentPrice: lastCandle.close,
      regimeAnalysis: replayState.marketRegime,
      activeCandidate: replayState.activeCandidate,
      councilResult: multiAgentResult,
    });
  }, [
    replayState.visibleCandles,
    replayState.activeCandidate,
    replayState.marketRegime,
    multiAgentResult,
    symbol,
  ]);

  // زمان‌سنج جلسه کاری
  useEffect(() => {
    if (!isSessionActive) return;
    const timer = setInterval(() => {
      setSessionSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isSessionActive]);

  // حلقه بازپخش خودکار کندل‌ها
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setReplayState(prev => {
        if (prev.currentStepIndex >= prev.totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        const next = replayEngine.stepForward();
        return { ...next };
      });
    }, speedMs);
    return () => clearInterval(timer);
  }, [isPlaying, speedMs]);

  // بارگذاری اولیه وضعیت از حافظه محلی
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = PersistenceStorage.loadFromLocal();
      if (saved) {
        if (saved.symbol === 'XAUUSD' || saved.symbol === 'EURUSD') {
          setSymbol(saved.symbol);
          replayEngine.setSymbol(saved.symbol);
        }
        replayEngine.reset();
        for (let i = 14; i < saved.currentStepIndex; i++) {
          replayEngine.stepForward();
        }
        setReplayState(replayEngine.getSnapshot());
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // کنترل تغییر نماد
  const handleSymbolChange = (newSymbol: SymbolId) => {
    setSymbol(newSymbol);
    replayEngine.setSymbol(newSymbol);
    const snap = replayEngine.getSnapshot();
    setReplayState(snap);
    PersistenceStorage.saveToLocal({
      symbol: newSymbol,
      currentStepIndex: snap.currentStepIndex,
      accountBalance: broker.getState().accountBalance,
      accountEquity: broker.getState().accountEquity,
    });
  };

  // کنترل گام ریپلی
  const handleStepForward = () => {
    const next = replayEngine.stepForward();
    setReplayState({ ...next });
    PersistenceStorage.saveToLocal({
      symbol,
      currentStepIndex: next.currentStepIndex,
      accountBalance: broker.getState().accountBalance,
      accountEquity: broker.getState().accountEquity,
    });
  };

  const handleResetReplay = () => {
    setIsPlaying(false);
    const next = replayEngine.reset();
    setReplayState({ ...next });
    PersistenceStorage.saveToLocal({
      symbol,
      currentStepIndex: next.currentStepIndex,
      accountBalance: broker.getState().accountBalance,
      accountEquity: broker.getState().accountEquity,
    });
  };

  // تغییر فیلتر سبک معاملاتی ۴ گانه
  const handleStyleFilterChange = (filter: TradingStyleType | 'ALL') => {
    replayEngine.setStyleFilter(filter);
    const snap = replayEngine.getSnapshot();
    setReplayState({ ...snap });
  };

  // اجرای سفارش فوری ۱-کلیکی از کاکپیت تاکتیکی
  const handleExecuteInstantOrder = (
    direction: 'BUY' | 'SELL',
    riskPercent: number,
    useCandidateLevels: boolean,
    partialConfig: PartialTPConfig
  ) => {
    try {
      const lastCandle = replayState.visibleCandles[replayState.visibleCandles.length - 1];
      const livePrice = lastCandle ? lastCandle.close : symbol === 'XAUUSD' ? 2050 : 1.085;
      const liveAtr = symbol === 'XAUUSD' ? 2.5 : 0.0015;

      let lots = 0.01;
      let entry = livePrice;
      let sl = direction === 'BUY' ? entry - liveAtr * 1.2 : entry + liveAtr * 1.2;
      let tp = direction === 'BUY' ? entry + liveAtr * 2.5 : entry - liveAtr * 2.5;

      if (useCandidateLevels && replayState.activeCandidate) {
        entry = replayState.activeCandidate.entryPrice;
        sl = replayState.activeCandidate.stopLossPrice;
        tp = replayState.activeCandidate.takeProfitPrice;
        if (!riskPreview || !riskPreview.isValid || riskPreview.adjustedVolumeLots < 0.01) {
          setExecutionMessage(
            `خطای کنترل ریسک: ${riskPreview?.explanation || 'سرمایه حساب برای رعایت سقف ریسک ۰٫۲۵٪ و حداقل حجم بروکر (۰٫۰۱ لات) کافی نیست.'}`
          );
          return;
        }
        lots = riskPreview.adjustedVolumeLots;
      } else {
        const bracket = PositionScalingEngine.calculateInstantBracket(
          symbol,
          direction,
          livePrice,
          liveAtr,
          riskPercent,
          brokerState.accountEquity,
          partialConfig
        );
        if (!bracket.isValid || bracket.calculatedLots < 0.01) {
          setExecutionMessage(
            `خطای کنترل ریسک: ${bracket.errorFa || 'سرمایه حساب برای رعایت سقف ریسک ۰٫۲۵٪ و حداقل حجم بروکر (۰٫۰۱ لات) کافی نیست.'}`
          );
          return;
        }
        lots = bracket.calculatedLots;
        entry = bracket.entryPrice;
        sl = bracket.stopLossPrice;
        tp = bracket.takeProfitPrice;
      }

      const { position } = broker.createMarketBracketOrder(
        symbol,
        direction,
        lots,
        entry,
        sl,
        tp
      );

      setExecutionMessage(
        `سفارش فوری ${direction === 'BUY' ? 'خرید' : 'فروش'} با حجم ${lots} لات در قیمت ${entry} ثبت شد (شناسه پوزیشن: ${position.id}).`
      );

      setReplayState({ ...replayEngine.getSnapshot() });
    } catch (err) {
      setExecutionMessage(`خطای ثبت فوری: ${(err as Error).message}`);
    }
  };

  // کلید اضطراری بستن کلیه پوزیشن‌ها (Panic Kill-Switch)
  const handlePanicKillSwitch = () => {
    const event = PositionScalingEngine.triggerPanicKillSwitch(broker, 'MANUAL_PANIC');
    setExecutionMessage(event.summaryFa);
    setReplayState({ ...replayEngine.getSnapshot() });
  };

  // بازیابی وضعیت از فایل JSON
  const handleStateRestored = (imported: AppExportPayloadV1['state']) => {
    setSymbol(imported.symbol);
    replayEngine.setSymbol(imported.symbol);
    replayEngine.reset();
    for (let i = 14; i < imported.currentStepIndex; i++) {
      replayEngine.stepForward();
    }
    const snap = replayEngine.getSnapshot();
    setReplayState(snap);
    setExecutionMessage(`وضعیت با موفقیت از فایل بازیابی شد (نماد ${imported.symbol}).`);
  };

  // ارسال سفارش در مرحله ۵
  const handleConfirmSubmit = async (options?: { simulateTimeout?: boolean; simulateRejection?: boolean }) => {
    if (!replayState.activeCandidate || !riskPreview) return;
    setIsSubmitting(true);
    setExecutionMessage(null);

    const intentId = `INTENT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const idempotencyKey = `IDEMP-${intentId}`;

    try {
      const res = await fetch('/api/orders/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId,
          idempotencyKey,
          symbol: replayState.activeCandidate.symbol,
          direction: replayState.activeCandidate.direction,
          volumeLots: riskPreview.adjustedVolumeLots,
          limitPrice: replayState.activeCandidate.entryPrice,
          stopLossPrice: replayState.activeCandidate.stopLossPrice,
          takeProfitPrice: replayState.activeCandidate.takeProfitPrice,
          userConfirmationTimestamp: Date.now(),
          simulateTimeout: options?.simulateTimeout,
          simulateRejection: options?.simulateRejection,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setExecutionMessage(`سفارش لیمیت با موفقیت در بروکر ثبت شد. شناسه بروکر: ${data.record.brokerOrderId}`);
      } else if (data.state === 'UNKNOWN_RECONCILE_REQUIRED') {
        setExecutionMessage(
          `هشدار ایمنی: پاسخ مبهم دریافت شد. سفارش به حالت بازتطبیق رفت و ارسال‌های جدید مسدود شد.`
        );
      } else {
        setExecutionMessage(`خطای ارسال: ${data.error || 'عملیات با شکست مواجه شد.'}`);
      }

      await fetchOutbox();
      setIsModalOpen(false);
    } catch (err) {
      setExecutionMessage(`خطای غیرمنتظره: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // بازتطبیق سفارش با سرور بروکر
  const handleReconcileOrder = async (intentId: string) => {
    try {
      const res = await fetch('/api/orders/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId }),
      });
      const data = await res.json();
      if (data.reconciled) {
        setExecutionMessage(data.message);
      } else {
        setExecutionMessage(`خطا در بازتطبیق: ${data.error}`);
      }
      await fetchOutbox();
    } catch (err) {
      setExecutionMessage(`خطا در بازتطبیق: ${(err as Error).message}`);
    }
  };

  const brokerState = broker.getState();
  const pendingOutboxCount = outboxRecords.filter(
    r => r.state === 'SUBMITTING' || r.state === 'UNKNOWN_RECONCILE_REQUIRED'
  ).length;

  return (
    <main className="min-h-screen bg-[#101217] text-[#e3e8f2] flex flex-col font-sans selection:bg-cyan-600 selection:text-white">
      {/* سربرگ استاندارد متریال ۳ با نشان دائمی DEMO */}
      <Header
        dataMode="REPLAYED"
        accountMaskedId={currentEnvironment === 'BROKER_DEMO' ? 'DEMO-****5678' : 'PAPER-****1234'}
        equity={brokerState.accountEquity}
        balance={brokerState.accountBalance}
        isBlocked={isBlocked}
        currentViewMode={viewMode}
        onChangeViewMode={setViewMode}
        activeModelName={activeProfile.nameFa}
        onOpenAIModal={() => setIsAIModalOpen(true)}
        currentEnvironment={currentEnvironment}
        onChangeEnvironment={setCurrentEnvironment}
        marketRegime={replayState.marketRegime}
        onOpenAlertModal={() => setIsAlertModalOpen(true)}
        unreadAlertsCount={unreadAlertsCount}
      />

      <div className={`w-full mx-auto p-3 sm:p-4 md:p-5 space-y-4 transition-all duration-300 ${
        viewMode === 'mobile'
          ? 'max-w-md'
          : viewMode === 'windows'
          ? 'max-w-[1550px]'
          : 'max-w-7xl'
      }`}>
        {/* پیام‌های سیستمی و اعلانات امنیتی */}
        {executionMessage && (
          <div className="p-3 bg-[#17212e] border border-cyan-700/60 rounded-2xl text-xs flex items-center justify-between gap-2 text-cyan-200 shadow-sm" dir="rtl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{executionMessage}</span>
            </div>
            <button
              onClick={() => setExecutionMessage(null)}
              className="text-zinc-400 hover:text-white p-1 rounded-lg"
              aria-label="بستن پیام"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* نوار جابجایی تب‌های متریال ۳ جهت مطالعه خلوت و بدون خستگی چشم */}
        <M3Tabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          hasActiveCandidate={!!replayState.activeCandidate}
          outboxPendingCount={pendingOutboxCount}
        />

        {/* محتوای تب فعال: ساختار تفکیک‌شده و بهینه */}
        {activeTab === 'chart' && (
          <div className="space-y-4">
            {/* نوار ابزار ریپلی و نماد */}
            <SymbolReplayToolbar
              symbol={symbol}
              onSymbolChange={handleSymbolChange}
              isSessionActive={isSessionActive}
              onToggleSession={() => setIsSessionActive(!isSessionActive)}
              sessionSeconds={sessionSeconds}
              currentStepIndex={replayState.currentStepIndex}
              totalSteps={replayState.totalSteps}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              speedMs={speedMs}
              onChangeSpeed={setSpeedMs}
              onStepForward={handleStepForward}
              onReset={handleResetReplay}
              onOpenExportModal={() => setIsExportModalOpen(true)}
              onOpenAIModal={() => setIsAIModalOpen(true)}
              onOpenMultiAgentModal={() => setIsMultiAgentModalOpen(true)}
              activeModelNameFa={activeProfile.nameFa}
              activeTradingStyleBadgeFa={activeTradingStyleBadgeFa}
              activeStyleFilter={replayState.activeStyleFilter}
              onChangeStyleFilter={handleStyleFilterChange}
            />

            {/* کاکپیت تاکتیکی ترید سریع ۱-کلیکی، خروج پله‌ای و Kill-Switch (فاز ۲) */}
            <InstantExecutionPad
              symbol={symbol}
              currentPrice={
                replayState.visibleCandles[replayState.visibleCandles.length - 1]?.close ||
                (symbol === 'XAUUSD' ? 2050 : 1.085)
              }
              currentAtr={symbol === 'XAUUSD' ? 2.5 : 0.0015}
              accountEquity={brokerState.accountEquity}
              activeCandidate={replayState.activeCandidate}
              onExecuteInstantOrder={handleExecuteInstantOrder}
              onPanicKillSwitch={handlePanicKillSwitch}
              openPositionsCount={brokerState.positions.filter(p => p.isOpen).length}
            />

            {/* چیدمان نمودار و کارت تحلیل ستاپ - دو ستونه از عرض md به بالا برای تاشوی باز و لپ‌تاپ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* ستون نمودار کندل‌استیک ۵ دقیقه‌ای و دیدبان چندتایم‌فریمه */}
              <div className="md:col-span-2 space-y-4">
                <ChartCanvas
                  symbol={symbol}
                  candles={replayState.visibleCandles}
                  activeCandidate={replayState.activeCandidate}
                  multiTimeframeLevels={macroLevels}
                  monteCarloCone={forwardMonteCarloCone}
                  isCrosshairSynced={true}
                  crosshairPrice={syncedCrosshairPrice}
                  onCrosshairChange={(price) => setSyncedCrosshairPrice(price)}
                />
                <MultiTimeframeSyncView
                  symbol={symbol}
                  currentPrice={
                    replayState.visibleCandles[replayState.visibleCandles.length - 1]?.close ||
                    (symbol === 'XAUUSD' ? 2050 : 1.085)
                  }
                  macroTrend="BULLISH"
                  onOpenMonteCarlo={() => setIsMonteCarloModalOpen(true)}
                  onOpenBacktest={() => setIsBacktestModalOpen(true)}
                  onOpenAlerts={() => setIsAlertModalOpen(true)}
                  unreadAlertsCount={unreadAlertsCount}
                />
              </div>

              {/* ستون کارت ستاپ و تحلیل هوش مصنوعی آفلاین */}
              <div className="md:col-span-1">
                <SetupAnalysisCard
                  candidate={replayState.activeCandidate}
                  riskPreview={riskPreview}
                  shadowAnalysis={shadowAnalysis}
                  multiAgentResult={multiAgentResult}
                  isBlocked={isBlocked}
                  onOpenOrderModal={() => setIsModalOpen(true)}
                  onOpenAIModal={() => setIsAIModalOpen(true)}
                  onOpenMultiAgentModal={() => setIsMultiAgentModalOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        {/* بخش پژوهش، بک‌تست پیشرفته و پیپرتریدینگ W2 */}
        {activeTab === 'research' && (
          <div className="space-y-4">
            <ResearchWorkbench
              currentCandles={replayState.visibleCandles}
              symbol={symbol}
            />
          </div>
        )}

        {/* بخش مدیریت سفارش‌ها و بازتطبیق اجرای سایه W3 */}
        {activeTab === 'execution' && (
          <div className="space-y-4">
            <LiveShadowWorkbench />
          </div>
        )}

        {/* بخش محافظ ریسک، سقف زیان و کلیدهای قطع نوسان W4 */}
        {activeTab === 'guardian' && (
          <div className="space-y-4">
            <RiskGuardianWorkbench />
          </div>
        )}

        {/* بخش ژورنال خودکار و ممیزی رفتار معاملاتی W5 */}
        {activeTab === 'journal' && (
          <div className="space-y-4">
            <JournalWorkbenchW5 />
          </div>
        )}

        {/* بخش کتابچه استراتژی S0 و بازیابی معنایی محلی (Local Semantic RAG) */}
        {activeTab === 'playbook' && (
          <div className="space-y-4">
            <RAGPlaybookWorkbench />
          </div>
        )}

        {/* بخش امنیت، بازیابی و صندوق تراکنشی cTrader */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <OutboxExecutionCard
                records={outboxRecords}
                isBlocked={isBlocked}
                blockingReason={blockingReason}
                onReconcile={handleReconcileOrder}
                onRefreshOutbox={fetchOutbox}
              />
              <SecurityDRPanel />
            </div>
          </div>
        )}

        {/* بخش آزمون‌های خودکار و پایش سلامت سیستم */}
        {activeTab === 'tests' && (
          <div className="space-y-4">
            <TestRunnerPanel />
          </div>
        )}
      </div>

      {/* مودال تأیید نهایی ارسال به cTrader Demo (مرحله ۵) */}
      {replayState.activeCandidate && riskPreview && (
        <OrderIntentModal
          candidate={replayState.activeCandidate}
          riskPreview={riskPreview}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirmSubmit={handleConfirmSubmit}
          isSubmitting={isSubmitting}
          isBlockedByReconciliation={isBlocked}
          blockingReason={blockingReason}
        />
      )}

      {/* نشانگر هوشمند وضعیت آفلاین و مرزهای پردازش در وب */}
      <OfflineIndicator />

      {/* مودال پشتیبان‌گیری و بازیابی داده‌ها */}
      <ExportImportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentState={{
          symbol,
          currentStepIndex: replayState.currentStepIndex,
          accountBalance: broker.getState().accountBalance,
          accountEquity: broker.getState().accountEquity,
        }}
        onStateRestored={handleStateRestored}
      />

      {/* مرکز دانلود و مدیریت هوش‌های مصنوعی آفلاین */}
      <OfflineAIManagerModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        currentPrice={replayState.visibleCandles[replayState.visibleCandles.length - 1]?.close || 2650.5}
        symbol={symbol}
      />

      {/* اتاق فرمان ۴ ایجنت هوشمند و سبک‌های معاملاتی */}
      <MultiAgentOrchestratorModal
        isOpen={isMultiAgentModalOpen}
        onClose={() => setIsMultiAgentModalOpen(false)}
        config={multiAgentConfig}
        onSaveConfig={handleSaveMultiAgentConfig}
      />

      {/* مودال شبیه‌سازی ۱۰۰۰ مسیره مونت‌کارلو */}
      <MonteCarloModal
        isOpen={isMonteCarloModalOpen}
        onClose={() => setIsMonteCarloModalOpen(false)}
        initialPrice={
          replayState.activeCandidate?.entryPrice ||
          replayState.visibleCandles[replayState.visibleCandles.length - 1]?.close ||
          (symbol === 'XAUUSD' ? 2050 : 1.085)
        }
        targetPrice={
          replayState.activeCandidate?.takeProfitPrice ||
          (symbol === 'XAUUSD' ? 2062 : 1.092)
        }
        stopLossPrice={
          replayState.activeCandidate?.stopLossPrice ||
          (symbol === 'XAUUSD' ? 2044 : 1.081)
        }
        symbol={symbol}
      />

      {/* مودال آزمایشگاه جامع بک‌تست تاریخی چند سبکه */}
      <MultiStyleBacktestModal
        isOpen={isBacktestModalOpen}
        onClose={() => setIsBacktestModalOpen(false)}
        candles={replayState.visibleCandles}
        symbol={symbol}
      />

      {/* مرکز دیدبان و مدیریت هشدارهای هوشمند */}
      <SignalAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => {
          setIsAlertModalOpen(false);
          setUnreadAlertsCount(SignalAlertDispatcher.getUnreadCount());
        }}
      />
    </main>
  );
}
