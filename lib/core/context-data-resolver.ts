// lib/core/context-data-resolver.ts
// حل‌کننده داده‌های کانتکست چند تایم‌فریمی (Multi-Timeframe Context Resolver)
// تضمین اکید ضد نگاه به آینده: کندل HTF فقط در صورتی معتبر است که زمان بسته شدن آن <= زمان بسته شدن کندل اجرایی باشد.

import type { Candle, Timeframe } from '../contracts/market';
import { getCandleCloseTimestamp, timeframeToMs } from '../contracts/market';
import type { HtfContextData } from '../contracts/strategy-definition';
import { getLastClosedHigherTimeframeCandle } from './mtf-alignment';

export interface ResolveHtfOptions {
  execCandle: Candle;
  execTimeframe: Timeframe;
  htfCandles: readonly Candle[];
  htfTimeframe: Timeframe;
  isNative?: boolean;
}

export interface MtfCoverageReport {
  isComplete: boolean;
  execBarsCount: number;
  htfBarsCount: number;
  firstExecTime: number;
  lastExecTime: number;
  coverageRatio: number;
  missingRanges: Array<{ start: number; end: number }>;
}

export class ContextDataResolver {
  /**
   * حل و استخراج آخرین کندل بسته شده تایم‌فریم بالاتر (HTF)
   * با تطابق اکید ضد نگاه به آینده (Anti-Lookahead)
   */
  public static resolveHtfContext(options: ResolveHtfOptions): HtfContextData | null {
    const { execCandle, execTimeframe, htfCandles, htfTimeframe, isNative = true } = options;

    if (!execCandle || !htfCandles || htfCandles.length === 0) {
      return null;
    }

    const execCloseTime = getCandleCloseTimestamp(execCandle.timestamp, execTimeframe);
    const htfTfMs = timeframeToMs(htfTimeframe);

    // استفاده از موتور تراز ضد نگاه‌به‌آینده
    // executionTimestamp برای تراز HTF همان زمان بسته شدن کندل اجرایی است
    const alignment = getLastClosedHigherTimeframeCandle(
      execCloseTime,
      htfCandles,
      htfTimeframe,
      isNative ? 'NATIVE_DATASET' : 'AGGREGATED_FROM_EXECUTION'
    );

    if (alignment.alignmentStatus !== 'AVAILABLE' || !alignment.candle) {
      return null;
    }

    const candle = alignment.candle;
    const htfCloseTime = candle.timestamp + htfTfMs;

    // گیت ضد نگاه به آینده: کندل HTF نباید پس از پایان کندل اجرایی بسته شود
    if (htfCloseTime > execCloseTime) {
      return null;
    }

    return {
      timeframe: htfTimeframe,
      candle,
      closeTimestamp: htfCloseTime,
      isNative,
      availableAt: htfCloseTime,
    };
  }

  /**
   * بررسی پوشش داده‌های HTF در طول بازه کندل‌های اجرایی
   */
  public static validateCoverage(
    execCandles: readonly Candle[],
    execTimeframe: Timeframe,
    htfCandles: readonly Candle[],
    htfTimeframe: Timeframe
  ): MtfCoverageReport {
    if (!execCandles || execCandles.length === 0) {
      return {
        isComplete: false,
        execBarsCount: 0,
        htfBarsCount: htfCandles?.length || 0,
        firstExecTime: 0,
        lastExecTime: 0,
        coverageRatio: 0,
        missingRanges: [],
      };
    }

    const firstExec = execCandles[0].timestamp;
    const lastExec = execCandles[execCandles.length - 1].timestamp;

    if (!htfCandles || htfCandles.length === 0) {
      return {
        isComplete: false,
        execBarsCount: execCandles.length,
        htfBarsCount: 0,
        firstExecTime: firstExec,
        lastExecTime: lastExec,
        coverageRatio: 0,
        missingRanges: [{ start: firstExec, end: lastExec }],
      };
    }

    let coveredBars = 0;
    const missingRanges: Array<{ start: number; end: number }> = [];
    let currentMissingStart: number | null = null;

    for (const execCandle of execCandles) {
      const htf = this.resolveHtfContext({
        execCandle,
        execTimeframe,
        htfCandles,
        htfTimeframe,
      });

      if (htf) {
        coveredBars++;
        if (currentMissingStart !== null) {
          missingRanges.push({ start: currentMissingStart, end: execCandle.timestamp });
          currentMissingStart = null;
        }
      } else {
        if (currentMissingStart === null) {
          currentMissingStart = execCandle.timestamp;
        }
      }
    }

    if (currentMissingStart !== null) {
      missingRanges.push({ start: currentMissingStart, end: lastExec });
    }

    const coverageRatio = coveredBars / execCandles.length;

    return {
      isComplete: coveredBars === execCandles.length,
      execBarsCount: execCandles.length,
      htfBarsCount: htfCandles.length,
      firstExecTime: firstExec,
      lastExecTime: lastExec,
      coverageRatio,
      missingRanges,
    };
  }
}
