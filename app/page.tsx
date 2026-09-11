'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { TradingStyleType } from '@/lib/contracts/regimes';
import { RiskPreviewResult } from '@/lib/contracts/risk';
import { TransactionalOutboxRecord } from '@/lib/contracts/execution';
import { SimulatedBroker } from '@/lib/core/simulated-broker';
import { ReplayEngine, ReplayState } from '@/lib/replay/replay-engine';
import { calculateDeterministicRisk } from '@/lib/core/risk-calculator';
import { Header, TradingEnvironment } from '@/components/trading/header';
import { AppNavigation, WorkspaceKey } from '@/components/navigation/app-navigation';
import { TradeWorkspace } from '@/components/workspaces/trade-workspace';
import { AIHubWorkspace } from '@/components/workspaces/ai-hub-workspace';
import { AnalyticsWorkspace } from '@/components/workspaces/analytics-workspace';
import { SystemWorkspace } from '@/components/workspaces/system-workspace';
import { OrderIntentModal } from '@/components/trading/order-intent-modal';
import { OfflineIndicator } from '@/components/trading/offline-indicator';
import { ExportImportModal } from '@/components/trading/export-import-modal';
import { OfflineAIManagerModal } from '@/components/trading/offline-ai-manager-modal';
import { MultiAgentOrchestratorModal } from '@/components/trading/multi-agent-orchestrator-modal';
import { MultiAgentOrchestrator } from '@/lib/core/multi-agent-orchestrator';
import {
  MultiAgentConfiguration,
  TRADING_STYLES,
} from '@/lib/contracts/multi-agent-system';
import { AVAILABLE_OFFLINE_MODELS, BrowserOfflineAIManager } from '@/lib/ai/browser-offline-ai';
import { PositionScalingEngine } from '@/lib/core/position-scaling-engine';
import { PartialTPConfig } from '@/lib/contracts/tactical-cockpit';
import { PersistenceStorage, AppExportPayloadV1 } from '@/lib/persistence/storage';
import {
  AnalystCriticPipeline,
  OfflineAIProfileId,
  OFFLINE_AI_PROFILES,
  ShadowAnalysisPipelineResult,
} from '@/lib/core/analyst-critic';
import { MonteCarloModal } from '@/components/trading/monte-carlo-modal';
import { MultiStyleBacktestModal } from '@/components/trading/multi-style-backtest-modal';
import { SignalAlertModal } from '@/components/trading/signal-alert-modal';
import { SignalAlertDispatcher } from '@/lib/core/signal-alert-dispatcher';
import { MonteCarloSimulator } from '@/lib/core/monte-carlo-simulator';
import { TimeframeResampler } from '@/lib/core/timeframe-resampler';
import { MultiTimeframeLevel, PercentileStepPoint } from '@/lib/contracts/monte-carlo';
import { ShieldCheck, X } from 'lucide-react';

const broker = new SimulatedBroker(10000);
const replayEngine = new ReplayEngine('XAUUSD', broker);
const PROFILE_BY_MODEL: Record<string, OfflineAIProfileId> = {
  's0-deterministic': 'local-offline-s0-v1',
  'deep-critic-strict': 'local-offline-deep-critic-v1',
  'qwen3.5-0.8b-mlc': 'qwen3.5-0.8b-mlc',
  'qwen3.5-2b-mlc': 'qwen3.5-2b-mlc',
  'qwen3.5-4b-mlc': 'qwen3.5-4b-mlc',
  'qwen3-1.7b-mlc': 'qwen3-1.7b-mlc',
  'phi-4-mini-instruct-mlc': 'phi-4-mini-instruct-mlc',
  'deepseek-r1-distill-qwen-7b-mlc': 'deepseek-r1-distill-qwen-7b-mlc',
  'llama-3.2-3b-instruct-mlc': 'llama-3.2-3b-instruct-mlc',
  'qwen2.5-7b-instruct-mlc': 'qwen2.5-7b-instruct-mlc',
  'gemma-4-e2b-litert': 'gemma-4-e2b-litert',
};

