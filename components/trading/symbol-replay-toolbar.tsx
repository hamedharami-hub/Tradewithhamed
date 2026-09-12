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
  Sparkles,
  Eye,
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
  onOpenAIDrawer?: () => void;
  hasActiveCandidate?: boolean;
  onToggleZen?: () => void;
  isZenMode?: boolean;
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
  onOpenAIDrawer,
  hasActiveCandidate = false,
  onToggleZen,
  isZenMode = false,
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
      className="bg-[#0e121b]/95 border border-[#1e2535] rounded-2xl p-2 sm:px-3 sm:py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 text-xs shadow-md select-none font-sans"
      dir="rtl"
    >
      {/* ردیف اول: نمادها و موتور بازپخش */}
      <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
        {/* انتخاب نماد معاملاتی */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-[#141926] p-0.5 rounded-xl border border-[#222a3a]">
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
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-mono font-bold flex items-center gap-1 transition-all ${
                  isSelected
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a2130]'
                }`}
              >
                <Icon className={`w-3 h-3 ${isSelected ? 'text-white' : item.color}`} />
                <span className="hidden sm:inline">{item.id}</span>
                <span className="sm:hidden text-[11px]">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* موتور بازپخش (Replay Engine) */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-[#141926] p-0.5 rounded-xl border border-[#222a3a]">
          <span dir="ltr" className="font-mono text-[10px] text-zinc-400 px-1.5 py-0.5">
            {currentStepIndex + 1}/{totalSteps}
          </span>

          {/* بازنشانی */}
          <button
            type="button"
            onClick={onReset}
            className="p-1 sm:p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-[#182030] rounded-lg transition-colors"
            title="بازنشانی ریپلی"
            aria-label="بازنشانی ریپلی"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* دکمه Play / Pause */}
          <button
            type="button"
            onClick={onTogglePlay}
            className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all ${
              isPlaying
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white font-bold'
            }`}
            title={isPlaying ? 'توقف پخش' : 'پخش خودکار'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="text-[11px] hidden sm:inline">{isPlaying ? 'توقف' : 'پخش'}</span>
          </button>

          {/* گام بعدی */}
          <button
            type="button"
            onClick={onStepForward}
            disabled={currentStepIndex >= totalSteps - 1}
            className="p-1 sm:p-1.5 text-zinc-300 hover:text-white hover:bg-[#182030] disabled:opacity-40 rounded-lg transition-colors"
            title="کندل بعدی"
            aria-label="کندل بعدی"
          >
            <SkipForward className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          {/* سرعت‌ها */}
          <div className="flex items-center gap-0.5 border-r border-[#222a3a] pr-1 mr-0.5">
            {speeds.map(s => (
              <button
                key={s.ms}
                type="button"
                onClick={() => onChangeSpeed(s.ms)}
                className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
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
      </div>

      {/* ردیف دوم: ابزارهای تحلیلی، ستاپ هوش مصنوعی، بک‌تست و نشست */}
      <div className="flex items-center justify-between sm:justify-end gap-1.5 overflow-x-auto no-scrollbar">
        {/* دکمه اختصاصی کشوی ستاپ هوش مصنوعی */}
        {onOpenAIDrawer && (
          <button
            type="button"
            onClick={onOpenAIDrawer}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition-all shadow-xs ${
              hasActiveCandidate
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 animate-pulse'
                : 'bg-[#141926] hover:bg-[#1b2234] border-[#252f44] text-cyan-400'
            }`}
            title="مشاهده ستاپ و تحلیل هوش مصنوعی"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>{hasActiveCandidate ? 'ستاپ فعال AI' : 'ستاپ AI'}</span>
            {hasActiveCandidate && (
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            )}
          </button>
        )}

        {/* آزمایشگاه بک‌تست یک‌ساله */}
        {onOpenBacktest && (
          <button
            type="button"
            onClick={onOpenBacktest}
            className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold rounded-xl flex items-center gap-1 transition-all text-[11px] shadow-xs"
            title="آزمایشگاه جامع بک‌تست ۱ ساله استراتژی‌ها"
          >
            <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
            <span>بک‌تست 🧪</span>
          </button>
        )}

        {/* کلید نشست کاری */}
        <button
          type="button"
          onClick={onToggleSession}
          className={`px-2 py-1 rounded-xl text-[11px] font-medium flex items-center gap-1 border transition-all ${
            isSessionActive
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-[#141926] border-[#252f44] text-zinc-400'
          }`}
          title="زمان نشست کاری"
        >
          <Power className="w-3 h-3" />
          <span className="font-mono">{isSessionActive ? formatSessionTime(sessionSeconds) : 'نشست'}</span>
        </button>

        {/* شورای ایجنت‌ها */}
        <button
          type="button"
          onClick={onOpenMultiAgentModal || onOpenAIModal}
          className="px-2 py-1 bg-[#141926] hover:bg-[#1c2336] border border-[#252f44] text-cyan-300 rounded-xl flex items-center gap-1 transition-colors text-[11px]"
          title="اتاق فرمان ۴ ایجنت هوشمند"
        >
          <Bot className="w-3 h-3 text-cyan-400" />
          <span className="hidden md:inline">شورا</span>
          <span className="text-[9px] font-mono bg-cyan-950 px-1 rounded text-cyan-300">
            {activeTradingStyleBadgeFa}
          </span>
        </button>

        {/* پشتیبان */}
        <button
          type="button"
          onClick={onOpenExportModal}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-[#182030] rounded-xl border border-[#252f44] transition-colors"
          title="پشتیبان‌گیری / بازیابی"
          aria-label="پشتیبان‌گیری"
        >
          <Database className="w-3.5 h-3.5" />
        </button>

        {/* کلید تمرکز ذن (Zen Mode) */}
        {onToggleZen && (
          <button
            type="button"
            onClick={onToggleZen}
            className={`p-1.5 rounded-xl border transition-colors ${
              isZenMode
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-[#141926] hover:bg-[#1c2336] border-[#252f44] text-zinc-400 hover:text-emerald-400'
            }`}
            title="حالت تمرکز ذن (خلوتی کامل چارت)"
            aria-label="حالت تمرکز ذن"
          >
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
});

SymbolReplayToolbar.displayName = 'SymbolReplayToolbar';
