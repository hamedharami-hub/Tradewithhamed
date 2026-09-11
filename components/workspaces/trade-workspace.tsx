'use client';

import React, { useState } from 'react';
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

  const currentAtr = symbol === 'XAUUSD' ? 2.5 : 0.0015;

  const macroTrend =
    replayState.marketRegime?.regime === 'TRENDING_BULLISH'
      ? 'BULLISH'
      : replayState.marketRegime?.regime === 'TRENDING_BEARISH'
      ? 'BEARISH'
      : 'RANGING';

  return (
    <div className="space-y-4" dir="rtl">
      {/* نوار ابزار دیده‌بان نمادها، بازپخش و زمان‌بندی جلسه */}
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
        activeModelNameFa={activeModelNameFa}
        activeTradingStyleBadgeFa={activeTradingStyleBadgeFa}
        activeStyleFilter={replayState.activeStyleFilter}
        onChangeStyleFilter={onChangeStyleFilter}
      />

      {/* نوار دیده‌بان بلادرنگ ریزساختار بازار، سشن، اسپرد زنده، تقویم اقتصادی و سپر ریسک */}
      <LiveMicrostructureTicker
        symbol={symbol}
        currentTimestamp={currentTimestamp}
        currentPrice={currentPrice}
        dailyDrawdownPercent={dailyDrawdownPercent}
        consecutiveLossCount={consecutiveLossCount}
      />

      {/* پد اجرای ۱-کلیکی هوشمند با قابلیت مقیاس‌گذاری حجم و ذخیره سود چندمرحله‌ای */}
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

      {/* چیدمان تطبیقی دو ستونه: چارت تکنیکال + تحلیل ستاپ و هوش مصنوعی */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* ستون اصلی: چارت تعاملی پیشرفته Canvas و همگام‌ساز تایم‌فریم‌ها */}
        <div className="lg:col-span-2 w-full space-y-4">
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
            currentPrice={currentPrice}
            macroTrend={macroTrend}
            macroLevels={macroLevels}
            onOpenMonteCarlo={onOpenMonteCarlo}
            onOpenBacktest={onOpenBacktest}
            onOpenAlerts={onOpenAlerts}
            unreadAlertsCount={unreadAlertsCount}
          />
        </div>

        {/* ستون کناری: کارت تحلیل ستاپ S0، پیش‌نمایش ریسک قطعی و شورای ایجنت‌ها */}
        <div className="lg:col-span-1 w-full">
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
        </div>
      </div>

      {/* مودال تولید و صادرات پوستر گرافیکی ستاپ یا پوزیشن جاری */}
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
