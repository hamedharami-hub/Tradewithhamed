// components/trading/instant-execution-pad.tsx
// داک شناور اجرای سریع ۱-کلیکی، حجم بهینه و تنظیمات تاکتیکی
// طراحی ارگونومیک شناور شیشه‌ای (Floating Action Dock) با نهایت خلوتی بصری

'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SymbolId, SYMBOL_SPECS } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { DEFAULT_PARTIAL_TP_CONFIG, PartialTPConfig } from '@/lib/contracts/tactical-cockpit';
import { calculateDeterministicRisk } from '@/lib/core/risk-calculator';
import { PropFirmId, PROP_FIRM_PRESETS, DEFAULT_PROP_FIRM_ID } from '@/lib/contracts/prop-firms';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Percent,
  Split,
  AlertOctagon,
  Sparkles,
  AlertTriangle,
  Sliders,
  X,
  Plus,
  Minus,
  Check,
} from 'lucide-react';

export type TradePsychologyMood = 'PLAN_DISCIPLINED' | 'FOMO_RUSH' | 'REVENGE_TRADE' | 'FATIGUED';

export const PSYCHOLOGY_MOOD_OPTIONS: { id: TradePsychologyMood; labelFa: string; badgeClass: string }[] = [
  { id: 'PLAN_DISCIPLINED', labelFa: '🎯 طبق پلن', badgeClass: 'bg-emerald-950/70 border-emerald-600 text-emerald-300' },
  { id: 'FOMO_RUSH', labelFa: '⚡ فومو / عجله', badgeClass: 'bg-amber-950/70 border-amber-600 text-amber-300' },
  { id: 'REVENGE_TRADE', labelFa: '😡 انتقام', badgeClass: 'bg-rose-950/70 border-rose-600 text-rose-300' },
  { id: 'FATIGUED', labelFa: '😴 خسته', badgeClass: 'bg-purple-950/70 border-purple-600 text-purple-300' },
];

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
    partialConfig: PartialTPConfig,
    meta?: { mood?: string; propFirmId?: PropFirmId }
  ) => void;
  onPanicKillSwitch: () => void;
  openPositionsCount: number;
}

