// lib/core/timeframe-aggregator.ts
// موتور تجمیع قطعی کندل‌ها از تایم‌فریم پایه به تایم‌فریم‌های بالاتر
// تضمین عدم انتشار کندل‌های ناتمام و ثبت منبع داده

import { Candle, Timeframe } from '../contracts/market';

export function timeframeToMilliseconds(timeframe: Timeframe): number {
  const durations: Record<Timeframe, number> = {
    '1M': 60_000,
    '5M': 5 * 60_000,
    '15M': 15 * 60_000,
    '1H': 60 * 60_000,
    '4H': 4 * 60 * 60_000,
    D1: 24 * 60 * 60_000,
    W1: 7 * 24 * 60 * 60_000,
  };
  return durations[timeframe] || 300_000;
}

export interface AggregatedCandle extends Candle {
  openTime: number;
  closeTime: number;
  barCount: number;
  isComplete: boolean;
}

/**
 * بررسی زوج‌های مجاز تایم‌فریم اجرا و تاییدیه بر اساس بخش D استاندارد
 */
export const VALID_TIMEFRAME_PAIRS: Record<Timeframe, Timeframe[]> = {
  '1M': ['5M', '15M'],
  '5M': ['15M', '1H'],
  '15M': ['1H', '4H'],
  '1H': ['4H', 'D1'],
  '4H': ['D1'],
  D1: ['W1'],
  W1: [],
};

export function validateTimeframeCombination(
  executionTf: Timeframe,
  confirmationTf: Timeframe
): { isValid: boolean; errorMessageFa?: string } {
  const allowed = VALID_TIMEFRAME_PAIRS[executionTf] || [];
  if (!allowed.includes(confirmationTf)) {
    const validPairsStr = Object.entries(VALID_TIMEFRAME_PAIRS)
      .filter(([_, confs]) => confs.length > 0)
      .map(([exec, confs]) => `${exec} با [${confs.join(', ')}]`)
      .join(' | ');

    return {
      isValid: false,
      errorMessageFa: `ترکیب تایم‌فریم اجرای ${executionTf} با تاییدیه ${confirmationTf} نامعتبر است. تایم‌فریم تاییدیه باید دقیقاً طبق استاندارد بالاتر از تایم‌فریم اجرا باشد. ترکیب‌های مجاز: ${validPairsStr}`,
    };
  }
  return { isValid: true };
}

/**
 * تجمیع اتمیک و قطعی کندل‌های بسته تایم‌فریم پایین به کندل‌های تایم‌فریم بالاتر
 * کندل جاری ناقص که هنوز به انتهای بازه خود نرسیده باشد، در صورت includeIncomplete=false حذف می‌شود.
 */
export function aggregateCandles(
  sourceCandles: readonly Candle[],
  targetTimeframe: Timeframe,
  includeIncomplete = false
): AggregatedCandle[] {
  if (!sourceCandles || sourceCandles.length === 0) {
    return [];
  }

  const targetMs = timeframeToMilliseconds(targetTimeframe);
  const buckets = new Map<number, Candle[]>();

  for (const candle of sourceCandles) {
    // تراز زمان بر مبنای شروع پنجره زمانی تایم‌فریم هدف (مبتنی بر مبدا زمان یونیکس UTC)
    const bucketStart = Math.floor(candle.timestamp / targetMs) * targetMs;
    let list = buckets.get(bucketStart);
    if (!list) {
      list = [];
      buckets.set(bucketStart, list);
    }
    list.push(candle);
  }

  const result: AggregatedCandle[] = [];
  const sortedBucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (let idx = 0; idx < sortedBucketKeys.length; idx++) {
    const bucketStart = sortedBucketKeys[idx];
    const rawList = buckets.get(bucketStart)!;
    // مرتب‌سازی کندل‌های درون باکت بر حسب زمان
    const list = [...rawList].sort((a, b) => a.timestamp - b.timestamp);

    const bucketCloseTime = bucketStart + targetMs;
    const lastCandle = list[list.length - 1];

    // کندل زمانی کامل تلقی می‌شود که حداقل یک کندل در انتهای بازه زمانی داشته باشد
    // یا اینکه باکت بعدی آغاز شده باشد
    const isLastBucket = idx === sortedBucketKeys.length - 1;
    const isComplete = !isLastBucket || (lastCandle.timestamp + (list.length > 1 ? (list[1].timestamp - list[0].timestamp) : 0) >= bucketCloseTime);

    if (!isComplete && !includeIncomplete) {
      // حذف کندل ناتمام برای جلوگیری از Look-ahead bias
      continue;
    }

    const open = list[0].open;
    const close = lastCandle.close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const c of list) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume || 0;
    }

    result.push({
      timestamp: bucketStart,
      open,
      high,
      low,
      close,
      volume,
      isClosed: isComplete,
      openTime: bucketStart,
      closeTime: bucketCloseTime,
      barCount: list.length,
      isComplete,
    });
  }

  return result;
}

export const TimeframeAggregator = {
  aggregateCandles,
  validateTimeframeCombination,
  timeframeToMilliseconds,
};
