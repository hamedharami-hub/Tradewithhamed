// components/trading/risk-guardian-workbench.tsx
// میز کار تعاملی محافظ ریسک، سقف زیان روزانه و کلید قطع اضطراری W4
// طراحی مینیمال بر اساس اصول متریال ۳ گوگل، مناسب برای مطالعه طولانی بدون خستگی چشم

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Power,
  Flame,
  Clock,
  Layers,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  Sliders,
  DollarSign,
  TrendingUp,
  Info,
} from 'lucide-react';
import { RiskGuardianEngine } from '@/lib/core/risk-guardian-engine';
import { OrderIntentPayload, PortfolioLedgerState } from '@/lib/core/ports';
import { runW4AcceptanceSuite, W4AcceptanceTestResult } from '@/lib/core/__tests__/w4-acceptance.test';

const SIMULATION_TIMESTAMP = 1772841600000;

export const RiskGuardianWorkbench: React.FC = () => {
  const guardian = useMemo(() => new RiskGuardianEngine(), []);

  // وضعیت‌های تعاملی
  const [activeSubTab, setActiveSubTab] = useState<'simulator' | 'circuits' | 'breakeven' | 'tests'>('simulator');
  const [w4TestResults, setW4TestResults] = useState<W4AcceptanceTestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // دفترکل شبیه‌سازی‌شده برای تست محاسبات
  const [simulatedEquity, setSimulatedEquity] = useState(10000);
  const [simulatedOpenPositions, setSimulatedOpenPositions] = useState(0);

  // ورودی‌های شبیه‌ساز ریسک پیش از معامله
  const [simSymbol, setSimSymbol] = useState<'XAUUSD' | 'EURUSD'>('XAUUSD');
  const [simLots, setSimLots] = useState(0.1);
  const [simEntry, setSimEntry] = useState(2650.0);
  const [simSL, setSimSL] = useState(2640.0);
  const [simTP, setSimTP] = useState(2670.0);

  // ورودی شبیه‌ساز اسپرد جاری بازار
  const [simCurrentSpreadPips, setSimCurrentSpreadPips] = useState(1.5);

  // همگام‌سازی وضعیت داخلی
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  const guardianState = guardian.getState();
  const riskConfig = guardian.getRiskConfig();
  const circuitConfig = guardian.getCircuitConfig();

  // ارزیابی لحظه‌ای سفارش در شبیه‌ساز
  const simulatedLedger: PortfolioLedgerState = useMemo(() => ({
    environment: 'PAPER_LIVE',
    accountNamespace: 'SHADOW_LIVE',
    initialCash: 10000,
    cashBalance: simulatedEquity,
    equity: simulatedEquity,
    usedMargin: simulatedOpenPositions * 200,
    freeMargin: simulatedEquity - (simulatedOpenPositions * 200),
    marginLevelPercent: 500,
    totalRealizedPnl: 0,
    totalUnrealizedPnl: 0,
    totalCommissions: 0,
    totalSwap: 0,
    positions: Array(simulatedOpenPositions).fill(null).map((_, i) => ({
      positionId: `POS-SIM-${i}`,
      intentId: `INT-SIM-${i}`,
      environment: 'PAPER_LIVE',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650,
      currentPrice: 2655,
      stopLossPrice: 2640,
      takeProfitPrice: 2670,
      unrealizedPnl: 50,
      realizedPnl: 0,
      commissionPaid: 0.6,
      financingSwap: 0,
      isOpen: true,
      openedTimestamp: SIMULATION_TIMESTAMP - 3600000,
      maePips: 0,
      mfePips: 5,
    })),
    peakEquity: 10000,
    maxDrawdownAmount: 0,
    maxDrawdownPercent: 0,
  }), [simulatedEquity, simulatedOpenPositions]);

  const simulatedIntent: OrderIntentPayload = useMemo(() => ({
    intentId: 'INT-SIM-EVAL',
    environment: 'PAPER_LIVE',
    accountNamespace: 'SHADOW_LIVE',
    candidateId: 'CND-SIM-EVAL',
    symbol: simSymbol,
    orderType: 'LIMIT',
    direction: 'BUY',
    volumeLots: simLots,
    entryPrice: simEntry,
    stopLossPrice: simSL,
    takeProfitPrice: simTP,
    reasonCode: 'W4_PRE_TRADE_SIMULATION',
    createdTimestamp: SIMULATION_TIMESTAMP,
    idempotencyKey: 'KEY-SIM',
  }), [simSymbol, simLots, simEntry, simSL, simTP]);

  const marketSnapshot = useMemo(() => {
    const pipVal = simSymbol === 'XAUUSD' ? 0.1 : 0.0001;
    return {
      bid: simEntry,
      ask: simEntry + (simCurrentSpreadPips * pipVal),
      timestamp: SIMULATION_TIMESTAMP,
    };
  }, [simSymbol, simEntry, simCurrentSpreadPips]);

  const evaluation = useMemo(() => {
    return guardian.evaluateOrderRisk(simulatedIntent, simulatedLedger, marketSnapshot);
  }, [guardian, simulatedIntent, simulatedLedger, marketSnapshot]);

  // کلید قطع اضطراری
  const toggleKillSwitch = () => {
    if (guardianState.isEmergencyKillSwitchActive) {
      guardian.resetEmergencyKillSwitch();
      setActionNotice('کلید قطع اضطراری غیرفعال شد. معاملات مجدداً مجاز هستند.');
    } else {
      guardian.triggerEmergencyKillSwitch('قطع دستی اضطراری توسط کاربر');
      setActionNotice('کلید قطع اضطراری فعال شد! کلیه معاملات بلافاصله متوقف شدند.');
    }
    refresh();
  };

  // شبیه‌سازی معامله زیان‌ده یا سودده
  const handleSimulateTradeOutcome = (pnl: number) => {
    guardian.recordClosedTrade(pnl);
    setSimulatedEquity(prev => prev + pnl);
    refresh();
    setActionNotice(
      pnl < 0
        ? `زیان $${Math.abs(pnl)} در سرفصل امروز ثبت شد.`
        : `سود $${pnl} در سرفصل امروز ثبت شد و شمارنده زیان متوالی صفر گردید.`
    );
  };

  // اجرای آزمون‌های گیت پذیرش W4
  const handleRunW4Suite = async () => {
    setIsRunningTests(true);
    const results = await runW4AcceptanceSuite();
    setW4TestResults(results);
    setIsRunningTests(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-slate-100 font-sans" dir="rtl">
      {/* هدر متریال ۳ مینیمال و آرام */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                سامانه محافظ ریسک، سقف زیان و کلیدهای قطع نوسان (Gate W4 Risk Guardian)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Risk Guardian & PMS
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              پایش بلادرنگ بودجه ریسک روزانه، کنترل اهرم و حجم معامله، خنک‌سازی زیان‌های متوالی، کلیدهای قطع اسپرد و نوسان، و انتقال خودکار حد ضرر به نقطه سربه‌سر.
            </p>
          </div>

          {/* کلید قطع اضطراری */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleKillSwitch}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border shadow-sm ${
                guardianState.isEmergencyKillSwitchActive
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 animate-pulse'
                  : 'bg-slate-800/90 hover:bg-rose-950/40 text-rose-300 border-rose-500/30'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>
                {guardianState.isEmergencyKillSwitchActive
                  ? 'کلید قطع فعال است (آزادسازی)'
                  : 'کلید قطع اضطراری (Kill-Switch)'}
              </span>
            </button>
          </div>
        </div>

        {/* اعلان عملیات */}
        {actionNotice && (
          <div className="mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 text-xs text-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
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

      {/* کارت‌های سنجه‌های ریسک روزانه */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">سود / زیان امروز</span>
          <span className={`text-2xl font-bold font-mono ${
            guardianState.dailyRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`} dir="ltr">
            {guardianState.dailyRealizedPnl >= 0 ? '+' : ''}${guardianState.dailyRealizedPnl.toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            سقف افت مجاز: ${riskConfig.maxDailyLossAmount} ({riskConfig.maxDailyLossPercent}%)
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">زیان‌های متوالی</span>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold font-mono ${
              guardianState.consecutiveLossCount >= riskConfig.consecutiveLossesLimit
                ? 'text-rose-400 animate-bounce'
                : 'text-slate-200'
            }`}>
              {guardianState.consecutiveLossCount} / {riskConfig.consecutiveLossesLimit}
            </span>
            {guardianState.consecutiveLossCount > 0 && (
              <Flame className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">
            {guardianState.cooldownUntilTimestamp ? 'دوره خنک‌سازی فعال است' : 'وضعیت خنک‌سازی: آماده'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">سقف پوزیشن‌های هم‌زمان</span>
          <span className="text-2xl font-bold font-mono text-indigo-400">
            {simulatedOpenPositions} / {riskConfig.maxOpenPositions}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            حداکثر ریسک هر معامله: {riskConfig.maxRiskPerTradePercent}%
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <span className="text-xs text-slate-400 block mb-1">وضعیت کلی گیت محافظ</span>
          <div className="flex items-center gap-1.5 mt-1">
            {evaluation.isApproved ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>سبز و مجاز</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-sm">
                <ShieldAlert className="w-4 h-4" />
                <span>مسدود امنیتی</span>
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">
            سرمایه فعلی: ${simulatedEquity.toLocaleString()}
          </span>
        </div>
      </div>

      {/* سربرگ‌های ثانویه */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'simulator'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>ارزیاب و شبیه‌ساز پیش از معامله (Pre-Trade Sizing)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('circuits')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'circuits'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>کلیدهای قطع نوسان و زمان (Circuit Breakers)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('breakeven')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'breakeven'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>انتقال به سربه‌سر و تریلینگ استاپ (Breakeven & Trailing)</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('tests');
            if (w4TestResults.length === 0) handleRunW4Suite();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
            activeSubTab === 'tests'
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/40'
              : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>آزمون‌های گیت پذیرش W4 ({w4TestResults.length}/7)</span>
        </button>
      </div>

      {/* محتوای تب ۱: ارزیاب پیش از معامله */}
      {activeSubTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* فرم شبیه‌ساز سفارش */}
          <div className="lg:col-span-1 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>مشخصات سفارش فرضی جهت ارزیابی</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">نماد</label>
                  <select
                    value={simSymbol}
                    onChange={(e) => setSimSymbol(e.target.value as 'XAUUSD' | 'EURUSD')}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="XAUUSD">XAUUSD (طلا)</option>
                    <option value="EURUSD">EURUSD (یورو)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">حجم معامله (لات)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="5"
                    value={simLots}
                    onChange={(e) => setSimLots(parseFloat(e.target.value) || 0.1)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono text-left focus:outline-none focus:border-indigo-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">قیمت ورود فرضی</label>
                <input
                  type="number"
                  step="0.1"
                  value={simEntry}
                  onChange={(e) => setSimEntry(parseFloat(e.target.value) || 2650.0)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono text-left focus:outline-none focus:border-indigo-500"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">حد ضرر (SL)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simSL}
                    onChange={(e) => setSimSL(parseFloat(e.target.value) || 2640.0)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-rose-300 font-mono text-left focus:outline-none focus:border-rose-500"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">حد سود (TP)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simTP}
                    onChange={(e) => setSimTP(parseFloat(e.target.value) || 2670.0)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-emerald-300 font-mono text-left focus:outline-none focus:border-emerald-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-slate-400 block text-[11px]">شبیه‌سازی شرایط حساب و بازار:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-500 block text-[10px]">تعداد پوزیشن باز</label>
                    <select
                      value={simulatedOpenPositions}
                      onChange={(e) => setSimulatedOpenPositions(parseInt(e.target.value))}
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 text-xs font-mono"
                    >
                      <option value="0">۰ معامله باز</option>
                      <option value="1">۱ معامله باز</option>
                      <option value="2">۲ معامله باز (حداکثر)</option>
                      <option value="3">۳ معامله باز (تجاوز)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-500 block text-[10px]">اسپرد جاری (پیپ)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={simCurrentSpreadPips}
                      onChange={(e) => setSimCurrentSpreadPips(parseFloat(e.target.value) || 1.5)}
                      className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 text-xs font-mono text-left"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSimulateTradeOutcome(-120)}
                    className="py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/20 text-[11px] transition-colors"
                  >
                    + ثبت ۱ معامله زیان‌ده ($120-)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateTradeOutcome(150)}
                    className="py-1.5 px-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/20 text-[11px] transition-colors"
                  >
                    + ثبت ۱ معامله سودده ($150+)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* پنل ارزیابی و نتیجه محافظ */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span>نتیجه ارزیابی امنیتی و محاسبات سایزینگ</span>
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                evaluation.isApproved
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
              }`}>
                {evaluation.isApproved ? 'تاییدشده (APPROVED)' : `ردشده (${evaluation.rejectReasonCode})`}
              </span>
            </div>

            <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
              evaluation.isApproved
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
            }`}>
              <div className="flex items-center gap-2 mb-1 font-semibold">
                {evaluation.isApproved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                <span>{evaluation.messageFa}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block mb-1">ریسک دلاری محاسبه‌شده</span>
                <span className="text-lg font-bold font-mono text-slate-100" dir="ltr">
                  ${evaluation.evaluatedRiskDollars}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  معادل {evaluation.evaluatedRiskPercent}% از ارزش حساب
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block mb-1">حداکثر حجم مجاز (۱٪ ریسک)</span>
                <span className="text-lg font-bold font-mono text-indigo-400" dir="ltr">
                  {evaluation.maxAllowedVolumeLots} لات
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  برای سقف ۱۰۰ دلار ریسک
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block mb-1">نسبت سود به ریسک (R/R)</span>
                <span className="text-lg font-bold font-mono text-emerald-400" dir="ltr">
                  {Math.abs(simSL - simEntry) > 0 ? (Math.abs(simTP - simEntry) / Math.abs(simSL - simEntry)).toFixed(2) : 0} R
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  حداقل مجاز: 1.00 R
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۲: کلیدهای قطع نوسان و اخبار */}
      {activeSubTab === 'circuits' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-white block">کلید قطع اسپرد طلا و یورو</span>
              <p className="text-xs text-slate-400">
                سقف اسپرد مجاز طلا: <span className="font-mono text-indigo-400">{circuitConfig.maxSpreadPips.XAUUSD} پیپ</span> (۳۵ سنت)
                <br />
                سقف اسپرد مجاز یورو: <span className="font-mono text-indigo-400">{circuitConfig.maxSpreadPips.EURUSD} پیپ</span>
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>پایشگر بلادرنگ فعال</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-white block">محافظ گپ تعطیلات آخر هفته</span>
              <p className="text-xs text-slate-400">
                ساعت مسدودسازی روز جمعه: <span className="font-mono text-indigo-400">{circuitConfig.fridayCutoffHourUtc}:00 UTC</span>
                <br />
                جلوگیری از زیان گپ بازگشایی بازار در صبح دوشنبه.
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>قانون بدون استثناء</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-white block">حفاظت جهش نوسان اخبار (ATR Spike)</span>
              <p className="text-xs text-slate-400">
                آستانه حساسیت: <span className="font-mono text-indigo-400">{circuitConfig.volatilitySpikeThresholdMultiplier}x</span> میانگین متحرک ATR
                <br />
                مسدودسازی ۱۵ دقیقه قبل و بعد از انتشارهای سنگین.
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>سپر ضد اسپایک نقدینگی</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۳: قوانین سربه‌سر و تریلینگ استاپ */}
      {activeSubTab === 'breakeven' && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span>قوانین خودکار انتقال به نقطه سربه‌سر و محافظت از سود</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
              <span className="font-semibold text-white block">انتقال خودکار به سربه‌سر (Auto Breakeven Migration):</span>
              <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                <li>شرط فعال‌سازی: رسیدن سود شناور به حداقل ۱.۵R (ریوارد به ریسک).</li>
                <li>بافر سود تضمینی: ۱ پیپ بالاتر از نقطه ورود خرید (یا پایین‌تر در فروش) جهت پوشش کارمزد بروکر.</li>
                <li>تضمین عدم بازگشت معامله سودده به وضعیت زیان‌ده.</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
              <span className="font-semibold text-white block">تریلینگ استاپ پویا (Dynamic Trailing Stop):</span>
              <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                <li>آغاز ردیابی سود: از ۲.۵R سود به بالا.</li>
                <li>گام پیشروی: حداقل ۲.۰ پیپ در هر حرکت قیمت.</li>
                <li>حفظ فاصله ساختاری حداقل 1R با سقف‌ها و کف‌های قیمتی.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* محتوای تب ۴: آزمون‌های گیت پذیرش W4 */}
      {activeSubTab === 'tests' && (
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>مجموعه آزمون‌های پذیرش گیت ۴ (Gate W4 Acceptance Tests)</span>
              </h2>
              <p className="text-xs text-slate-400">
                سنجش خودکار ۷ مؤلفه کلیدی: سقف زیان روزانه، خنک‌سازی زیان‌های متوالی، محدودیت پوزیشن هم‌زمان، سایزینگ ۱ درصدی، قطع اسپرد، انتقال به سربه‌سر و کلید قطع اضطراری.
              </p>
            </div>
            <button
              onClick={handleRunW4Suite}
              disabled={isRunningTests}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isRunningTests ? 'در حال اجرای آزمون‌ها...' : 'اجرای مجدد آزمون‌های W4'}</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {w4TestResults.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors flex items-start justify-between gap-4"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-400">{t.id}</span>
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
    </div>
  );
};
