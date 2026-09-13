import type { SymbolId, Timeframe } from '@/lib/contracts/market';

export type DatasetSourceKind = 'HISTORICAL_RESEARCH' | 'SYNTHETIC_DAILY_INTERPOLATION' | 'REPLAY_WINDOW';

export interface DatasetProvenance {
  sourceKind: DatasetSourceKind;
  provider: string;
  labelFa: string;
  isSynthetic: boolean;
  isBrokerMatched: boolean;
  warnings: string[];
}

export function getDatasetProvenance(symbol: SymbolId, timeframe: Timeframe, year: string): DatasetProvenance {
  if (year === '2025') return {
    sourceKind: 'SYNTHETIC_DAILY_INTERPOLATION', provider: 'Yahoo Finance daily bars; deterministic intraday interpolation',
    labelFa: `شبیه‌سازی درون‌روزی مشتق‌شده از کندل روزانه برای ${symbol} ${timeframe}`,
    isSynthetic: true, isBrokerMatched: false,
    warnings: ['این دیتاست تیک یا کندل واقعی درون‌روزی نیست و فقط برای آزمایش پژوهشی قابل استفاده است.', 'برای اعتبارسنجی اجرای واقعی، اسلیپیج، اسپرد و نتایج M1/M5 کافی نیست.'],
  };
  return {
    sourceKind: 'HISTORICAL_RESEARCH', provider: 'Bundled historical research dataset', labelFa: `داده تاریخی پژوهشی ${symbol} ${timeframe}`,
    isSynthetic: false, isBrokerMatched: false, warnings: ['تطابق با قیمت، اسپرد و زمان‌بندی بروکر به‌صورت مستقل تأیید نشده است.'],
  };
}
