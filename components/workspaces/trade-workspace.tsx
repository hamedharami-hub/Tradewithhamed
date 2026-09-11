// components/workspaces/trade-workspace.tsx
// میز معامله پیشرفته ذن مینیمالیست (Zen Minimalist Trading Terminal)
// چارت عریض مسلط (Hero Chart) + کشوی شیشه‌ای هوش مصنوعی (Slide-over Drawer) + داک اجرای شناور

'use client';

import React, { useState, useEffect } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { ReplayState } from '@/lib/replay/replay-engine';
import { RiskPreviewResult } from '@/lib/contracts/risk';
import { TradingStyleType } from '@/lib/contracts/regimes';
import { SymbolReplayToolbar } from '@/components/trading/symbol-replay-toolbar';
import { InstantExecutionPad } from '@/components/trading/instant-execution-pad';
import { ChartCanvas } from '@/components/trading/chart-canvas';
import { SetupAnalysisCard } from '@/components/trading/setup-analysis-card';
import { MultiTimeframeSyncView } from '@/components/trading/multi-timeframe-sync-view';
import { MultiTimeframeLevel, PercentileStepPoint } from '@/lib/contracts/monte-carlo';
import { PartialTPConfig } from '@/lib/contracts/tactical-cockpit';
import { LiveMicrostructureTicker } from '@/components/trading/live-microstructure-ticker';
import { ShareableTradeCardModal } from '@/components/trading/shareable-trade-card-modal';
import {
  Sparkles,
  Bot,
  X,
  Eye,
  EyeOff,
  Layers,
  BarChart2,
  ChevronLeft,
  FlaskConical,
} from 'lucide-react';

interface TradeWorkspaceProps {
  symbol: SymbolId;
  onSymbolChange: (s: SymbolId) => void;
  replayState: ReplayState;
  onStepForward: () => void;
  onResetReplay: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speedMs: number;
  onChangeSpeed: (speed: number) => void;
  sessionSeconds: number;
  isSessionActive: boolean;
  onToggleSession: () => void;
  accountEquity: number;
  openPositionsCount: number;
  riskPreview?: RiskPreviewResult | null;
  shadowAnalysis: any;
  multiAgentResult: any;
  isBlocked: boolean;
  onExecuteInstantOrder: (
    direction: 'BUY' | 'SELL',
    riskPercent: number,
    useCandidateLevels: boolean,
    partialConfig: PartialTPConfig,
    meta?: { mood?: string; propFirmId?: string }
  ) => void;
  onPanicKillSwitch: () => void;
  onOpenOrderModal: () => void;
  onOpenAIModal: () => void;
  onOpenMultiAgentModal: () => void;
  onOpenExportModal: () => void;
  activeModelNameFa?: string;
  activeTradingStyleBadgeFa?: string;
  onChangeStyleFilter?: (filter: TradingStyleType | 'ALL') => void;
  syncedCrosshairPrice: number | null;
  setSyncedCrosshairPrice: (price: number | null) => void;
  macroLevels: MultiTimeframeLevel[];
  forwardMonteCarloCone?: PercentileStepPoint[];
  onOpenMonteCarlo: () => void;
  onOpenBacktest: () => void;
  onOpenAlerts: () => void;
  unreadAlertsCount: number;
  viewMode?: 'auto' | 'mobile' | 'windows';
  dailyDrawdownPercent?: number;
  consecutiveLossCount?: number;
}

