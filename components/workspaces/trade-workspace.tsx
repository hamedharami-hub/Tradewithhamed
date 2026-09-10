'use client';

import React from 'react';
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
          />
        </div>
      </div>
    </div>
  );
};
