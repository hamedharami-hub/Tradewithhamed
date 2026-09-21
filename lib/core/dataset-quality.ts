// lib/core/dataset-quality.ts
// موتور جامع ارزیابی کیفیت، اعتبارسنجی سلامت داده و صدور شناسنامه دیتاست (Dataset Passport)
// بدون دست‌کاری حجم‌های گمشده و با تفکیک دقیق منابع حجم و آزمون وارم‌آپ

import { Candle, SymbolId, SYMBOL_SPECS, Timeframe } from '../contracts/market';
import {
  DatasetPassport,
  DatasetQualityMetrics,
  DatasetQualityValidationOptions,
  InstrumentType,
  VolumeType,
} from '../contracts/dataset-contract';
import { DatasetFingerprintEngine } from './dataset-fingerprint';

export class DatasetQualityEngine {
  public static timeframeToMs(timeframe: Timeframe): number {
    const values: Record<Timeframe, number> = {
      '1M': 60_000,
      '5M': 300_000,
      '15M': 900_000,
      '1H': 3_600_000,
      '4H': 14_400_000,
      D1: 86_400_000,
      W1: 7 * 86_400_000,
    };
    return values[timeframe] || 900_000;
  }

  /**
   * ارزیابی ماهیت حجم داده بدون تزریق مقادیر ساختگی
   */
  public static detectVolumeType(candles: readonly Candle[]): VolumeType {
    if (!candles || candles.length === 0) return 'MISSING';

    let nonZeroCount = 0;
    let floatVolumeCount = 0;
    let integerVolumeCount = 0;

    for (let i = 0; i < candles.length; i++) {
      const v = candles[i].volume;
      if (v !== undefined && v > 0) {
        nonZeroCount++;
        if (Math.floor(v) !== v) {
          floatVolumeCount++;
        } else {
          integerVolumeCount++;
        }
      }
    }

    if (nonZeroCount === 0 || (nonZeroCount / candles.length) < 0.05) {
      return 'MISSING';
    }

    // حجم‌های اعشاری یا بسیار بزرگ بیانگر حجم واقعی سفارشات صرافی هستند
    if (floatVolumeCount > 0) {
      return 'REAL_SOURCE_VOLUME';
    }

    // حجم‌های عددی صحیح معمولاً شمارش تیک (Tick Volume) هستند
    if (integerVolumeCount > 0) {
      return 'TICK_VOLUME';
    }

    return 'MISSING';
  }

  /**
   * پالایش، اعتبارسنجی و صدور شناسنامه جامع برای دیتاست
   */
  public static inspectAndValidate(
    rawCandles: readonly Candle[],
    symbol: SymbolId = 'GBPUSD',
    timeframe: Timeframe = '15M',
    options: DatasetQualityValidationOptions = {}
  ): {
    acceptedCandles: Candle[];
    passport: DatasetPassport;
  } {
    const minCandles = options.minimumCandles ?? 14;
    const minWarmup = options.minimumWarmupBars ?? 200;
    const intervalMs = this.timeframeToMs(timeframe);

    const errors: string[] = [];
    const warnings: string[] = [];
    const accepted: Candle[] = [];

    let duplicateCount = 0;
    let reversedTimestampCount = 0;
    let gapCount = 0;
    let weekendGapCount = 0;
    let flatCandleCount = 0;
    let zeroVolumeCount = 0;
    let negativePriceCount = 0;
    let invalidSpreadCount = 0;
    let rejectedCount = 0;

    let prevTs = -1;

    for (let i = 0; i < rawCandles.length; i++) {
      const c = rawCandles[i];

      // ۱. اعتبارسنجی مقادیر عددی
      if (
        !Number.isFinite(c.timestamp) ||
        !Number.isFinite(c.open) ||
        !Number.isFinite(c.high) ||
        !Number.isFinite(c.low) ||
        !Number.isFinite(c.close)
      ) {
        rejectedCount++;
        continue;
      }

      // ۲. بررسی قیمت‌های مثبت
      if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
        negativePriceCount++;
        rejectedCount++;
        continue;
      }

      // ۳. بررسی درستی منطق OHLC
      if (c.high < c.low || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) {
        invalidSpreadCount++;
        rejectedCount++;
        continue;
      }

      // ۴. بررسی کندل‌های مسطح (Zero Range)
      if (c.high === c.low) {
        flatCandleCount++;
      }

      // ۵. بررسی حجم
      if (!c.volume || c.volume <= 0) {
        zeroVolumeCount++;
      }

      // ۶. کنترل ترتیب زمانی و تکراری
      if (prevTs > 0) {
        if (c.timestamp === prevTs) {
          duplicateCount++;
          rejectedCount++;
          continue;
        }
        if (c.timestamp < prevTs) {
          reversedTimestampCount++;
          rejectedCount++;
          continue;
        }

        const delta = c.timestamp - prevTs;
        if (delta > intervalMs * 2.5) {
          const isWeekend = delta >= 36 * 3600_000;
          if (isWeekend) {
            weekendGapCount++;
          } else {
            gapCount++;
          }
        }
      }

      prevTs = c.timestamp;
      accepted.push({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
        isClosed: c.isClosed !== false,
      });
    }

