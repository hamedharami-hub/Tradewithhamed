// lib/core/mtf-alignment.ts
// موتور تراز تایم‌فریم بدون نگاه به آینده (Anti Look-Ahead Alignment Engine)
// تضمین مطلق عدم افشای کندل‌های ناتمام و عدم دسترسی به داده‌های آینده

import { Candle, Timeframe } from '../contracts/market';
import { HigherTimeframeSource } from '../contracts/strategy-parameters';
import { timeframeToMilliseconds } from './timeframe-aggregator';

export type TimeframeAlignmentStatus =
  | 'AVAILABLE'
  | 'NOT_YET_CLOSED'
  | 'MISSING_HISTORY'
  | 'OUTSIDE_RANGE'
  | 'INVALID_SEQUENCE';

export interface MtfAlignmentResult {
  candle: Candle | null;
  candleOpenTime: number;
  candleCloseTime: number;
  availableAt: number;
  source: HigherTimeframeSource;
  alignmentStatus: TimeframeAlignmentStatus;
  reasonCode: string;
  timestamp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

/**
 * بازیابی آخرین کندل بسته شده تایم‌فریم بالاتر با تضمین ضد نگاه‌به‌آینده (O(log N))
 * قانونی قطعی: availableAt = candleCloseTime <= executionTimestamp
 */
export function getLastClosedHigherTimeframeCandle(
  arg1: number | readonly Candle[],
  arg2: number | readonly Candle[],
  higherTimeframe: Timeframe,
  source: HigherTimeframeSource = 'AUTO'
): MtfAlignmentResult {
  let executionTimestamp: number;
  let higherTimeframeCandles: readonly Candle[];

  if (typeof arg1 === 'number') {
    executionTimestamp = arg1;
    higherTimeframeCandles = arg2 as readonly Candle[];
  } else {
    higherTimeframeCandles = arg1 as readonly Candle[];
    executionTimestamp = arg2 as number;
  }
  const tfMs = timeframeToMilliseconds(higherTimeframe);

  if (!higherTimeframeCandles || higherTimeframeCandles.length === 0) {
    return {
      candle: null,
      candleOpenTime: 0,
      candleCloseTime: 0,
      availableAt: 0,
      source,
      alignmentStatus: 'MISSING_HISTORY',
      reasonCode: 'هیچ داده‌ای در تایم‌فریم بالاتر یافت نشد.',
    };
  }

  // بررسی سلامت توالی کندل‌ها
  if (
    higherTimeframeCandles.length > 1 &&
    higherTimeframeCandles[0].timestamp > higherTimeframeCandles[higherTimeframeCandles.length - 1].timestamp
  ) {
    return {
      candle: null,
      candleOpenTime: 0,
      candleCloseTime: 0,
      availableAt: 0,
      source,
      alignmentStatus: 'INVALID_SEQUENCE',
      reasonCode: 'توالی کندل‌های تایم‌فریم بالاتر نامعتبر و غیرصعودی است.',
    };
  }

  // اولین کندل اگر کلوزش از زمان جاری جلوتر باشد هنوز هیچ کندل بسته‌ای در دسترس نیست
  const firstClose = higherTimeframeCandles[0].timestamp + tfMs;
  if (firstClose > executionTimestamp) {
    return {
      candle: null,
      candleOpenTime: higherTimeframeCandles[0].timestamp,
      candleCloseTime: firstClose,
      availableAt: firstClose,
      source,
      alignmentStatus: 'NOT_YET_CLOSED',
      reasonCode: `اولین کندل تایم‌فریم بالاتر در زمان ${new Date(firstClose).toISOString()} بسته می‌شود و در زمان جاری (${new Date(executionTimestamp).toISOString()}) در دسترس نیست.`,
    };
  }

  // جستجوی دودویی برای یافتن آخرین کندلی که closeTime <= executionTimestamp باشد
  let low = 0;
  let high = higherTimeframeCandles.length - 1;
  let bestIdx = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const c = higherTimeframeCandles[mid];
    const cClose = c.timestamp + tfMs;

    if (cClose <= executionTimestamp) {
      bestIdx = mid;
      low = mid + 1; // جستجو برای کندل‌های بسته‌شدهٔ جدیدتر
    } else {
      high = mid - 1;
    }
  }

  if (bestIdx === -1) {
    return {
      candle: null,
      candleOpenTime: 0,
      candleCloseTime: 0,
      availableAt: 0,
      source,
      alignmentStatus: 'OUTSIDE_RANGE',
      reasonCode: 'هیچ کندل بسته‌ای از تایم‌فریم بالاتر قبل از زمان اجرای فعلی وجود ندارد.',
    };
  }

  const matchedCandle = higherTimeframeCandles[bestIdx];
  const candleCloseTime = matchedCandle.timestamp + tfMs;

  return {
    candle: matchedCandle,
    candleOpenTime: matchedCandle.timestamp,
    candleCloseTime,
    availableAt: candleCloseTime,
    source,
    alignmentStatus: 'AVAILABLE',
    reasonCode: 'کندل تاییدشده گذشته و کاملاً بسته در دسترس است.',
    timestamp: matchedCandle.timestamp,
    open: matchedCandle.open,
    high: matchedCandle.high,
    low: matchedCandle.low,
    close: matchedCandle.close,
  };
}

/**
 * ترازساز اشاره‌گر یکنواخت (Monotonic Pointer MTF Alignment Cursor)
 * برای استفاده پرفورمنس بالا در حلقه‌های اجرای بک‌تست (O(1) amortized)
 */
export class MtfAlignmentCursor {
  private lastIndex = 0;
  private readonly tfMs: number;

  constructor(
    private readonly candles: readonly Candle[],
    private readonly higherTimeframe: Timeframe,
    private readonly source: HigherTimeframeSource = 'AUTO'
  ) {
    this.tfMs = timeframeToMilliseconds(higherTimeframe);
  }

  public getClosedCandle(executionTimestamp: number): MtfAlignmentResult {
    if (!this.candles || this.candles.length === 0) {
      return {
        candle: null,
        candleOpenTime: 0,
        candleCloseTime: 0,
        availableAt: 0,
        source: this.source,
        alignmentStatus: 'MISSING_HISTORY',
        reasonCode: 'داده‌های تاییدیه خالی است.',
      };
    }

    // حرکت رو به جلو تا جایی که کندل بسته بعدی از executionTimestamp فراتر نرود
    while (
      this.lastIndex + 1 < this.candles.length &&
      this.candles[this.lastIndex + 1].timestamp + this.tfMs <= executionTimestamp
    ) {
      this.lastIndex++;
    }

    const currentCandle = this.candles[this.lastIndex];
    const currentClose = currentCandle.timestamp + this.tfMs;

    if (currentClose <= executionTimestamp) {
      return {
        candle: currentCandle,
        candleOpenTime: currentCandle.timestamp,
        candleCloseTime: currentClose,
        availableAt: currentClose,
        source: this.source,
        alignmentStatus: 'AVAILABLE',
        reasonCode: 'کندل تاییدیه گذشته با موفقیت تراز شد.',
      };
    }

    // اگر اولین کندل هم هنوز بسته نشده باشد
    return {
      candle: null,
      candleOpenTime: currentCandle.timestamp,
      candleCloseTime: currentClose,
      availableAt: currentClose,
      source: this.source,
      alignmentStatus: 'NOT_YET_CLOSED',
      reasonCode: 'کندل تایم‌فریم بالاتر هنوز باز است.',
    };
  }
}
