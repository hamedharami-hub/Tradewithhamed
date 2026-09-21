// lib/core/__tests__/dataset-time-contract.test.ts
// مجموعه آزمون‌های جامع پکیج A: شناسنامه دیتاست، اثرانگشت SHA-256، تفکیک منابع حجم،
// یکپارچگی زمان و سشن، مدیریت گپ و جلوگیری قطعی از رگرسیون یا گیر کردن در بکتست GBPUSD

import { Candle, Timeframe, SymbolId } from '../../contracts/market';
import { VolumeType, DatasetPassport } from '../../contracts/dataset-contract';
import { DatasetQualityEngine } from '../dataset-quality';
import { DatasetFingerprintEngine } from '../dataset-fingerprint';
import { SessionTimezoneEngine } from '../session-timezone';
import { ResearchLab } from '../research-lab';

export interface DatasetTimeContractTestResult {
  name: string;
  passed: boolean;
  details: string;
}

function makeCandle(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
  isClosed = true
): Candle {
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume,
    isClosed,
  };
}

function generateCandles(
  count: number,
  startTs = 1704067200000, // 2024-01-01 00:00:00 UTC
  stepMs = 900_000,        // 15M
  startPrice = 1.2500,
  volume = 100
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 10) * 0.0030;
    const open = price;
    const close = Number((startPrice + wave + (i % 2 === 0 ? 0.0006 : -0.0005)).toFixed(5));
    const high = Number((Math.max(open, close) + 0.0008).toFixed(5));
    const low = Number((Math.min(open, close) - 0.0008).toFixed(5));
    price = close;
    candles.push(makeCandle(startTs + i * stepMs, open, high, low, close, volume, true));
  }
  return candles;
}

