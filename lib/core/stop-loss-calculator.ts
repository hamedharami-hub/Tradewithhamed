// lib/core/stop-loss-calculator.ts
// موتور تخصصی محاسبه و اعتبارسنجی حد ضرر (Stop-Loss Calculator)
// پشتیبانی از ATR, STRUCTURE و FIXED_PIPS بر اساس بخش J مشخصات

import { Candle, SymbolId, SYMBOL_SPECS, Timeframe } from '../contracts/market';
import { StopLossMode } from '../contracts/strategy-parameters';
import { calculateWilderATR } from './atr';
import { detectSwingPoints } from './swings';

export type StopLossValidationStatus =
  | 'VALID'
  | 'ZERO_STOP_DISTANCE'
  | 'STOP_ON_WRONG_SIDE'
  | 'STOP_TOO_CLOSE'
  | 'STOP_TOO_FAR'
  | 'INSUFFICIENT_ATR'
  | 'INSUFFICIENT_STRUCTURE'
  | 'RISK_EXCEEDS_LIMIT';

export interface CalculatedStopLossResult {
  status: StopLossValidationStatus;
  stopLossPrice: number;
  rawStopPrice: number;
  riskDistancePrice: number;
  riskDistancePips: number;
  reasonFa: string;
}

export class StopLossCalculator {
  /**
   * محاسبه دقیق حد ضرر متناسب با شیوه انتخابی و مشخصات نماد
   */
  public static calculate(
    mode: StopLossMode,
    direction: 'BUY' | 'SELL',
    entryPrice: number,
    candles: readonly Candle[],
    symbol: SymbolId,
    timeframe: Timeframe,
    options: {
      atrPeriod?: number;
      atrMultiplier?: number;
      fixedStopPips?: number;
      structureLookback?: number;
      minStopPips?: number;
      maxStopPips?: number;
    } = {}
  ): CalculatedStopLossResult {
    const spec = SYMBOL_SPECS[symbol];
    const pipSize = spec.pipSize;
    const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
    const minStopPips = options.minStopPips ?? 2.0;
    const maxStopPips = options.maxStopPips ?? (symbol === 'XAUUSD' ? 500 : 300);

    let rawStop = 0;

    switch (mode) {
      case 'FIXED_PIPS': {
        const pips = options.fixedStopPips || 20;
        const dist = pips * pipSize;
        rawStop = direction === 'BUY' ? entryPrice - dist : entryPrice + dist;
        break;
      }

      case 'STRUCTURE': {
        const lookback = options.structureLookback || 5;
        const currentIdx = candles.length - 1;
        const swings = detectSwingPoints([...candles], timeframe);
        // فقط پیوت‌هایی که در گذشته یا همین لحظه تایید شده‌اند مجاز هستند
        const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= currentIdx);

        if (direction === 'BUY') {
          const lows = confirmedSwings.filter(s => s.type === 'LOW').slice(-lookback);
          if (lows.length === 0) {
            return {
              status: 'INSUFFICIENT_STRUCTURE',
              stopLossPrice: 0,
              rawStopPrice: 0,
              riskDistancePrice: 0,
              riskDistancePips: 0,
              reasonFa: 'هیچ پیوت کف ساختار تاییدشده‌ای در گذشته برای تعیین حد ضرر یافت نشد.',
            };
          }
          // پایین‌ترین پیوت کف اخیر منهای یک بافر جزیی
          const lowestRecentLow = Math.min(...lows.map(l => l.price));
          const buffer = 2 * pipSize;
          rawStop = lowestRecentLow - buffer;
        } else {
          const highs = confirmedSwings.filter(s => s.type === 'HIGH').slice(-lookback);
          if (highs.length === 0) {
            return {
              status: 'INSUFFICIENT_STRUCTURE',
              stopLossPrice: 0,
              rawStopPrice: 0,
              riskDistancePrice: 0,
              riskDistancePips: 0,
              reasonFa: 'هیچ پیوت سقف ساختار تاییدشده‌ای در گذشته برای تعیین حد ضرر یافت نشد.',
            };
          }
          const highestRecentHigh = Math.max(...highs.map(h => h.price));
          const buffer = 2 * pipSize;
          rawStop = highestRecentHigh + buffer;
        }
        break;
      }

      case 'ATR':
      default: {
        const period = options.atrPeriod || 14;
        const mult = options.atrMultiplier ?? 1.5;
        const atrs = calculateWilderATR([...candles], period);
        if (atrs.length === 0) {
          return {
            status: 'INSUFFICIENT_ATR',
            stopLossPrice: 0,
            rawStopPrice: 0,
            riskDistancePrice: 0,
            riskDistancePips: 0,
            reasonFa: 'تعداد کندل‌ها برای محاسبه شاخص ATR کافی نیست.',
          };
        }
        const currentAtr = atrs[atrs.length - 1];
        const dist = currentAtr * mult;
        rawStop = direction === 'BUY' ? entryPrice - dist : entryPrice + dist;
        break;
      }
    }

    const stopLossPrice = Number(rawStop.toFixed(precision));
    const priceDiff = direction === 'BUY' ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;

    // ۱. بررسی فاصله صفر
    if (Math.abs(priceDiff) < 1e-7) {
      return {
        status: 'ZERO_STOP_DISTANCE',
        stopLossPrice,
        rawStopPrice: rawStop,
        riskDistancePrice: 0,
        riskDistancePips: 0,
        reasonFa: 'فاصله حد ضرر تا قیمت ورود صفر است.',
      };
    }

    // ۲. بررسی جهت اشتباه حد ضرر
    if (priceDiff < 0) {
      return {
        status: 'STOP_ON_WRONG_SIDE',
        stopLossPrice,
        rawStopPrice: rawStop,
        riskDistancePrice: Math.abs(priceDiff),
        riskDistancePips: Math.abs(priceDiff) / pipSize,
        reasonFa: direction === 'BUY'
          ? 'حد ضرر خرید باید زیر قیمت ورود باشد اما بالاتر قرار گرفته است.'
          : 'حد ضرر فروش باید بالای قیمت ورود باشد اما پایین‌تر قرار گرفته است.',
      };
    }

    const distancePips = priceDiff / pipSize;

    // ۳. بررسی حد ضرر خیلی کوچک
    if (distancePips < minStopPips) {
      return {
        status: 'STOP_TOO_CLOSE',
        stopLossPrice,
        rawStopPrice: rawStop,
        riskDistancePrice: priceDiff,
        riskDistancePips: distancePips,
        reasonFa: `فاصله حد ضرر (${distancePips.toFixed(1)} پیپ) کمتر از حداقل مجاز (${minStopPips} پیپ) است.`,
      };
    }

    // ۴. بررسی حد ضرر خیلی بزرگ
    if (distancePips > maxStopPips) {
      return {
        status: 'STOP_TOO_FAR',
        stopLossPrice,
        rawStopPrice: rawStop,
        riskDistancePrice: priceDiff,
        riskDistancePips: distancePips,
        reasonFa: `فاصله حد ضرر (${distancePips.toFixed(1)} پیپ) بیش از حداکثر مجاز (${maxStopPips} پیپ) است.`,
      };
    }

    return {
      status: 'VALID',
      stopLossPrice,
      rawStopPrice: rawStop,
      riskDistancePrice: priceDiff,
      riskDistancePips: Number(distancePips.toFixed(1)),
      reasonFa: `حد ضرر ${mode} با موفقیت در فاصله ${distancePips.toFixed(1)} پیپ تایید شد.`,
    };
  }
}
