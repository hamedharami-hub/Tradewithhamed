// components/trading/live-shadow-workbench.tsx
// میز کار تعاملی مدیریت سفارش‌ها و بازتطبیق W3 (Live Shadow & Execution Workbench)
// طراحی خلوت و مینیمال بر اساس اصول متریال ۳ گوگل، سازگار با مطالعه طولانی بدون خستگی چشم

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Activity,
  RotateCw,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Play,
  Layers,
  Sparkles,
  Info,
  Laptop,
  Smartphone,
  AlertTriangle,
  Radio,
  Lock,
  Flame,
} from 'lucide-react';
import { LiveShadowExecutionEngine } from '@/lib/core/live-shadow-engine';
import { LiveShadowOrder, ReconciliationIncident } from '@/lib/contracts/w3-ems';
import { OrderIntentPayload } from '@/lib/core/ports';
import { runW3AcceptanceSuite, W3AcceptanceTestResult } from '@/lib/core/__tests__/w3-acceptance.test';

export const LiveShadowWorkbench: React.FC = () => {
  // موتور اجرای پایدار در سمت کاربر
  const engine = useMemo(() => new LiveShadowExecutionEngine(), []);

  // وضعیت‌های تعاملی
  const [orders, setOrders] = useState<LiveShadowOrder[]>(() => engine.getOrders());
  const [incidents, setIncidents] = useState<ReconciliationIncident[]>(() =>
    engine.getReconciliationEngine().getAllIncidents()
  );
  const [activeSubTab, setActiveSubTab] = useState<'dispatcher' | 'drift' | 'reconciliation' | 'tests' | 'w4_online'>('dispatcher');
  const [w3TestResults, setW3TestResults] = useState<W3AcceptanceTestResult[]>([]);
  const [w4TestResults, setW4TestResults] = useState<any[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // وضعیت‌های زنده، چنددستگاهی و سوئیچ اضطراری بسته W4
  const [liveQuotes, setLiveQuotes] = useState<Record<string, any>>({});
  const [feedStatus, setFeedStatus] = useState<any>(null);
  const [executorState, setExecutorState] = useState<{
    activeDeviceLabel: 'windows' | 'pixel';
    epoch: number;
    activeSessionId: string;
    status: string;
  } | null>(null);
  const [isKillNewEntries, setIsKillNewEntries] = useState(false);
  const [isOperatorAuthenticated, setIsOperatorAuthenticated] = useState(false);
  const [operatorAccessKey, setOperatorAccessKey] = useState('');
  const [isUnlockingOperator, setIsUnlockingOperator] = useState(false);

  // واکشی دوره‌ای وضعیت زنده قیمت‌ها، تک‌مجری و کلید اضطراری
  useEffect(() => {
    let mounted = true;
    const fetchW4State = async () => {
      try {
        const [qRes, eRes, kRes] = await Promise.all([
          fetch('/api/market/quotes').then(r => r.json()).catch(() => null),
          fetch('/api/executor').then(r => r.json()).catch(() => null),
          fetch('/api/orders/emergency-stop').then(r => r.json()).catch(() => null),
        ]);
        if (!mounted) return;
        if (qRes?.quotes) {
          setLiveQuotes(qRes.quotes);
          setFeedStatus(qRes.feedStatus);
        }
        setIsOperatorAuthenticated(eRes?.isAuthenticated === true);
        setExecutorState(eRes?.isAuthenticated === true && eRes?.state ? eRes.state : null);
        if (kRes) {
          setIsKillNewEntries(!!kRes.isKillNewEntriesActive);
        }
      } catch {}
    };

    fetchW4State();
    const interval = setInterval(fetchW4State, 2500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleUnlockOperator = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!operatorAccessKey) return;
    setIsUnlockingOperator(true);
    setActionNotice(null);
    try {
      const response = await fetch('/api/operator/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey: operatorAccessKey }),
      });
      const data = await response.json();
      if (!response.ok || !data.authenticated) {
        setActionNotice(
          data.error === 'OPERATOR_ACCESS_NOT_CONFIGURED'
            ? 'کنترل اپراتور در سرور پیکربندی نشده است. OPERATOR_ACCESS_KEY و OPERATOR_SESSION_SECRET را تنظیم کنید.'
            : 'بازگشایی کنترل اپراتور انجام نشد. کلید را بررسی کنید.'
        );
        return;
      }

      const executorResponse = await fetch('/api/executor');
      const executorData = await executorResponse.json();
      setIsOperatorAuthenticated(executorData.isAuthenticated === true);
      setExecutorState(executorData.isAuthenticated === true ? executorData.state : null);
      setOperatorAccessKey('');
      setActionNotice('کنترل اپراتور برای این مرورگر باز شد.');
    } catch {
      setActionNotice('ارتباط با سرور برای بازگشایی کنترل اپراتور برقرار نشد.');
    } finally {
      setIsUnlockingOperator(false);
    }
  };

  const handleLockOperator = async () => {
    await fetch('/api/operator/session', { method: 'DELETE' }).catch(() => null);
    setIsOperatorAuthenticated(false);
    setExecutorState(null);
    setActionNotice('کنترل اپراتور در این مرورگر قفل شد.');
  };

  // واگذاری مجری‌گری بین ویندوز و گوشی پیکسل (W4 Gate B) پس از احراز نشست اپراتور
  const handleSwitchExecutor = async (targetDevice: 'windows' | 'pixel') => {
    if (!isOperatorAuthenticated || !executorState) {
      setActionNotice('ابتدا کنترل اپراتور را باز کنید.');
      return;
    }
    try {
      const res = await fetch('/api/executor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'switch',
          targetDevice,
          targetSessionId: `${targetDevice}-session-${Date.now()}`,
          userConfirmation: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.state) {
        setExecutorState(data.state);
        setActionNotice(`مجری‌گری با موفقیت به ${targetDevice === 'windows' ? 'ویندوز' : 'گوشی پیکسل'} منتقل شد (ایپاک: ${data.state.epoch}).`);
      } else {
        setActionNotice(`خطای تغییر مجری: ${data.error || 'عملیات رد شد'}`);
      }
    } catch (e) {
      setActionNotice(`خطا در تغییر مجری: ${(e as Error).message}`);
    }
  };

  // فعال/غیرفعال‌سازی سوئیچ اضطراری توقف معاملات جدید (W4 Gate C) با احراز تک‌مجری
  const handleToggleKillSwitch = async () => {
    if (!isOperatorAuthenticated || !executorState) {
      setActionNotice('ابتدا کنترل اپراتور را باز کنید.');
      return;
    }
    try {
      const newActive = !isKillNewEntries;
      const res = await fetch('/api/orders/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: newActive,
          sessionId: executorState.activeSessionId,
          epoch: executorState.epoch,
          deviceLabel: executorState.activeDeviceLabel,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsKillNewEntries(data.isKillNewEntriesActive);
        setActionNotice(data.message);
      } else {
        setActionNotice(`خطا در تنظیم سوئیچ اضطراری: ${data.error || 'دسترسی غیرمجاز (۴۰۳)'}`);
      }
    } catch (e) {
      setActionNotice(`خطا در تنظیم سوئیچ اضطراری: ${(e as Error).message}`);
    }
  };

  // اجرای آزمون‌های آنلاین W4
  const handleRunW4OnlineSuite = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch('/api/verify-tests');
      const data = await res.json();
      const filtered = (data.results || []).filter((r: any) => r.name.includes('[W4 Online'));
      setW4TestResults(filtered);
    } catch {}
    setIsRunningTests(false);
  };

  // فرم ارسال سفارش لیمیت آزمایشی
  const [symbol, setSymbol] = useState<'XAUUSD' | 'EURUSD'>('XAUUSD');
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [volumeLots, setVolumeLots] = useState(0.1);
  const [entryPrice, setEntryPrice] = useState(2650.0);
  const [stopLossPrice, setStopLossPrice] = useState(2640.0);
  const [takeProfitPrice, setTakeProfitPrice] = useState(2670.0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // همگام‌سازی وضعیت
  const refreshState = React.useCallback(() => {
    setOrders(engine.getOrders());
    setIncidents(engine.getReconciliationEngine().getAllIncidents());
  }, [engine]);

  // ارسال سفارش نمونه
  const handleSubmitTestOrder = async () => {
    setIsSubmitting(true);
    setActionNotice(null);

    const currentTime = Date.now();
    const intentId = `W3-USER-${currentTime.toString().slice(-6)}`;
    const intent: OrderIntentPayload = {
      intentId,
      environment: 'PAPER_LIVE',
      accountNamespace: 'SHADOW_LIVE',
      candidateId: `CND-${intentId}`,
      symbol,
      orderType: 'LIMIT',
      direction,
      volumeLots,
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      reasonCode: 'W3_MANUAL_DISPATCH',
      createdTimestamp: currentTime,
      idempotencyKey: `KEY-${intentId}`,
    };

    const res = await engine.submitOrder(intent, currentTime);
    setIsSubmitting(false);
    refreshState();

    if (res.success) {
      setActionNotice(`سفارش لیمیت با موفقیت ارسال شد و در وضعیت ${res.order?.state} قرار گرفت.`);
    } else {
      setActionNotice(`خطا در ارسال سفارش: ${res.error}`);
    }
  };

  // شبیه‌سازی تایم‌اوت شبکه برای آزمودن قفل Fail-Closed
  const handleSimulateNetworkTimeout = () => {
    const currentTime = Date.now();
    const intentId = `TIMEOUT-${currentTime.toString().slice(-4)}`;
    const dummyOrder: LiveShadowOrder = {
      id: `ORD-${intentId}`,
      intentId,
      correlationId: `CORR-${currentTime}`,
      idempotencyKey: `KEY-${intentId}`,
      environment: 'PAPER_LIVE',
      symbol: 'XAUUSD',
      direction: 'BUY',
      orderType: 'LIMIT',
      volumeLots: 0.1,
      requestedPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      maxSlippagePips: 2.0,
      state: 'UNKNOWN_RECONCILE_REQUIRED',
      createdAt: currentTime,
      submittedAt: currentTime - 5000,
      reasonCode: 'SIMULATED_TIMEOUT',
    };

    engine.getReconciliationEngine().registerIncident(
      dummyOrder,
      'TIMEOUT',
      'شبیه‌سازی تایم‌اوت شبکه جهت آزمودن قفل ایمنی Fail-Closed',
      currentTime
    );
    refreshState();
    setActionNotice('سانحه تایم‌اوت ثبت شد. سیستم در وضعیت Fail-Closed قفل گردید.');
  };

  // رفع دستی سانحه بازتطبیق
  const handleManualResolve = React.useCallback((incidentId: string) => {
    engine.manualReconcileIncident(
      incidentId,
      'CANCELLED',
      'تایید دستی توسط کاربر حامد'
    );
    refreshState();
    setActionNotice('سانحه بازتطبیق رفع شد و قفل ایمنی برداشته شد.');
  }, [engine, refreshState]);

  // اجرای آزمون‌های پذیرش گیت W3
  const handleRunW3Suite = async () => {
    setIsRunningTests(true);
    const results = await runW3AcceptanceSuite();
    setW3TestResults(results);
    setIsRunningTests(false);
  };

  const driftStats = engine.getDriftMonitor().getAggregateStats();
  const failClosedCheck = engine.getReconciliationEngine().canSubmitNewOrder();
  const pendingIncidentsCount = engine.getReconciliationEngine().getPendingIncidents().length;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-100 font-sans" dir="rtl">
      {/* هدر متریال ۳ خلوت و آرامش‌بخش */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                سامانه مدیریت سفارش‌ها و بازتطبیق شبکه (Gate W3 Execution & EMS)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Live Shadow & Paper
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              موتور رویدادمحور چرخه حیات سفارش‌ها (OMS)، رهگیری لغزش و تأخیر شبکه (Drift Monitor)، کلید ضد تکرار، و پروتکل ایمنی بازتطبیق Fail-Closed بدون خستگی چشم.
            </p>
          </div>

          {/* نشانگر قفل ایمنی */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border ${
                failClosedCheck.allowed
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-950/50 text-rose-300 border-rose-500/40'
              }`}
            >
              {failClosedCheck.allowed ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>قفل ایمنی Fail-Closed: مجاز (سبز)</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400 animate-bounce" />
                  <span>قفل ایمنی Fail-Closed: مسدود (بازتطبیق لازم)</span>
                </>
              )}
            </div>

            <button
              onClick={refreshState}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700/60"
              title="تازه‌سازی وضعیت"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* اعلان عملیات */}
        {actionNotice && (
          <div className="mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 text-xs text-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{actionNotice}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded"
            >
              بستن
            </button>
          </div>
        )}
      </div>

      {/* نوار مظنه‌های زنده، کنترل تک‌مجری و سوئیچ اضطراری W4 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* مظنه طلا */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">XAUUSD</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono border ${
                  (liveQuotes['XAUUSD']?.quality || 'SIMULATED') === 'LIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {liveQuotes['XAUUSD']?.quality || 'SIMULATED'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                اسپرد: {liveQuotes['XAUUSD']?.spreadPips ?? 2.5} پیپ
              </span>
            </div>
          </div>
          <div className="text-left font-mono" dir="ltr">
            <div className="text-xs text-slate-300 font-semibold">
              ${liveQuotes['XAUUSD']?.bid?.toFixed(2) ?? '2652.45'} / ${liveQuotes['XAUUSD']?.ask?.toFixed(2) ?? '2652.70'}
            </div>
            <div className="text-[10px] text-slate-500">Bid / Ask</div>
          </div>
        </div>

        {/* مظنه یورو */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">EURUSD</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono border ${
                  (liveQuotes['EURUSD']?.quality || 'SIMULATED') === 'LIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {liveQuotes['EURUSD']?.quality || 'SIMULATED'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                اسپرد: {liveQuotes['EURUSD']?.spreadPips ?? 1.4} پیپ
              </span>
            </div>
          </div>
          <div className="text-left font-mono" dir="ltr">
            <div className="text-xs text-slate-300 font-semibold">
              {liveQuotes['EURUSD']?.bid?.toFixed(5) ?? '1.08465'} / {liveQuotes['EURUSD']?.ask?.toFixed(5) ?? '1.08479'}
            </div>
            <div className="text-[10px] text-slate-500">Bid / Ask</div>
          </div>
        </div>

        {/* کنترل تک‌مجری بین‌دستگاهی (W4 Gate B) و سوئیچ اضطراری (Gate C) */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-2">
          {!isOperatorAuthenticated ? (
            <form onSubmit={handleUnlockOperator} className="space-y-2" aria-label="بازگشایی کنترل اپراتور">
              <div className="flex items-center gap-2 text-amber-400">
                <Lock className="w-4 h-4" />
                <span className="text-xs font-bold">کنترل اپراتور قفل است</span>
              </div>
              <label className="sr-only" htmlFor="operator-access-key">کلید دسترسی اپراتور</label>
              <input
                id="operator-access-key"
                type="password"
                autoComplete="current-password"
                value={operatorAccessKey}
                onChange={(event) => setOperatorAccessKey(event.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                placeholder="کلید دسترسی اپراتور"
              />
              <button
                type="submit"
                disabled={isUnlockingOperator || !operatorAccessKey}
                className="w-full min-h-[44px] rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-50 text-cyan-300 border border-cyan-500/30 text-xs font-bold"
              >
                {isUnlockingOperator ? 'در حال بازگشایی…' : 'بازگشایی کنترل اپراتور'}
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">مجری:</span>
                  <span className="font-bold text-cyan-400 text-xs flex items-center gap-1">
                    {executorState?.activeDeviceLabel === 'pixel' ? (
                      <><Smartphone className="w-3.5 h-3.5 text-amber-400" /><span>پیکسل</span></>
                    ) : (
                      <><Laptop className="w-3.5 h-3.5 text-cyan-400" /><span>ویندوز</span></>
                    )}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                    Epoch: {executorState?.epoch ?? '—'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleLockOperator}
                  className="min-h-[36px] px-2 rounded-lg text-[10px] text-slate-400 hover:text-white border border-slate-700"
                >
                  قفل
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSwitchExecutor(executorState?.activeDeviceLabel === 'windows' ? 'pixel' : 'windows')}
                className="text-[11px] px-3 py-2 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-colors flex items-center justify-center font-medium"
                title="واگذاری نوبت مجری‌گری با افزایش اتمیک Epoch"
              >
                واگذاری به {executorState?.activeDeviceLabel === 'windows' ? 'پیکسل' : 'ویندوز'}
              </button>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">سوئیچ اضطراری:</span>
                <button
                  type="button"
                  onClick={handleToggleKillSwitch}
                  className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                    isKillNewEntries
                      ? 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{isKillNewEntries ? 'ورود جدید مسدود (فعال)' : 'عادی (غیرفعال)'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* سربرگ‌های ثانویه تمیز */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('dispatcher')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'dispatcher'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>ارسال و مدیریت سفارش (OMS Dispatcher)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('drift')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'drift'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>کیفیت اجرا و مانیتور انحراف (EQS & Drift)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'reconciliation'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>میز بازتطبیق و سوانح ({pendingIncidentsCount})</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('tests');
            if (w3TestResults.length === 0) handleRunW3Suite();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'tests'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>آزمون‌های گیت پذیرش W3 ({w3TestResults.length}/7)</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('w4_online');
            if (w4TestResults.length === 0) handleRunW4OnlineSuite();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'w4_online'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>آزمون‌های آنلاین W4 (Paper Live / Demo / Handoff)</span>
        </button>
      </div>

      {/* محتوای تب ۱: ارسال سفارش و شبیه‌سازی چرخه حیات */}
      {activeSubTab === 'dispatcher' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* فرم ارسال سفارش با ظاهر ارگونومیک */}
          <div className="lg:col-span-1 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>ثبت سفارش لیمیت آزمایشی (Limit Only)</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">نماد معاملاتی</label>
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value as 'XAUUSD' | 'EURUSD')}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  >
                    <option value="XAUUSD">XAUUSD (طلا)</option>
                    <option value="EURUSD">EURUSD (یورو)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">جهت معامله</label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setDirection('BUY')}
                      className={`py-1 rounded-lg font-semibold transition-all ${
                        direction === 'BUY'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      خرید
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('SELL')}
                      className={`py-1 rounded-lg font-semibold transition-all ${
                        direction === 'SELL'
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      فروش
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">حجم معامله (لات)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5"
                  value={volumeLots}
                  onChange={(e) => setVolumeLots(parseFloat(e.target.value) || 0.1)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono text-left focus:outline-none focus:border-cyan-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">قیمت لیمیت درخواستی</label>
                <input
                  type="number"
                  step="0.1"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 2650.0)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono text-left focus:outline-none focus:border-cyan-500"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">حد ضرر (SL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={stopLossPrice}
                    onChange={(e) => setStopLossPrice(parseFloat(e.target.value) || 2640.0)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-rose-300 font-mono text-left focus:outline-none focus:border-rose-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">حد سود (TP)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={takeProfitPrice}
                    onChange={(e) => setTakeProfitPrice(parseFloat(e.target.value) || 2670.0)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-emerald-300 font-mono text-left focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  disabled={isSubmitting || !failClosedCheck.allowed}
                  onClick={handleSubmitTestOrder}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  <span>ارسال سفارش به موتور اجرای سایه</span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateNetworkTimeout}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>شبیه‌سازی قطعی شبکه (آزمون قفل Fail-Closed)</span>
                </button>
              </div>
            </div>
          </div>

          {/* جدول زنده چرخه سفارش‌ها */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>تاریخچه و وضعیت سفارش‌های در گردش ({orders.length})</span>
              </h2>
              <span className="text-xs text-slate-400">محیط: PAPER_LIVE</span>
            </div>

            {orders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                هیچ سفارشی ثبت نشده است. با استفاده از فرم کناری، اولین سفارش را ارسال کنید.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-medium">
                      <th className="py-2.5 px-2">شناسه سفارش</th>
                      <th className="py-2.5 px-2">نماد/جهت</th>
                      <th className="py-2.5 px-2">قیمت درخواستی</th>
                      <th className="py-2.5 px-2">حدود SL / TP</th>
                      <th className="py-2.5 px-2">وضعیت چرخه حیات</th>
                      <th className="py-2.5 px-2">لغزش و امتیاز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono" dir="ltr">
                    {orders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-2 text-slate-300">
                          {ord.intentId}
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`inline-flex items-center gap-1 font-semibold ${
                            ord.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {ord.direction === 'BUY' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            {ord.symbol} ({ord.volumeLots}L)
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-200">
                          {ord.requestedPrice.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-slate-400">
                          <span className="text-rose-400">{ord.stopLossPrice.toFixed(1)}</span> / <span className="text-emerald-400">{ord.takeProfitPrice.toFixed(1)}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            ord.state === 'FILLED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : ord.state === 'UNKNOWN_RECONCILE_REQUIRED'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {ord.state}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-300">
                          {ord.qualityMetric ? (
                            <span>
                              {ord.qualityMetric.slippagePips}p ({ord.qualityMetric.executionQualityScore}%)
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* محتوای تب ۲: مانیتور انحراف و کیفیت اجرا */}
      {activeSubTab === 'drift' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">میانگین امتیاز کیفیت (EQS)</span>
              <span className="text-2xl font-bold font-mono text-cyan-400">
                {driftStats.averageQualityScore}/100
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">میانگین تأخیر ارسال (Latency)</span>
              <span className="text-2xl font-bold font-mono text-slate-200">
                {driftStats.avgLatencyMs} ms
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">میانگین لغزش قیمت (Slippage)</span>
              <span className="text-2xl font-bold font-mono text-slate-200">
                {driftStats.avgSlippagePips} پیپ
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
              <span className="text-xs text-slate-400 block mb-1">موارد نقض لغزش (Violations)</span>
              <span className="text-2xl font-bold font-mono text-rose-400">
                {driftStats.driftViolations} مورد
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-white">قوانین محاسبه امتیاز کیفیت اجرا (Execution Quality Scoring):</h3>
            <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside">
              <li>نقطه مبنا: ۱۰۰ امتیاز کامل به ازای اجرای بدون لغزش در زمان کمتر از ۵۰۰ میلی‌ثانیه.</li>
              <li>جریمه لغزش نامطلوب: کسر حداکثر ۴۰ امتیاز به نسبت تجاوز لغزش از ۲ پیپ مجاز.</li>
              <li>جریمه تأخیر شبکه: کسر حداکثر ۳۰ امتیاز به ازای فراتر رفتن زمان ارسال تا پذیرش از سقف ۵۰۰ms.</li>
              <li>جریمه اسپرد نامتعارف: کسر ۱۵ امتیاز در صورتی که اسپرد در زمان اجرا از ۳ پیپ فراتر رود.</li>
            </ul>
          </div>
        </div>
      )}

      {/* محتوای تب ۳: مرکز بازتطبیق و سوانح شبکه */}
      {activeSubTab === 'reconciliation' && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-cyan-400" />
                <span>سوانح نیازمند بازتطبیق اجباری (Reconciliation Incidents)</span>
              </h2>
              <p className="text-xs text-slate-400">
                بر اساس تضمین ایمنی Fail-Closed، تا رفع ابهام کامل سوانح زیر، هیچ سفارش جدیدی در سیستم پردازش نخواهد شد.
              </p>
            </div>
            <button
              onClick={async () => {
                const res = await engine.reconcile();
                refreshState();
                setActionNotice(`بازتطبیق خودکار انجام شد: ${res.reconciledCount} سفارش تطبیق داده شد.`);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 border border-cyan-500/30 transition-colors flex items-center gap-2"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>استعلام و بازتطبیق خودکار با اسنپ‌شات بروکر</span>
            </button>
          </div>

          {incidents.length === 0 ? (
            <div className="p-8 text-center text-emerald-400/80 text-xs border border-dashed border-emerald-500/20 rounded-xl bg-emerald-950/10">
              هیچ سانحه بازتطبیق بازی وجود ندارد. وضعیت ارتباط با بروکر کاملاً شفاف و سفید است.
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc) => (
                <div
                  key={inc.incidentId}
                  className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                    inc.status === 'PENDING'
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                      : 'bg-slate-800/40 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono" dir="ltr">
                      <span className="font-semibold text-white">{inc.incidentId}</span>
                      <span className="text-slate-400">| سفارش: {inc.intentId}</span>
                      <span className="text-slate-400">| دلیل: {inc.reason}</span>
                    </div>
                    <p className="text-slate-300">{inc.notes}</p>
                  </div>

                  {inc.status === 'PENDING' && (
                    <button
                      onClick={() => handleManualResolve(inc.incidentId)}
                      className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-medium text-xs transition-colors whitespace-nowrap"
                    >
                      تایید دستی و رفع قفل ایمنی
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* محتوای تب ۴: آزمون‌های گیت پذیرش W3 */}
      {activeSubTab === 'tests' && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>مجموعه آزمون‌های پذیرش گیت ۳ (Gate W3 Acceptance Tests)</span>
              </h2>
              <p className="text-xs text-slate-400">
                ارزیابی خودکار و قطعی تمامی ۷ اصل مهندسی چرخه حیات سفارشات، آیدمپوتنسی، ایمنی Fail-Closed و مانیتور انحراف.
              </p>
            </div>
            <button
              onClick={handleRunW3Suite}
              disabled={isRunningTests}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white text-xs font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunningTests ? 'در حال اجرای آزمون‌ها...' : 'اجرای مجدد آزمون‌های W3'}</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {w3TestResults.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors flex items-start justify-between gap-4"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-cyan-400">{t.id}</span>
                    <span className="font-semibold text-white">{t.nameFa}</span>
                    <span className="text-[11px] font-mono text-slate-400" dir="ltr">({t.nameEn})</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{t.details}</p>
                </div>
                <div className="flex-shrink-0">
                  {t.passed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>قبول (PASS)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>مردود (FAIL)</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* محتوای تب ۵: مجموعه آزمون‌های آنلاین دروازه‌های W4 */}
      {activeSubTab === 'w4_online' && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span>مجموعه آزمون‌های جامع دروازه‌های آنلاین W4 (Gate A, Gate B, Gate C)</span>
              </h2>
              <p className="text-xs text-slate-400">
                پوشش آزمون‌های داده زنده، Paper Live با صفر خروج به بروکر، تک‌مجری بین‌دستگاهی با Handoff و Epoch، تایید دستی دمو، شکست امن لایو و سوئیچ اضطراری.
              </p>
            </div>
            <button
              onClick={handleRunW4OnlineSuite}
              disabled={isRunningTests}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white text-xs font-medium transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunningTests ? 'در حال اجرای آزمون‌ها...' : 'اجرای آزمون‌های آنلاین W4'}</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {w4TestResults.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                جهت اجرای خودکار آزمون‌های آنلاین، روی دکمه «اجرای آزمون‌های آنلاین W4» کلیک کنید.
              </div>
            ) : (
              w4TestResults.map((t, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors flex items-start justify-between gap-4"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{t.name}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{t.details}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {t.passed ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>قبول (PASS)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>مردود (FAIL)</span>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