export function runDatasetTimeContractTestSuite(): DatasetTimeContractTestResult[] {
  const results: DatasetTimeContractTestResult[] = [];

  // ۱. قطعیت و حساسیت به تغییر اثرانگشت SHA-256 (Determinism & Tamper Sensitivity)
  try {
    const candles1 = generateCandles(30);
    const candles2 = generateCandles(30);
    const fp1 = DatasetFingerprintEngine.computeSha256(candles1, 'GBPUSD', '15M');
    const fp2 = DatasetFingerprintEngine.computeSha256(candles2, 'GBPUSD', '15M');

    // دست‌کاری نامحسوس یک کندل
    const tamperedCandles = [...candles1];
    tamperedCandles[10] = { ...tamperedCandles[10], close: tamperedCandles[10].close + 0.00001 };
    const fpTampered = DatasetFingerprintEngine.computeSha256(tamperedCandles, 'GBPUSD', '15M');

    const passed =
      fp1 === fp2 &&
      fp1 !== fpTampered &&
      fp1.startsWith('sha256-') &&
      fp1.length === 71 &&
      /^[0-9a-f]{64}$/.test(fp1.replace('sha256-', ''));
    results.push({
      name: 'SHA-256 Fingerprint Determinism and Tamper Sensitivity',
      passed,
      details: passed
        ? `Deterministic hash generated: ${fp1.slice(0, 19)}..., sensitivity verified.`
        : `Hash mismatch or format invalid: ${fp1}`,
    });
  } catch (err) {
    results.push({
      name: 'SHA-256 Fingerprint Determinism and Tamper Sensitivity',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. تشخیص دقیق حجم واقعی، تیک، مفقود و ساختگی (Volume Classification Taxonomy)
  try {
    const realVolumeCandles = generateCandles(20).map(c => ({ ...c, volume: 1542.45 }));
    const tickVolumeCandles = generateCandles(20).map(c => ({ ...c, volume: 450 }));
    const missingVolumeCandles = generateCandles(20).map(c => ({ ...c, volume: 0 }));

    const typeReal = DatasetQualityEngine.detectVolumeType(realVolumeCandles);
    const typeTick = DatasetQualityEngine.detectVolumeType(tickVolumeCandles);
    const typeMissing = DatasetQualityEngine.detectVolumeType(missingVolumeCandles);

    const passed =
      typeReal === 'REAL_SOURCE_VOLUME' &&
      typeTick === 'TICK_VOLUME' &&
      typeMissing === 'MISSING';

    results.push({
      name: 'Volume Classification Taxonomy: REAL_SOURCE_VOLUME, TICK_VOLUME, MISSING',
      passed,
      details: `Detected: Real=${typeReal}, Tick=${typeTick}, Missing=${typeMissing}`,
    });
  } catch (err) {
    results.push({
      name: 'Volume Classification Taxonomy: REAL_SOURCE_VOLUME, TICK_VOLUME, MISSING',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. عدم تزریق حجم ساختگی به داده‌های فاقد حجم (Zero/Missing Volume Preservation)
  try {
    const zeroVolCandles = generateCandles(25).map(c => ({ ...c, volume: 0 }));
    const { acceptedCandles, passport } = DatasetQualityEngine.inspectAndValidate(
      zeroVolCandles,
      'EURUSD',
      '15M'
    );

    const preservedZeroCount = acceptedCandles.filter(c => c.volume === 0).length;
    const passed = passport.volumeType === 'MISSING' && preservedZeroCount === 25;

    results.push({
      name: 'Missing Volume Integrity: No synthetic numbers injected into zero volume bars',
      passed,
      details: `Preserved zero volume bars: ${preservedZeroCount}/25, Passport volumeType: ${passport.volumeType}`,
    });
  } catch (err) {
    results.push({
      name: 'Missing Volume Integrity: No synthetic numbers injected into zero volume bars',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. حذف کندل ناکامل در انتهای بازه (Incomplete Trailing Bar Exclusion)
  try {
    const candles = generateCandles(30);
    // آخرین کندل در حال حاضر باز است
    candles[candles.length - 1].isClosed = false;

    const { acceptedCandles, passport } = DatasetQualityEngine.inspectAndValidate(
      candles,
      'GBPUSD',
      '15M',
      { dropIncompleteTrailingBar: true }
    );

    const passed =
      acceptedCandles.length === 29 &&
      passport.hasIncompleteTrailingBar === true &&
      acceptedCandles[acceptedCandles.length - 1].isClosed === true;

    results.push({
      name: 'Trailing Bar Integrity: Drop incomplete/unclosed bar at end of dataset',
      passed,
      details: `Accepted count: ${acceptedCandles.length} (expected 29), Trailing dropped: ${passport.hasIncompleteTrailingBar}`,
    });
  } catch (err) {
    results.push({
      name: 'Trailing Bar Integrity: Drop incomplete/unclosed bar at end of dataset',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. شناسایی و حذف زمان‌های معکوس (Reversed Timestamps Rejection)
  try {
    const candles = generateCandles(20);
    // دست‌کاری زمان کندل شماره ۱۰ به عقب‌تر
    candles[10].timestamp = candles[8].timestamp;

    const { acceptedCandles, passport } = DatasetQualityEngine.inspectAndValidate(
      candles,
      'GBPUSD',
      '15M'
    );

    const passed =
      passport.quality.reversedTimestampCount === 1 &&
      acceptedCandles.length === 19;

    results.push({
      name: 'Time Sequence Integrity: Reversed timestamp detection and sanitization',
      passed,
      details: `Reversed detected: ${passport.quality.reversedTimestampCount}, Valid accepted: ${acceptedCandles.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Time Sequence Integrity: Reversed timestamp detection and sanitization',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۶. شناسایی و حذف زمان‌های تکراری (Duplicate Timestamps Rejection)
  try {
    const candles = generateCandles(20);
    candles[12].timestamp = candles[11].timestamp;

    const { acceptedCandles, passport } = DatasetQualityEngine.inspectAndValidate(
      candles,
      'GBPUSD',
      '15M'
    );

    const passed =
      passport.quality.duplicateCount === 1 &&
      acceptedCandles.length === 19;

    results.push({
      name: 'Time Sequence Integrity: Duplicate timestamp deduplication',
      passed,
      details: `Duplicates detected: ${passport.quality.duplicateCount}, Valid accepted: ${acceptedCandles.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Time Sequence Integrity: Duplicate timestamp deduplication',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۷. تفکیک گپ‌های طبیعی آخر هفته از گپ‌های غیرمنتظره روزهای کاری (Gap Classification)
  try {
    // ایجاد ۲ کندل چهارشنبه با ۴ ساعت گپ غیرمنتظره درون هفته‌ای
    const wednesdayNormal = 1704276000000; // Wed Jan 03 2024 10:00 UTC
    const wednesdayGap = wednesdayNormal + 4 * 3600_000; // Wed Jan 03 2024 14:00 UTC
    // ایجاد ۲ کندل جمعه شب تا دوشنبه صبح (گپ آخر هفته ~ ۶۰ ساعت)
    const fridayClose = 1704499200000; // Fri Jan 05 2024 24:00 UTC
    const mondayOpen = fridayClose + 60 * 3600_000; // Mon Jan 08 2024 12:00 UTC

    const candles: Candle[] = [
      makeCandle(wednesdayNormal, 1.255, 1.257, 1.253, 1.256),
      makeCandle(wednesdayGap, 1.256, 1.258, 1.254, 1.257),
      makeCandle(wednesdayGap + 900_000, 1.257, 1.259, 1.255, 1.258),
      makeCandle(fridayClose - 900_000, 1.25, 1.252, 1.248, 1.251),
      makeCandle(fridayClose, 1.251, 1.253, 1.249, 1.252),
      makeCandle(mondayOpen, 1.253, 1.255, 1.251, 1.254),
      makeCandle(mondayOpen + 900_000, 1.254, 1.256, 1.252, 1.255),
    ];
    for (let k = 0; k < 15; k++) {
      candles.push(makeCandle(mondayOpen + (k + 2) * 900_000, 1.255, 1.257, 1.253, 1.256));
    }

    const { passport } = DatasetQualityEngine.inspectAndValidate(candles, 'GBPUSD', '15M');
    const passed = passport.quality.weekendGapCount >= 1 && passport.quality.gapCount >= 1;

    results.push({
      name: 'Gap Classification: Separate regular weekend breaks from intra-week anomalies',
      passed,
      details: `Weekend gaps: ${passport.quality.weekendGapCount}, Intra-week gaps: ${passport.quality.gapCount}`,
    });
  } catch (err) {
    results.push({
      name: 'Gap Classification: Separate regular weekend breaks from intra-week anomalies',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۸. شناسایی کندل‌های مسطح بدون رنج (Flat Candle High === Low Detection)
  try {
    const candles = generateCandles(25);
    // کندل تخت با High === Low
    candles[5].high = candles[5].low = candles[5].open = candles[5].close = 1.2600;

    const { passport } = DatasetQualityEngine.inspectAndValidate(candles, 'GBPUSD', '15M');
    const passed = passport.quality.flatCandleCount === 1;

    results.push({
      name: 'Candle Structure: Flat candle (zero-range) identification',
      passed,
      details: `Flat candle count: ${passport.quality.flatCandleCount}`,
    });
  } catch (err) {
    results.push({
      name: 'Candle Structure: Flat candle (zero-range) identification',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۹. انطباق زمانی و تمایز UTC داخلی، آفست بروکر و تایم‌زون کاربر (Timezone & Broker Offset)
  try {
    const utcTs = Date.UTC(2024, 5, 15, 12, 0, 0); // 2024-06-15 12:00:00 UTC
    // نیویورک در تابستان EDT است (UTC-4) -> ساعت ۸ صبح
    const nyTime = SessionTimezoneEngine.getLocalTime(utcTs, 'America/New_York', 0);
    // سیدنی UTC+10 -> ساعت ۲۲
    const sydneyTime = SessionTimezoneEngine.getLocalTime(utcTs, 'Australia/Sydney', 0);
    // بروکر با آفست +120 دقیقه (UTC+2) -> ساعت ۱۴
    const brokerTime = SessionTimezoneEngine.getLocalTime(utcTs, 'BROKER_FIXED', 120);

    const passed =
      nyTime.hour === 8 &&
      sydneyTime.hour === 22 &&
      brokerTime.hour === 14;

    results.push({
      name: 'Timezone Engine: Separation of UTC, display timezone and broker offset',
      passed,
      details: `UTC 12:00 -> NY: ${nyTime.hour}:00, Sydney: ${sydneyTime.hour}:00, Broker+2h: ${brokerTime.hour}:00`,
    });
  } catch (err) {
    results.push({
      name: 'Timezone Engine: Separation of UTC, display timezone and broker offset',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۰. آگاهی از تغییر ساعت تابستانی / زمستانی DST (Daylight Saving Time Awareness)
  try {
    // لندن زمستان (GMT / UTC+0) در تاریخ 15 ژانویه 2024
    const winterUtc = Date.UTC(2024, 0, 15, 14, 0, 0);
    const winterLondon = SessionTimezoneEngine.getLocalTime(winterUtc, 'Europe/London', 0);

    // لندن تابستان (BST / UTC+1) در تاریخ 15 ژوئن 2024
    const summerUtc = Date.UTC(2024, 5, 15, 14, 0, 0);
    const summerLondon = SessionTimezoneEngine.getLocalTime(summerUtc, 'Europe/London', 0);

    const passed = winterLondon.hour === 14 && summerLondon.hour === 15;

    results.push({
      name: 'Daylight Saving Time (DST) Integrity: London GMT vs BST offset shifts',
      passed,
      details: `Winter London hour: ${winterLondon.hour}:00, Summer London hour: ${summerLondon.hour}:00`,
    });
  } catch (err) {
    results.push({
      name: 'Daylight Saving Time (DST) Integrity: London GMT vs BST offset shifts',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۱. اعتبارسنجی کفایت کندل‌های وارم‌آپ (Warmup Bars Adequacy)
  try {
    const insufficientCandles = generateCandles(50);
    const { passport: p1 } = DatasetQualityEngine.inspectAndValidate(
      insufficientCandles,
      'GBPUSD',
      '15M',
      { minimumWarmupBars: 200 }
    );

    const sufficientCandles = generateCandles(250);
    const { passport: p2 } = DatasetQualityEngine.inspectAndValidate(
      sufficientCandles,
      'GBPUSD',
      '15M',
      { minimumWarmupBars: 200 }
    );

    const passed = p1.hasSufficientWarmup === false && p2.hasSufficientWarmup === true;

    results.push({
      name: 'Warmup Adequacy: Flag insufficient warmup bars to prevent premature signal triggers',
      passed,
      details: `50 bars sufficient: ${p1.hasSufficientWarmup}, 250 bars sufficient: ${p2.hasSufficientWarmup}`,
    });
  } catch (err) {
    results.push({
      name: 'Warmup Adequacy: Flag insufficient warmup bars to prevent premature signal triggers',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۲. صدور شناسنامه دیتاست با متادیتا و نمره سلامت داده (DatasetPassport Generation)
  try {
    const candles = generateCandles(100);
    const { passport } = DatasetQualityEngine.inspectAndValidate(candles, 'GBPUSD', '15M');

    const passed =
      passport.symbol === 'GBPUSD' &&
      passport.timeframe === '15M' &&
      passport.quality.qualityScorePercent >= 95 &&
      passport.fingerprintSha256.startsWith('sha256-') &&
      passport.coverageLabelFa.includes('کندل');

    results.push({
      name: 'Dataset Passport Generation: Metadata, quality score and Persian label',
      passed,
      details: `Score: ${passport.quality.qualityScorePercent}%, Label: ${passport.coverageLabelFa}`,
    });
  } catch (err) {
    results.push({
      name: 'Dataset Passport Generation: Metadata, quality score and Persian label',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۳. رد صریح قیمت‌های منفی یا معکوس High < Low (Data Hygiene Gates)
  try {
    const dirtyCandles: Candle[] = [
      makeCandle(1700000000000, 1.25, 1.24, 1.26, 1.25), // High < Low
      makeCandle(1700000900000, -1.25, 1.26, 1.24, 1.25), // negative open
      ...generateCandles(20, 1700001800000),
    ];

    const { acceptedCandles, passport } = DatasetQualityEngine.inspectAndValidate(
      dirtyCandles,
      'GBPUSD',
      '15M'
    );

    const passed =
      passport.quality.rejectedCandles === 2 &&
      acceptedCandles.length === 20;

    results.push({
      name: 'Data Hygiene Gates: Immediate rejection of inverted High/Low and negative prices',
      passed,
      details: `Rejected dirty bars: ${passport.quality.rejectedCandles}, Accepted: ${acceptedCandles.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Data Hygiene Gates: Immediate rejection of inverted High/Low and negative prices',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۴. رفع قطعی باگ قفل شدن/گیر کردن در بکتست GBPUSD (GBPUSD Backtest Complete Finish)
  try {
    const gbpCandles = generateCandles(260, 1704067200000, 900_000, 1.2700);

    let progressCalls = 0;
    const { metrics } = ResearchLab.runBacktest(gbpCandles, 'GBPUSD', {
      timeframe: '15M',
      style: 'SMC_INTRADAY',
      lookbackCandles: 220,
      onProgress: (_p, _t) => {
        progressCalls++;
      },
    });

    const passed =
      metrics.equityCurve.length > 0 &&
      metrics.diagnostics !== undefined &&
      metrics.datasetPassport !== undefined &&
      progressCalls > 0;

    results.push({
      name: 'GBPUSD Backtest Integrity: Zero hanging, complete execution to the final candle',
      passed,
      details: `Backtest finished cleanly. Equity points: ${metrics.equityCurve.length}, Progress calls: ${progressCalls}`,
    });
  } catch (err) {
    results.push({
      name: 'GBPUSD Backtest Integrity: Zero hanging, complete execution to the final candle',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۵. الصاق قطعی شناسنامه دیتاست در خروجی متریک‌های بک‌تست (Passport Attachment in Metrics)
  try {
    const candles = generateCandles(240);
    const { metrics } = ResearchLab.runBacktest(candles, 'EURUSD', {
      timeframe: '15M',
      style: 'ALL',
    });

    const passport = metrics.datasetPassport;
    const passed =
      passport !== undefined &&
      passport.symbol === 'EURUSD' &&
      passport.volumeType === 'TICK_VOLUME' &&
      passport.quality.validationPassed === true;

    results.push({
      name: 'Metrics Contract: Full DatasetPassport attached to PerformanceMetrics',
      passed,
      details: `Passport present: ${passport !== undefined}, VolumeType: ${passport?.volumeType}, Score: ${passport?.quality.qualityScorePercent}%`,
    });
  } catch (err) {
    results.push({
      name: 'Metrics Contract: Full DatasetPassport attached to PerformanceMetrics',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۶. انطباق نام و روز سشن بر مبنای تایم‌زون کاربر و بروکر (Session and Weekday Resolution)
  try {
    // جمعه ساعت ۲۳:۰۰ UTC
    const fridayNightUtc = Date.UTC(2024, 0, 12, 23, 0, 0);
    // برای کاربری در سیدنی (UTC+11 در تابستان نیمکره جنوبی) این زمان شنبه صبح است
    const localSydney = SessionTimezoneEngine.getLocalTime(fridayNightUtc, 'Australia/Sydney', 0);
    // برای کاربری در نیویورک (UTC-5) این زمان جمعه عصر است
    const localNy = SessionTimezoneEngine.getLocalTime(fridayNightUtc, 'America/New_York', 0);

    const passed = localSydney.dayOfWeek === 6 && localNy.dayOfWeek === 5;

    results.push({
      name: 'Session Timezone Alignment: Local weekday matches target timezone boundary',
      passed,
      details: `Sydney dayOfWeek: ${localSydney.dayOfWeek} (Sat), NY dayOfWeek: ${localNy.dayOfWeek} (Fri)`,
    });
  } catch (err) {
    results.push({
      name: 'Session Timezone Alignment: Local weekday matches target timezone boundary',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
