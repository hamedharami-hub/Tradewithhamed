// components/trading/journal-workbench-w5.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  Clock,
  RotateCw,
  ShieldCheck,
  Zap,
  Activity,
  ChevronDown,
  ChevronUp,
  HeartHandshake,
  Brain,
  Target,
  Sparkles,
} from 'lucide-react';
import {
  TradeLifecycleRecord,
  BehavioralAuditFlag,
  DisciplineScorecard,
  AlphaFrictionAttribution,
  SessionTimeDistribution,
} from '@/lib/contracts/w5-journal-analytics';
import { PostTradeAnalyticsEngine } from '@/lib/core/post-trade-analytics';
import { runW5AcceptanceSuite, W5AcceptanceTestResult } from '@/lib/core/__tests__/w5-acceptance.test';

// نمونه داده‌های تاریخی غنی‌شده W5 با تضمین ثبات و عدم نیاز به بارگذاری سنگین
const DEFAULT_W5_TRADES: TradeLifecycleRecord[] = [
  {
    tradeId: 'TR-101',
    intentId: 'INT-W5-01',
    correlationId: 'CORR-01',
    causationId: 'CAUSE-01',
    brokerOrderId: 'CT-ORD-110291',
    symbol: 'XAUUSD',
    direction: 'BUY',
    volumeLots: 0.05,
    entryPrice: 2642.5,
    stopLossPrice: 2637.5,
    takeProfitPrice: 2657.5,
    exitPrice: 2657.5,
    openedAt: 1725613200000,
    closedAt: 1725615600000,
    exitReason: 'TP_HIT',
    plannedRiskAmount: 25.0,
    realizedGrossPnL: 75.0,
    brokerCommission: 0.35,
    slippagePips: 0.3,
    slippageCostDollar: 0.15,
    realizedNetPnL: 74.5,
    realizedRMultiple: 2.98,
    maxAdverseExcursionPips: 8.0,
    maxAdverseExcursionDollar: 4.0,
    maxFavorableExcursionPips: 155.0,
    maxFavorableExcursionDollar: 77.5,
    exitEfficiencyPercent: 96.8,
    setupGrade: 'A+',
    traderNotesFa: 'جاروب نقدینگی کف آسیا با تایید کندل تهاجمی ۵ دقیقه‌ای و خروج در سقف FVG ۴ ساعته.',
  },
  {
    tradeId: 'TR-102',
    intentId: 'INT-W5-02',
    correlationId: 'CORR-02',
    causationId: 'CAUSE-02',
    brokerOrderId: 'CT-ORD-110292',
    symbol: 'EURUSD',
    direction: 'SELL',
    volumeLots: 0.06,
    entryPrice: 1.0865,
    stopLossPrice: 1.0895,
    takeProfitPrice: 1.0775,
    exitPrice: 1.0895,
    openedAt: 1725610200000,
    closedAt: 1725611400000,
    exitReason: 'SL_HIT',
    plannedRiskAmount: 18.0,
    realizedGrossPnL: -18.0,
    brokerCommission: 0.36,
    slippagePips: 0.5,
    slippageCostDollar: 0.3,
    realizedNetPnL: -18.66,
    realizedRMultiple: -1.04,
    maxAdverseExcursionPips: 30.0,
    maxAdverseExcursionDollar: 18.0,
    maxFavorableExcursionPips: 6.0,
    maxFavorableExcursionDollar: 3.6,
    exitEfficiencyPercent: 0,
    setupGrade: 'B',
    traderNotesFa: 'شکست سقف ساختار قبل از زمان بهینه سشن. خروج با حد ضرر استاندارد بدون دستکاری.',
  },
  {
    tradeId: 'TR-103',
    intentId: 'INT-W5-03',
    correlationId: 'CORR-03',
    causationId: 'CAUSE-03',
    brokerOrderId: 'CT-ORD-110293',
    symbol: 'XAUUSD',
    direction: 'BUY',
    volumeLots: 0.04,
    entryPrice: 2640.0,
    stopLossPrice: 2635.0,
    takeProfitPrice: 2655.0,
    exitPrice: 2655.0,
    openedAt: 1725616800000,
    closedAt: 1725619200000,
    exitReason: 'TP_HIT',
    plannedRiskAmount: 20.0,
    realizedGrossPnL: 60.0,
    brokerCommission: 0.28,
    slippagePips: 0.2,
    slippageCostDollar: 0.08,
    realizedNetPnL: 59.64,
    realizedRMultiple: 2.98,
    maxAdverseExcursionPips: 4.0,
    maxAdverseExcursionDollar: 1.6,
    maxFavorableExcursionPips: 152.0,
    maxFavorableExcursionDollar: 60.8,
    exitEfficiencyPercent: 98.7,
    setupGrade: 'A',
    traderNotesFa: 'ورود مجدد پس از اصلاح سالم در نشست لندن. انضباط کامل در حفظ حد سود.',
  },
  {
    tradeId: 'TR-104',
    intentId: 'INT-W5-04',
    correlationId: 'CORR-04',
    causationId: 'CAUSE-04',
    brokerOrderId: 'CT-ORD-110294',
    symbol: 'XAUUSD',
    direction: 'SELL',
    volumeLots: 0.03,
    entryPrice: 2656.0,
    stopLossPrice: 2661.0,
    takeProfitPrice: 2641.0,
    exitPrice: 2650.0,
    openedAt: 1725624000000,
    closedAt: 1725626400000,
    exitReason: 'MANUAL_CLOSE',
    plannedRiskAmount: 15.0,
    realizedGrossPnL: 18.0,
    brokerCommission: 0.21,
    slippagePips: 0.4,
    slippageCostDollar: 0.12,
    realizedNetPnL: 17.67,
    realizedRMultiple: 1.18,
    maxAdverseExcursionPips: 12.0,
    maxAdverseExcursionDollar: 3.6,
    maxFavorableExcursionPips: 150.0,
    maxFavorableExcursionDollar: 45.0,
    exitEfficiencyPercent: 40.0,
    setupGrade: 'B',
    traderNotesFa: 'خروج دستی قبل از تارگت به علت انتشار خبر نوسانی FOMC.',
  },
];

