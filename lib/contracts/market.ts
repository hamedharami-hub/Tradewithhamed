/**
 * قراردادهای پایه داده‌های بازار، کندل‌ها و مشخصات نمادها
 */

export type SymbolId = 'XAUUSD' | 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'BTCUSD';

export type Timeframe = '1M' | '5M' | '15M' | '1H' | '4H' | 'D1';

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
