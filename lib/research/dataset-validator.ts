import type { Candle, Timeframe } from '@/lib/contracts/market';
import { validateResearchCandles, type DatasetQualityCheck } from './dataset';

export interface DatasetCoverage { startTimestamp: number | null; endTimestamp: number | null; requestedYear: number; coveredDays: number; coversRequestedYear: boolean; labelFa: string; }
export interface ValidatedDataset { candles: Candle[]; quality: DatasetQualityCheck; coverage: DatasetCoverage; }

export function validateBacktestDataset(candles: Candle[], timeframe: Timeframe, requestedYear: string): ValidatedDataset {
  const quality = validateResearchCandles(candles, timeframe);
  const accepted = quality.accepted;
  const requested = Number(requestedYear);
  const startTimestamp = accepted[0]?.timestamp ?? null;
  const endTimestamp = accepted.at(-1)?.timestamp ?? null;
  const coveredDays = startTimestamp !== null && endTimestamp !== null ? Math.max(0, Math.floor((endTimestamp - startTimestamp) / 86_400_000) + 1) : 0;
  const coversRequestedYear = startTimestamp !== null && endTimestamp !== null && new Date(startTimestamp).getUTCFullYear() === requested && new Date(endTimestamp).getUTCFullYear() === requested && coveredDays >= 360;
  const format = (timestamp: number | null) => timestamp === null ? 'نامشخص' : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'UTC' }).format(timestamp);
  if (!coversRequestedYear) quality.warnings.push(`پوشش واقعی داده ${format(startTimestamp)} تا ${format(endTimestamp)} است و سال کامل ${requested} نیست.`);
  return { candles: accepted, quality, coverage: { startTimestamp, endTimestamp, requestedYear: requested, coveredDays, coversRequestedYear, labelFa: `${format(startTimestamp)} تا ${format(endTimestamp)} (${coveredDays.toLocaleString('fa-IR')} روز)` } };
}