type SubTab = 'ALPHA' | 'BEHAVIORAL' | 'EXCURSION' | 'TIME' | 'TESTS';

export function JournalWorkbenchW5() {
  const [subTab, setSubTab] = useState<SubTab>('ALPHA');
  const [trades, setTrades] = useState<TradeLifecycleRecord[]>(DEFAULT_W5_TRADES);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<W5AcceptanceTestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [selectedFilterSymbol, setSelectedFilterSymbol] = useState<'ALL' | 'XAUUSD' | 'EURUSD'>('ALL');

  // واکشی داده‌های زنده سرور (در صورت موجود بودن)
  useEffect(() => {
    let isMounted = true;
    const syncServerData = async () => {
      try {
        const res = await fetch('/api/journal');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.positions && Array.isArray(data.positions) && data.positions.length > 0) {
            // تبدیل پوزیشن‌های موجود به رکوردهای غنی‌شده چرخه حیات
            const mapped: TradeLifecycleRecord[] = data.positions.map((p: any, idx: number) => {
              const symbol = p.symbol || 'XAUUSD';
              const direction = p.direction || 'BUY';
              const volumeLots = p.volumeLots || 0.05;
              const entryPrice = p.entryPrice || 2650;
              const exitPrice = p.exitPrice || entryPrice;
              const stopLoss = p.stopLossPrice || entryPrice - 5;
              const takeProfit = p.takeProfitPrice || entryPrice + 15;
              const grossPnl = p.realizedGrossPnL || 0;
              const commission = p.brokerCommission || 0.3;
              const netPnl = p.realizedNetPnL || grossPnl - commission;
              const plannedRisk = p.plannedRiskAmount || 20;
              const rMult = plannedRisk > 0 ? Number((netPnl / plannedRisk).toFixed(2)) : 0;

              const excursion = PostTradeAnalyticsEngine.calculateExcursionMetrics({
                symbol,
                direction,
                entryPrice,
                exitPrice,
                highestPriceDuringTrade: Math.max(entryPrice, exitPrice) + (symbol === 'XAUUSD' ? 1.0 : 0.001),
                lowestPriceDuringTrade: Math.min(entryPrice, exitPrice) - (symbol === 'XAUUSD' ? 0.5 : 0.0005),
                volumeLots,
              });

              return {
                tradeId: p.positionId || `TR-${idx + 100}`,
                intentId: p.intentId || `INT-${idx}`,
                correlationId: p.correlationId || `CORR-${idx}`,
                causationId: p.causationId || `CAUSE-${idx}`,
                brokerOrderId: p.brokerOrderId || 'CT-DEMO',
                symbol,
                direction,
                volumeLots,
                entryPrice,
                stopLossPrice: stopLoss,
                takeProfitPrice: takeProfit,
                exitPrice,
                openedAt: p.openedAt || Date.now() - 3600000,
                closedAt: p.closedAt || Date.now(),
                exitReason: p.exitReason || (grossPnl > 0 ? 'TP_HIT' : 'SL_HIT'),
                plannedRiskAmount: plannedRisk,
                realizedGrossPnL: grossPnl,
                brokerCommission: commission,
                slippagePips: 0.3,
                slippageCostDollar: 0.15,
                realizedNetPnL: netPnl,
                realizedRMultiple: rMult,
                maxAdverseExcursionPips: excursion.maePips,
                maxAdverseExcursionDollar: excursion.maeDollar,
                maxFavorableExcursionPips: excursion.mfePips,
                maxFavorableExcursionDollar: excursion.mfeDollar,
                exitEfficiencyPercent: excursion.exitEfficiencyPercent,
                setupGrade: rMult >= 2 ? 'A+' : rMult > 0 ? 'A' : 'B',
                traderNotesFa: p.notes || 'ثبت خودکار از سرور cTrader Demo',
              };
            });
            if (mapped.length > 0) {
              setTrades(mapped);
            }
          }
        }
      } catch {}
    };
    syncServerData();
    return () => {
      isMounted = false;
    };
  }, []);

  // فیلتر معاملات
  const filteredTrades = useMemo(() => {
    if (selectedFilterSymbol === 'ALL') return trades;
    return trades.filter(t => t.symbol === selectedFilterSymbol);
  }, [trades, selectedFilterSymbol]);

  // تفکیک آلفا و اصطکاک
  const alphaAttribution: AlphaFrictionAttribution = useMemo(() => {
    return PostTradeAnalyticsEngine.calculateAlphaAttribution(filteredTrades);
  }, [filteredTrades]);

  // شناسایی خطاهای رفتاری
  const behavioralBiases: BehavioralAuditFlag[] = useMemo(() => {
    return PostTradeAnalyticsEngine.auditBehavioralBiases(filteredTrades);
  }, [filteredTrades]);

  // کارنامه انضباط
  const disciplineScorecard: DisciplineScorecard = useMemo(() => {
    return PostTradeAnalyticsEngine.calculateDisciplineScorecard(filteredTrades, behavioralBiases);
  }, [filteredTrades, behavioralBiases]);

  // توزیع زمانی و نشست‌ها
  const timeDistribution: SessionTimeDistribution = useMemo(() => {
    return PostTradeAnalyticsEngine.calculateSessionDistribution(filteredTrades);
  }, [filteredTrades]);

  // اجرای آزمون‌های گیت پذیرش W5
  const handleRunAcceptanceTests = async () => {
    setIsRunningTests(true);
    try {
      const results = await runW5AcceptanceSuite();
      setTestResults(results);
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* سربرگ معرفی گیت W5 — طراحی متریال ۳ خلوت و آرامش‌بخش */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-sm transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                  ژورنال خودکار و ممیزی رفتار معاملاتی (گیت W5)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Gate W5 Live
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                تفکیک ریاضی آلفای ناخالص از اصطکاک بروکر، رادار خطاهای شناختی، کارنامه انضباط و تحلیل انحراف MAE/MFE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* انتخاب فیلتر نماد */}
            <div className="flex bg-slate-800/80 border border-slate-700/60 rounded-xl p-0.5 text-xs font-mono" dir="ltr">
              {(['ALL', 'XAUUSD', 'EURUSD'] as const).map(sym => (
                <button
                  key={sym}
                  onClick={() => setSelectedFilterSymbol(sym)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    selectedFilterSymbol === sym
                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            <button
              onClick={handleRunAcceptanceTests}
              disabled={isRunningTests}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-medium transition-all"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
              <span>ارزیابی آزمون‌های W5</span>
            </button>
          </div>
        </div>

        {/* منوی زیربخش‌های W5 — دکمه‌های متریال ۳ بدون شلوغی بصری */}
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs">
          <button
            onClick={() => setSubTab('ALPHA')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
              subTab === 'ALPHA'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-medium'
                : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>تفکیک آلفا و کارنامه انضباط</span>
          </button>

          <button
            onClick={() => setSubTab('BEHAVIORAL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
              subTab === 'BEHAVIORAL'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium'
                : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>رادار سوگیری‌های رفتاری</span>
            {behavioralBiases.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-300 text-[10px] flex items-center justify-center font-mono">
                {behavioralBiases.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('EXCURSION')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
              subTab === 'EXCURSION'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-medium'
                : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>دفترچه و ارزیابی MAE / MFE</span>
          </button>

          <button
            onClick={() => setSubTab('TIME')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
              subTab === 'TIME'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-medium'
                : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>ماتریس زمانی و نشست‌ها</span>
          </button>

          <button
            onClick={() => setSubTab('TESTS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
              subTab === 'TESTS'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-medium'
                : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>آزمون‌های گیت پذیرش ({testResults.length > 0 ? `${testResults.filter(t => t.passed).length}/${testResults.length}` : '۷'})</span>
          </button>
        </div>
      </div>

      {/* ۱. تب تفکیک آلفا و کارنامه انضباط */}
      {subTab === 'ALPHA' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* کارت کارت انضباط کلی */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">نمره انضباط روان‌شناختی</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                disciplineScorecard.grade === 'A+' || disciplineScorecard.grade === 'A'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                رتبه {disciplineScorecard.grade}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-emerald-400" dir="ltr">
                {disciplineScorecard.overallScore}
              </span>
              <span className="text-xs text-slate-500">از ۱۰۰ امتیاز</span>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>پایبندی به حجم و ریسک ۱٪</span>
                  <span className="font-mono text-slate-200" dir="ltr">{disciplineScorecard.riskSizingAdherencePercent}٪</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${disciplineScorecard.riskSizingAdherencePercent}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>شکیبایی و پرهیز از فومو</span>
                  <span className="font-mono text-slate-200" dir="ltr">{disciplineScorecard.patienceScorePercent}٪</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full"
                    style={{ width: `${disciplineScorecard.patienceScorePercent}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>ثبات حد ضرر و عدم بیش‌معامله‌گری</span>
                  <span className="font-mono text-slate-200" dir="ltr">{disciplineScorecard.stopLossAdherencePercent}٪</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${disciplineScorecard.stopLossAdherencePercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 font-medium">نقاط قوت تثبیت‌شده:</span>
              <ul className="mt-1.5 space-y-1 text-xs text-emerald-300">
                {disciplineScorecard.strengthsFa.map((st, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>{st}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* کارت تفکیک آلفای ناخالص و اصطکاک اجرای بروکر */}
          <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-300 font-medium">
                  تفکیک ریاضی بازدهی: آلفای خام در برابر اصطکاک بروکر (Friction Drag)
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono" dir="ltr">
                فرسایش سود: {alphaAttribution.frictionDragPercent}٪
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 text-[11px] block">آلفای ناخالص استراتژی</span>
                <span className="text-base font-bold font-mono text-emerald-400 mt-1 block" dir="ltr">
                  +${alphaAttribution.grossAlphaDollar}
                </span>
                <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                  {alphaAttribution.grossAlphaR > 0 ? `+${alphaAttribution.grossAlphaR}R` : '0R'}
                </span>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 text-[11px] block">کارمزد بروکر cTrader</span>
                <span className="text-base font-bold font-mono text-amber-400 mt-1 block" dir="ltr">
                  -${alphaAttribution.totalCommissionsDollar}
                </span>
                <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                  -{alphaAttribution.totalCommissionR.toFixed(2)}R
                </span>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 text-[11px] block">افت ناشی از لغزش (Slippage)</span>
                <span className="text-base font-bold font-mono text-rose-400 mt-1 block" dir="ltr">
                  -${alphaAttribution.totalSlippageDollar}
                </span>
                <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                  -{alphaAttribution.totalSlippageR.toFixed(2)}R
                </span>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-2.5">
                <span className="text-slate-400 text-[11px] block">سود خالص محقق‌شده</span>
                <span className="text-base font-bold font-mono text-cyan-300 mt-1 block" dir="ltr">
                  +${alphaAttribution.netRealizedProfitDollar}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono" dir="ltr">
                  +{alphaAttribution.netRealizedR}R
                </span>
              </div>
            </div>

            {/* نوار توزیع اصطکاک */}
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <div className="flex justify-between text-[11px] text-slate-400 mb-1.5">
                <span>تسهیم ارزش دلاری سفارشات</span>
                <span dir="ltr" className="font-mono text-slate-300">
                  خالص: {((alphaAttribution.netRealizedProfitDollar / Math.max(1, alphaAttribution.grossAlphaDollar)) * 100).toFixed(1)}٪ | کارمزد و اسلیپیج: {alphaAttribution.frictionDragPercent}٪
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full flex overflow-hidden">
                <div
                  className="bg-emerald-500 h-full"
                  style={{
                    width: `${Math.max(
                      0,
                      100 - alphaAttribution.frictionDragPercent
                    )}%`,
                  }}
                  title="سود خالص"
                />
                <div
                  className="bg-amber-500 h-full"
                  style={{
                    width: `${Math.min(
                      50,
                      (alphaAttribution.totalCommissionsDollar / Math.max(1, alphaAttribution.grossAlphaDollar)) * 100
                    )}%`,
                  }}
                  title="کارمزد"
                />
                <div
                  className="bg-rose-500 h-full"
                  style={{
                    width: `${Math.min(
                      50,
                      (alphaAttribution.totalSlippageDollar / Math.max(1, alphaAttribution.grossAlphaDollar)) * 100
                    )}%`,
                  }}
                  title="لغزش نرخ"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                معماری گیت W5 با اجرای سفارش‌های لیمیت و بافر اسپرد، اصطکاک اجرای معاملات را در سطح بهینه ۱ تا ۲ درصدی کنترل کرده و از فرسایش لبه آماری (Edge) جلوگیری می‌کند.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ۲. تب رادار سوگیری‌های رفتاری */}
      {subTab === 'BEHAVIORAL' && (
        <div className="space-y-4">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                سیستم پایش هوشمند خطاهای شناختی و روان‌شناسی معامله‌گر
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              این سیستم با بررسی مداوم زمان‌بندی سفارشات، تغییرات فاصله از FVG، واکنش‌ها پس از زیان و حجم‌گیری‌ها، خطاهای رفتاری نظیر معامله انتقامی و فومو را به‌صورت قطعی کشف می‌کند.
            </p>
          </div>

          {behavioralBiases.length === 0 ? (
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-emerald-300">عدم مشاهده هیچ‌گونه خطای رفتاری فعال</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                هیچ الگویی از معامله انتقامی (Revenge Trading)، بیش‌معامله‌گری (Overtrading) یا تعقیب قیمت (FOMO) در تاریخچه معاملات فعال شناسایی نشد.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {behavioralBiases.map(bias => (
                <div
                  key={bias.id}
                  className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 space-y-2 hover:border-amber-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      {bias.titleFa}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {bias.severity}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {bias.descriptionFa}
                  </p>

                  <div className="bg-slate-800/60 rounded-xl p-2.5 text-[11px] space-y-1">
                    <div className="text-slate-400">
                      <span className="text-slate-500">جزییات سنجه:</span> {bias.metricDetails}
                    </div>
                    <div className="text-emerald-300">
                      {bias.coolingAdviceFa}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ۳. تب دفترچه معاملات و ارزیابی MAE / MFE */}
      {subTab === 'EXCURSION' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                تاریخچه معاملات، انحراف نامطلوب (MAE)، مطلوب (MFE) و نسبت بهره‌وری
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              تعداد: {filteredTrades.length} معامله
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="py-2 px-2 text-right">معامله / نماد</th>
                  <th className="py-2 px-2 text-right">جهت / حجم</th>
                  <th className="py-2 px-2 text-right">ورود / خروج</th>
                  <th className="py-2 px-2 text-right">MAE (زیان موقت)</th>
                  <th className="py-2 px-2 text-right">MFE (سود موقت)</th>
                  <th className="py-2 px-2 text-right">بهره‌وری خروج</th>
                  <th className="py-2 px-2 text-right">سود خالص</th>
                  <th className="py-2 px-2 text-center">جزییات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredTrades.map(trade => {
                  const isExpanded = expandedTradeId === trade.tradeId;
                  const isProfit = trade.realizedNetPnL > 0;

                  return (
                    <React.Fragment key={trade.tradeId}>
                      <tr className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-2 font-mono">
                          <div className="font-semibold text-slate-100">{trade.symbol}</div>
                          <div className="text-[10px] text-slate-500">{trade.tradeId}</div>
                        </td>
                        <td className="py-2.5 px-2 font-mono">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            trade.direction === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}>
                            {trade.direction}
                          </span>
                          <span className="text-slate-400 text-[11px] mr-1.5">{trade.volumeLots} lot</span>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px]" dir="ltr">
                          <div>E: {trade.entryPrice}</div>
                          <div className="text-slate-400">X: {trade.exitPrice}</div>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-rose-400 text-[11px]" dir="ltr">
                          {trade.maxAdverseExcursionPips}p (${trade.maxAdverseExcursionDollar})
                        </td>
                        <td className="py-2.5 px-2 font-mono text-emerald-400 text-[11px]" dir="ltr">
                          {trade.maxFavorableExcursionPips}p (${trade.maxFavorableExcursionDollar})
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px]" dir="ltr">
                          <span className={`px-1.5 py-0.5 rounded ${
                            trade.exitEfficiencyPercent >= 70
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : trade.exitEfficiencyPercent >= 40
                              ? 'bg-amber-500/10 text-amber-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {trade.exitEfficiencyPercent}٪
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-mono font-bold" dir="ltr">
                          <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                            {isProfit ? `+${trade.realizedNetPnL}` : trade.realizedNetPnL}$
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {trade.realizedRMultiple > 0 ? `+${trade.realizedRMultiple}R` : `${trade.realizedRMultiple}R`}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => setExpandedTradeId(isExpanded ? null : trade.tradeId)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* سطر بازشونده جزییات معامله */}
                      {isExpanded && (
                        <tr className="bg-slate-800/20">
                          <td colSpan={8} className="p-3 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800 space-y-1">
                                <span className="text-slate-400 text-[11px] block">مشخصات سفارش بروکر:</span>
                                <div className="text-slate-300 font-mono text-[11px]" dir="ltr">
                                  Broker ID: {trade.brokerOrderId || 'N/A'}
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  علت خروج: <span className="text-emerald-400 font-mono">{trade.exitReason}</span>
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  کارمزد بروکر: <span className="text-amber-300 font-mono">${trade.brokerCommission}</span>
                                </div>
                              </div>

                              <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800 space-y-1">
                                <span className="text-slate-400 text-[11px] block">کیفیت اجرا و لغزش:</span>
                                <div className="text-slate-300 text-[11px]">
                                  لغزش نرخ ورود: <span className="font-mono text-cyan-300">{trade.slippagePips} پیپ</span>
                                </div>
                                <div className="text-slate-300 text-[11px]">
                                  رتبه کیفیت ستاپ: <span className="font-mono text-emerald-400 font-bold">{trade.setupGrade || 'A'}</span>
                                </div>
                              </div>

                              <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800 space-y-1">
                                <span className="text-slate-400 text-[11px] block">یادداشت فنی تحلیل‌گر:</span>
                                <p className="text-slate-300 text-[11px] leading-relaxed">
                                  {trade.traderNotesFa || 'یادداشتی ثبت نشده است.'}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ۴. تب ماتریس زمانی و نشست‌ها */}
      {subTab === 'TIME' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-slate-200">توزیع عملکرد ساعتی (UTC)</h3>
              </div>
              <div className="space-y-2">
                {timeDistribution.hourlyEdge.map(h => (
                  <div key={h.hourUtc} className="flex items-center justify-between text-xs p-2 bg-slate-800/40 rounded-xl">
                    <span className="font-mono text-slate-300" dir="ltr">
                      {h.hourUtc.toString().padStart(2, '0')}:00 UTC
                    </span>
                    <span className="text-slate-400">{h.tradesCount} معامله</span>
                    <span className="font-mono text-slate-300" dir="ltr">وین‌ریت: {h.winRatePercent}٪</span>
                    <span className={`font-mono font-semibold ${h.netProfitDollar >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
                      {h.netProfitDollar >= 0 ? `+${h.netProfitDollar}$` : `${h.netProfitDollar}$`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-200">پنجره‌های بهینه معاملاتی</h3>
              </div>
              <div className="space-y-3 text-xs">
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3">
                  <span className="text-[11px] text-emerald-400 font-medium block">بهترین پنجره زمانی:</span>
                  <p className="text-slate-200 mt-1">{timeDistribution.bestTradingWindowFa}</p>
                </div>
                <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3">
                  <span className="text-[11px] text-rose-400 font-medium block">پنجره نامطلوب جهت پرهیز:</span>
                  <p className="text-slate-200 mt-1">{timeDistribution.worstTradingWindowFa}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ۵. تب آزمون‌های گیت پذیرش W5 */}
      {subTab === 'TESTS' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                نتایج آزمون‌های پذیرش گیت W5 (W5 Acceptance Test Suite)
              </h3>
            </div>
            <button
              onClick={handleRunAcceptanceTests}
              disabled={isRunningTests}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/40 text-xs font-medium transition-all"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
              <span>اجرای مجدد آزمون‌ها</span>
            </button>
          </div>

          {testResults.length === 0 ? (
            <div className="bg-slate-800/30 rounded-xl p-6 text-center text-xs text-slate-400">
              جهت مشاهده وضعیت ۷ آزمون قطعی گیت W5، دکمه «ارزیابی آزمون‌های W5» را بفشارید.
            </div>
          ) : (
            <div className="space-y-2">
              {testResults.map(t => (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-all ${
                    t.passed
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {t.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-200">
                        [{t.id}] {t.nameFa}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t.details}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-center font-mono text-[11px] text-slate-400" dir="ltr">
                    <span>{t.executionMs} ms</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      t.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {t.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
