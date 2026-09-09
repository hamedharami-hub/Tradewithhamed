import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import type { HistoricalDataset, HistoricalDatasetManifest } from './contracts';

export interface YahooChartPayload {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; exchangeName?: string; currency?: string; timezone?: string };
      timestamp?: Array<number | null>;
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }> | null;
    error?: { description?: string } | null;
  };
}

export interface DatasetQualityCheck {
  accepted: Candle[];
  rejectedBars: number;
  duplicateBars: number;
  gapsDetected: number;
  errors: string[];
  warnings: string[];
}

export const timeframeMs = (timeframe: Timeframe): number => {
  const values: Record<Timeframe, number> = {
    '1M': 60_000,
    '5M': 300_000,
    '15M': 900_000,
    '1H': 3_600_000,
    '4H': 14_400_000,
    'D1': 86_400_000,
  };
  return values[timeframe];
};

export function inferTimeframe(candles: Candle[]): Timeframe | null {
  if (candles.length < 2) return null;
  const deltas: number[] = [];
  for (let index = 1; index < candles.length; index++) {
    const difference = candles[index].timestamp - candles[index - 1].timestamp;
    if (difference > 0 && difference <= 24 * 60 * 60 * 1_000) deltas.push(difference);
  }
  if (deltas.length === 0) return null;
  deltas.sort((left, right) => left - right);
  const median = deltas[Math.floor(deltas.length / 2)];
  const known = (Object.keys({ '1M': true, '5M': true, '15M': true, '1H': true, '4H': true, 'D1': true }) as Timeframe[])
    .map(timeframe => ({ timeframe, distance: Math.abs(timeframeMs(timeframe) - median) }))
    .sort((left, right) => left.distance - right.distance)[0];
  return known && known.distance <= timeframeMs(known.timeframe) * 0.1 ? known.timeframe : null;
}

export function validateResearchCandles(candles: Candle[], timeframe: Timeframe): DatasetQualityCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const accepted: Candle[] = [];
  let rejectedBars = 0;
  let duplicateBars = 0;
  let gapsDetected = 0;
  let previousTimestamp = -Infinity;
  const interval = timeframeMs(timeframe);
  const firstTimestamp = candles.find(candle => Number.isFinite(candle.timestamp))?.timestamp;
  const alignmentOffset = timeframe === 'D1' || firstTimestamp === undefined
    ? null
    : (firstTimestamp < 10_000_000_000 ? firstTimestamp * 1_000 : firstTimestamp) % interval;

  for (const raw of candles) {
    const validNumbers = [raw.timestamp, raw.open, raw.high, raw.low, raw.close, raw.volume].every(Number.isFinite);
    const validOhlc = raw.high >= Math.max(raw.open, raw.close) && raw.low <= Math.min(raw.open, raw.close) && raw.high >= raw.low;
    const canonicalTimestamp = raw.timestamp < 10_000_000_000 ? raw.timestamp * 1_000 : raw.timestamp;

    const isAlignedToTimeframe = alignmentOffset === null || canonicalTimestamp % interval === alignmentOffset;
    if (!validNumbers || !validOhlc || canonicalTimestamp <= 0 || !isAlignedToTimeframe) {
      rejectedBars++;
      continue;
    }

    if (canonicalTimestamp <= previousTimestamp) {
      if (canonicalTimestamp === previousTimestamp) duplicateBars++;
      else errors.push(`ترتیب زمانی معکوس در timestamp=${canonicalTimestamp} مشاهده شد.`);
      rejectedBars++;
      continue;
    }

    if (previousTimestamp > 0) {
      const gap = canonicalTimestamp - previousTimestamp;
      if (gap > interval * 2.5) {
        const weekendLikeGap = gap >= 40 * 60 * 60 * 1_000;
        if (!weekendLikeGap) gapsDetected++;
      }
    }

    accepted.push({ ...raw, timestamp: canonicalTimestamp, isClosed: true });
    previousTimestamp = canonicalTimestamp;
  }

  if (accepted.length < 100) warnings.push('دیتاست کمتر از ۱۰۰ bar پذیرفته‌شده دارد؛ تحلیل آماری محدود خواهد بود.');
  if (gapsDetected > 0) warnings.push(`${gapsDetected} گپ غیرآخرهفته‌ای ثبت شد؛ نتایج بازه‌های حاوی گپ باید با احتیاط خوانده شوند.`);
  if (rejectedBars > 0) warnings.push(`${rejectedBars} bar نامعتبر، تکراری یا خارج از ترتیب رد شد.`);

  return { accepted, rejectedBars, duplicateBars, gapsDetected, errors, warnings };
}

