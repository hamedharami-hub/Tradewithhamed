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

export interface AggregationDiagnostics {
  totalBuckets: number;
  completeBuckets: number;
  incompleteHtfBucketsRejected: number;
  duplicateTimestampsFound: number;
  outOfGridTimestampsFound: number;
  gapBucketsFound: number;
}

/**
 * تجمیع اتمیک و قطعی کندل‌های بسته تایم‌فریم پایین به کندل‌های تایم‌فریم بالاتر
 * کندل جاری ناقص که هنوز به انتهای بازه خود نرسیده یا دارای گپ/داده نامعتبر باشد،
 * در صورت includeIncomplete=false حذف می‌شود تا از Look-ahead bias جلوگیری گردد.
 */
export function aggregateCandles(
  sourceCandles: readonly Candle[],
  targetTimeframe: Timeframe,
  includeIncomplete = false,
  sourceTimeframe?: Timeframe,
  diagnosticsOut?: AggregationDiagnostics
): AggregatedCandle[] {
  if (!sourceCandles || sourceCandles.length === 0) {
    return [];
  }

  const targetMs = timeframeToMilliseconds(targetTimeframe);
  const sourceMs = sourceTimeframe ? timeframeToMilliseconds(sourceTimeframe) : null;
  const buckets = new Map<number, Candle[]>();

  let outOfGridCount = 0;

  for (const candle of sourceCandles) {
    // تراز زمان بر مبنای شروع پنجره زمانی تایم‌فریم هدف (مبتنی بر مبدا زمان یونیکس UTC)
    const bucketStart = Math.floor(candle.timestamp / targetMs) * targetMs;

    // بررسی تراز روی شبکه زمانی کندل منبع
    if (sourceMs !== null && (candle.timestamp - bucketStart) % sourceMs !== 0) {
      outOfGridCount++;
    }

    let list = buckets.get(bucketStart);
    if (!list) {
      list = [];
      buckets.set(bucketStart, list);
    }
    list.push(candle);
  }

  const result: AggregatedCandle[] = [];
  const sortedBucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  let duplicateCount = 0;
  let gapBucketsCount = 0;
  let incompleteRejected = 0;

  for (let idx = 0; idx < sortedBucketKeys.length; idx++) {
    const bucketStart = sortedBucketKeys[idx];
    const rawList = buckets.get(bucketStart)!;
    // مرتب‌سازی کندل‌های درون باکت بر حسب زمان
    const list = [...rawList].sort((a, b) => a.timestamp - b.timestamp);

    const bucketCloseTime = bucketStart + targetMs;
    const isLastBucket = idx === sortedBucketKeys.length - 1;

    // استخراج گام زمانی منبع درون این باکت یا پیش‌فرض
    let effectiveSourceMs = sourceMs;
    if (!effectiveSourceMs) {
      if (list.length > 1) {
        effectiveSourceMs = list[1].timestamp - list[0].timestamp;
      } else if (sourceCandles.length > 1) {
        effectiveSourceMs = sourceCandles[1].timestamp - sourceCandles[0].timestamp;
      } else {
        effectiveSourceMs = targetMs;
      }
    }

    // اعتبارسنجی تکراری بودن تایم‌استمپ‌ها و پیوستگی شبکه زمانی
    let hasDuplicates = false;
    let hasGaps = false;
    const seenTimestamps = new Set<number>();

    for (let k = 0; k < list.length; k++) {
      const ts = list[k].timestamp;
      if (seenTimestamps.has(ts)) {
        hasDuplicates = true;
        duplicateCount++;
      }
      seenTimestamps.add(ts);

      if (k > 0 && effectiveSourceMs > 0) {
        const step = ts - list[k - 1].timestamp;
        if (step > effectiveSourceMs) {
          hasGaps = true;
        }
      }
    }

    if (hasGaps) {
      gapBucketsCount++;
    }

    // محاسبه تعداد کندل مورد انتظار در یک باکت کامل
    const expectedBarCount = effectiveSourceMs > 0 ? Math.round(targetMs / effectiveSourceMs) : 1;
    const lastCandle = list[list.length - 1];

    // باکت زمانی کاملاً معتبر و کامل است اگر:
    // ۱. سطل آخر ناتمام نباشد (حداقل یک کندل در انتهای بازه را پوشش دهد)
    // ۲. تعداد کندل‌ها با مقدار مورد انتظار همخوانی داشته باشد (بدون کندل جامانده درون باکت)
    // ۳. تایم‌استمپ تکراری یا گپ بازه داخل باکت نداشته باشد
    const reachesBucketClose = (lastCandle.timestamp + (effectiveSourceMs > 0 ? effectiveSourceMs : 0)) >= bucketCloseTime;
    const hasFullBarCount = expectedBarCount <= 1 || list.length >= expectedBarCount;

    let isComplete = false;
    if (targetTimeframe === 'W1' && effectiveSourceMs >= 86400000) {
      // در تایم‌فریم هفتگی D1 به W1، روزهای کاری هفته ۵ روز هستند (نه ۷ روز)
      isComplete = (!isLastBucket || reachesBucketClose) && list.length >= 5 && !hasDuplicates;
    } else {
      isComplete = (!isLastBucket || reachesBucketClose) && hasFullBarCount && !hasDuplicates && !hasGaps;
    }

    if (!isComplete && !includeIncomplete) {
      incompleteRejected++;
      // حذف کندل ناتمام یا مخدوش برای جلوگیری از Look-ahead bias و خطای تجمیع
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

  if (diagnosticsOut) {
    diagnosticsOut.totalBuckets = sortedBucketKeys.length;
    diagnosticsOut.completeBuckets = result.length;
    diagnosticsOut.incompleteHtfBucketsRejected = incompleteRejected;
    diagnosticsOut.duplicateTimestampsFound = duplicateCount;
    diagnosticsOut.outOfGridTimestampsFound = outOfGridCount;
    diagnosticsOut.gapBucketsFound = gapBucketsCount;
  }

  return result;
}

export function validateAlignment(
  sourceCandles: readonly Candle[],
  targetTimeframe: Timeframe,
  sourceTimeframe?: Timeframe
): AggregationDiagnostics {
  const diag: AggregationDiagnostics = {
    totalBuckets: 0,
    completeBuckets: 0,
    incompleteHtfBucketsRejected: 0,
    duplicateTimestampsFound: 0,
    outOfGridTimestampsFound: 0,
    gapBucketsFound: 0,
  };
  aggregateCandles(sourceCandles, targetTimeframe, false, sourceTimeframe, diag);
  return diag;
}

export const TimeframeAggregator = {
  aggregateCandles,
  validateAlignment,
  validateTimeframeCombination,
  timeframeToMilliseconds,
};