export default function TradingLabPage() {
  const [symbol, setSymbol] = useState<SymbolId>('XAUUSD');
  const [replayState, setReplayState] = useState<ReplayState>(replayEngine.getSnapshot());
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceKey>('trade');
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
  const [selectedModelId, setSelectedModelId] = useState<string>(() => BrowserOfflineAIManager.getSelectedModelId());

  const [aiProfileId, setAiProfileId] = useState<OfflineAIProfileId>(() => PROFILE_BY_MODEL[BrowserOfflineAIManager.getSelectedModelId()] || 'local-offline-s0-v1');
  const [shadowAnalysis, setShadowAnalysis] = useState<ShadowAnalysisPipelineResult | null>(null);

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    BrowserOfflineAIManager.setSelectedModelId(modelId);

    const profileId = PROFILE_BY_MODEL[modelId] || 'local-offline-s0-v1';
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

  // تحلیل عصبی صرفاً در سایه اجرا می‌شود و در نبود مدل آماده، نتیجه fail-closed دارد.
  useEffect(() => {
    let active = true;
    const candidate = replayState.activeCandidate;
    if (!candidate) {
      queueMicrotask(() => { if (active) setShadowAnalysis(null); });
      return () => { active = false; };
    }
    const profile = OFFLINE_AI_PROFILES.find(item => item.id === aiProfileId);
    if (profile?.type !== 'WEBLLM_WEBGPU') {
      const deterministicResult = AnalystCriticPipeline.runShadowPipeline(candidate, aiProfileId);
      queueMicrotask(() => { if (active) setShadowAnalysis(deterministicResult); });
      return () => { active = false; };
    }
    queueMicrotask(() => { if (active) setShadowAnalysis(null); });
    void AnalystCriticPipeline.runShadowPipelineAsync(candidate, aiProfileId).then(result => {
      if (active) setShadowAnalysis(result);
    });
    return () => { active = false; };
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

  // مخروط صدک‌های استوکاستیک مونت‌کارلو به سمت آینده روی چارت
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
        if (saved.symbol === 'XAUUSD' || saved.symbol === 'EURUSD' || saved.symbol === 'GBPUSD' || saved.symbol === 'USDJPY') {
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
    partialConfig: PartialTPConfig,
    meta?: { mood?: string; propFirmId?: string }
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
        tp,
        meta
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
    if (imported.symbol === 'XAUUSD' || imported.symbol === 'EURUSD' || imported.symbol === 'GBPUSD' || imported.symbol === 'USDJPY') {
      setSymbol(imported.symbol);
      replayEngine.setSymbol(imported.symbol);
    }
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

    let activeSession = 'default-windows-session';
    let activeEpoch = 1;
    let activeDevice: 'windows' | 'pixel' = 'windows';

    try {
      const execRes = await fetch('/api/executor').then(r => r.json()).catch(() => null);
      if (execRes?.state) {
        activeSession = execRes.state.activeSessionId;
        activeEpoch = execRes.state.epoch;
        activeDevice = execRes.state.activeDeviceLabel;
      }
    } catch {}

    try {
      const res = await fetch('/api/orders/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentId,
          idempotencyKey,
          symbol,
          direction: replayState.activeCandidate.direction,
          volumeLots: riskPreview.adjustedVolumeLots,
          limitPrice: replayState.activeCandidate.entryPrice,
          stopLossPrice: replayState.activeCandidate.stopLossPrice,
          takeProfitPrice: replayState.activeCandidate.takeProfitPrice,
          userConfirmationTimestamp: Date.now(),
          environment: currentEnvironment,
          executorSessionId: activeSession,
          executorEpoch: activeEpoch,
          deviceLabel: activeDevice,
          simulateTimeout: options?.simulateTimeout,
          simulateRejection: options?.simulateRejection,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setExecutionMessage(
          `سفارش با موفقیت در صندوق تراکنش ثبت شد. شناسه مشتری: ${data.clientOrderId}. در صف ارسال امن به cTrader Demo.`
        );
        setIsModalOpen(false);
      } else {
        setExecutionMessage(`خطا در ارسال سفارش: ${data.error || 'خطای ناشناخته'}`);
      }
      await fetchOutbox();
    } catch (err) {
      setExecutionMessage(`خطای شبکه هنگام ارسال سفارش: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // بازتطبیق اضطراری دستی یک سفارش
  const handleReconcileOrder = async (clientOrderId: string) => {
    try {
      const res = await fetch('/api/orders/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientOrderId }),
      });
      const data = await res.json();
      if (res.ok) {
        setExecutionMessage(`وضعیت بازتطبیق برای ${clientOrderId}: ${data.status}`);
      } else {
        setExecutionMessage(`خطا در بازتطبیق: ${data.error}`);
      }
      await fetchOutbox();
    } catch (err) {
      setExecutionMessage(`خطا در بازتطبیق: ${(err as Error).message}`);
    }
  };

  const brokerState = broker.getState();
  const dailyDrawdownPercent =
    brokerState.accountBalance > 0 && brokerState.accountEquity < brokerState.accountBalance
      ? Number((((brokerState.accountBalance - brokerState.accountEquity) / brokerState.accountBalance) * 100).toFixed(2))
      : 0;

  const closedPositions = brokerState.positions.filter(p => !p.isOpen);
  let consecutiveLossCount = 0;
  for (let i = closedPositions.length - 1; i >= 0; i--) {
    if (closedPositions[i].realizedPnl < 0) {
      consecutiveLossCount++;
    } else {
      break;
    }
  }

  const pendingOutboxCount = outboxRecords.filter(
    r => r.state === 'SUBMITTING' || r.state === 'UNKNOWN_RECONCILE_REQUIRED'
  ).length;

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col font-sans selection:bg-cyan-600 selection:text-white transition-colors">
      {/* سربرگ استاندارد هماهنگ با قالب و نشان وضعیت ۴ گانه */}
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

      {/* بخش اصلی بدنه همراه با سایدبار راست دسکتاپ و ناوبری موبایل */}
      <div className="flex-1 flex w-full relative min-h-[calc(100vh-48px)]" dir="rtl">
        {/* نوار ناوبری ۵ محیط کاری (سایدبار دسکتاپ و نوار پایینی موبایل) */}
        <AppNavigation
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={setActiveWorkspace}
          hasActiveCandidate={!!replayState.activeCandidate}
          outboxPendingCount={pendingOutboxCount}
          unreadAlertsCount={unreadAlertsCount}
          viewMode={viewMode}
        />

        {/* محتوای محیط کاری فعال */}
        <div
          className={`flex-1 w-full max-w-full overflow-x-hidden p-2 sm:p-4 pb-28 md:pb-6 space-y-3 transition-all duration-300 ${
            viewMode === 'mobile'
              ? 'max-w-md mx-auto'
              : 'max-w-[1800px] mx-auto'
          }`}
        >
          {/* پیام‌های سیستمی و اعلانات امنیتی */}
          {executionMessage && (
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-xs flex items-center justify-between gap-2 text-cyan-500 shadow-sm" dir="rtl">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{executionMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setExecutionMessage(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg"
                aria-label="بستن پیام"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* محیط کاری ۱: میز معامله و دیده‌بان */}
          {activeWorkspace === 'trade' && (
            <TradeWorkspace
              symbol={symbol}
              onSymbolChange={handleSymbolChange}
              replayState={replayState}
              onStepForward={handleStepForward}
              onResetReplay={handleResetReplay}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              speedMs={speedMs}
              onChangeSpeed={setSpeedMs}
              sessionSeconds={sessionSeconds}
              isSessionActive={isSessionActive}
              onToggleSession={() => setIsSessionActive(!isSessionActive)}
              accountEquity={brokerState.accountEquity}
              openPositionsCount={brokerState.positions.filter(p => p.isOpen).length}
              riskPreview={riskPreview}
              shadowAnalysis={shadowAnalysis}
              multiAgentResult={multiAgentResult}
              isBlocked={isBlocked}
              onExecuteInstantOrder={handleExecuteInstantOrder}
              onPanicKillSwitch={handlePanicKillSwitch}
              onOpenOrderModal={() => setIsModalOpen(true)}
              onOpenAIModal={() => setIsAIModalOpen(true)}
              onOpenMultiAgentModal={() => setIsMultiAgentModalOpen(true)}
              onOpenExportModal={() => setIsExportModalOpen(true)}
              activeModelNameFa={activeProfile.nameFa}
              activeTradingStyleBadgeFa={activeTradingStyleBadgeFa}
              onChangeStyleFilter={handleStyleFilterChange}
              syncedCrosshairPrice={syncedCrosshairPrice}
              setSyncedCrosshairPrice={setSyncedCrosshairPrice}
              macroLevels={macroLevels}
              forwardMonteCarloCone={forwardMonteCarloCone}
              onOpenMonteCarlo={() => setIsMonteCarloModalOpen(true)}
              onOpenBacktest={() => setIsBacktestModalOpen(true)}
              onOpenAlerts={() => setIsAlertModalOpen(true)}
              unreadAlertsCount={unreadAlertsCount}
              viewMode={viewMode}
              dailyDrawdownPercent={dailyDrawdownPercent}
              consecutiveLossCount={consecutiveLossCount}
            />
          )}

          {/* محیط کاری ۲: هاب هوش مصنوعی و استراتژی‌ها */}
          {activeWorkspace === 'ai' && (
            <AIHubWorkspace
              symbol={symbol}
              candles={replayState.visibleCandles}
              macroLevels={macroLevels}
              syncedCrosshairPrice={syncedCrosshairPrice}
              setSyncedCrosshairPrice={setSyncedCrosshairPrice}
              multiAgentConfig={multiAgentConfig}
              onOpenMultiAgentModal={() => setIsMultiAgentModalOpen(true)}
              onOpenAIModal={() => setIsAIModalOpen(true)}
              selectedModelName={activeProfile.nameFa}
            />
          )}

          {/* محیط کاری ۳: کارگاه تحلیلی، پژوهش، ریسک و ژورنال */}
          {activeWorkspace === 'analytics' && (
            <AnalyticsWorkspace
              candles={replayState.visibleCandles}
              symbol={symbol}
              onOpenMonteCarlo={() => setIsMonteCarloModalOpen(true)}
              onOpenBacktest={() => setIsBacktestModalOpen(true)}
              positions={brokerState.positions}
            />
          )}

          {/* محیط کاری ۴: مرکز کنترل، امنیت و سلامت سیستم */}
          {activeWorkspace === 'system' && (
            <SystemWorkspace
              outboxRecords={outboxRecords}
              isBlocked={isBlocked}
              blockingReason={blockingReason}
              onReconcileOrder={handleReconcileOrder}
              onRefreshOutbox={fetchOutbox}
              onOpenExportModal={() => setIsExportModalOpen(true)}
            />
          )}
        </div>
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