export function parseYahooChartPayload(payload: YahooChartPayload): Candle[] {
  const error = payload.chart?.error?.description;
  const result = payload.chart?.result?.[0];
  if (error || !result) throw new Error(error || 'پاسخ Yahoo Finance فاقد series قیمتی معتبر است.');

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) throw new Error('پاسخ Yahoo Finance فاقد OHLC است.');

  const count = Math.min(timestamps.length, quote.open?.length || 0, quote.high?.length || 0, quote.low?.length || 0, quote.close?.length || 0);
  const candles: Candle[] = [];
  for (let index = 0; index < count; index++) {
    const timestamp = timestamps[index];
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    const close = quote.close?.[index];
    const volume = quote.volume?.[index] ?? 0;
    if ([timestamp, open, high, low, close].every(value => typeof value === 'number' && Number.isFinite(value))) {
      candles.push({
        timestamp: (timestamp as number) * 1_000,
        open: open as number,
        high: high as number,
        low: low as number,
        close: close as number,
        volume: typeof volume === 'number' && Number.isFinite(volume) ? volume : 0,
        isClosed: true,
      });
    }
  }
  return candles.sort((left, right) => left.timestamp - right.timestamp);
}

export function createDatasetFromCandles(input: {
  candles: Candle[];
  provider: string;
  providerSymbol: string;
  canonicalSymbol?: SymbolId;
  instrumentLabel: string;
  timeframe: Timeframe;
  rawSourcePath: string;
  contentSha256: string;
  sourceLicense: string;
  importedAt?: string;
}): HistoricalDataset {
  const quality = validateResearchCandles(input.candles, input.timeframe);
  if (quality.accepted.length === 0) throw new Error('پس از کنترل کیفیت، هیچ bar قابل‌استفاده‌ای باقی نماند.');

  const startTime = quality.accepted[0].timestamp;
  const endTime = quality.accepted[quality.accepted.length - 1].timestamp;
  const manifest: HistoricalDatasetManifest = {
    datasetId: `DS-${input.provider.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${input.providerSymbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}-${input.timeframe}-${input.contentSha256.slice(0, 12)}`,
    datasetKind: 'HISTORICAL_BAR',
    status: quality.errors.length === 0 && quality.rejectedBars === 0 ? 'READY' : quality.accepted.length > 0 ? 'PARTIAL' : 'REJECTED',
    provider: input.provider,
    providerSymbol: input.providerSymbol,
    canonicalSymbol: input.canonicalSymbol,
    instrumentLabel: input.instrumentLabel,
    timeframe: input.timeframe,
    timezone: 'UTC',
    startTime,
    endTime,
    totalBars: input.candles.length,
    acceptedBars: quality.accepted.length,
    rejectedBars: quality.rejectedBars,
    duplicateBars: quality.duplicateBars,
    gapsDetected: quality.gapsDetected,
    contentSha256: input.contentSha256,
    rawSourcePath: input.rawSourcePath,
    importedAt: input.importedAt || new Date().toISOString(),
    schemaVersion: 'research-dataset-v1',
    sourceLicense: input.sourceLicense,
    notes: [...quality.errors, ...quality.warnings],
  };

  return { manifest, candles: quality.accepted };
}
