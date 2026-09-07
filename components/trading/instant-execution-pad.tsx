// components/trading/instant-execution-pad.tsx
// کاکپیت تاکتیکی ترید سریع ۱-کلیکی، خروج پله‌ای و کلید اضطراری Kill-Switch
// طراحی اختصاصی متریال ۳ بهینه برای Pixel 9 Pro Fold (نمایشگر تاشو) و Snapdragon X Plus

'use client';

import React, { useState } from 'react';
import { SymbolId, SYMBOL_SPECS } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { DEFAULT_PARTIAL_TP_CONFIG, PartialTPConfig } from '@/lib/contracts/tactical-cockpit';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Percent,
  Split,
  Crosshair,
  AlertOctagon,
  Sparkles,
} from 'lucide-react';

interface InstantExecutionPadProps {
  symbol: SymbolId;
  currentPrice: number;
  currentAtr: number;
  accountEquity: number;
  activeCandidate: StrategyCandidate | null;
  onExecuteInstantOrder: (
    direction: 'BUY' | 'SELL',
    riskPercent: number,
    useCandidateLevels: boolean,
    partialConfig: PartialTPConfig
  ) => void;
  onPanicKillSwitch: () => void;
  openPositionsCount: number;
}

export const InstantExecutionPad: React.FC<InstantExecutionPadProps> = React.memo(({
  symbol,
  currentPrice,
  currentAtr,
  accountEquity,
  activeCandidate,
  onExecuteInstantOrder,
  onPanicKillSwitch,
  openPositionsCount,
}) => {
  const [selectedRisk, setSelectedRisk] = useState<number>(0.25);
  const [isPartialEnabled, setIsPartialEnabled] = useState<boolean>(true);
  const [showKillConfirm, setShowKillConfirm] = useState<boolean>(false);

  const spec = SYMBOL_SPECS[symbol];
  const atr = Math.max(currentAtr, symbol === 'XAUUSD' ? 1.5 : 0.001);
  const slDist = atr * 1.2;

  // محاسبه لات تخمینی در زمان واقعی
  const riskDollars = (accountEquity * selectedRisk) / 100;
  const estimatedLots = Math.max(
    spec.minLots,
    Math.min(spec.maxLots, Number((riskDollars / (slDist * spec.contractSize)).toFixed(2)))
  );

  const partialConfig: PartialTPConfig = {
    ...DEFAULT_PARTIAL_TP_CONFIG,
    enabled: isPartialEnabled,
  };

  return (
    <div
      className="w-full bg-[#151922] border border-[#272f3e] rounded-2xl p-3 sm:p-4 shadow-sm text-right font-sans"
      dir="rtl"
    >
      {/* سربرگ کاکپیت */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#252c3b] pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-500/10 rounded-lg text-cyan-400">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs md:text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <span>کاکپیت ترید سریع ۱-کلیکی (Instant Pad)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 border border-cyan-800 text-cyan-300">
                Phase 2
              </span>
            </h3>
            <span className="text-[11px] text-zinc-400">
              ارسال آنی سفارش با لات محاسبه‌شده و خروج پله‌ای TP1
            </span>
          </div>
        </div>

        {/* دکمه فیوز اضطراری Kill-Switch */}
        <div className="relative">
          {showKillConfirm ? (
            <div className="flex items-center gap-1.5 bg-rose-950 p-1 rounded-xl border border-rose-600 animate-pulse">
              <span className="text-[10px] text-rose-200 font-bold px-1">بستن همه؟</span>
              <button
                type="button"
                onClick={() => {
                  onPanicKillSwitch();
                  setShowKillConfirm(false);
                }}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors"
              >
                تایید فوری
              </button>
              <button
                type="button"
                onClick={() => setShowKillConfirm(false)}
                className="px-1.5 py-1 text-zinc-400 hover:text-white text-xs"
              >
                لغو
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowKillConfirm(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                openPositionsCount > 0
                  ? 'bg-rose-950/80 border-rose-600/80 text-rose-300 hover:bg-rose-900 shadow-sm'
                  : 'bg-[#1b1f2b] border-[#293245] text-zinc-400 hover:text-rose-400'
              }`}
              title="بستن آنی کلیه پوزیشن‌ها و لغو سفارش‌های در انتظار"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>کلید اضطراری (Kill-Switch)</span>
              {openPositionsCount > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-900/80 rounded-full text-[10px] font-mono text-rose-200">
                  {openPositionsCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ردیف تنظیمات سریع: درصد ریسک و خروج پله‌ای */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-xs">
        {/* انتخاب درصد ریسک */}
        <div className="flex items-center justify-between bg-[#12151c] p-2 rounded-xl border border-[#232936]">
          <div className="flex items-center gap-1 text-zinc-300">
            <Percent className="w-3.5 h-3.5 text-cyan-400" />
            <span>ریسک در معامله:</span>
          </div>
          <div className="flex items-center gap-1">
            {[0.1, 0.25, 0.5, 1.0].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRisk(r)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                  selectedRisk === r
                    ? 'bg-cyan-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1f2a]'
                }`}
              >
                {r}٪
              </button>
            ))}
          </div>
        </div>

        {/* تاگل خروج پله‌ای و Breakeven */}
        <div className="flex items-center justify-between bg-[#12151c] p-2 rounded-xl border border-[#232936]">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <Split className="w-3.5 h-3.5 text-emerald-400" />
            <span>خروج پله‌ای (TP1 50% + ریسک‌فری):</span>
          </div>
          <button
            type="button"
            onClick={() => setIsPartialEnabled(!isPartialEnabled)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
              isPartialEnabled
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}
          >
            {isPartialEnabled ? 'فعال (1.2R)' : 'غیرفعال'}
          </button>
        </div>
      </div>

      {/* کلیدهای بزرگ ترید ۱-کلیکی (خرید و فروش فوری) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* کلید خرید ۱-کلیکی BUY */}
        <button
          type="button"
          onClick={() => onExecuteInstantOrder('BUY', selectedRisk, false, partialConfig)}
          className="p-3 bg-gradient-to-r from-emerald-950 to-[#102920] hover:from-emerald-900 hover:to-[#15382b] border border-emerald-600/80 rounded-xl flex items-center justify-between transition-all group shadow-sm active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg group-hover:bg-emerald-500/30 transition-colors">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="text-right">
              <div className="font-bold text-emerald-300 text-sm flex items-center gap-1.5">
                <span>خرید فوری (BUY)</span>
                <span className="text-[10px] font-mono opacity-80">1-CLICK</span>
              </div>
              <div className="text-[11px] text-emerald-200/80 font-mono">
                حجم: {estimatedLots} Lot | SL: -{(slDist).toFixed(symbol === 'XAUUSD' ? 1 : 4)}
              </div>
            </div>
          </div>
          <div dir="ltr" className="text-right font-mono">
            <span className="text-xs text-zinc-400 block">Ask Price</span>
            <span className="text-sm font-bold text-emerald-300">{currentPrice.toFixed(symbol === 'XAUUSD' ? 2 : 5)}</span>
          </div>
        </button>

        {/* کلید فروش ۱-کلیکی SELL */}
        <button
          type="button"
          onClick={() => onExecuteInstantOrder('SELL', selectedRisk, false, partialConfig)}
          className="p-3 bg-gradient-to-r from-rose-950 to-[#291216] hover:from-rose-900 hover:to-[#38151c] border border-rose-600/80 rounded-xl flex items-center justify-between transition-all group shadow-sm active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg group-hover:bg-rose-500/30 transition-colors">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div className="text-right">
              <div className="font-bold text-rose-300 text-sm flex items-center gap-1.5">
                <span>فروش فوری (SELL)</span>
                <span className="text-[10px] font-mono opacity-80">1-CLICK</span>
              </div>
              <div className="text-[11px] text-rose-200/80 font-mono">
                حجم: {estimatedLots} Lot | SL: +{(slDist).toFixed(symbol === 'XAUUSD' ? 1 : 4)}
              </div>
            </div>
          </div>
          <div dir="ltr" className="text-right font-mono">
            <span className="text-xs text-zinc-400 block">Bid Price</span>
            <span className="text-sm font-bold text-rose-300">{currentPrice.toFixed(symbol === 'XAUUSD' ? 2 : 5)}</span>
          </div>
        </button>
      </div>

      {/* کلید ویژه: اجرای مستقیم ستاپ کشف‌شده هوش مصنوعی در صورت وجود */}
      {activeCandidate && (
        <div className="mt-3 pt-2.5 border-t border-[#252c3b] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-zinc-300">ستاپ هوش مصنوعی آماده است:</span>
            <span className="font-bold text-cyan-300 font-mono">
              {activeCandidate.direction} ({activeCandidate.strategyName.split(' ')[0]})
            </span>
          </div>
          <button
            type="button"
            onClick={() => onExecuteInstantOrder(activeCandidate.direction, selectedRisk, true, partialConfig)}
            className="px-3 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-600 text-cyan-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            <span>اجرای فوری ستاپ با سطوح دقیق هوش مصنوعی</span>
          </button>
        </div>
      )}
    </div>
  );
});

InstantExecutionPad.displayName = 'InstantExecutionPad';
