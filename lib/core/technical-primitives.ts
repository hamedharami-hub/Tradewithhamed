// lib/core/technical-primitives.ts
// کتابخانه قواعد تکنیکال استاندارد و ممیزی‌شده نسخه ۱
// شامل EMA، شکست دانچیان، ATR، RSI، باندهای بولینگر، Z-Score و ایچیموکو بدون نگاه به آینده

import type { Candle } from '../contracts/market';
import { calculateWilderATR } from './atr';

export interface IchimokuValues {
  tenkanSen: number;   // Conversion Line (9)
  kijunSen: number;    // Base Line (26)
  senkouSpanA: number; // Leading Span A (ahead 26 bars)
  senkouSpanB: number; // Leading Span B (52, ahead 26 bars)
  chikouSpan: number;  // Lagging Span (behind 26 bars)
  calculatedAtIndex: number;
}

export class TechnicalPrimitives {
  /**
   * محاسبه میانگین متحرک نمایی (EMA)
   */
  public static calculateEma(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const result: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      result.push(values[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  /**
   * ارزیابی جایگاه قیمت نسبت به EMA
   */
  public static evaluateEmaPosition(
    candle: Candle,
    emaValues: number[],
    candleIndex: number
  ): { position: 'ABOVE' | 'BELOW' | 'AT'; distancePercent: number; emaValue: number } {
    const emaValue = emaValues[Math.min(candleIndex, emaValues.length - 1)];
    const dist = ((candle.close - emaValue) / emaValue) * 100;
    return {
      position: candle.close > emaValue ? 'ABOVE' : candle.close < emaValue ? 'BELOW' : 'AT',
      distancePercent: Number(dist.toFixed(2)),
      emaValue,
    };
  }

  /**
   * ارزیابی شیب EMA (Slope)
   */
  public static evaluateEmaSlope(
    emaValues: number[],
    candleIndex: number,
    slopeLookback = 3
  ): { slope: number; direction: 'RISING' | 'FALLING' | 'FLAT' } {
    if (candleIndex < slopeLookback) return { slope: 0, direction: 'FLAT' };
    const current = emaValues[candleIndex];
    const prev = emaValues[candleIndex - slopeLookback];
    const slope = (current - prev) / slopeLookback;
    return {
      slope: Number(slope.toFixed(6)),
      direction: slope > 0.00001 ? 'RISING' : slope < -0.00001 ? 'FALLING' : 'FLAT',
    };
  }

  /**
   * شکست کانال دانچیان (Donchian Breakout)
   */
  public static evaluateDonchianBreakout(
    candles: Candle[],
    candleIndex: number,
    channelPeriod = 20
  ): { breakout: 'UP' | 'DOWN' | 'NONE'; channelHigh: number; channelLow: number } {
    if (candleIndex < channelPeriod) return { breakout: 'NONE', channelHigh: 0, channelLow: 0 };
    const slice = candles.slice(candleIndex - channelPeriod, candleIndex);
    const channelHigh = Math.max(...slice.map(c => c.high));
    const channelLow = Math.min(...slice.map(c => c.low));
    const current = candles[candleIndex];

    if (current.close > channelHigh) return { breakout: 'UP', channelHigh, channelLow };
    if (current.close < channelLow) return { breakout: 'DOWN', channelHigh, channelLow };
    return { breakout: 'NONE', channelHigh, channelLow };
  }

  /**
   * محاسبه شاخص قدرت نسبی (RSI)
   */
  public static calculateRsi(candles: Candle[], period = 14): number[] {
    const rsi: number[] = [];
    if (candles.length < period + 1) return rsi;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = 0; i < period; i++) rsi.push(50); // warmup

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));

    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(Number((100 - (100 / (1 + rs))).toFixed(2)));
    }
    return rsi;
  }

  /**
   * محاسبه باندهای بولینگر (Bollinger Bands)
   */
  public static calculateBollingerBands(
    candles: Candle[],
    period = 20,
    multiplier = 2.0
  ): { middle: number[]; upper: number[]; lower: number[] } {
    const middle: number[] = [];
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      if (i < period - 1) {
        middle.push(candles[i].close);
        upper.push(candles[i].close);
        lower.push(candles[i].close);
        continue;
      }
      const slice = candles.slice(i - period + 1, i + 1);
      const sma = slice.reduce((sum, c) => sum + c.close, 0) / period;
      const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - sma, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      middle.push(sma);
      upper.push(sma + multiplier * stdDev);
      lower.push(sma - multiplier * stdDev);
    }
    return { middle, upper, lower };
  }

  /**
   * محاسبه انحراف آماری Z-Score برای بازگشت به میانگین
   */
  public static calculateZScore(
    candles: Candle[],
    candleIndex: number,
    lookback = 20
  ): number {
    if (candleIndex < lookback) return 0;
    const slice = candles.slice(candleIndex - lookback + 1, candleIndex + 1);
    const mean = slice.reduce((acc, c) => acc + c.close, 0) / lookback;
    const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / lookback;
    const std = Math.sqrt(variance);
    if (std === 0) return 0;
    return Number(((candles[candleIndex].close - mean) / std).toFixed(2));
  }

  /**
   * محاسبه ایچیموکو کینکو هیو (Ichimoku Kinko Hyo)
   * تضمین ضد نگاه به آینده:
   * تفکیک دقیق زمان محاسبه کندل i از خطوط جابجا شده (Shifted Spans).
   * Senkou Span های شیفت‌داده‌شده به آینده هرگز وارد تصمیم‌گیری کندل جاری نمی‌شوند.
   */
  public static calculateIchimokuAt(
    candles: Candle[],
    candleIndex: number,
    tenkanPeriod = 9,
    kijunPeriod = 26,
    senkouBPeriod = 52
  ): IchimokuValues | null {
    if (candleIndex < senkouBPeriod) return null;

    const calcHighLowMid = (period: number): number => {
      const slice = candles.slice(candleIndex - period + 1, candleIndex + 1);
      const h = Math.max(...slice.map(c => c.high));
      const l = Math.min(...slice.map(c => c.low));
      return (h + l) / 2;
    };

    const tenkanSen = calcHighLowMid(tenkanPeriod);
    const kijunSen = calcHighLowMid(kijunPeriod);

    // ابر کومو در کندل جاری حاصل شیفت ۲۶ کندل قبل است (بدون نگاه به آینده)
    let senkouSpanA = (tenkanSen + kijunSen) / 2;
    let senkouSpanB = calcHighLowMid(senkouBPeriod);

    if (candleIndex >= kijunPeriod) {
      // مقادیر تاریخی متناظر با ابر بالای سر کندل جاری (تولیدشده در ۲۶ کندل قبل)
      const pastIdx = candleIndex - kijunPeriod;
      const pastSliceTenkan = candles.slice(pastIdx - tenkanPeriod + 1, pastIdx + 1);
      const pastSliceKijun = candles.slice(pastIdx - kijunPeriod + 1, pastIdx + 1);
      const pastSliceB = candles.slice(pastIdx - senkouBPeriod + 1, pastIdx + 1);

      if (pastSliceB.length === senkouBPeriod) {
        const pastTenkan = (Math.max(...pastSliceTenkan.map(c => c.high)) + Math.min(...pastSliceTenkan.map(c => c.low))) / 2;
        const pastKijun = (Math.max(...pastSliceKijun.map(c => c.high)) + Math.min(...pastSliceKijun.map(c => c.low))) / 2;
        senkouSpanA = (pastTenkan + pastKijun) / 2;
        senkouSpanB = (Math.max(...pastSliceB.map(c => c.high)) + Math.min(...pastSliceB.map(c => c.low))) / 2;
      }
    }

    const chikouSpan = candles[candleIndex].close;

    return {
      tenkanSen: Number(tenkanSen.toFixed(5)),
      kijunSen: Number(kijunSen.toFixed(5)),
      senkouSpanA: Number(senkouSpanA.toFixed(5)),
      senkouSpanB: Number(senkouSpanB.toFixed(5)),
      chikouSpan: Number(chikouSpan.toFixed(5)),
      calculatedAtIndex: candleIndex,
    };
  }
}
