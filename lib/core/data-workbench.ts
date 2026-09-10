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
      };
    }

    // مرتب‌سازی زمانی تضمینی
    const sorted = [...rawCandles].sort((a, b) => a.timestamp - b.timestamp);
    let duplicates = 0;
    const intervalMs = this.timeframeToMs(timeframe);

    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];

      // بررسی صحت منطقی OHLC
      if (c.high < c.low) {
        errors.push(`کندل در زمان ${c.timestamp} دارای سقف کمتر از کف است (High < Low).`);
      }
      if (c.high < c.open || c.high < c.close) {
        errors.push(`کندل در زمان ${c.timestamp} دارای سقف کمتر از قیمت باز/بسته است.`);
      }
      if (c.low > c.open || c.low > c.close) {
        errors.push(`کندل در زمان ${c.timestamp} دارای کف بالاتر از قیمت باز/بسته است.`);
      }

      // بررسی تکرار زمانی
      if (i > 0) {
        const prev = sorted[i - 1];
        if (c.timestamp === prev.timestamp) {
          duplicates++;
        } else if (c.timestamp < prev.timestamp) {
          errors.push(`ترتیب زمانی معکوس در کندل ${c.timestamp}`);
        } else {
          // بررسی گپ غیرعادی (به جز آخر هفته)
          const diff = c.timestamp - prev.timestamp;
          if (diff > intervalMs * 2.5) {
            const missing = Math.round(diff / intervalMs) - 1;
            // فیلتر کردن گپ‌های عادی تعطیلات آخر هفته (بیشتر از ۴۸ ساعت)
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
    }

    if (duplicates > 0) {
      warnings.push(`تعداد ${duplicates} کندل دارای زمان یکسان و تکراری شناسایی شد.`);
    }
    if (gapSummary.length > 0) {
      warnings.push(`تعداد ${gapSummary.length} گپ زمانی غیرتعطیل در داده‌ها شناسایی شد.`);
    }

    const hasWarmupData = sorted.length >= 14;
    if (!hasWarmupData) {
      errors.push('تعداد کندل‌ها کمتر از ۱۴ عدد است (فاز Warmup اندیکاتور ATR تکمیل نمی‌شود).');
    }

    const manifest: DatasetManifest = {
      id: `DS-${symbol}-${Date.now()}`,
      symbol,
      baseTimeframe: timeframe,
      startTime: sorted[0].timestamp,
      endTime: sorted[sorted.length - 1].timestamp,
      totalCandles: sorted.length,
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
