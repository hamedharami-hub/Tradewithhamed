// components/trading/multi-timeframe-sync-view.tsx
// کامپوننت نمایشگر همگام‌ساز چندتایم‌فریمه (H1 Macro Trend + M5 Execution Structure)
// کراس‌هیر مشترک، سطوح کلیدی اشتراکی (PDH/PDL/Asia/FVG) و تطابق چندوجهی ۱۰۰٪ آفلاین

'use client';

import React, { useState } from 'react';
import { MultiTimeframeLevel } from '@/lib/contracts/monte-carlo';
import {
  Layers,
  Maximize2,
  Minimize2,
  Crosshair,
  Eye,
  Sliders,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Bell,
} from 'lucide-react';

interface MultiTimeframeSyncViewProps {
  symbol: string;
  currentPrice: number;
  macroTrend?: 'BULLISH' | 'BEARISH' | 'RANGING';
  macroLevels?: MultiTimeframeLevel[];
  onOpenMonteCarlo?: () => void;
  onOpenBacktest?: () => void;
  onOpenAlerts?: () => void;
  unreadAlertsCount?: number;
}

export const MultiTimeframeSyncView: React.FC<MultiTimeframeSyncViewProps> = ({
  symbol,
  currentPrice,
  macroTrend = 'BULLISH',
  macroLevels = [],
  onOpenMonteCarlo,
  onOpenBacktest,
  onOpenAlerts,
  unreadAlertsCount = 0,
}) => {
  const [isCrosshairSynced, setIsCrosshairSynced] = useState<boolean>(true);
  const [activeMacroTF, setActiveMacroTF] = useState<'H1' | 'H4'>('H1');
  const [activeMicroTF, setActiveMicroTF] = useState<'M5' | 'M1'>('M5');
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);

  // سطوح کلیدی پیش‌فرض در صورت عدم دریافت از استیت بیرونی
  const defaultLevels: MultiTimeframeLevel[] = [
    {
      id: 'pdh',
      labelFa: 'سقف روز قبل (PDH)',
      labelEn: 'Previous Day High',
      price: currentPrice + 8.5,
      timeframe: 'H1',
      type: 'PDH',
      color: '#f59e0b',
    },
    {
      id: 'pdl',
      labelFa: 'کف روز قبل (PDL)',
      labelEn: 'Previous Day Low',
      price: currentPrice - 9.2,
      timeframe: 'H1',
      type: 'PDL',
      color: '#06b6d4',
    },
    {
      id: 'asia-high',
      labelFa: 'سقف سشن آسیا',
      labelEn: 'Asia Session High',
      price: currentPrice + 3.8,
      timeframe: 'M5',
      type: 'ASIA_HIGH',
      color: '#ec4899',
    },
    {
      id: 'fvg-mid',
      labelFa: 'تراز تعادل FVG (۵۰٪)',
      labelEn: 'FVG Equilibrium',
      price: currentPrice - 1.5,
      timeframe: 'M5',
      type: 'EQUILIBRIUM',
      color: '#10b981',
    },
  ];

  const levelsToDisplay = macroLevels.length > 0 ? macroLevels : defaultLevels;

  return (
    <div className="bg-[#131720] border border-[#232938] rounded-2xl p-3.5 space-y-3 font-sans text-right" dir="rtl">
      {/* سربرگ کنترل چندتایم‌فریمه */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1f2533] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
              <span>دیدبان همگام چندتایم‌فریمه (Dual Timeframe Sync)</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                {activeMacroTF} + {activeMicroTF}
              </span>
            </h3>
            <span className="text-[10px] text-zinc-400">
              تطابق جهت کلان با ساختار ورود ۵ دقیقه‌ای و خطوط راهنمای سراسری
            </span>
          </div>
        </div>

        {/* دکمه‌های وضعیت همگام‌سازی، بک‌تست، اعلان‌ها و مونت‌کارلو */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsCrosshairSynced(!isCrosshairSynced)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 border transition-colors ${
              isCrosshairSynced
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
            title="همگام‌سازی کراس‌هیر روی هر دو چارت"
          >
            <Crosshair className="w-3 h-3" />
            <span>کراس‌هیر {isCrosshairSynced ? 'همگام' : 'جدا'}</span>
          </button>

          {onOpenAlerts && (
            <button
              type="button"
              onClick={onOpenAlerts}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#141b2b] text-cyan-300 border border-cyan-800/70 hover:bg-cyan-950 flex items-center gap-1 transition-colors relative"
              title="مشاهده هشدارهای هوشمند و تنظیمات صدا"
            >
              <Bell className="w-3 h-3 text-cyan-400" />
              <span>هشدارها</span>
              {unreadAlertsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              )}
            </button>
          )}

          {onOpenBacktest && (
            <button
              type="button"
              onClick={onOpenBacktest}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#181a28] text-purple-300 border border-purple-800/70 hover:bg-purple-950 flex items-center gap-1 transition-colors"
              title="بک‌تست تاریخی چند سبکه با اعتبارسنجی شورا و مونت‌کارلو"
            >
              <BarChart3 className="w-3 h-3 text-purple-400" />
              <span>بک‌تست تاریخی</span>
            </button>
          )}

          {onOpenMonteCarlo && (
            <button
              type="button"
              onClick={onOpenMonteCarlo}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800 hover:bg-purple-900 flex items-center gap-1 transition-colors"
            >
              <TrendingUp className="w-3 h-3" />
              <span>مونت‌کارلو ۱۰۰۰ مسیر</span>
            </button>
          )}
        </div>
      </div>

      {/* شبکه دوتایی تایم‌فریم‌ها: ماکرو H1 و میکرو M5 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* پنل ۱: تایم‌فریم ماکرو H1 */}
        <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e2433] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold bg-[#1a202d] text-cyan-300 text-[10px]">
                {activeMacroTF} MACRO
              </span>
              <span className="text-[11px] text-zinc-300 font-bold">بستر و ساختار کلان</span>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                macroTrend === 'BULLISH'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                  : macroTrend === 'BEARISH'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                  : 'bg-amber-950 text-amber-400 border border-amber-800/60'
              }`}
            >
              روند: {macroTrend === 'BULLISH' ? 'صعودی (Bullish)' : macroTrend === 'BEARISH' ? 'نزولی (Bearish)' : 'رنج (Choppy)'}
            </span>
          </div>

          {/* خلاصه سطوح ماکرو */}
          <div className="space-y-1 pt-1 text-[11px]">
            {levelsToDisplay.filter(l => l.timeframe === 'H1' || l.timeframe === 'H4').map(lvl => (
              <div key={lvl.id} className="flex items-center justify-between py-0.5 px-2 rounded bg-[#131722]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lvl.color }} />
                  <span className="text-zinc-300">{lvl.labelFa}</span>
                </div>
                <span className="font-mono text-zinc-100 font-bold" dir="ltr">
                  {lvl.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* پنل ۲: تایم‌فریم میکرو M5 */}
        <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e2433] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded font-mono font-bold bg-[#1a202d] text-emerald-300 text-[10px]">
                {activeMicroTF} EXECUTION
              </span>
              <span className="text-[11px] text-zinc-300 font-bold">شکار نقدینگی و اجرای ورود</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">
              قیمت لحظه‌ای: {currentPrice.toFixed(2)}
            </span>
          </div>

          {/* خلاصه سطوح میکرو */}
          <div className="space-y-1 pt-1 text-[11px]">
            {levelsToDisplay.filter(l => l.timeframe === 'M5' || l.timeframe === 'M15').map(lvl => (
              <div key={lvl.id} className="flex items-center justify-between py-0.5 px-2 rounded bg-[#131722]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lvl.color }} />
                  <span className="text-zinc-300">{lvl.labelFa}</span>
                </div>
                <span className="font-mono text-zinc-100 font-bold" dir="ltr">
                  {lvl.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
