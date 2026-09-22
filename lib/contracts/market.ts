/**
 * قراردادهای پایه داده‌های بازار، کندل‌ها و مشخصات نمادها
 */

export type SymbolId = 'XAUUSD' | 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'BTCUSD';

export type Timeframe = '1M' | '5M' | '15M' | '1H' | '4H' | 'D1' | 'W1';

export interface Candle {
  timestamp: number; // میلی‌ثانیه یونیکس
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean; // فقط کندل‌های بسته وارد محاسبات تصمیم‌گیری می‌شوند
}

export interface SymbolMetadata {
  id: SymbolId;
  name: string;
  category: 'METALS' | 'FOREX' | 'CRYPTO';
  contractSize: number; // اندازه قرارداد (طلا ۱۰۰ اونس، یورو ۱۰۰,۰۰۰ واحد)
  pipSize: number;      // ارزش هر پیپ در قیمت (طلا ۰.۱، یورو ۰.۰۰۰۱)
  tickSize: number;     // کمترین گام قیمت (طلا ۰.۰۱، یورو ۰.۰۰۰۰۱)
  minLots: number;      // حداقل حجم (۰.۰۱)
  maxLots: number;      // حداکثر حجم (۲۰.۰)
  lotStep: number;      // پله افزایش حجم (۰.۰۱)
  commissionPerLot: number; // کارمزد بروکر در هر لات (مثلاً ۶ دلار)
  typicalSpreadPips: number;
}

export const SYMBOL_SPECS: Record<SymbolId, SymbolMetadata> = {
  XAUUSD: {
    id: 'XAUUSD',
    name: 'Gold vs US Dollar',
    category: 'METALS',
    contractSize: 100,
    pipSize: 0.1,
    tickSize: 0.01,
    minLots: 0.01,
    maxLots: 10.0,
    lotStep: 0.01,
    commissionPerLot: 6.0,
    typicalSpreadPips: 2.0,
  },
  EURUSD: {
    id: 'EURUSD',
    name: 'Euro vs US Dollar',
    category: 'FOREX',
    contractSize: 100000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    minLots: 0.01,
    maxLots: 20.0,
    lotStep: 0.01,
    commissionPerLot: 6.0,
    typicalSpreadPips: 0.8,
  },
  GBPUSD: {
    id: 'GBPUSD',
    name: 'British Pound vs US Dollar',
    category: 'FOREX',
    contractSize: 100000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    minLots: 0.01,
    maxLots: 20.0,
    lotStep: 0.01,
    commissionPerLot: 6.0,
    typicalSpreadPips: 1.2,
  },
  USDJPY: {
    id: 'USDJPY',
    name: 'US Dollar vs Japanese Yen',
    category: 'FOREX',
    contractSize: 100000,
    pipSize: 0.01,
    tickSize: 0.001,
    minLots: 0.01,
    maxLots: 20.0,
    lotStep: 0.01,
    commissionPerLot: 6.0,
    typicalSpreadPips: 1.0,
  },
  BTCUSD: {
    id: 'BTCUSD',
    name: 'Bitcoin vs US Dollar',
    category: 'CRYPTO',
    contractSize: 1,
    pipSize: 1,
    tickSize: 0.01,
    minLots: 0.01,
    maxLots: 10.0,
    lotStep: 0.01,
    commissionPerLot: 0.0,
    typicalSpreadPips: 50.0,
  },
};

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1M': 60_000,
  '5M': 300_000,
  '15M': 900_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  D1: 86_400_000,
  W1: 7 * 86_400_000,
};

/**
 * تبدیل تایم‌فریم به مدت‌زمان میلی‌ثانیه بر مبنای قرارداد استاندارد
 */
export function timeframeToMs(timeframe: Timeframe): number {
  return TIMEFRAME_MS[timeframe] || 300_000;
}

/**
 * زمان قطعی بسته شدن کندل بر مبنای قرارداد: timestamp بازشدن کندل است
 * بنابراین داده‌های کندل فقط در زمان closeTimestamp در دسترس هستند.
 */
export function getCandleCloseTimestamp(candleOrTimestamp: Candle | number, timeframe: Timeframe): number {
  const ts = typeof candleOrTimestamp === 'number' ? candleOrTimestamp : candleOrTimestamp.timestamp;
  return ts + timeframeToMs(timeframe);
}

/**
 * تعداد ارقام اعشار مجاز قیمت برای هر نماد بر اساس مشخصات ابزار
 */
export function getPricePrecision(symbol: SymbolId): number {
  if (symbol === 'XAUUSD' || symbol === 'BTCUSD') return 2;
  if (symbol === 'USDJPY') return 3;
  return 5;
}

/**
 * گرد کردن قیمت به دقت استاندارد نماد
 */
export function roundSymbolPrice(value: number, symbol: SymbolId): number {
  return Number(value.toFixed(getPricePrecision(symbol)));
}
