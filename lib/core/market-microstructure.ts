// lib/core/market-microstructure.ts
// ماژول ریزساختار بازار: اسپرد پویا بر حسب سشن، فیلتر رول‌اور، و حل هندسی ابهام درون‌کندلی

import { Candle, SymbolId } from '../contracts/market';

export type MarketSession =
  | 'ASIA'
  | 'LONDON'
  | 'LONDON_NY_OVERLAP'
  | 'NEW_YORK'
  | 'OFF_HOURS';

/**
 * تشخیص سشن معاملاتی بر پایه زمان UTC
 */
export function getSessionForTimestamp(timestamp: number): MarketSession {
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;

  // سشن آسیا: 00:00 تا 06:59 UTC
  if (timeInMinutes < 7 * 60) {
    return 'ASIA';
  }
  // سشن لندن خالص: 07:00 تا 12:59 UTC
  if (timeInMinutes < 13 * 60) {
    return 'LONDON';
  }
  // هم‌پوشانی طلایی لندن و نیویورک: 13:00 تا 16:30 UTC
  if (timeInMinutes <= 16 * 60 + 30) {
    return 'LONDON_NY_OVERLAP';
  }
  // سشن نیویورک عصر: 16:31 تا 20:59 UTC
  if (timeInMinutes < 21 * 60) {
    return 'NEW_YORK';
  }
  // رول‌اور شبانه و خارج از ساعات اصلی: 21:00 تا 23:59 UTC
  return 'OFF_HOURS';
}

/**
 * تشخیص بازهٔ پرخطر رول‌اور شبانه بروکرها و تعطیلی آخر هفته
 * رول‌اور بین ۲۱:۰۰ تا ۲۲:۳۰ UTC که اسپرد به شدت متورم می‌شود و نقدینگی تبخیر می‌گردد.
 */
export function isRolloverBlackout(timestamp: number): boolean {
  const date = new Date(timestamp);
  const day = date.getUTCDay(); // 0 = یکشنبه, 5 = جمعه, 6 = شنبه
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;

  // تعطیلی آخر هفته: جمعه بعد از ۲۱:۰۰ UTC تا یکشنبه ۲۱:۰۰ UTC
  if (day === 5 && timeInMinutes >= 21 * 60) return true;
  if (day === 6) return true;
  if (day === 0 && timeInMinutes < 21 * 60) return true;

  // رول‌اور روزانه (دوشنبه تا پنجشنبه): 21:00 تا 22:30 UTC
  if (timeInMinutes >= 21 * 60 && timeInMinutes <= 22 * 60 + 30) {
    return true;
  }

  return false;
}

/**
 * محاسبهٔ اسپرد پویا بر حسب سشن معاملاتی و شرایط نقدینگی
 * در ساعات لندن/نیویورک اسپرد فشرده‌ترین حالت است و در رول‌اور یا آسیا باز می‌شود.
 */
export function getDynamicSpreadPips(
  symbol: SymbolId,
  timestamp: number,
  baseSpreadPips = 1.2
): number {
  const session = getSessionForTimestamp(timestamp);
  const inRollover = isRolloverBlackout(timestamp);

  // در زمان رول‌اور، اسپرد بین ۳ تا ۶ برابر متورم می‌شود
  if (inRollover) {
    const multiplier = symbol === 'XAUUSD' ? 4.5 : 3.8;
    return Number((baseSpreadPips * multiplier).toFixed(2));
  }

  switch (session) {
    case 'LONDON_NY_OVERLAP':
      // بیشترین نقدینگی و فشرده‌ترین اسپرد
      return Number((baseSpreadPips * 0.9).toFixed(2));
    case 'LONDON':
      // نقدینگی بالا و اسپرد استاندارد
      return Number((baseSpreadPips * 1.0).toFixed(2));
    case 'NEW_YORK':
      // نقدینگی مطلوب
      return Number((baseSpreadPips * 1.1).toFixed(2));
    case 'ASIA':
      // نقدینگی متوسط با اسپرد بازتر
      return Number((baseSpreadPips * 1.6).toFixed(2));
    case 'OFF_HOURS':
    default:
      // ساعات کم‌نقدینگی شبانه
      return Number((baseSpreadPips * 2.2).toFixed(2));
  }
}

