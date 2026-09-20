'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { EnvironmentNavBar } from '@/components/navigation/environment-nav-bar';
import { DataProvenance, evaluateDataFreshness } from '@/lib/contracts/provenance';
import { SymbolId } from '@/lib/contracts/market';
import { OutboxExecutionCard } from '@/components/trading/outbox-execution-card';
import { TransactionalOutboxRecord, OrderSubmissionRequest } from '@/lib/contracts/execution';
import {
  Globe,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Lock,
  Unlock,
  PowerOff,
  Activity,
  CheckCircle2,
  Clock,
  Info,
  Sliders,
  Play,
  TrendingUp,
  TrendingDown,
  X,
  Layers,
  Cpu,
  PauseCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

export default function DemoPage() {
  const [viewMode, setViewMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');
  const [symbol, setSymbol] = useState<SymbolId>('XAUUSD');
  const [quote, setQuote] = useState<{ bid: number; ask: number; timestamp: number } | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [gatewayStatus, setGatewayStatus] = useState<string>('DISCONNECTED');
  const [isConfigured, setIsConfigured] = useState<boolean>(true);
  const [isBrokerConnected, setIsBrokerConnected] = useState<boolean>(false);
  const [isOperatorAuthenticated, setIsOperatorAuthenticated] = useState<boolean>(false);
  const [accessKey, setAccessKey] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [outboxRecords, setOutboxRecords] = useState<TransactionalOutboxRecord[]>([]);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockingReason, setBlockingReason] = useState<string | undefined>();
  const [isKillNewEntriesActive, setIsKillNewEntriesActive] = useState<boolean>(false);
  const [executorState, setExecutorState] = useState<{
    activeSessionId?: string;
    epoch?: number;
    activeDeviceLabel?: 'windows' | 'pixel';
    leaseExpiresAt?: number;
    status?: string;
  } | null>(null);

  // فرم ثبت سفارش تستی
  const [orderVolumeLots, setOrderVolumeLots] = useState<number>(0.01);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // شبیه‌سازی خطا در حالت پیشرفته (برای آزمایش Fail-Closed)
  const [isSimulateTimeout, setIsSimulateTimeout] = useState<boolean>(false);
  const [isSimulateRejection, setIsSimulateRejection] = useState<boolean>(false);

  // آستانه تازگی تحمیل‌شده سرور (۵ ثانیه)
  const stalenessThresholdMs = 5000;

  // مرجع نماد فعال جهت جلوگیری از نشستن پاسخ‌های دیررس نماد قبلی
  const symbolRef = useRef<SymbolId>(symbol);
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  // تغییر نماد با ابطال آنی کوت قبلی و خروج فوری از قابلیت سفارش‌گذاری
  const handleSymbolChange = (newSymbol: SymbolId) => {
    if (newSymbol === symbol) return;
    setQuote(null);
    setLastFetchTime(0);
    symbolRef.current = newSymbol;
    setSymbol(newSymbol);
  };

  // تایمر فعال یک‌ثانیه‌ای برای ارزیابی پویا و بلادرنگ تازگی داده با گذشت زمان
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // واکشی وضعیت دروازه و مظنه‌های زنده منحصراً از Gateway با mode=demo
  const fetchMarketData = useCallback(async () => {
    const requestedSymbol = symbolRef.current;
    try {
      const res = await fetch(`/api/market/quotes?symbol=${requestedSymbol}&mode=demo`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        // بررسی عدم تداخل پاسخ دیررس با نماد تغییریافته
        if (symbolRef.current === requestedSymbol) {
          if (data.quote && data.source === 'CTRADER_DEMO') {
            setQuote(data.quote);
            setLastFetchTime(Date.now());
          } else {
            setQuote(null);
          }
          if (data.gatewayStatus) {
            setGatewayStatus(data.gatewayStatus.state || 'DISCONNECTED');
            setIsConfigured(Boolean(data.gatewayStatus.configured));
            setIsBrokerConnected(Boolean(data.gatewayStatus.connected && data.gatewayStatus.state === 'SUBSCRIBED'));
          }
        }
      } else {
        if (symbolRef.current === requestedSymbol) {
          setQuote(null);
        }
      }
    } catch {
      if (symbolRef.current === requestedSymbol) {
        setQuote(null);
        setGatewayStatus('DISCONNECTED');
        setIsBrokerConnected(false);
      }
    }
  }, []);

  // واکشی وضعیت مجری، سوئیچ اضطراری و صندوق سفارش‌ها
  const fetchSessionAndOutbox = useCallback(async () => {
    try {
      const execRes = await fetch('/api/executor', { cache: 'no-store' });
      if (execRes.ok) {
        const data = await execRes.json();
        setIsOperatorAuthenticated(data.isAuthenticated === true);
        if (data.state) {
          setExecutorState(data.state);
        }
      }

      const outboxRes = await fetch('/api/orders/outbox', { cache: 'no-store' });
      if (outboxRes.ok) {
        const data = await outboxRes.json();
        setOutboxRecords(data.records || []);
        setIsBlocked(data.isBlocked || false);
        setBlockingReason(data.blockingReason);
      }

      const stopRes = await fetch('/api/orders/emergency-stop', { cache: 'no-store' });
      if (stopRes.ok) {
        const data = await stopRes.json();
        setIsKillNewEntriesActive(Boolean(data.isKillNewEntriesActive));
      }
    } catch {}
  }, []);

  // واکشی دوره‌ای داده‌های مظنه و وضعیت جلسه
  useEffect(() => {
    let isCancelled = false;

    const runSync = async () => {
      if (isCancelled) return;
      await fetchMarketData();
      if (isCancelled) return;
      await fetchSessionAndOutbox();
    };

    void runSync();
    const interval = setInterval(() => {
      void runSync();
    }, 4000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [fetchMarketData, fetchSessionAndOutbox]);

  const provenance: DataProvenance = useMemo(() => {
    const lastRec = quote?.timestamp || lastFetchTime || 0;
    const isActuallyLive = Boolean(quote && isBrokerConnected);
    const prov: DataProvenance = {
      originType: 'BROKER_DEMO_FEED',
      originLabelFa: isActuallyLive ? 'فید مستقیم cTrader Demo' : 'دادهٔ بروکر در دسترس نیست',
      datasetId: 'ctrader-demo-gateway',
      symbol,
      timeframe: '5M',
      timezone: 'UTC',
      lastReceivedAt: lastRec,
      freshnessStatus: 'UNKNOWN',
      stalenessThresholdMs,
      isVerifiedRealData: isActuallyLive,
      notesFa: 'محیط دموی بروکر با اعتبارسنجی مستقل سرور و منع فال‌بک به داده ساختگی.',
    };
    if (!quote || !isBrokerConnected || lastRec <= 0) {
      prov.freshnessStatus = 'DISCONNECTED';
    } else {
      prov.freshnessStatus = evaluateDataFreshness(prov, currentTime);
    }
    return prov;
  }, [quote, lastFetchTime, symbol, isBrokerConnected, currentTime]);

  const isDataStale =
    !quote ||
    !isBrokerConnected ||
    provenance.freshnessStatus === 'STALE' ||
    provenance.freshnessStatus === 'DISCONNECTED' ||
    provenance.freshnessStatus === 'UNKNOWN';

  const isBrokerOnline = isBrokerConnected;

  // بازگشایی نشست اپراتور
  const handleUnlockOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey) return;
    setAuthError(null);
    try {
      const res = await fetch('/api/operator/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsOperatorAuthenticated(true);
        setAccessKey('');
        await fetchSessionAndOutbox();
      } else {
        setAuthError(data.error || 'کلید دسترسی اپراتور نامعتبر است.');
      }
    } catch {
      setAuthError('خطا در برقراری ارتباط با سرور.');
    }
  };

  const handleLockOperator = async () => {
    await fetch('/api/operator/session', { method: 'DELETE' }).catch(() => null);
    setIsOperatorAuthenticated(false);
  };

  // ۱. توقف ورودهای جدید (Circuit Breaker / Pause New Entries)
  const handleToggleKillSwitch = async () => {
    const nextActive = !isKillNewEntriesActive;
    const actionName = nextActive ? 'توقف ورودهای جدید' : 'رفع توقف ورودهای جدید';
    if (
      !confirm(
        `آیا از «${actionName}» اطمینان دارید؟\n${
          nextActive
            ? 'با فعال‌سازی این حالت، ارسال هرگونه سفارش جدید به بروکر مسدود می‌شود، اما پوزیشن‌های باز جاری حفظ خواهند شد.'
            : 'با غیرفعال‌سازی این حالت، امکان ارسال مجدد سفارش‌های جدید فراهم خواهد شد.'
        }`
      )
    )
      return;

    try {
      const res = await fetch('/api/orders/emergency-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: nextActive,
          sessionId: executorState?.activeSessionId || 'default-windows-session',
          epoch: executorState?.epoch ?? 1,
          deviceLabel: executorState?.activeDeviceLabel || 'windows',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsKillNewEntriesActive(data.isKillNewEntriesActive);
        setSubmitMessage({
          type: 'info',
          text: data.message || (nextActive ? 'ورودهای جدید مسدود شدند.' : 'ارسال سفارش جدید مجاز شد.'),
        });
      } else {
        setSubmitMessage({
          type: 'error',
          text: data.error || 'خطا در تغییر وضعیت توقف اضطراری.',
        });
      }
    } catch {
      setSubmitMessage({ type: 'error', text: 'خطا در ارتباط با سرور.' });
    }
  };

  // ارسال سفارش تستی به بروکر (دمو)
  const handleOrderSubmit = async (direction: 'BUY' | 'SELL') => {
    if (!isOperatorAuthenticated) {
      setSubmitMessage({ type: 'error', text: 'برای ثبت سفارش، ابتدا نشست اپراتور را در بالا بازگشایی فرمایید.' });
      return;
    }
    if (isKillNewEntriesActive) {
      setSubmitMessage({ type: 'error', text: 'توقف ورودهای جدید فعال است؛ ثبت هرگونه سفارش جدید به بروکر مسدود می‌باشد.' });
      return;
    }
    if (isDataStale) {
      setSubmitMessage({ type: 'error', text: 'داده‌های مظنه قدیمی یا قطع هستند. ثبت سفارش روی قیمت منقضی مسدود است.' });
      return;
    }
    if (!quote) {
      setSubmitMessage({ type: 'error', text: 'مظنه قیمت لحظه‌ای دریافت نشده است.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const limitPrice = direction === 'BUY' ? quote.ask : quote.bid;
      const slSpread = symbol === 'XAUUSD' ? 2.5 : 0.0015;
      const stopLossPrice =
        direction === 'BUY'
          ? Number((limitPrice - slSpread * 1.5).toFixed(symbol === 'XAUUSD' ? 2 : 5))
          : Number((limitPrice + slSpread * 1.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const takeProfitPrice =
        direction === 'BUY'
          ? Number((limitPrice + slSpread * 3.0).toFixed(symbol === 'XAUUSD' ? 2 : 5))
          : Number((limitPrice - slSpread * 3.0).toFixed(symbol === 'XAUUSD' ? 2 : 5));

      const payload: OrderSubmissionRequest & {
        dataProvenance: any;
        simulateTimeout?: boolean;
        simulateRejection?: boolean;
      } = {
        environment: 'BROKER_DEMO',
        dataProvenance: {
          originType: provenance.originType,
          originLabelFa: provenance.originLabelFa,
          lastReceivedAt: provenance.lastReceivedAt,
          stalenessThresholdMs: provenance.stalenessThresholdMs,
        },
        intentId: `intent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        idempotencyKey: `idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userConfirmationTimestamp: Date.now(),
        symbol,
        direction,
        limitPrice,
        stopLossPrice,
        takeProfitPrice,
        volumeLots: orderVolumeLots,
        executorSessionId: executorState?.activeSessionId || 'default-windows-session',
        executorEpoch: executorState?.epoch ?? 1,
        deviceLabel: executorState?.activeDeviceLabel || 'windows',
        simulateTimeout: isSimulateTimeout,
        simulateRejection: isSimulateRejection,
      };

      const res = await fetch('/api/orders/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setSubmitMessage({
          type: 'success',
          text: `سفارش تستی ${direction === 'BUY' ? 'خرید' : 'فروش'} با شناسه بروکر «${result.brokerOrderId || result.intentId}» با موفقیت در حساب دموی بروکر ثبت شد.`,
        });
      } else {
        setSubmitMessage({
          type: 'error',
          text: `خطا در ثبت سفارش بروکر: ${result.error || 'خطای نامشخص'}`,
        });
      }

      await fetchSessionAndOutbox();
    } catch (err) {
      setSubmitMessage({ type: 'error', text: `خطای شبکه در ارسال سفارش: ${(err as Error).message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none" dir="rtl">
      {/* شناسنامه ۵‌گانه محیط و سوئیچ ساده/پیشرفته */}
      <EnvironmentNavBar
        currentEnv="DEMO"
        provenance={provenance}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4">
        {/* نوار معرفی محیط دموی بروکر با تفکیک دو دکمه اضطراری */}
        <div className="bg-gradient-to-r from-emerald-500/10 via-[#0e171e] to-[#0e171e] border border-emerald-500/30 p-4 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-zinc-100">
                  محیط دموی بروکر (اتصال به حساب cTrader Demo)
                </h1>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                    gatewayStatus === 'CONNECTED'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {gatewayStatus === 'CONNECTED' ? 'متصل به سرور دمو' : 'در انتظار اتصال'}
                </span>
                {isKillNewEntriesActive && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    توقف ورود جدید فعال است
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                ارسال سفارش به حساب تمرینی بروکر با اعتبارسنجی مستقل سرور، کلید ضدتکرار، انقضای زمانی و بدون هرگونه داده ساختگی.
              </p>
            </div>
          </div>

          {/* دو دکمه اضطراری کاملاً متمایز با توضیحات صریح */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            {/* ۱. توقف ورودهای جدید (Circuit Breaker / Pause) */}
            <button
              onClick={handleToggleKillSwitch}
              title="توقف ورودهای جدید: معاملات باز جاری حفظ می‌شوند، اما هیچ سفارش جدیدی ارسال نمی‌شود."
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                isKillNewEntriesActive
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-950'
                  : 'bg-[#182030] hover:bg-[#202a40] text-zinc-300 border-[#2b3952]'
              }`}
            >
              <PauseCircle className="w-4 h-4 text-amber-400" />
              <span>{isKillNewEntriesActive ? 'رفع توقف ورود جدید' : 'توقف ورودهای جدید (Pause)'}</span>
            </button>

            {/* ۲. بستن فوری پوزیشن‌ها (غیرفعال به دلیل عدم پیاده‌سازی در رابط) */}
            <button
              type="button"
              disabled={true}
              title="بستن همهٔ پوزیشن‌ها هنوز پیاده‌سازی نشده است. برای بستن معاملات از cTrader استفاده کنید."
              className="px-3 py-2 rounded-xl bg-zinc-800/40 text-zinc-400 text-xs font-bold flex items-center justify-center gap-1.5 border border-zinc-700/40 cursor-not-allowed opacity-60"
            >
              <PowerOff className="w-4 h-4 text-zinc-500" />
              <span>بستن فوری تمام پوزیشن‌ها (غیرفعال)</span>
            </button>
          </div>
        </div>

        {/* توضیح صریح درباره عدم امکان بستن سراسری پوزیشن‌ها در رابط فعلی */}
        <div className="p-3 bg-[#111622] border border-[#1e2738] rounded-xl text-xs text-amber-300/90 flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>بستن همهٔ پوزیشن‌ها هنوز پیاده‌سازی نشده است. برای بستن معاملات از cTrader استفاده کنید.</span>
        </div>

        {/* پیام‌های سیستمی */}
        {submitMessage && (
          <div
            className={`p-3.5 rounded-2xl text-xs flex items-center justify-between gap-2 shadow-md ${
              submitMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : submitMessage.type === 'error'
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {submitMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : submitMessage.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <Info className="w-4 h-4 shrink-0 text-cyan-400" />
              )}
              <span className="font-medium">{submitMessage.text}</span>
            </div>
            <button onClick={() => setSubmitMessage(null)} className="text-zinc-400 hover:text-zinc-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* هشدار قطع فید داده یا کهنگی (عدم فال‌بک خاموش) */}
        {isDataStale && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 animate-pulse" />
              <div>
                <h3 className="font-bold text-xs sm:text-sm">داده‌های دریافتی از سرور بروکر قطع یا قدیمی هستند!</h3>
                <p className="text-xs text-rose-400/90 mt-0.5 leading-relaxed">
                  طبق اصول ایمنی سامانه، هیچ‌گاه به داده‌های ساختگی سوئیچ نمی‌شود. جهت جلوگیری از باز شدن معامله بر مبنای قیمت منقضی، ثبت سفارش مسدود شده است. (آستانه مجاز تازگی: {stalenessThresholdMs / 1000} ثانیه).
                </p>
              </div>
            </div>
            <button
              onClick={fetchMarketData}
              className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold flex items-center gap-1.5 border border-rose-500/40 transition-all shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تلاش مجدد دریافت مظنه</span>
            </button>
          </div>
        )}

        {/* پیام شفاف و هدایت‌کننده در صورت قطع ارتباط سرور یا نبود کلید اتصال */}
        {(!isConfigured || !isBrokerOnline) && (
          <div className="p-4 bg-[#141926] border border-[#232d42] rounded-2xl text-xs space-y-2 text-zinc-300">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Info className="w-4 h-4" />
              <span>ارتباط با سرور بروکر برقرار نیست</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              ارتباط با سرور دموی cTrader در دسترس نیست یا کلیدهای اتصال در سرور تنظیم نشده‌اند. می‌توانید با خیال آسوده در محیط‌های <strong>«۱. تمرین با داده نمونه»</strong> یا <strong>«۲. بررسی استراتژی»</strong> بدون نیاز به اینترنت یا بروکر به کار خود ادامه دهید.
            </p>
          </div>
        )}

        {/* کارت احراز هویت نشست اپراتور */}
        <div className="bg-[#101420] border border-[#1d2436] p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            {isOperatorAuthenticated ? (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <Unlock className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
            )}
            <div>
              <div className="text-xs font-bold text-zinc-200">
                {isOperatorAuthenticated ? 'نشست اپراتور فعال است' : 'نیازمند بازگشایی نشست اپراتور'}
              </div>
              <div className="text-[11px] text-zinc-400">
                {isOperatorAuthenticated
                  ? 'مجوز ثبت سفارش و بررسی وضعیت در صندوق سفارش‌های بروکر صادر شده است.'
                  : 'برای جلوگیری از ارسال ناخواسته سفارش، ارسال معامله به بروکر نیازمند کلید دسترسی اپراتور است.'}
              </div>
            </div>
          </div>

          {!isOperatorAuthenticated ? (
            <form onSubmit={handleUnlockOperator} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="password"
                placeholder="کلید دسترسی اپراتور..."
                value={accessKey}
                onChange={e => setAccessKey(e.target.value)}
                className="bg-[#151b2a] border border-[#263148] rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-hidden focus:border-cyan-500 font-mono w-full sm:w-56"
              />
              <button
                type="submit"
                disabled={!accessKey}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shrink-0"
              >
                بازگشایی
              </button>
            </form>
          ) : (
            <button
              onClick={handleLockOperator}
              className="px-3 py-1.5 rounded-xl bg-[#1a2132] hover:bg-[#222c42] text-zinc-300 text-xs font-medium border border-[#2b3752] transition-all"
            >
              قفل مجدد نشست
            </button>
          )}
        </div>

        {authError && (
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400">
            {authError}
          </div>
        )}

        {/* مظنه قیمت زنده و ارسال سفارش تستی به بروکر */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ستون ۱ و ۲: مظنه قیمت و ثبت معامله */}
          <div className="lg:col-span-2 bg-[#101420] border border-[#1d2436] p-4 rounded-2xl space-y-4 shadow-md">
            <div className="flex items-center justify-between border-b border-[#1b2234] pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-zinc-100">مظنه لحظه‌ای و ارسال سفارش تستی به بروکر</h2>
              </div>

              {/* انتخاب نمادهای مجاز با پشتیبانی در Gateway */}
              <div className="flex items-center gap-1 bg-[#141a28] p-1 rounded-xl border border-[#243048]">
                {(['XAUUSD', 'EURUSD'] as SymbolId[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSymbolChange(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                      symbol === s
                        ? 'bg-cyan-500 text-black shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* کارت‌های قیمت فروش و خرید */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#141926] border border-[#222b3d] p-3.5 rounded-xl">
                <span className="text-[11px] text-zinc-400">مظنه فروش بروکر (Bid)</span>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {quote ? quote.bid : '---'}
                </div>
              </div>

              <div className="bg-[#141926] border border-[#222b3d] p-3.5 rounded-xl">
                <span className="text-[11px] text-zinc-400">مظنه خرید بروکر (Ask)</span>
                <div className="text-xl font-bold text-cyan-400 font-mono mt-1">
                  {quote ? quote.ask : '---'}
                </div>
              </div>
            </div>

            {/* فرم ارسال سفارش تستی */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400 whitespace-nowrap">حجم معامله (لات):</label>
                <input
                  type="number"
                  min="0.01"
                  max="5"
                  step="0.01"
                  value={orderVolumeLots}
                  onChange={e => setOrderVolumeLots(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                  className="bg-[#141a28] border border-[#232f46] rounded-xl px-3 py-1.5 text-xs text-zinc-200 font-mono w-28 focus:outline-hidden focus:border-cyan-500"
                />
                <span className="text-[11px] text-zinc-500">حداقل حجم: ۰.۰۱ لات</span>
              </div>

              {/* دکمه‌های ثبت سفارش تستی خرید / فروش */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleOrderSubmit('BUY')}
                  disabled={isSubmitting || isDataStale || !isOperatorAuthenticated || isKillNewEntriesActive || !quote}
                  className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-950"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>ارسال سفارش تستی خرید (BUY)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOrderSubmit('SELL')}
                  disabled={isSubmitting || isDataStale || !isOperatorAuthenticated || isKillNewEntriesActive || !quote}
                  className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-950"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>ارسال سفارش تستی فروش (SELL)</span>
                </button>
              </div>

              {/* توضیح صریح اثر دکمه‌ها برای کاربر غیرتخصصی */}
              <div className="p-3 bg-[#131926] border border-[#21293c] rounded-xl text-xs text-zinc-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                  <span>💡 اثر این دکمه‌ها:</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  کلیک روی این دکمه‌ها سفارش آزمایشی را مستقیماً به حساب دموی cTrader ارسال می‌کند. هیچ پولی از شما کسر نمی‌شود و ریسک مالی ندارد، اما این معامله در حساب دموی بروکر شما ثبت شده و بر موجودی مجازی آن اثر می‌گذارد.
                </p>
              </div>
            </div>
          </div>

          {/* ستون ۳: راهنمای گام‌ها و وضعیت ایمنی */}
          <div className="bg-[#101420] border border-[#1d2436] p-4 rounded-2xl space-y-4 shadow-md">
            <div className="flex items-center gap-2 border-b border-[#1b2234] pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-200">وضعیت ایمنی و پیش‌نیازها</h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141926] border border-[#212a3d]">
                <span className="text-zinc-400">اتصال به سرور cTrader:</span>
                <span className={isBrokerOnline ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                  {isBrokerOnline ? 'برقرار ✓' : 'قطع ✗'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141926] border border-[#212a3d]">
                <span className="text-zinc-400">نشست اپراتور:</span>
                <span className={isOperatorAuthenticated ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {isOperatorAuthenticated ? 'بازگشایی شده ✓' : 'قفل 🔒'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141926] border border-[#212a3d]">
                <span className="text-zinc-400">وضعیت داده مظنه:</span>
                <span className={!isDataStale ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                  {!isDataStale ? 'تازه و معتبر ✓' : 'منقضی یا قطع ✗'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141926] border border-[#212a3d]">
                <span className="text-zinc-400">توقف ورود جدید:</span>
                <span className={!isKillNewEntriesActive ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {!isKillNewEntriesActive ? 'غیرفعال (عادی)' : 'فعال (مسدودسازی)'}
                </span>
              </div>
            </div>

            {/* بخش پیشرفته: شبیه‌سازی تست‌های شکست ایمن (Fail-Closed) */}
            {viewMode === 'ADVANCED' && (
              <div className="border-t border-[#1e2638] pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-purple-300 font-bold text-xs">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>آزمایش رفتارهای ایمنی (حالت پیشرفته)</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-zinc-400">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSimulateTimeout}
                      onChange={e => setIsSimulateTimeout(e.target.checked)}
                      className="rounded bg-[#171f2e] border-zinc-700"
                    />
                    <span>شبیه‌سازی قطعی شبکه (تست وضعیت نامشخص)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSimulateRejection}
                      onChange={e => setIsSimulateRejection(e.target.checked)}
                      className="rounded bg-[#171f2e] border-zinc-700"
                    />
                    <span>شبیه‌سازی رد سفارش توسط بروکر</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* وضعیت ارسال سفارش‌ها به بروکر (صندوق سفارش‌ها و بررسی وضعیت‌های نامشخص) */}
        <OutboxExecutionCard
          records={outboxRecords}
          onReconcile={async (id: string) => {
            setSubmitMessage({ type: 'info', text: 'درخواست بررسی وضعیت سفارش ارسال شد...' });
            try {
              const res = await fetch('/api/orders/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intentId: id, clientOrderId: id }),
              });
              const data = await res.json().catch(() => null);
              if (res.ok && data?.reconciled) {
                setSubmitMessage({
                  type: 'success',
                  text: `عملیات تأیید شد: وضعیت سفارش ${id} با موفقیت با بروکر بازتطبیق و تأیید شد.`,
                });
              } else if (res.ok && data) {
                setSubmitMessage({
                  type: 'info',
                  text: `درخواست پذیرفته شد: سفارش ${id} در صف بررسی وضعیت قرار دارد (${data.message || 'در انتظار تطبیق'}).`,
                });
              } else if (res.status === 401) {
                setSubmitMessage({
                  type: 'error',
                  text: 'خطای احراز هویت (۴۰۱): نشست اپراتور منقضی شده یا نامعتبر است.',
                });
              } else if (res.status === 403) {
                setSubmitMessage({
                  type: 'error',
                  text: 'خطای دسترسی (۴۰۳): مجوز بازتطبیق سفارش صادر نشد.',
                });
              } else if (res.status === 503) {
                setSubmitMessage({
                  type: 'error',
                  text: 'خطای سرویس بروکر (۵۰۳): سرویس بازتطبیق بروکر در دسترس نیست.',
                });
              } else {
                setSubmitMessage({
                  type: 'error',
                  text: `خطا در بررسی وضعیت سفارش: ${data?.error || `کد خطا ${res.status}`}`,
                });
              }
            } catch (err) {
              setSubmitMessage({
                type: 'error',
                text: `خطای شبکه در ارتباط با سرور: ${(err as Error).message}`,
              });
            }
            await fetchSessionAndOutbox();
          }}
          onRefreshOutbox={fetchSessionAndOutbox}
          isBlocked={isBlocked}
          blockingReason={blockingReason}
          viewMode={viewMode}
        />
      </div>
    </main>
  );
}
