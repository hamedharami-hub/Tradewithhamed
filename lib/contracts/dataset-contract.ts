// lib/contracts/dataset-contract.ts
// قرارداد جامع شناسنامه داده، کیفیت متادیتا، دسته‌بندی حجم و انطباق زمانی

import { SymbolId, Timeframe } from './market';

export type VolumeType =
  | 'REAL_SOURCE_VOLUME' // حجم واقعی صرافی / تجمیعی بین‌بانکی
  | 'TICK_VOLUME'        // حجم بر مبنای شمارش تیک‌های قیمت (Tick Count)
  | 'MISSING'            // داده فاقد حجم است (Volume = 0 یا ناموجود)
  | 'SYNTHETIC';         // حجم ساختگی یا تقریب مصنوعی (باید آشکارا برچسب بخورد)

export type InstrumentType = 'FOREX' | 'METALS' | 'CRYPTO' | 'INDEX';

export interface DatasetQualityMetrics {
  totalRawCandles: number;
  acceptedCandles: number;
  rejectedCandles: number;
  duplicateCount: number;
  reversedTimestampCount: number;
  gapCount: number;
  weekendGapCount: number;
  flatCandleCount: number; // High === Low
  zeroVolumeCount: number;
  missingVolumeCount: number;
  negativePriceCount: number;
  invalidSpreadCount: number;
  qualityScorePercent: number; // 0 to 100
  validationPassed: boolean;
  errors: string[];
  warnings: string[];
}

export interface DatasetPassport {
  datasetId: string;
  source: string;
  symbol: SymbolId;
  instrumentType: InstrumentType;
  timeframe: Timeframe;
  timezone: string; // e.g. "UTC", "America/New_York", "Europe/London"
  candleTimestampMeaning: 'OPEN_TIME' | 'CLOSE_TIME';
  volumeType: VolumeType;
  firstValidTimestamp: number;
  lastValidTimestamp: number;
  totalCandles: number;
  warmupBarsAvailable: number;
  hasSufficientWarmup: boolean;
  fingerprintSha256: string;
  fingerprintFnv1a: string;
  quality: DatasetQualityMetrics;
  coverageLabelFa: string;
  isComplete: boolean;
  hasIncompleteTrailingBar: boolean;
  verifiedAt: string;
}

export interface DatasetQualityValidationOptions {
  minimumCandles?: number;
  minimumWarmupBars?: number;
  strictVolumeCheck?: boolean;
  allowWeekendGaps?: boolean;
  dropIncompleteTrailingBar?: boolean;
}