    // ۷. حذف کندل ناقص احتمالی در انتهای بازه (Incomplete Trailing Bar)
    let hasIncompleteTrailingBar = false;
    if (accepted.length > 0 && options.dropIncompleteTrailingBar !== false) {
      const lastCandle = accepted[accepted.length - 1];
      if (lastCandle.isClosed === false) {
        accepted.pop();
        hasIncompleteTrailingBar = true;
        warnings.push('کندل باز انتهای بازه جهت پیشگیری از خطای نگاه‌به‌آینده حذف شد.');
      }
    }

    if (accepted.length < minCandles) {
      errors.push(`تعداد کندل‌های معتبر (${accepted.length}) کمتر از حداقل مجاز (${minCandles}) است.`);
    }

    const warmupBarsAvailable = accepted.length;
    const hasSufficientWarmup = warmupBarsAvailable >= minWarmup;
    if (!hasSufficientWarmup) {
      warnings.push(`تعداد کل کندل‌ها (${warmupBarsAvailable}) کمتر از وارم‌آپ بهینه (${minWarmup}) است؛ معاملات ممکن است محدود شوند.`);
    }

    if (gapCount > 0) {
      warnings.push(`${gapCount} مورد گپ زمانی درون هفته در داده‌ها شناسایی شد.`);
    }

    // محاسبه امتیاز کیفیت (۰ تا ۱۰۰)
    let qualityPenalty = (rejectedCount * 2) + (gapCount * 3) + (duplicateCount * 2) + (reversedTimestampCount * 10);
    if (flatCandleCount > accepted.length * 0.1) qualityPenalty += 10;
    const qualityScorePercent = Math.max(0, Math.min(100, Math.round(100 - (qualityPenalty / Math.max(1, rawCandles.length)) * 100)));

    const volumeType = this.detectVolumeType(accepted);
    const spec = SYMBOL_SPECS[symbol];
    let instrumentType: InstrumentType = 'FOREX';
    if (spec) {
      if (spec.category === 'METALS') instrumentType = 'METALS';
      else if (spec.category === 'CRYPTO') instrumentType = 'CRYPTO';
    }

    const firstValidTimestamp = accepted.length > 0 ? accepted[0].timestamp : 0;
    const lastValidTimestamp = accepted.length > 0 ? accepted[accepted.length - 1].timestamp : 0;

    const fpSha256 = DatasetFingerprintEngine.computeSha256(accepted, symbol, timeframe);
    const fpFnv1a = DatasetFingerprintEngine.compute(accepted, symbol, timeframe);

    const firstDate = firstValidTimestamp > 0 ? new Date(firstValidTimestamp).toISOString().slice(0, 10) : 'N/A';
    const lastDate = lastValidTimestamp > 0 ? new Date(lastValidTimestamp).toISOString().slice(0, 10) : 'N/A';
    const coverageLabelFa = `${firstDate} تا ${lastDate} (${accepted.length.toLocaleString('fa-IR')} کندل)`;

    const qualityMetrics: DatasetQualityMetrics = {
      totalRawCandles: rawCandles.length,
      acceptedCandles: accepted.length,
      rejectedCandles: rejectedCount,
      duplicateCount,
      reversedTimestampCount,
      gapCount,
      weekendGapCount,
      flatCandleCount,
      zeroVolumeCount,
      missingVolumeCount: volumeType === 'MISSING' ? accepted.length : 0,
      negativePriceCount,
      invalidSpreadCount,
      qualityScorePercent,
      validationPassed: errors.length === 0,
      errors,
      warnings,
    };

    const passport: DatasetPassport = {
      datasetId: `ds-${symbol}-${timeframe}-${firstValidTimestamp}`,
      source: 'BUNDLED_STANDARDIZED',
      symbol,
      instrumentType,
      timeframe,
      timezone: 'UTC',
      candleTimestampMeaning: 'OPEN_TIME',
      volumeType,
      firstValidTimestamp,
      lastValidTimestamp,
      totalCandles: accepted.length,
      warmupBarsAvailable,
      hasSufficientWarmup,
      fingerprintSha256: fpSha256,
      fingerprintFnv1a: fpFnv1a,
      quality: qualityMetrics,
      coverageLabelFa,
      isComplete: errors.length === 0,
      hasIncompleteTrailingBar,
      verifiedAt: new Date().toISOString(),
    };

    return {
      acceptedCandles: accepted,
      passport,
    };
  }
}