export const TradeWorkspace: React.FC<TradeWorkspaceProps> = ({
  symbol,
  onSymbolChange,
  replayState,
  onStepForward,
  onResetReplay,
  isPlaying,
  onTogglePlay,
  speedMs,
  onChangeSpeed,
  sessionSeconds,
  isSessionActive,
  onToggleSession,
  accountEquity,
  openPositionsCount,
  riskPreview,
  shadowAnalysis,
  multiAgentResult,
  isBlocked,
  onExecuteInstantOrder,
  onPanicKillSwitch,
  onOpenOrderModal,
  onOpenAIModal,
  onOpenMultiAgentModal,
  onOpenExportModal,
  activeModelNameFa,
  activeTradingStyleBadgeFa,
  onChangeStyleFilter,
  syncedCrosshairPrice,
  setSyncedCrosshairPrice,
  macroLevels,
  forwardMonteCarloCone = [],
  onOpenMonteCarlo,
  onOpenBacktest,
  onOpenAlerts,
  unreadAlertsCount,
  viewMode = 'auto',
  dailyDrawdownPercent = 0,
  consecutiveLossCount = 0,
}) => {
  const currentCandle = replayState.visibleCandles[replayState.visibleCandles.length - 1];
  const currentPrice =
    currentCandle?.close ||
    (symbol === 'XAUUSD' ? 2050 : 1.085);
  const currentTimestamp = currentCandle?.timestamp || 0;

  const [isTradeCardModalOpen, setIsTradeCardModalOpen] = useState(false);
  const [isAIDrawerOpen, setIsAIDrawerOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);

  const currentAtr = symbol === 'XAUUSD' ? 2.5 : 0.0015;

  const macroTrend =
    replayState.marketRegime?.regime === 'TRENDING_BULLISH'
      ? 'BULLISH'
      : replayState.marketRegime?.regime === 'TRENDING_BEARISH'
      ? 'BEARISH'
      : 'RANGING';

  // کلید میانبر Esc برای بستن کشوی هوش مصنوعی یا حالت ذن
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAIDrawerOpen) setIsAIDrawerOpen(false);
        if (isZenMode) setIsZenMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAIDrawerOpen, isZenMode]);

  return (
    <div className="relative w-full space-y-3 font-sans" dir="rtl">
      {/* ردیف کنترل‌های بالای چارت (در حالت ذن برای خلوتی کامل پنهان می‌شوند) */}
      {!isZenMode && (
        <div className="space-y-2">
          {/* نوار تک‌سطری ریپلی، نمادها و نشست */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <SymbolReplayToolbar
                symbol={symbol}
                onSymbolChange={onSymbolChange}
                isSessionActive={isSessionActive}
                onToggleSession={onToggleSession}
                sessionSeconds={sessionSeconds}
                currentStepIndex={replayState.currentStepIndex}
                totalSteps={replayState.totalSteps}
                isPlaying={isPlaying}
                onTogglePlay={onTogglePlay}
                speedMs={speedMs}
                onChangeSpeed={onChangeSpeed}
                onStepForward={onStepForward}
                onReset={onResetReplay}
                onOpenExportModal={onOpenExportModal}
                onOpenAIModal={onOpenAIModal}
                onOpenMultiAgentModal={onOpenMultiAgentModal}
                onOpenBacktest={onOpenBacktest}
                activeModelNameFa={activeModelNameFa}
                activeTradingStyleBadgeFa={activeTradingStyleBadgeFa}
                activeStyleFilter={replayState.activeStyleFilter}
                onChangeStyleFilter={onChangeStyleFilter}
              />
            </div>

            {/* دکمه‌های کنترل سریع: کشوی هوش مصنوعی، آزمایشگاه بک‌تست و حالت ذن */}
            <div className="flex items-center gap-1.5 shrink-0 justify-end">
              {/* دکمه ورود به آزمایشگاه جامع بک‌تست */}
              <button
                type="button"
                onClick={onOpenBacktest}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all shadow-xs bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300"
                title="آزمایشگاه جامع بک‌تست استراتژی‌های معاملاتی و شبیه‌سازی"
              >
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                <span>آزمایشگاه بک‌تست 🧪</span>
              </button>

              {/* دکمه کشوی ستاپ و هوش مصنوعی */}
              <button
                type="button"
                onClick={() => setIsAIDrawerOpen(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all shadow-xs ${
                  replayState.activeCandidate
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 animate-pulse'
                    : 'bg-[#121622] hover:bg-[#1a2030] border-[#222a3d] text-cyan-400'
                }`}
                title="مشاهده ستاپ و تحلیل هوش مصنوعی"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {replayState.activeCandidate ? 'ستاپ فعال هوش مصنوعی' : 'تحلیل ستاپ و هوش مصنوعی'}
                </span>
                {replayState.activeCandidate && (
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                )}
              </button>

              {/* کلید حالت تمرکز ذن (Zen Mode) */}
              <button
                type="button"
                onClick={() => setIsZenMode(true)}
                className="p-2 rounded-xl bg-[#121622] hover:bg-[#1a2030] border border-[#222a3d] text-zinc-400 hover:text-zinc-100 transition-colors"
                title="حالت تمرکز ذن (پنهان‌سازی همه ابزارها برای خلوتی ذهن)"
                aria-label="حالت تمرکز ذن"
              >
                <Eye className="w-4 h-4 text-emerald-400" />
              </button>
            </div>
          </div>

          {/* نوار وضعیت ریزساختار تک‌سطری و آرامش‌بخش */}
          <LiveMicrostructureTicker
            symbol={symbol}
            currentTimestamp={currentTimestamp}
            currentPrice={currentPrice}
            dailyDrawdownPercent={dailyDrawdownPercent}
            consecutiveLossCount={consecutiveLossCount}
          />
        </div>
      )}

      {/* نشانگر حالت ذن و کلید خروج */}
      {isZenMode && (
        <div className="flex items-center justify-between bg-[#10141f]/90 border border-[#21293c] px-3 py-1.5 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-emerald-400">
            <EyeOff className="w-4 h-4" />
            <span className="font-bold">حالت تمرکز ذن فعال است</span>
            <span className="text-[10px] text-zinc-400 hidden sm:inline">(فضای خالص برای تحلیل بدون اغتشاش ذهنی)</span>
          </div>
          <button
            type="button"
            onClick={() => setIsZenMode(false)}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-bold transition-colors"
          >
            خروج از حالت ذن (Esc)
          </button>
        </div>
      )}

      {/* چارت اصلی و حاکم بر صفحه (Hero Main Chart) - بدون هیچ ستون جانبی مزاحم */}
      <div className="w-full relative rounded-2xl overflow-hidden shadow-lg border border-[#1e2536]">
        <ChartCanvas
          symbol={symbol}
          candles={replayState.visibleCandles}
          activeCandidate={replayState.activeCandidate}
          multiTimeframeLevels={macroLevels}
          monteCarloCone={forwardMonteCarloCone}
          isCrosshairSynced={true}
          crosshairPrice={syncedCrosshairPrice}
          onCrosshairChange={(price) => setSyncedCrosshairPrice(price)}
          onOpenBacktest={onOpenBacktest}
        />

        {/* داک اجرای سریع ۱-کلیکی شناور در پایین چارت */}
        <div className="mt-3">
          <InstantExecutionPad
            symbol={symbol}
            currentPrice={currentPrice}
            currentAtr={currentAtr}
            accountEquity={accountEquity}
            activeCandidate={replayState.activeCandidate}
            onExecuteInstantOrder={onExecuteInstantOrder}
            onPanicKillSwitch={onPanicKillSwitch}
            openPositionsCount={openPositionsCount}
          />
        </div>
      </div>

      {/* کشوی شیشه‌ای روان برای تحلیل ستاپ و هوش مصنوعی (Slide-Over Drawer) */}
      {isAIDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl">
          {/* پس‌زمینه نیمه‌شفاف برای فوکوس کامل */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsAIDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md sm:max-w-lg bg-[#0e121b]/95 backdrop-blur-xl border-l border-[#222a3d] shadow-2xl flex flex-col">
              {/* سربرگ کشو */}
              <div className="p-4 border-b border-[#202738] flex items-center justify-between bg-[#121624]">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">
                      مرکز تحلیل ستاپ و هوش مصنوعی
                    </h3>
                    <p className="text-[10px] text-zinc-400">
                      شورای ۴ ایجنت، تحلیل سایه عصبی و مدیریت ریسک
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAIDrawerOpen(false)}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-[#1d2436] transition-colors"
                  aria-label="بستن کشو"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* بدنه کشو با اسکرول روان */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* کارت جامع ستاپ و شورای هوش مصنوعی */}
                <SetupAnalysisCard
                  candidate={replayState.activeCandidate}
                  riskPreview={riskPreview ?? null}
                  shadowAnalysis={shadowAnalysis}
                  multiAgentResult={multiAgentResult}
                  isBlocked={isBlocked}
                  onOpenOrderModal={onOpenOrderModal}
                  onOpenAIModal={onOpenAIModal}
                  onOpenMultiAgentModal={onOpenMultiAgentModal}
                  onOpenShareCard={() => setIsTradeCardModalOpen(true)}
                />

                {/* دیدبان سطوح چندتایم‌فریمه و لانچرهای مونت‌کارلو و بک‌تست */}
                <div className="pt-2 border-t border-[#1e2536]">
                  <MultiTimeframeSyncView
                    symbol={symbol}
                    currentPrice={currentPrice}
                    macroTrend={macroTrend}
                    macroLevels={macroLevels}
                    onOpenMonteCarlo={onOpenMonteCarlo}
                    onOpenBacktest={onOpenBacktest}
                    onOpenAlerts={onOpenAlerts}
                    unreadAlertsCount={unreadAlertsCount}
                  />
                </div>
              </div>

              {/* پاورقی کشو */}
              <div className="p-3 border-t border-[#202738] bg-[#121624] flex items-center justify-between text-[11px] text-zinc-400">
                <span>Tradewithhamed AI Engine v4.0</span>
                <button
                  type="button"
                  onClick={() => setIsAIDrawerOpen(false)}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium"
                >
                  بستن پنل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال تولید پوستر گرافیکی معامله */}
      <ShareableTradeCardModal
        isOpen={isTradeCardModalOpen}
        onClose={() => setIsTradeCardModalOpen(false)}
        data={
          replayState.activeCandidate
            ? {
                symbol: replayState.activeCandidate.symbol,
                direction: replayState.activeCandidate.direction,
                entryPrice: replayState.activeCandidate.entryPrice,
                stopLossPrice: replayState.activeCandidate.stopLossPrice,
                takeProfitPrice: replayState.activeCandidate.takeProfitPrice,
                volumeLots: riskPreview?.adjustedVolumeLots ?? 0.05,
                realizedRMultiple: riskPreview?.netRiskRewardRatio ?? 2.5,
                realizedNetPnL: (riskPreview?.plannedRiskAmount ?? 100) * (riskPreview?.netRiskRewardRatio ?? 2.5),
                setupGrade: 'A+',
                isCandidate: true,
                psychologyMood: 'PLAN_DISCIPLINED',
                propFirmId: 'FTMO_100K',
                openedAt: replayState.activeCandidate.createdAtTimestamp,
              }
            : {
                symbol,
                direction: 'BUY',
                entryPrice: currentPrice,
                stopLossPrice: currentPrice - (symbol === 'XAUUSD' ? 5 : 0.003),
                takeProfitPrice: currentPrice + (symbol === 'XAUUSD' ? 12 : 0.0075),
                volumeLots: 0.05,
                realizedRMultiple: 2.4,
                realizedNetPnL: 240,
                setupGrade: 'A',
                isCandidate: true,
                psychologyMood: 'PLAN_DISCIPLINED',
                propFirmId: 'FTMO_100K',
                openedAt: currentTimestamp,
              }
        }
      />
    </div>
  );
};