export interface IntraBarExitResolution {
  slHit: boolean;
  tpHit: boolean;
  isAmbiguous: boolean;
  firstExit: 'SL' | 'TP' | null;
  rationale: string;
}

/**
 * رفع ابهام مسیر حرکت درون‌کندلی با مدل قطبیت بدنه کندل (Bar Polarity Traversal)
 * هنگامی که هر دو سطح SL و TP درون رنج یک کندل قرار دارند:
 * - کندل صعودی (Close >= Open): توالی Open -> Low -> High -> Close
 * - کندل نزولی (Close < Open): توالی Open -> High -> Low -> Close
 */
export function resolveIntraBarExit(
  candle: Candle,
  direction: 'BUY' | 'SELL',
  stopLossPrice: number,
  takeProfitPrice: number,
  policy: 'PESSIMISTIC' | 'OPTIMISTIC' | 'BAR_POLARITY' = 'BAR_POLARITY'
): IntraBarExitResolution {
  const isBuy = direction === 'BUY';
  const slHit = isBuy ? candle.low <= stopLossPrice : candle.high >= stopLossPrice;
  const tpHit = isBuy ? candle.high >= takeProfitPrice : candle.low <= takeProfitPrice;

  if (!slHit && !tpHit) {
    return { slHit: false, tpHit: false, isAmbiguous: false, firstExit: null, rationale: 'NONE' };
  }

  if (slHit && !tpHit) {
    return { slHit: true, tpHit: false, isAmbiguous: false, firstExit: 'SL', rationale: 'SL_ONLY' };
  }

  if (!slHit && tpHit) {
    return { slHit: false, tpHit: true, isAmbiguous: false, firstExit: 'TP', rationale: 'TP_ONLY' };
  }

  // حالت ابهام: هر دو سطح تاچ شده‌اند
  const isAmbiguous = true;

  if (policy === 'PESSIMISTIC') {
    return {
      slHit: true,
      tpHit: true,
      isAmbiguous,
      firstExit: 'SL',
      rationale: 'PESSIMISTIC_WORST_CASE',
    };
  }

  if (policy === 'OPTIMISTIC') {
    return {
      slHit: true,
      tpHit: true,
      isAmbiguous,
      firstExit: 'TP',
      rationale: 'OPTIMISTIC_BEST_CASE',
    };
  }

  // مدل قطبیت بدنه (BAR_POLARITY)
  const isBullish = candle.close >= candle.open;

  if (isBullish) {
    // مسیر معمول کندل صعودی: ابتدا به سمت Low و سپس صعود به سمت High
    if (isBuy) {
      // برای خرید، رفتن به سمت Low یعنی برخورد زودهنگام به SL
      return {
        slHit: true,
        tpHit: true,
        isAmbiguous,
        firstExit: 'SL',
        rationale: 'BULLISH_BAR_LOW_FIRST_SL',
      };
    } else {
      // برای فروش، رفتن به سمت Low یعنی رسیدن زودهنگام به حد سود (TP)
      return {
        slHit: true,
        tpHit: true,
        isAmbiguous,
        firstExit: 'TP',
        rationale: 'BULLISH_BAR_LOW_FIRST_TP',
      };
    }
  } else {
    // مسیر معمول کندل نزولی: ابتدا به سمت High و سپس سقوط به سمت Low
    if (isBuy) {
      // برای خرید، رفتن به سمت High یعنی رسیدن زودهنگام به حد سود (TP)
      return {
        slHit: true,
        tpHit: true,
        isAmbiguous,
        firstExit: 'TP',
        rationale: 'BEARISH_BAR_HIGH_FIRST_TP',
      };
    } else {
      // برای فروش، رفتن به سمت High یعنی برخورد زودهنگام به SL
      return {
        slHit: true,
        tpHit: true,
        isAmbiguous,
        firstExit: 'SL',
        rationale: 'BEARISH_BAR_HIGH_FIRST_SL',
      };
    }
  }
}
