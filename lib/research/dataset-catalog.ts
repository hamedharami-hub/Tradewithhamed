import type { SymbolId, Timeframe } from '@/lib/contracts/market';

export type DatasetAvailability = 'READY' | 'PARTIAL' | 'IMPORT_REQUIRED';

export interface HistoricalDatasetCatalogItem {
  id: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  startUtc: string;
  endUtc: string;
  bars: number;
  gaps: number;
  status: DatasetAvailability;
  source: string;
  noteFa: string;
}

/**
 * Inventory copied from the verified hand-off dataset manifest. It is metadata,
 * not an embedded price feed: users still import the matching CSV locally before
 * a browser-side backtest can consume its candles.
 */
export const HISTORICAL_DATASET_CATALOG: HistoricalDatasetCatalogItem[] = [
  {
    id: 'EURUSD-D1-2016-2026',
    symbol: 'EURUSD',
    timeframe: 'D1',
    startUtc: '2016-09-08T23:00:00.000Z',
    endUtc: '2026-09-08T23:00:00.000Z',
    bars: 2534,
    gaps: 0,
    status: 'PARTIAL',
    source: 'Yahoo Finance',
    noteFa: 'دادهٔ روزانهٔ بلندمدت؛ برای تحلیل ساختار کلان مناسب است، نه ورود دقیقه‌ای.',
  },
  {
    id: 'EURUSD-M1-2024',
    symbol: 'EURUSD',
    timeframe: '1M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:58:00.000Z',
    bars: 372379,
    gaps: 316,
    status: 'READY',
    source: 'HistData',
    noteFa: 'دادهٔ یک‌دقیقه‌ای ۲۰۲۴؛ پیش از بک‌تست کامل به بازه‌های کوچک‌تر تقسیم شود.',
  },
  {
    id: 'EURUSD-M5-2024',
    symbol: 'EURUSD',
    timeframe: '5M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:50:00.000Z',
    bars: 74887,
    gaps: 10,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'مناسب برای اسکلپ، SMC درون‌روز و بازگشت به میانگین.',
  },
  {
    id: 'EURUSD-M15-2024',
    symbol: 'EURUSD',
    timeframe: '15M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:30:00.000Z',
    bars: 24969,
    gaps: 5,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'بازهٔ ۱۵ دقیقه برای پژوهش SMC و آزمون‌های walk-forward.',
  },
  {
    id: 'EURUSD-H1-2024',
    symbol: 'EURUSD',
    timeframe: '1H',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T20:00:00.000Z',
    bars: 6242,
    gaps: 2,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'برای فیلتر روند و سوئینگ کلان مناسب است.',
  },
  {
    id: 'GBPUSD-M1-2024',
    symbol: 'GBPUSD',
    timeframe: '1M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:58:00.000Z',
    bars: 372047,
    gaps: 386,
    status: 'PARTIAL',
    source: 'HistData',
    noteFa: 'یک‌دقیقه‌ای با تکرار و گپ ثبت‌شده؛ گزارش اعتبارسنجی را قبل از نتیجه‌گیری بررسی کنید.',
  },
  {
    id: 'GBPUSD-M5-2024',
    symbol: 'GBPUSD',
    timeframe: '5M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:50:00.000Z',
    bars: 74875,
    gaps: 17,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'مناسب برای بک‌تست درون‌روز با تقسیم زمانی معنادار.',
  },
  {
    id: 'GBPUSD-M15-2024',
    symbol: 'GBPUSD',
    timeframe: '15M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:30:00.000Z',
    bars: 24967,
    gaps: 8,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'به‌علاوه artifact پژوهشی چندساله ۲۰۲۰ تا ۲۰۲۴ در تایم‌فریم ۱۵ دقیقه وجود دارد.',
  },
  {
    id: 'GBPUSD-H1-2024',
    symbol: 'GBPUSD',
    timeframe: '1H',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T20:00:00.000Z',
    bars: 6242,
    gaps: 1,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'به‌علاوه artifact پژوهشی چندساله ۲۰۲۰ تا ۲۰۲۴ در تایم‌فریم یک‌ساعت وجود دارد.',
  },
  {
    id: 'USDJPY-M1-2024',
    symbol: 'USDJPY',
    timeframe: '1M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:58:00.000Z',
    bars: 372023,
    gaps: 290,
    status: 'PARTIAL',
    source: 'HistData',
    noteFa: 'یک‌دقیقه‌ای با گپ‌ها و تکرارهای ثبت‌شده؛ فقط بعد از کنترل کیفیت استفاده شود.',
  },
  {
    id: 'USDJPY-M5-2024',
    symbol: 'USDJPY',
    timeframe: '5M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:50:00.000Z',
    bars: 74698,
    gaps: 14,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'مناسب برای بک‌تست درون‌روز و پژوهش رژیم بازار.',
  },
  {
    id: 'USDJPY-M15-2024',
    symbol: 'USDJPY',
    timeframe: '15M',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T21:30:00.000Z',
    bars: 24906,
    gaps: 9,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'مناسب برای آزمون ساختار و سناریوهای SMC.',
  },
  {
    id: 'USDJPY-H1-2024',
    symbol: 'USDJPY',
    timeframe: '1H',
    startUtc: '2024-01-01T22:00:00.000Z',
    endUtc: '2024-12-31T20:00:00.000Z',
    bars: 6226,
    gaps: 4,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'برای سوئینگ و فیلتر روند بلندتر مناسب است.',
  },
  {
    id: 'XAUUSD-M1-2024',
    symbol: 'XAUUSD',
    timeframe: '1M',
    startUtc: '2024-01-01T23:00:00.000Z',
    endUtc: '2024-12-31T21:57:00.000Z',
    bars: 355592,
    gaps: 215,
    status: 'PARTIAL',
    source: 'HistData',
    noteFa: 'یک‌دقیقه‌ای با گپ‌های ثبت‌شده؛ برای دامنه‌های کوتاه و با کنترل کیفیت استفاده شود.',
  },
  {
    id: 'XAUUSD-M5-2024',
    symbol: 'XAUUSD',
    timeframe: '5M',
    startUtc: '2024-01-01T23:00:00.000Z',
    endUtc: '2024-12-31T21:50:00.000Z',
    bars: 71132,
    gaps: 209,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'دادهٔ ۵ دقیقهٔ ۲۰۲۴؛ کیفیت گپ‌ها را در پنل اعتبارسنجی لحاظ کنید.',
  },
  {
    id: 'XAUUSD-M15-2024',
    symbol: 'XAUUSD',
    timeframe: '15M',
    startUtc: '2024-01-01T23:00:00.000Z',
    endUtc: '2024-12-31T21:30:00.000Z',
    bars: 23712,
    gaps: 208,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'دادهٔ پژوهشی ۱۵ دقیقه؛ پیش از هر نتیجه، حساسیت نسبت به گپ‌ها سنجیده شود.',
  },
  {
    id: 'XAUUSD-H1-2024',
    symbol: 'XAUUSD',
    timeframe: '1H',
    startUtc: '2024-01-01T23:00:00.000Z',
    endUtc: '2024-12-31T20:00:00.000Z',
    bars: 5932,
    gaps: 8,
    status: 'READY',
    source: 'HistData aggregated',
    noteFa: 'برای بررسی روند و سوئینگ کلان استفاده شود.',
  },
  {
    id: 'BTCUSD-IMPORT',
    symbol: 'BTCUSD',
    timeframe: '1H',
    startUtc: '',
    endUtc: '',
    bars: 0,
    gaps: 0,
    status: 'IMPORT_REQUIRED',
    source: 'User import',
    noteFa: 'نماد BTCUSD در موتور پشتیبانی می‌شود اما artifact تاریخی منتقل‌شده برای آن وجود ندارد؛ CSV/OHLCV معتبر وارد کنید.',
  },
];

export const DATASET_IMPORT_GUIDANCE_FA = 'CSV باید ستون‌های time/date، open، high، low، close و در صورت وجود volume داشته باشد. قبل از Backtest، گزارش گپ و تکرار زمانی را بررسی کنید.';

export function datasetsForSymbol(symbol: SymbolId): HistoricalDatasetCatalogItem[] {
  return HISTORICAL_DATASET_CATALOG.filter(item => item.symbol === symbol);
}

export function formatDatasetDateRange(item: HistoricalDatasetCatalogItem): string {
  if (!item.startUtc || !item.endUtc) return 'نیازمند ورود داده';
  return `${item.startUtc.slice(0, 10)} تا ${item.endUtc.slice(0, 10)}`;
}
