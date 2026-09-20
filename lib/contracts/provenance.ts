import { SymbolId, Timeframe } from './market';

export type DataOriginType =
  | 'SAMPLE_FIXTURE'          // داده نمونه داخلی
  | 'USER_IMPORTED_CSV'       // داده واردشده توسط کاربر
  | 'BUNDLED_HISTORICAL'      // دیتاست تاریخی آماده
  | 'BROKER_DEMO_FEED';       // دریافت مستقیم از دموی بروکر

export type FreshnessStatus = 'FRESH' | 'STALE' | 'DISCONNECTED' | 'UNKNOWN';

export interface DataProvenance {
  originType: DataOriginType;
  originLabelFa: string;
  datasetId: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  rangeStart?: number;
  rangeEnd?: number;
  timezone: 'UTC';
  lastReceivedAt: number;
  freshnessStatus: FreshnessStatus;
  stalenessThresholdMs: number;
  isVerifiedRealData: boolean;
  notesFa?: string;
}

export const DEFAULT_STALENESS_THRESHOLDS_MS: Record<Timeframe, number> = {
  '1M': 60_000,        // ۱ دقیقه
  '5M': 300_000,       // ۵ دقیقه
  '15M': 900_000,      // ۱۵ دقیقه
  '1H': 3_600_000,     // ۱ ساعت
  '4H': 14_400_000,    // ۴ ساعت
  'D1': 86_400_000,    // ۲۴ ساعت
  'W1': 604_800_000,   // ۷ روز
};

/**
 * سنجش وضعیت تازگی داده بر اساس زمان دریافت و آستانه مجاز
 */
export function evaluateDataFreshness(
  provenance: DataProvenance,
  now: number = Date.now()
): FreshnessStatus {
  if (provenance.originType === 'SAMPLE_FIXTURE' || provenance.originType === 'BUNDLED_HISTORICAL') {
    // داده‌های نمونه و تاریخی همیشه برای محیط خود معتبر هستند، اما به عنوان فید زنده تلقی نمی‌شوند
    return 'FRESH';
  }

  if (provenance.originType === 'USER_IMPORTED_CSV') {
    return 'FRESH';
  }

  if (!provenance.lastReceivedAt || provenance.lastReceivedAt <= 0) {
    return 'UNKNOWN';
  }

  const ageMs = now - provenance.lastReceivedAt;
  if (ageMs > provenance.stalenessThresholdMs * 2) {
    return 'DISCONNECTED';
  }
  if (ageMs > provenance.stalenessThresholdMs) {
    return 'STALE';
  }
  return 'FRESH';
}

/**
 * تعیین اینکه آیا منبع داده مجوز ثبت سفارش در بروکر را دارد یا خیر
 * الزامات امنیتی: فقط داده‌های فید مستقیم بروکر دمو مجاز به ایجاد سفارش در بروکر هستند.
 */
export function isOriginAllowedForBrokerWrite(originType: DataOriginType): boolean {
  return originType === 'BROKER_DEMO_FEED';
}