const getPriceDecimals = (sym: SymbolId) => {
  if (sym === 'XAUUSD' || sym === 'BTCUSD') return 2;
  if (sym === 'USDJPY') return 3;
  return 5;
};

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
  const [selectedPropFirm, setSelectedPropFirm] = useState<PropFirmId>(DEFAULT_PROP_FIRM_ID);
  const [selectedMood, setSelectedMood] = useState<TradePsychologyMood>('PLAN_DISCIPLINED');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);

  const configRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setIsConfigOpen(false);
      }
    };
    if (isConfigOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isConfigOpen]);

  const spec = SYMBOL_SPECS[symbol];
  const minAtr = symbol === 'XAUUSD' ? 1.5 : symbol === 'USDJPY' ? 0.15 : symbol === 'BTCUSD' ? 250 : 0.001;
  const atr = Math.max(currentAtr, minAtr);
  const slDist = atr * 1.2;
  const tpDist = slDist * 2.0;
  const priceDecimals = getPriceDecimals(symbol);

  // محاسبه مستقیم با ماشین حساب ریسک قطعی
  const riskPreview = useMemo(() => {
    return calculateDeterministicRisk({
      symbol,
      direction: 'BUY',
      entryPrice: currentPrice,
      stopLossPrice: Number((currentPrice - slDist).toFixed(priceDecimals)),
      takeProfitPrice: Number((currentPrice + tpDist).toFixed(priceDecimals)),
      accountEquity,
      riskPercentage: selectedRisk,
    });
  }, [symbol, currentPrice, slDist, tpDist, accountEquity, selectedRisk, priceDecimals]);

  const estimatedLots = riskPreview.adjustedVolumeLots;
  const isCapitalSufficient = riskPreview.isValid && estimatedLots >= spec.minLots;

  const partialConfig: PartialTPConfig = {
    ...DEFAULT_PARTIAL_TP_CONFIG,
    enabled: isPartialEnabled,
  };

  const handleStepRisk = (delta: number) => {
    const risks = [0.05, 0.1, 0.15, 0.2, 0.25];
    const currentIndex = risks.indexOf(selectedRisk);
    if (currentIndex === -1) {
      setSelectedRisk(0.25);
      return;
    }
    const nextIndex = Math.max(0, Math.min(risks.length - 1, currentIndex + delta));
    setSelectedRisk(risks[nextIndex]);
  };

  return (
    <div className="relative w-full" dir="rtl" ref={configRef}>
      {/* داک اصلی معلق (Floating Dock) */}
      <div className="bg-[#0f131f]/95 backdrop-blur-xl border border-[#222a3d] rounded-2xl p-2 px-3 shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {/* ردیف بالا در موبایل: کنترل حجم و ریسک + تنظیمات */}
        <div className="flex sm:hidden items-center justify-between gap-1.5 pb-1.5 border-b border-[#1b2234]">
          {/* مرکز داک: انتخاب‌گر حجم و درصد ریسک سریع */}
          <div className="flex items-center gap-2 bg-[#141926] px-2.5 py-1 rounded-xl border border-[#232d40] flex-1">
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-xs font-bold text-zinc-100">{estimatedLots} Lot</span>
              <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800">
                {selectedRisk}% ریسک
              </span>
            </div>
            <span className="text-[9px] text-zinc-500 font-mono mr-auto">
              SL: -{slDist.toFixed(symbol === 'XAUUSD' ? 1 : symbol === 'USDJPY' ? 2 : 4)}
            </span>
            <div className="flex items-center gap-0.5 border-r border-[#263145] pr-1">
              <button
                type="button"
                onClick={() => handleStepRisk(-1)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1f273a] transition-colors"
                title="کاهش ریسک"
                aria-label="کاهش ریسک"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handleStepRisk(1)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1f273a] transition-colors"
                title="افزایش ریسک"
                aria-label="افزایش ریسک"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* کلید تنظیمات پیشرفته در موبایل */}
          <button
            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`p-2 rounded-xl border transition-colors flex items-center justify-center ${
              isConfigOpen
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'bg-[#141926] hover:bg-[#1c2336] border-[#252f44] text-zinc-400 hover:text-zinc-200'
            }`}
            title="تنظیمات تاکتیکی و ریسک"
            aria-label="تنظیمات تاکتیکی"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>

        {/* دکمه اختصاصی اجرای فوری ستاپ هوش مصنوعی در موبایل (در صورت وجود) */}
        {activeCandidate && (
          <button
            type="button"
            onClick={() =>
              onExecuteInstantOrder(activeCandidate.direction, selectedRisk, true, partialConfig, {
                mood: selectedMood,
                propFirmId: selectedPropFirm,
              })
            }
            className="sm:hidden flex items-center justify-center gap-2 w-full py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold text-xs transition-all animate-pulse"
            title="اجرای ستاپ هوش مصنوعی با سطوح ورود و حد ضرر محاسبه شده"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>اجرای ستاپ {activeCandidate.direction} ({activeCandidate.entryPrice})</span>
          </button>
        )}

        {/* ردیف اصلی دکمه‌های خرید و فروش */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 justify-between">
          {/* کلید خرید ۱-کلیکی BUY */}
          <button
            type="button"
            onClick={() =>
              onExecuteInstantOrder('BUY', selectedRisk, false, partialConfig, {
                mood: selectedMood,
                propFirmId: selectedPropFirm,
              })
            }
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold transition-all shadow-md active:scale-95 ${
              !isCapitalSufficient ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={!isCapitalSufficient ? 'سرمایه برای حداقل حجم مجاز کافی نیست' : 'خرید آنی (BUY)'}
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <div className="flex flex-col text-right leading-tight">
              <span className="text-xs sm:text-sm">خرید BUY</span>
              <span className="text-[10px] font-mono opacity-90">
                {currentPrice.toFixed(priceDecimals)}
              </span>
            </div>
          </button>

          {/* مرکز داک: انتخاب‌گر حجم و درصد ریسک سریع در دسکتاپ */}
          <div className="hidden sm:flex items-center gap-2 bg-[#141926] px-3 py-1.5 rounded-xl border border-[#232d40]">
            <div className="flex flex-col text-center">
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-xs font-bold text-zinc-100">{estimatedLots} Lot</span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800">
                  {selectedRisk}% ریسک
                </span>
              </div>
              <span className="text-[9px] text-zinc-500 font-mono">
                SL: -{slDist.toFixed(symbol === 'XAUUSD' ? 1 : symbol === 'USDJPY' ? 2 : 4)} | TP: +{tpDist.toFixed(symbol === 'XAUUSD' ? 1 : symbol === 'USDJPY' ? 2 : 4)}
              </span>
            </div>

            <div className="flex items-center gap-0.5 border-r border-[#263145] pr-1.5">
              <button
                type="button"
                onClick={() => handleStepRisk(-1)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1f273a] transition-colors"
                title="کاهش درصد ریسک"
                aria-label="کاهش ریسک"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleStepRisk(1)}
                className="p-1 text-zinc-400 hover:text-white rounded hover:bg-[#1f273a] transition-colors"
                title="افزایش درصد ریسک"
                aria-label="افزایش ریسک"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* کلید فروش ۱-کلیکی SELL */}
          <button
            type="button"
            onClick={() =>
              onExecuteInstantOrder('SELL', selectedRisk, false, partialConfig, {
                mood: selectedMood,
                propFirmId: selectedPropFirm,
              })
            }
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold transition-all shadow-md active:scale-95 ${
              !isCapitalSufficient ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={!isCapitalSufficient ? 'سرمایه برای حداقل حجم مجاز کافی نیست' : 'فروش آنی (SELL)'}
          >
            <div className="flex flex-col text-right leading-tight">
              <span className="text-xs sm:text-sm">فروش SELL</span>
              <span className="text-[10px] font-mono opacity-90">
                {currentPrice.toFixed(priceDecimals)}
              </span>
            </div>
            <TrendingDown className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* دکمه اختصاصی اجرای فوری ستاپ هوش مصنوعی در دسکتاپ (در صورت وجود) */}
        {activeCandidate && (
          <button
            type="button"
            onClick={() =>
              onExecuteInstantOrder(activeCandidate.direction, selectedRisk, true, partialConfig, {
                mood: selectedMood,
                propFirmId: selectedPropFirm,
              })
            }
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold text-xs transition-all animate-pulse"
            title="اجرای ستاپ هوش مصنوعی با سطوح ورود و حد ضرر محاسبه شده"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>اجرای ستاپ {activeCandidate.direction}</span>
          </button>
        )}

        {/* کلید تنظیمات پیشرفته در دسکتاپ */}
        <div className="hidden sm:block relative">
          <button
            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`p-2.5 rounded-xl border transition-colors flex items-center justify-center ${
              isConfigOpen
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : 'bg-[#141926] hover:bg-[#1c2336] border-[#252f44] text-zinc-400 hover:text-zinc-200'
            }`}
            title="تنظیمات تاکتیکی و پراپ‌فرم"
            aria-label="تنظیمات تاکتیکی"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* پاپ‌اور تنظیمات تاکتیکی (رو به بالا) */}
      {isConfigOpen && (
        <div className="fixed inset-x-3 bottom-20 sm:absolute sm:bottom-14 sm:left-0 z-50 w-auto sm:w-80 bg-[#121622]/95 backdrop-blur-xl border border-[#252f44] rounded-2xl p-4 shadow-2xl space-y-3 font-sans text-xs max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#21283a] pb-2">
                <span className="font-bold text-zinc-100">تنظیمات تاکتیکی و ریسک</span>
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* درصد ریسک در معامله */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span>درصد ریسک در معامله:</span>
                  <span className="font-mono text-cyan-400 font-bold">{selectedRisk}%</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[0.05, 0.1, 0.2, 0.25].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedRisk(r)}
                      className={`py-1 rounded-lg font-mono text-[11px] transition-all border ${
                        selectedRisk === r
                          ? 'bg-cyan-600 border-cyan-500 text-white font-bold'
                          : 'bg-[#171d2b] border-[#252f44] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
              </div>

              {/* خروج پله‌ای TP1 */}
              <div className="flex items-center justify-between bg-[#171d2b] p-2 rounded-xl border border-[#252f44]">
                <div className="flex items-center gap-1.5 text-zinc-300 text-[11px]">
                  <Split className="w-3.5 h-3.5 text-emerald-400" />
                  <span>خروج پله‌ای (TP1 + ریسک‌فری):</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPartialEnabled(!isPartialEnabled)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
                    isPartialEnabled
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {isPartialEnabled ? 'فعال' : 'غیرفعال'}
                </button>
              </div>

              {/* پراپ‌فرم هدف */}
              <div className="space-y-1">
                <span className="text-[11px] text-zinc-400 block">پراپ‌فرم هدف:</span>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(PROP_FIRM_PRESETS) as PropFirmId[]).map(pfId => (
                    <button
                      key={pfId}
                      type="button"
                      onClick={() => setSelectedPropFirm(pfId)}
                      className={`p-1.5 rounded-lg text-[10px] font-bold truncate transition-all text-center border ${
                        selectedPropFirm === pfId
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-[#171d2b] border-[#252f44] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {pfId === 'FTMO_NORMAL'
                        ? 'FTMO'
                        : pfId === 'THE5ERS_HIGH_STAKES'
                        ? 'The5ers'
                        : pfId === 'FUNDEDNEXT_STELLAR'
                        ? 'FundedNext'
                        : 'شخصی'}
                    </button>
                  ))}
                </div>
              </div>

              {/* وضعیت روحی ورود */}
              <div className="space-y-1">
                <span className="text-[11px] text-zinc-400 block">وضعیت روحی ورود:</span>
                <div className="grid grid-cols-2 gap-1">
                  {PSYCHOLOGY_MOOD_OPTIONS.map(mood => (
                    <button
                      key={mood.id}
                      type="button"
                      onClick={() => setSelectedMood(mood.id)}
                      className={`p-1.5 rounded-lg text-[10px] font-bold truncate transition-all text-center border ${
                        selectedMood === mood.id
                          ? mood.badgeClass
                          : 'bg-[#171d2b] border-[#252f44] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {mood.labelFa}
                    </button>
                  ))}
                </div>
              </div>

              {/* کلید اضطراری Kill-Switch */}
              <div className="pt-2 border-t border-[#21283a]">
                {showKillConfirm ? (
                  <div className="flex items-center justify-between bg-rose-950/80 p-1.5 rounded-xl border border-rose-600 animate-pulse">
                    <span className="text-[10px] text-rose-200 font-bold">بستن کلیه پوزیشن‌ها؟</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onPanicKillSwitch();
                          setShowKillConfirm(false);
                          setIsConfigOpen(false);
                        }}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold"
                      >
                        تایید فوری
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowKillConfirm(false)}
                        className="px-1 text-zinc-400 hover:text-white text-[10px]"
                      >
                        لغو
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowKillConfirm(true)}
                    className="w-full py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                    <span>کلید اضطراری بستن همه (Kill-Switch)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      );
    });

InstantExecutionPad.displayName = 'InstantExecutionPad';
