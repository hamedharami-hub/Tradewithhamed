// lib/core/data-workbench.ts
// ورک‌بنچ اعتبارسنجی، تجمیع چندتایم‌فریمه و تحلیل گپ‌های داده‌های بازار

import { Candle, SymbolId, Timeframe } from '../contracts/market';

export interface DatasetManifest {
  id: string;
  symbol: SymbolId;
  baseTimeframe: Timeframe;
  startTime: number;
  endTime: number;
  totalCandles: number;
  gapsDetected: number;
  duplicatesFound: number;
  sha256Hash: string;
  integrityStatus: 'UNVERIFIED_CLIENT_IMPORT' | 'VERIFIED_FULL_SHA256';
  source: string;
  license: string;
  hasWarmupData: boolean; // آیا حداقل ۱۴ کندل برای Wilder ATR موجود است؟
}

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: DatasetManifest;
  gapSummary: {
    fromTime: number;
    toTime: number;
    missingCandlesEstimated: number;
  }[];
  cleanCandles?: Candle[];
  metrics?: {
    totalRows: number;
    validCandles: number;
    rejectedRows: number;
    ohlcInvalidCount: number;
    duplicateCount: number;
    gapCount: number;
    inferredTimeframe: Timeframe | null;
  };
}

export class DataWorkbench {
  // ۱. اعتبارسنجی جامع کندل‌ها و کشف داده‌های نامعتبر، تکراری و گپ‌ها
  public static validateCandles(
    rawCandles: Candle[],
    symbol: SymbolId,
    timeframe: Timeframe = '5M',
    source = 'Manual Import'
  ): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const gapSummary: ValidationReport['gapSummary'] = [];

    if (!rawCandles || rawCandles.length === 0) {
      return {
        isValid: false,
        errors: ['فایل ورودی فاقد کندل است.'],
        warnings: [],
        gapSummary: [],
        metrics: {
          totalRows: 0,
          validCandles: 0,
          rejectedRows: 0,
          ohlcInvalidCount: 0,
          duplicateCount: 0,
          gapCount: 0,
          inferredTimeframe: null,
        },
      };
    }

    // مرتب‌سازی زمانی تضمینی
    const sorted = [...rawCandles].sort((a, b) => a.timestamp - b.timestamp);
    let duplicates = 0;
    let ohlcInvalid = 0;
    let timeReversed = 0;
    const intervalMs = this.timeframeToMs(timeframe);
    const cleanCandles: Candle[] = [];

