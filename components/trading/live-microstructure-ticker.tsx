// components/trading/live-microstructure-ticker.tsx
// نوار دیده‌بان مینیمال ریزساختار بازار، سشن، اسپرد، تقویم اقتصادی و سپر ضد تیلت
// طراحی اختصاصی ذن مینیمالیستی تک‌خطی و فشرده با افشای تدریجی

'use client';

import React, { useMemo, useState } from 'react';
import { SymbolId } from '@/lib/contracts/market';
import {
  getSessionForTimestamp,
  getDynamicSpreadPips,
  isRolloverBlackout,
} from '@/lib/core/market-microstructure';
import { EconomicCalendarEngine } from '@/lib/core/economic-calendar';
import {
  Clock,
  Zap,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Flame,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface LiveMicrostructureTickerProps {
  symbol: SymbolId;
  currentTimestamp: number;
  currentPrice: number;
  dailyDrawdownPercent?: number;
  maxDailyDrawdownPercent?: number;
  consecutiveLossCount?: number;
}

export const LiveMicrostructureTicker: React.FC<LiveMicrostructureTickerProps> = ({
  symbol,
  currentTimestamp,
  currentPrice,
  dailyDrawdownPercent = 0,
  maxDailyDrawdownPercent = 3.0,
  consecutiveLossCount = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // ۱. محاسبه سشن و بررسی رول‌اور
  const sessionInfo = useMemo(() => {
    const ts = currentTimestamp;
    const session = getSessionForTimestamp(ts);
    const inRollover = isRolloverBlackout(ts);

    let sessionLabelFa = 'کم‌حجم';
    let isKillzone = false;
    let badgeColor = 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40';

    if (inRollover) {
      sessionLabelFa = 'رول‌اور شب';
      badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else if (session === 'LONDON_NY_OVERLAP') {
      sessionLabelFa = 'کیل‌زون هم‌پوشانی';
      isKillzone = true;
      badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    } else if (session === 'LONDON') {
      sessionLabelFa = 'سشن لندن';
      isKillzone = true;
      badgeColor = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    } else if (session === 'NEW_YORK') {
      sessionLabelFa = 'سشن نیویورک';
      badgeColor = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    } else if (session === 'ASIA') {
      sessionLabelFa = 'سشن آسیا';
      badgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    }

    return { session, inRollover, sessionLabelFa, isKillzone, badgeColor };
  }, [currentTimestamp]);

  // ۲. محاسبه اسپرد پویا به همراه ضریب جهش خبری
  const spreadInfo = useMemo(() => {
    const ts = currentTimestamp;
    const baseDynamic = getDynamicSpreadPips(symbol, ts);
    const newsMultiplier = EconomicCalendarEngine.getNewsSpreadMultiplier(ts, symbol);
    const finalSpread = Number((baseDynamic * newsMultiplier).toFixed(1));

    const isSpike = finalSpread > (symbol === 'XAUUSD' ? 2.5 : 2.0);
    return {
      finalSpread,
      isSpike,
      newsMultiplier,
    };
  }, [symbol, currentTimestamp]);

  // ۳. بررسی رویدادهای تقویم اقتصادی و فاصله تا خبر بعدی
  const newsInfo = useMemo(() => {
    const ts = currentTimestamp;
    const blackoutCheck = EconomicCalendarEngine.isNewsBlackout(ts, symbol, 15, 15);

    if (blackoutCheck.inBlackout) {
      return {
        status: 'BLACKOUT' as const,
        title: blackoutCheck.activeEvent?.titleFa || 'خبر پرریسک ماکرو',
        minutes: blackoutCheck.minutesToEvent ?? 0,
      };
    }

    const upcoming = EconomicCalendarEngine.getEventsForTimeRange(
      ts,
      ts + 4 * 3600 * 1000,
      symbol
    ).filter(e => e.impact === 'HIGH' && e.timestamp > ts);

    if (upcoming.length > 0) {
      const nextEvt = upcoming[0];
      const diffMins = Math.round((nextEvt.timestamp - ts) / 60000);
      return {
        status: diffMins <= 45 ? ('WARNING' as const) : ('UPCOMING' as const),
        title: nextEvt.titleFa,
        minutes: diffMins,
      };
    }

    return {
      status: 'CLEAR' as const,
      title: 'بازار آرام',
      minutes: 0,
    };
  }, [symbol, currentTimestamp]);

  // ۴. وضعیت سپر ضد تیلت و سقف افت روزانه
  const tiltInfo = useMemo(() => {
    let scalePercent = 100;
    if (consecutiveLossCount === 1) scalePercent = 75;
    else if (consecutiveLossCount >= 2) scalePercent = 50;

    const isNearCap = dailyDrawdownPercent >= maxDailyDrawdownPercent * 0.7;
    const isCapHit = dailyDrawdownPercent >= maxDailyDrawdownPercent;

    return {
      scalePercent,
      isNearCap,
      isCapHit,
    };
  }, [consecutiveLossCount, dailyDrawdownPercent, maxDailyDrawdownPercent]);

  return (
    <div className="w-full bg-[#0d111a]/80 border border-[#1e2536] rounded-xl px-3 py-1.5 text-xs select-none transition-all shadow-xs font-sans" dir="rtl">
      {/* نوار تک‌خطی جمع‌وجور و آرامش‌بخش */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar py-0.5 max-w-full shrink">
          {/* چیپ ۱: سشن و کیل‌زون */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-zinc-400 hidden sm:inline">سشن:</span>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1 ${sessionInfo.badgeColor}`}>
              {sessionInfo.isKillzone && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <span>{sessionInfo.sessionLabelFa}</span>
            </span>
          </div>

          <span className="text-zinc-700 hidden sm:inline">•</span>

          {/* چیپ ۲: اسپرد دینامیک */}
          <div className="flex items-center gap-1.5 font-mono">
            <Zap className={`w-3.5 h-3.5 ${spreadInfo.isSpike ? 'text-amber-400' : 'text-emerald-400'}`} />
            <span className="text-[10px] text-zinc-400 hidden sm:inline">اسپرد:</span>
            <span className={`text-[11px] font-bold ${spreadInfo.isSpike ? 'text-amber-300' : 'text-zinc-200'}`}>
              {spreadInfo.finalSpread} Pip
            </span>
          </div>

          <span className="text-zinc-700 hidden sm:inline">•</span>

          {/* چیپ ۳: تقویم ماکرو */}
          <div className="flex items-center gap-1.5">
            {newsInfo.status === 'BLACKOUT' ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            ) : newsInfo.status === 'WARNING' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span className="text-[10px] text-zinc-400 hidden sm:inline">تقویم:</span>
            <span className={`text-[11px] ${
              newsInfo.status === 'BLACKOUT'
                ? 'text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/30'
                : newsInfo.status === 'WARNING'
                ? 'text-amber-300 font-bold'
                : 'text-zinc-300'
            }`}>
              {newsInfo.status === 'BLACKOUT'
                ? `بلک‌اوت (${newsInfo.title})`
                : newsInfo.status === 'WARNING' || newsInfo.status === 'UPCOMING'
                ? `${newsInfo.minutes}د تا ${newsInfo.title}`
                : 'آرام (بدون خبر)'}
            </span>
          </div>

          <span className="text-zinc-700 hidden sm:inline">•</span>

          {/* چیپ ۴: سپر ریسک و افت روز */}
          <div className="flex items-center gap-1.5 font-mono">
            {tiltInfo.scalePercent < 100 ? (
              <Flame className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="text-[10px] text-zinc-400 hidden sm:inline">افت روز:</span>
            <span className={`text-[11px] font-bold ${
              tiltInfo.isCapHit ? 'text-rose-400' : tiltInfo.isNearCap ? 'text-amber-400' : 'text-zinc-300'
            }`}>
              {dailyDrawdownPercent.toFixed(1)}% / {maxDailyDrawdownPercent}%
            </span>
            {tiltInfo.scalePercent < 100 && (
              <span className="text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded font-bold">
                حجم {tiltInfo.scalePercent}%
              </span>
            )}
          </div>
        </div>

        {/* کلید باز کردن جزییات */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-zinc-500 hover:text-zinc-300 p-1 flex items-center gap-1 text-[10px] transition-colors"
          title={isExpanded ? 'بستن جزییات' : 'مشاهده جزییات ریزساختار'}
        >
          <span className="hidden md:inline">{isExpanded ? 'بستن' : 'جزییات'}</span>
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* بخش جزییات اختیاری بازشونده */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-[#1c2230] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-zinc-400">
          <div className="bg-[#121622] p-2 rounded-lg border border-[#21293c]">
            <span className="text-[10px] block text-zinc-500">منطقه زمانی:</span>
            <span className="text-zinc-200 font-bold">{sessionInfo.session}</span>
          </div>
          <div className="bg-[#121622] p-2 rounded-lg border border-[#21293c]">
            <span className="text-[10px] block text-zinc-500">ضریب جهش اسپرد:</span>
            <span className="text-zinc-200 font-bold">{spreadInfo.newsMultiplier}x</span>
          </div>
          <div className="bg-[#121622] p-2 rounded-lg border border-[#21293c]">
            <span className="text-[10px] block text-zinc-500">ضد ضرر متوالی:</span>
            <span className="text-zinc-200 font-bold">{consecutiveLossCount} ضرر پیاپی</span>
          </div>
          <div className="bg-[#121622] p-2 rounded-lg border border-[#21293c]">
            <span className="text-[10px] block text-zinc-500">قیمت جاری:</span>
            <span className="text-zinc-200 font-bold font-mono">{currentPrice.toFixed(symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
