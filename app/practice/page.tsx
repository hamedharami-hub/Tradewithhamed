'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { DataProvenance } from '@/lib/contracts/provenance';
import { ReplayEngine, ReplayState } from '@/lib/replay/replay-engine';
import { SimulatedBroker } from '@/lib/core/simulated-broker';
import { calculateDeterministicRisk } from '@/lib/core/risk-calculator';
import { PositionScalingEngine } from '@/lib/core/position-scaling-engine';
import { PartialTPConfig, DEFAULT_PARTIAL_TP_CONFIG } from '@/lib/contracts/tactical-cockpit';
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
  Percent,
  Sliders,
  PowerOff,
  HelpCircle,
} from 'lucide-react';

const practiceBroker = new SimulatedBroker(10000);
const practiceReplay = new ReplayEngine('XAUUSD', practiceBroker);

export default function PracticePage() {
  const [symbol, setSymbol] = useState<SymbolId>('XAUUSD');
  const [replayState, setReplayState] = useState<ReplayState>(practiceReplay.getSnapshot());
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(1000);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'SIMPLE' | 'ADVANCED'>('SIMPLE');

  // متغیرهای ریسک و تنظیمات معامله
  const [selectedRiskPercent, setSelectedRiskPercent] = useState<number>(0.25);
  const [isFreezeNewEntries, setIsFreezeNewEntries] = useState(false);
  const [isCouncilModalOpen, setIsCouncilModalOpen] = useState(false);
  const [multiAgentConfig, setMultiAgentConfig] = useState<MultiAgentConfiguration>(() =>
    MultiAgentOrchestrator.loadConfiguration()
  );

  const [initialTime] = useState(() => Date.now());

  const provenance: DataProvenance = useMemo(() => ({
    originType: 'SAMPLE_FIXTURE',
    originLabelFa: 'نمونه آزمایشی داخلی (Fixtures)',
    datasetId: `fixture-${symbol.toLowerCase()}-5m`,
    symbol,
    timeframe: '5M',
    timezone: 'UTC',
    lastReceivedAt: initialTime,
    freshnessStatus: 'FRESH',
    stalenessThresholdMs: 300_000,
    isVerifiedRealData: false,
    notesFa: 'محیط تمرین کاملاً آفلاین؛ داده‌ها و معاملات فقط در حافظه موقت مرورگر نگهداری می‌شوند.',
  }), [symbol, initialTime]);

  // کنترل بازپخش کندل‌ها
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setReplayState(prev => {
        if (prev.currentStepIndex >= prev.totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return { ...practiceReplay.stepForward() };
      });
    }, speedMs);
    return () => clearInterval(timer);
  }, [isPlaying, speedMs]);

  const handleSymbolChange = (newSymbol: SymbolId) => {
    setSymbol(newSymbol);
    practiceReplay.setSymbol(newSymbol);
    setReplayState({ ...practiceReplay.getSnapshot() });
  };

  const handleStepForward = () => {
    const next = practiceReplay.stepForward();
    setReplayState({ ...next });
  };

  const handleResetReplay = () => {
    setIsPlaying(false);
    const next = practiceReplay.reset();
    setReplayState({ ...next });
  };

  const brokerState = practiceBroker.getState();
  const lastCandle = replayState.visibleCandles[replayState.visibleCandles.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : symbol === 'XAUUSD' ? 2650 : 1.085;
  const currentAtr = symbol === 'XAUUSD' ? 2.5 : 0.0015;

  const macroLevels: MultiTimeframeLevel[] = useMemo(() => {
    if (!replayState.visibleCandles || replayState.visibleCandles.length === 0) return [];
    return TimeframeResampler.extractMultiTimeframeLevels(replayState.visibleCandles, symbol);
  }, [replayState.visibleCandles, symbol]);

  // محاسبه پیش‌نمایش کنترل ریسک قطعی
  const riskPreview = useMemo(() => {
    const slDist = currentAtr * 1.2;
    const tpDist = slDist * 2.0;
    const dec = symbol === 'XAUUSD' ? 2 : 5;
    return calculateDeterministicRisk({
      symbol,
      direction: 'BUY',
      entryPrice: currentPrice,
      stopLossPrice: Number((currentPrice - slDist).toFixed(dec)),
      takeProfitPrice: Number((currentPrice + tpDist).toFixed(dec)),
      accountEquity: brokerState.accountEquity,
      riskPercentage: selectedRiskPercent,
    });
  }, [symbol, currentPrice, currentAtr, brokerState.accountEquity, selectedRiskPercent]);

  // ارزیابی شورا در حالت پیشرفته (صرفاً امتیاز انطباق با قوانین، نه احتمال برد)
  const councilResult = useMemo(() => {
    return MultiAgentOrchestrator.evaluateCandidate(replayState.activeCandidate, multiAgentConfig, {
      environment: 'PRACTICE',
      dataProvenance: provenance.originLabelFa,
    });
  }, [replayState.activeCandidate, multiAgentConfig, provenance.originLabelFa]);

  // ثبت معامله تمرینی خرید یا فروش
  const handleExecuteTrade = (direction: 'BUY' | 'SELL') => {
    if (isFreezeNewEntries) {
      setExecutionMessage('خطا: ثبت ورودهای جدید متوقف است. برای ثبت معامله، ابتدا حالت توقف را غیرفعال کنید.');
      return;
    }

    try {
      const slDist = currentAtr * 1.2;
      const tpDist = slDist * 2.0;
      const dec = symbol === 'XAUUSD' ? 2 : 5;

      const entry = currentPrice;
      const sl = direction === 'BUY' ? Number((entry - slDist).toFixed(dec)) : Number((entry + slDist).toFixed(dec));
      const tp = direction === 'BUY' ? Number((entry + tpDist).toFixed(dec)) : Number((entry - tpDist).toFixed(dec));
      const lots = riskPreview.adjustedVolumeLots || 0.01;

      const { position } = practiceBroker.createMarketBracketOrder(
        symbol,
        direction,
        lots,
        entry,
        sl,
        tp
      );

      setExecutionMessage(
        `معامله تمرینی ${direction === 'BUY' ? 'خرید' : 'فروش'} با حجم ${lots} لات در قیمت ${entry} در حساب مجازی ثبت شد (شناسه: ${position.id}).`
      );

      setReplayState({ ...practiceReplay.getSnapshot() });
    } catch (err) {
      setExecutionMessage(`خطا: ${(err as Error).message}`);
    }
  };

  // ۱. توقف ورودهای جدید (Freeze New Entries)
  const handleToggleFreeze = () => {
    setIsFreezeNewEntries(!isFreezeNewEntries);
    setExecutionMessage(
      !isFreezeNewEntries
        ? 'حالت «توقف سفارش جدید» فعال شد: پوزیشن‌های باز جاری حفظ می‌شوند، اما ورود جدید مجاز نیست.'
        : 'حالت «توقف سفارش جدید» غیرفعال شد: امکان ورود معامله تمرینی مجدداً فراهم است.'
    );
  };

  // ۲. بستن فوری کلیه پوزیشن‌ها (Panic Liquidate)
  const handleCloseAllPositions = () => {
    const openCount = brokerState.positions.filter(p => p.isOpen).length;
    if (openCount === 0) {
      setExecutionMessage('هیچ پوزیشن بازی برای بستن وجود ندارد.');
      return;
    }
    if (!confirm(`آیا از بستن فوری تمامی ${openCount} پوزیشن باز در قیمت جاری اطمینان دارید؟`)) return;

    PositionScalingEngine.triggerPanicKillSwitch(practiceBroker, 'MANUAL_PANIC');
    setExecutionMessage(`تمام ${openCount} پوزیشن باز با کلید خروج اضطراری بسته شدند.`);
    setReplayState({ ...practiceReplay.getSnapshot() });
  };

  const openPositions = brokerState.positions.filter(p => p.isOpen);
  const closedPositions = brokerState.positions.filter(p => !p.isOpen);

  return (
    <main className="min-h-screen bg-[#0a0d14] text-zinc-100 flex flex-col font-sans select-none" dir="rtl">
      <EnvironmentNavBar
        currentEnv="PRACTICE"
        provenance={provenance}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      <div className="flex-1 p-3 sm:p-5 max-w-[1920px] w-full mx-auto space-y-4">
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
          {/* انتخاب نماد */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">نماد معامله:</span>
            {(['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'] as SymbolId[]).map(s => (
              <button
                key={s}
                onClick={() => handleSymbolChange(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  symbol === s
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
              onClick={handleResetReplay}
              className="p-2 rounded-xl bg-[#181f30] hover:bg-[#222a40] text-zinc-300 transition-all border border-[#28324a]"
              title="شروع مجدد ریپلی از ابتدا"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="text-xs text-zinc-400 font-mono bg-[#141926] px-3 py-1.5 rounded-xl border border-[#202738]">
              کندل {replayState.currentStepIndex + 1} از {replayState.totalSteps}
            </div>
          </div>
        </div>

        {/* چارت و داک معامله */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-[#0e121c] border border-[#1b2234] rounded-2xl p-3 overflow-hidden shadow-lg">
            <ChartCanvas
              candles={replayState.visibleCandles}
              symbol={symbol}
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
                <span className="text-xs font-bold text-cyan-400 font-mono">{selectedRiskPercent}%</span>
              </div>
              <div className="flex items-center gap-1">
                {[0.1, 0.15, 0.2, 0.25].map(r => (
                  <button
                    key={r}
                    onClick={() => setSelectedRiskPercent(r)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                      selectedRiskPercent === r
                        ? 'bg-cyan-500 text-black'
                        : 'bg-[#1b2234] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mr-auto">
                حجم محاسبه‌شده: {riskPreview.adjustedVolumeLots} Lot
              </span>
            </div>

            {/* دکمه‌های کنش‌محور خرید و فروش */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExecuteTrade('BUY')}
                disabled={isFreezeNewEntries}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <TrendingUp className="w-4 h-4" />
                <span>ثبت معاملهٔ تمرینی خرید (BUY)</span>
              </button>

              <button
                onClick={() => handleExecuteTrade('SELL')}
                disabled={isFreezeNewEntries}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <TrendingDown className="w-4 h-4" />
                <span>ثبت معاملهٔ تمرینی فروش (SELL)</span>
              </button>
            </div>

            {/* دو اقدام اضطراری مجزا و مشخص */}
            <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-r border-[#20293d] pt-2 sm:pt-0 sm:pr-3">
              <button
                onClick={handleToggleFreeze}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  isFreezeNewEntries
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-[#181f30] text-zinc-400 hover:text-zinc-200 border-[#28324a]'
                }`}
                title="پوزیشن‌های موجود باز می‌مانند، اما ورود جدید متوقف می‌شود"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>{isFreezeNewEntries ? 'ورودها متوقف است' : 'توقف سفارش جدید'}</span>
              </button>

              <button
                onClick={handleCloseAllPositions}
                disabled={openPositions.length === 0}
                className="px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-40 text-rose-300 text-xs font-bold flex items-center gap-1.5 border border-rose-800 transition-all"
                title="بستن فوری تمامی معاملات باز در قیمت جاری"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>بستن فوری همه معاملات</span>
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
                  پوزیشن‌های جاری در حافظه شبیه‌ساز محلی
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

        {/* دفتر معاملات و بررسی عملکرد (W5 سابق) */}
        <div className="bg-[#101420] border border-[#1d2436] rounded-2xl p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-[#1b2234] pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-200">دفتر معاملات و بررسی عملکرد</h2>
              <span className="text-[10px] text-zinc-500">(فقط معاملات ثبت‌شده در این نشست تمرینی)</span>
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
                با دکمه‌های «ثبت معاملهٔ تمرینی خرید یا فروش» در داک بالا معامله باز کنید. پس از برخورد با حد سود (TP) یا حد ضرر (SL)، سوابق و تحلیل خروج در این جدول نمایش می‌یابد.
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
                    <th className="py-2 px-3">قیمت خروج</th>
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
                      <td className="py-2 px-3">{p.currentPrice}</td>
                      <td className="py-2 px-3 text-rose-400">{p.stopLoss}</td>
                      <td className="py-2 px-3 text-emerald-400">{p.takeProfit}</td>
                      <td className={`py-2 px-3 font-bold ${p.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${p.realizedPnl}
                      </td>
                      <td className="py-2 px-3 font-sans text-[11px] text-zinc-400">
                        {p.closeReason === 'TP' ? 'تارگت سود (TP)' : p.closeReason === 'SL' ? 'حد ضرر (SL)' : 'خروج دستی'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