    // تخمین تایم‌فریم از روی دلتای میانگین کندل‌ها
    const deltas: number[] = [];
    for (let i = 1; i < Math.min(sorted.length, 100); i++) {
      const diff = sorted[i].timestamp - sorted[i - 1].timestamp;
      if (diff > 0 && diff <= 24 * 3600 * 1000) {
        deltas.push(diff);
      }
    }
    let inferredTf: Timeframe | null = null;
    if (deltas.length > 0) {
      deltas.sort((a, b) => a - b);
      const medianDelta = deltas[Math.floor(deltas.length / 2)];
      const tfMap: Record<Timeframe, number> = {
        '1M': 60_000,
        '5M': 300_000,
        '15M': 900_000,
        '1H': 3_600_000,
        '4H': 14_400_000,
        D1: 86_400_000,
        W1: 7 * 86_400_000,
      };
      for (const [tf, ms] of Object.entries(tfMap) as [Timeframe, number][]) {
        if (Math.abs(medianDelta - ms) <= ms * 0.25) {
          inferredTf = tf;
          break;
        }
      }
      if (inferredTf && inferredTf !== timeframe) {
        warnings.push(`هشدار تایم‌فریم: داده‌ها به صورت ${inferredTf} به نظر می‌رسند، اما تایم‌فریم پردازش ${timeframe} تنظیم شده است.`);
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      const c = { ...sorted[i] };

      // بررسی صحت منطقی OHLC
      let isOhlcOk = true;
      if (c.high < c.low) {
        isOhlcOk = false;
        ohlcInvalid++;
      } else if (c.high < c.open || c.high < c.close || c.low > c.open || c.low > c.close) {
        // ناهماهنگی جزئی اعشار/اسپرد را تطبیق می‌دهیم
        const highDiff = Math.max(c.open, c.close) - c.high;
        const lowDiff = c.low - Math.min(c.open, c.close);
        if (highDiff <= 0.002 && lowDiff <= 0.002) {
          c.high = Math.max(c.high, c.open, c.close);
          c.low = Math.min(c.low, c.open, c.close);
          ohlcInvalid++;
        } else {
          isOhlcOk = false;
          ohlcInvalid++;
        }
      }

      if (!isOhlcOk) {
        continue;
      }

      // بررسی تکرار زمانی یا معکوس بودن
      if (cleanCandles.length > 0) {
        const prev = cleanCandles[cleanCandles.length - 1];
        if (c.timestamp === prev.timestamp) {
          duplicates++;
          continue;
        } else if (c.timestamp < prev.timestamp) {
          timeReversed++;
          continue;
        } else {
          // بررسی گپ غیرعادی (به جز آخر هفته)
          const diff = c.timestamp - prev.timestamp;
          if (diff > intervalMs * 2.5) {
            const missing = Math.round(diff / intervalMs) - 1;
            const isWeekend = diff > 40 * 3600 * 1000;
            if (!isWeekend) {
              gapSummary.push({
                fromTime: prev.timestamp,
                toTime: c.timestamp,
                missingCandlesEstimated: missing,
              });
            }
          }
        }
      }

      cleanCandles.push(c);
    }

    if (ohlcInvalid > 0) {
      warnings.push(`تعداد ${ohlcInvalid} کندل دارای ناهماهنگی جزئی OHLC شناسایی و پالایش شدند.`);
    }
    if (duplicates > 0) {
      warnings.push(`تعداد ${duplicates} کندل دارای زمان یکسان و تکراری حذف شدند.`);
    }
    if (timeReversed > 0) {
      warnings.push(`تعداد ${timeReversed} کندل خارج از ترتیب زمانی پالایش شدند.`);
    }
    if (gapSummary.length > 0) {
      warnings.push(`تعداد ${gapSummary.length} گپ زمانی غیرتعطیل در داده‌ها شناسایی شد.`);
    }

    const hasWarmupData = cleanCandles.length >= 14;
    if (!hasWarmupData) {
      errors.push('تعداد کندل‌های معتبر کمتر از ۱۴ عدد است (فاز Warmup اندیکاتور ATR تکمیل نمی‌شود).');
    }

    const manifest: DatasetManifest = {
      id: `DS-${symbol}-${Date.now()}`,
      symbol,
      baseTimeframe: timeframe,
      startTime: cleanCandles[0]?.timestamp ?? 0,
      endTime: cleanCandles[cleanCandles.length - 1]?.timestamp ?? 0,
      totalCandles: cleanCandles.length,
      gapsDetected: gapSummary.length,
      duplicatesFound: duplicates,
      sha256Hash: 'UNVERIFIED-CLIENT-IMPORT',
      integrityStatus: 'UNVERIFIED_CLIENT_IMPORT',
      source,
      license: 'Public/Custom Trading Dataset',
      hasWarmupData,
    };

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      manifest,
      gapSummary,
      cleanCandles,
      metrics: {
        totalRows: rawCandles.length,
        validCandles: cleanCandles.length,
        rejectedRows: rawCandles.length - cleanCandles.length,
        ohlcInvalidCount: ohlcInvalid,
        duplicateCount: duplicates,
        gapCount: gapSummary.length,
        inferredTimeframe: inferredTf,
      },
    };
  }

  // ۲. تبدیل فایل متنی CSV به کندل‌های معتبر با قابلیت تنظیم اختلاف زمانی (Timezone Offset)
  public static parseCSV(
    csvText: string,
    timeframe: Timeframe = '5M',
    timezoneOffsetHours: number = 0
  ): { candles: Candle[]; errorCount: number } {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    const candles: Candle[] = [];
    let errorCount = 0;

    if (lines.length <= 1) return { candles: [], errorCount: 0 };

    // بررسی خط اول جهت پیدا کردن ایندکس ستون‌ها
    const header = lines[0].toLowerCase().split(/[,;\t]/);
    const timeIdx = header.findIndex(h => h.includes('time') || h.includes('date'));
    const openIdx = header.findIndex(h => h.includes('open'));
    const highIdx = header.findIndex(h => h.includes('high'));
    const lowIdx = header.findIndex(h => h.includes('low'));
    const closeIdx = header.findIndex(h => h.includes('close'));
    const volIdx = header.findIndex(h => h.includes('vol'));

    const startLine = timeIdx !== -1 && openIdx !== -1 ? 1 : 0;

    for (let i = startLine; i < lines.length; i++) {
      const parts = lines[i].split(/[,;\t]/).map(p => p.trim());
      if (parts.length < 5) {
        errorCount++;
        continue;
      }

      const tStr = parts[timeIdx !== -1 ? timeIdx : 0];
      const oStr = parts[openIdx !== -1 ? openIdx : 1];
      const hStr = parts[highIdx !== -1 ? highIdx : 2];
      const lStr = parts[lowIdx !== -1 ? lowIdx : 3];
      const cStr = parts[closeIdx !== -1 ? closeIdx : 4];
      const vStr = volIdx !== -1 ? parts[volIdx] : '100';

      const parsedTsRaw = isNaN(Number(tStr)) ? Date.parse(tStr) : Number(tStr);
      const parsedTs = parsedTsRaw > 0 && parsedTsRaw < 10_000_000_000 ? parsedTsRaw * 1000 : parsedTsRaw;
      // انطباق دقیق با ساعت هماهنگ جهانی (UTC) با کسر انحراف تایم‌زون
      const timestamp = !isNaN(parsedTs) ? parsedTs - (timezoneOffsetHours * 3600 * 1000) : NaN;
      const open = parseFloat(oStr);
      const high = parseFloat(hStr);
      const low = parseFloat(lStr);
      const close = parseFloat(cStr);
      const volume = parseFloat(vStr) || 100;

      if (!isNaN(timestamp) && !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
        candles.push({
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          isClosed: true,
        });
      } else {
        errorCount++;
      }
    }

    return { candles, errorCount };
  }

  // ۳. تجمیع کندل‌های تایم‌فریم پایین به بالاتر بدون نگاه به آینده
  public static aggregateCandles(
    baseCandles: Candle[],
    targetTimeframe: Timeframe
  ): Candle[] {
    const targetMs = this.timeframeToMs(targetTimeframe);
    const aggregated: Candle[] = [];
    let currentBucket: Candle[] = [];
    let bucketStart = 0;

    for (const candle of baseCandles) {
      const alignedTimestamp = Math.floor(candle.timestamp / targetMs) * targetMs;

      if (currentBucket.length === 0) {
        bucketStart = alignedTimestamp;
        currentBucket.push(candle);
      } else if (alignedTimestamp === bucketStart) {
        currentBucket.push(candle);
      } else {
        // بستن کندل تجمیع‌شده قبلی به صورت قطعی
        aggregated.push(this.mergeCandles(currentBucket, bucketStart));
        bucketStart = alignedTimestamp;
        currentBucket = [candle];
      }
    }

    // سطل آخر ممکن است هنوز در حال شکل‌گیری باشد؛ تا مشاهده اولین کندل سطل بعدی
    // نباید به استراتژی به‌عنوان کندل بسته تحویل شود.
    if (currentBucket.length > 0) {
      aggregated.push({ ...this.mergeCandles(currentBucket, bucketStart), isClosed: false });
    }

    return aggregated;
  }

  private static mergeCandles(bucket: Candle[], timestamp: number): Candle {
    const open = bucket[0].open;
    const close = bucket[bucket.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const c of bucket) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
    }

    return {
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      isClosed: true,
    };
  }

  public static timeframeToMs(tf: Timeframe): number {
    switch (tf) {
      case '1M':
        return 60 * 1000;
      case '5M':
        return 5 * 60 * 1000;
      case '15M':
        return 15 * 60 * 1000;
      case '1H':
        return 60 * 60 * 1000;
      case '4H':
        return 4 * 60 * 60 * 1000;
      case 'D1':
        return 24 * 60 * 60 * 1000;
      case 'W1':
        return 7 * 24 * 60 * 60 * 1000;
      default:
        return 5 * 60 * 1000;
    }
  }

}
