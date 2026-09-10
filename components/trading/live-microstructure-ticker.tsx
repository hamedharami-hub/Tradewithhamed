// components/trading/live-microstructure-ticker.tsx
// نوار دیده‌بان بلادرنگ ریزساختار بازار، سشن، اسپرد، تقویم اقتصادی و سپر ریسک ضد تیلت

'use client';

import React, { useMemo } from 'react';
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
  // ۱. محاسبه سشن و بررسی رول‌اور
  const sessionInfo = useMemo(() => {
    const ts = currentTimestamp;
    const session = getSessionForTimestamp(ts);
    const inRollover = isRolloverBlackout(ts);

    let sessionLabelFa = 'ساعات کم‌حجم';
    let isKillzone = false;
    let badgeColor = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';

    if (inRollover) {
      sessionLabelFa = 'رول‌اور شبانه نیویورک';
      badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    } else if (session === 'LONDON_NY_OVERLAP') {
      sessionLabelFa = 'کیل‌زون لندن و نیویورک';
      isKillzone = true;
      badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    } else if (session === 'LONDON') {
      sessionLabelFa = 'سشن اصلی لندن';
      isKillzone = true;
      badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    } else if (session === 'NEW_YORK') {
      sessionLabelFa = 'سشن عصر نیویورک';
      badgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    } else if (session === 'ASIA') {
      sessionLabelFa = 'سشن توکیو و سیدنی';
      badgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
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

    // جستجوی نزدیک‌ترین رویداد تا ۴ ساعت آینده
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
      title: 'بازار بدون خبر سنگین تا ۴ ساعت آینده',
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
    <div
      className="bg-[#0f131d] border border-[#202738] rounded-2xl p-2.5 sm:px-3.5 sm:py-2.5 shadow-md flex flex-wrap items-center justify-between gap-2.5 text-xs select-none transition-all"
      dir="rtl"
    >
      {/* بخش ۱: سشن بازار و کیل‌زون */}
      <div className="flex items-center gap-2 min-w-fit">
        <div className="p-1.5 rounded-lg bg-[#151b29] border border-[#242d40] text-zinc-300">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-400 leading-none">سشن معاملاتی:</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${sessionInfo.badgeColor}`}>
              {sessionInfo.sessionLabelFa}
            </span>
            {sessionInfo.isKillzone && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* بخش ۲: اسپرد دینامیک لحظه‌ای */}
      <div className="flex items-center gap-2 min-w-fit">
        <div className="p-1.5 rounded-lg bg-[#151b29] border border-[#242d40] text-zinc-300">
          <Zap className={`w-3.5 h-3.5 ${spreadInfo.isSpike ? 'text-amber-400' : 'text-emerald-400'}`} />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-400 leading-none">اسپرد زنده {symbol}:</span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`font-mono font-bold text-xs ${spreadInfo.isSpike ? 'text-amber-300' : 'text-zinc-200'}`}>
              {spreadInfo.finalSpread} پیپ
            </span>
            <span className="text-[10px] text-zinc-400">
              {spreadInfo.isSpike ? '(اتساع شب/خبر)' : '(نرمال)'}
            </span>
          </div>
        </div>
      </div>

      {/* بخش ۳: رادار تقویم اقتصادی */}
      <div className="flex items-center gap-2 min-w-fit">
        <div className="p-1.5 rounded-lg bg-[#151b29] border border-[#242d40]">
          {newsInfo.status === 'BLACKOUT' ? (
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
          ) : newsInfo.status === 'WARNING' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-400 leading-none">دیده‌بان رویدادهای ماکرو:</span>
          <div className="mt-0.5">
            {newsInfo.status === 'BLACKOUT' ? (
              <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/30 flex items-center gap-1">
                <span>بلک‌اوت خبر</span>
                <span className="font-mono text-[10px]">({newsInfo.title})</span>
              </span>
            ) : newsInfo.status === 'WARNING' ? (
              <span className="text-[11px] font-bold text-amber-300">
                {newsInfo.minutes} دقیقه تا {newsInfo.title}
              </span>
            ) : newsInfo.status === 'UPCOMING' ? (
              <span className="text-[11px] text-zinc-300">
                {newsInfo.minutes} دقیقه تا {newsInfo.title}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-300 font-medium">
                بازار آرام (بدون خبر سنگین)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* بخش ۴: سپر ریسک و ضد تیلت */}
      <div className="flex items-center gap-2 min-w-fit">
        <div className="p-1.5 rounded-lg bg-[#151b29] border border-[#242d40]">
          {tiltInfo.scalePercent < 100 ? (
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-400 leading-none">سپر ریسک و ضد تیلت:</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[11px] font-bold ${
              tiltInfo.isCapHit
                ? 'text-rose-400'
                : tiltInfo.isNearCap
                ? 'text-amber-400'
                : 'text-zinc-200'
            }`}>
              افت روز: {dailyDrawdownPercent.toFixed(1)}٪ / {maxDailyDrawdownPercent}٪
            </span>
            {tiltInfo.scalePercent < 100 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/15 text-amber-300 rounded font-bold border border-amber-500/30">
                حجم: {tiltInfo.scalePercent}٪
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
