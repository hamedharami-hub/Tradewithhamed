// components/trading/symbol-replay-toolbar.tsx
'use client';

import React from 'react';
import { SymbolId } from '@/lib/contracts/market';
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
  Sliders,
  Layers,
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
  activeModelNameFa?: string;
  activeTradingStyleBadgeFa?: string;
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
  activeModelNameFa = 'S0 آفلاین',
  activeTradingStyleBadgeFa = 'سبک S0',
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
      className="bg-[#161a22] border border-[#272d3b] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm"
      dir="rtl"
    >
      {/* انتخاب نماد معاملاتی با استایل متریال ۳ */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-300 font-medium">نماد معاملاتی:</span>
        <button
          type="button"
          onClick={() => onSymbolChange('XAUUSD')}
          className={`px-3 py-1.5 rounded-xl font-mono font-bold flex items-center gap-2 border transition-all ${
            symbol === 'XAUUSD'
              ? 'bg-[#2a2216] border-amber-500/70 text-amber-300 shadow-sm'
              : 'bg-[#12151b] border-[#252b38] text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1f29]'
          }`}
          title="طلا در برابر دلار آمریکا"
        >
          <Coins className="w-4 h-4 text-amber-400" />
          <span dir="ltr" className="tracking-wide">XAUUSD (Gold)</span>
        </button>
        <button
          type="button"
          onClick={() => onSymbolChange('EURUSD')}
          className={`px-3 py-1.5 rounded-xl font-mono font-bold flex items-center gap-2 border transition-all ${
            symbol === 'EURUSD'
              ? 'bg-[#132533] border-cyan-500/70 text-cyan-300 shadow-sm'
              : 'bg-[#12151b] border-[#252b38] text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1f29]'
          }`}
          title="یورو در برابر دلار آمریکا"
        >
          <DollarSign className="w-4 h-4 text-cyan-400" />
          <span dir="ltr" className="tracking-wide">EURUSD (Euro)</span>
        </button>
      </div>

      {/* نوار کنترل نشست معاملاتی و زمان سپری‌شده */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSession}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-2 border transition-all ${
            isSessionActive
              ? 'bg-rose-950/70 border-rose-700/60 text-rose-300'
              : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
          }`}
          title={isSessionActive ? 'توقف نشست آزمایشی' : 'شروع نشست آزمایشی جدید'}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{isSessionActive ? 'پایان نشست' : 'شروع نشست'}</span>
        </button>

        {isSessionActive && (
          <div className="flex items-center gap-1.5 bg-[#12151b] border border-[#262c39] px-2.5 py-1 rounded-xl text-zinc-300 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>زمان: {formatSessionTime(sessionSeconds)}</span>
          </div>
        )}
      </div>

      {/* کنترل‌های بازپخش خودکار کندل‌ها، گام دستی، ریست، خروجی و هوش مصنوعی */}
      <div className="flex items-center flex-wrap gap-2">
        {/* نشانگر گام کندل */}
        <span dir="ltr" className="font-mono text-zinc-400 bg-[#12151b] px-2.5 py-1 rounded-xl border border-[#232936]">
          Step {currentStepIndex + 1}/{totalSteps}
        </span>

        {/* دکمه Play / Pause */}
        <button
          type="button"
          onClick={onTogglePlay}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 border transition-all ${
            isPlaying
              ? 'bg-amber-950/80 border-amber-600/70 text-amber-300'
              : 'bg-cyan-950/80 border-cyan-600/70 text-cyan-300 hover:bg-cyan-900'
          }`}
          title={isPlaying ? 'توقف بازپخش خودکار' : 'پخش خودکار کندل‌ها'}
        >
          {isPlaying ? (
            <>
              <Pause className="w-4 h-4" />
              <span>توقف</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>پخش</span>
            </>
          )}
        </button>

        {/* انتخاب سرعت بازپخش */}
        <div className="flex items-center bg-[#12151b] border border-[#272d3a] rounded-xl p-0.5">
          {speeds.map(s => (
            <button
              key={s.ms}
              type="button"
              onClick={() => onChangeSpeed(s.ms)}
              className={`px-2 py-1 rounded-lg font-mono text-[11px] transition-colors ${
                speedMs === s.ms
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* گام دستی یک کندل به جلو */}
        <button
          type="button"
          onClick={onStepForward}
          disabled={currentStepIndex >= totalSteps - 1}
          className="px-3 py-1.5 bg-[#1d232f] hover:bg-[#252c3b] disabled:opacity-40 text-zinc-100 border border-[#2f3747] rounded-xl flex items-center gap-1.5 font-medium transition-colors"
          title="پیشروی یک کندل ۵ دقیقه‌ای به جلو"
        >
          <SkipForward className="w-4 h-4 text-cyan-400" />
          <span>کندل بعدی</span>
        </button>

        {/* بازنشانی ریپلی */}
        <button
          type="button"
          onClick={onReset}
          className="p-2 bg-[#1d232f] hover:bg-[#252c3b] text-zinc-400 hover:text-white border border-[#2f3747] rounded-xl transition-colors"
          title="بازنشانی ریپلی به کندل اولیه"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* دکمه پشتیبان‌گیری و بازیابی */}
        <button
          type="button"
          onClick={onOpenExportModal}
          className="px-2.5 py-1.5 bg-[#181c25] hover:bg-[#202532] border border-[#2b3342] text-zinc-200 rounded-xl flex items-center gap-1.5 font-medium transition-colors"
          title="پشتیبان‌گیری و بازیابی داده‌ها (JSON v1.0)"
        >
          <Database className="w-4 h-4 text-cyan-400" />
          <span className="hidden sm:inline">پشتیبان</span>
        </button>

        {/* دکمه اتاق فرمان ۴ ایجنت هوشمند و سبک ترید */}
        <button
          type="button"
          onClick={onOpenMultiAgentModal || onOpenAIModal}
          className="px-3 py-1.5 bg-[#152230] hover:bg-[#1b2b3d] border border-cyan-600/70 text-cyan-300 rounded-xl flex items-center gap-1.5 font-medium transition-colors shadow-sm"
          title="پیکربندی ۴ ایجنت تیمی و سبک معاملاتی"
        >
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-xs">اتاق فرمان ۴ ایجنت</span>
          <span className="px-1.5 py-0.2 rounded-md bg-cyan-900/60 border border-cyan-700/50 text-[10px] text-cyan-200">
            {activeTradingStyleBadgeFa}
          </span>
        </button>
      </div>
    </div>
  );
});

SymbolReplayToolbar.displayName = 'SymbolReplayToolbar';
