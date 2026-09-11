// components/trading/symbol-replay-toolbar.tsx
// نوار کنترل نمادها، بازپخش و نشست معاملاتی با طراحی فشرده و مدرن

'use client';

import React from 'react';
import { SymbolId } from '@/lib/contracts/market';
import { TradingStyleType } from '@/lib/contracts/regimes';
import {
  Coins,
  DollarSign,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Power,
  Database,
  Bot,
  SlidersHorizontal,
  FlaskConical,
} from 'lucide-react';

interface SymbolReplayToolbarProps {
  symbol: SymbolId;
  onSymbolChange: (newSymbol: SymbolId) => void;
  isSessionActive: boolean;
  onToggleSession: () => void;
  sessionSeconds: number;
  currentStepIndex: number;
  totalSteps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speedMs: number;
  onChangeSpeed: (ms: number) => void;
  onStepForward: () => void;
  onReset: () => void;
  onOpenExportModal: () => void;
  onOpenAIModal: () => void;
  onOpenMultiAgentModal?: () => void;
  onOpenBacktest?: () => void;
  activeModelNameFa?: string;
  activeTradingStyleBadgeFa?: string;
  activeStyleFilter?: TradingStyleType | 'ALL';
  onChangeStyleFilter?: (filter: TradingStyleType | 'ALL') => void;
}

export const SymbolReplayToolbar: React.FC<SymbolReplayToolbarProps> = React.memo(({
  symbol,
  onSymbolChange,
  isSessionActive,
  onToggleSession,
  sessionSeconds,
  currentStepIndex,
  totalSteps,
  isPlaying,
  onTogglePlay,
  speedMs,
  onChangeSpeed,
  onStepForward,
  onReset,
  onOpenExportModal,
  onOpenAIModal,
  onOpenMultiAgentModal,
  onOpenBacktest,
  activeTradingStyleBadgeFa = 'سبک S0',
  activeStyleFilter = 'ALL',
  onChangeStyleFilter,
}) => {
  const speeds = [
    { label: '1x', ms: 1000 },
    { label: '2x', ms: 500 },
    { label: '5x', ms: 200 },
  ];

  const formatSessionTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="bg-[#0e121b]/90 border border-[#1e2535] rounded-xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs select-none font-sans"
      dir="rtl"
    >
      {/* انتخاب نماد معاملاتی */}
      <div className="flex items-center gap-1 bg-[#141926] p-0.5 rounded-lg border border-[#222a3a]">
        {[
          { id: 'XAUUSD', label: 'Gold', icon: Coins, color: 'text-amber-400' },
          { id: 'EURUSD', label: 'EUR', icon: DollarSign, color: 'text-cyan-400' },
          { id: 'GBPUSD', label: 'GBP', icon: DollarSign, color: 'text-violet-400' },
          { id: 'USDJPY', label: 'JPY', icon: Coins, color: 'text-emerald-400' },
        ].map((item) => {
          const isSelected = symbol === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSymbolChange(item.id as SymbolId)}
              className={`px-2 py-1 rounded-md font-mono font-bold flex items-center gap-1 transition-all ${
                isSelected
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a2130]'
              }`}
            >
              <Icon className={`w-3 h-3 ${isSelected ? 'text-white' : item.color}`} />
              <span>{item.id}</span>
            </button>
          );
        })}
      </div>

      {/* موتور بازپخش (Replay Engine) */}
      <div className="flex items-center gap-1.5">
        <span dir="ltr" className="font-mono text-[10px] text-zinc-500 bg-[#141926] px-2 py-1 rounded-md border border-[#222a3a]">
          {currentStepIndex + 1}/{totalSteps}
        </span>

        {/* بازنشانی */}
        <button
          type="button"
          onClick={onReset}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#182030] rounded-lg border border-[#222a3a] transition-colors"
          title="بازنشانی ریپلی"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* دکمه Play / Pause */}
        <button
          type="button"
          onClick={onTogglePlay}
          className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 border transition-all ${
            isPlaying
              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
              : 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500 text-white font-bold'
          }`}
          title={isPlaying ? 'توقف پخش' : 'پخش خودکار'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span className="text-[11px]">{isPlaying ? 'توقف' : 'پخش'}</span>
        </button>

        {/* گام بعدی */}
        <button
          type="button"
          onClick={onStepForward}
          disabled={currentStepIndex >= totalSteps - 1}
          className="p-1.5 text-zinc-300 hover:text-white hover:bg-[#182030] disabled:opacity-40 rounded-lg border border-[#222a3a] transition-colors"
          title="کندل بعدی"
        >
          <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
        </button>

        {/* سرعت‌ها */}
        <div className="flex items-center bg-[#141926] p-0.5 rounded-lg border border-[#222a3a]">
          {speeds.map(s => (
            <button
              key={s.ms}
              type="button"
              onClick={() => onChangeSpeed(s.ms)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                speedMs === s.ms
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* نشست کاری و ابزارهای تحلیلی */}
      <div className="flex items-center gap-1.5">
        {/* کلید نشست */}
        <button
          type="button"
          onClick={onToggleSession}
          className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 border transition-all ${
            isSessionActive
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
          }`}
        >
          <Power className="w-3 h-3" />
          <span>{isSessionActive ? formatSessionTime(sessionSeconds) : 'شروع نشست'}</span>
        </button>

        {/* آزمایشگاه بک‌تست */}
        {onOpenBacktest && (
          <button
            type="button"
            onClick={onOpenBacktest}
            className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold rounded-lg flex items-center gap-1 transition-all text-[11px] shadow-xs"
            title="آزمایشگاه جامع بک‌تست استراتژی‌ها"
          >
            <FlaskConical className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">بک‌تست 🧪</span>
          </button>
        )}

        {/* اتاق فرمان ۴ ایجنت */}
        <button
          type="button"
          onClick={onOpenMultiAgentModal || onOpenAIModal}
          className="px-2 py-1 bg-[#162030] hover:bg-[#1d2b40] border border-cyan-600/50 text-cyan-300 rounded-lg flex items-center gap-1 transition-colors text-[11px]"
          title="اتاق فرمان ۴ ایجنت"
        >
          <Bot className="w-3 h-3 text-cyan-400" />
          <span className="hidden sm:inline">شورای ایجنت‌ها</span>
          <span className="text-[9px] font-mono bg-cyan-950 px-1 rounded text-cyan-300">
            {activeTradingStyleBadgeFa}
          </span>
        </button>

        {/* پشتیبان */}
        <button
          type="button"
          onClick={onOpenExportModal}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#182030] rounded-lg border border-[#222a3a] transition-colors"
          title="پشتیبان‌گیری / بازیابی"
        >
          <Database className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

SymbolReplayToolbar.displayName = 'SymbolReplayToolbar';
