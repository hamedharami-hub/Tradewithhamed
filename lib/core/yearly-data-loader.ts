// lib/core/yearly-data-loader.ts
// بارگذار هوشمند داده‌های تاریخی ۱ ساله برای هر ۴ نماد معاملاتی (XAUUSD, EURUSD, GBPUSD, USDJPY)
// پشتیبانی از کش درون‌حافظه جهت اجرای بی‌درنگ و آفلاین در مرورگر

import { Candle, SymbolId, Timeframe } from '../contracts/market';
import { GOLD_CANDLES_FIXTURE_5M } from '../replay/fixtures/gold-candles';
import { EURUSD_CANDLES_FIXTURE_5M } from '../replay/fixtures/eurusd-candles';
import { GBPUSD_CANDLES_FIXTURE_5M } from '../replay/fixtures/gbpusd-candles';
import { USDJPY_CANDLES_FIXTURE_5M } from '../replay/fixtures/usdjpy-candles';

export type TimeHorizon = 'FULL_YEAR' | 'H2_6M' | 'Q4_3M' | 'REPLAY_WINDOW';

export type YearDatasetId = '2025' | '2024';
export type BacktestTimeframe = 'D1' | '4H' | '1H' | '15M' | '5M' | '1M';

export interface HorizonOption {
  id: TimeHorizon;
  labelFa: string;
  descriptionFa: string;
}

export const TIME_HORIZONS: HorizonOption[] = [
  {
    id: 'FULL_YEAR',
    labelFa: '۱ ساله کامل',
    descriptionFa: 'پوشش کامل سال با تمام کندل‌های ساختاری بازار',
  },
  {
    id: 'H2_6M',
    labelFa: '۶ ماهه دوم (H2)',
    descriptionFa: 'از ۱ ژوئیه تا ۳۱ دسامبر برای بررسی رژیم‌های نیم‌سال پایانی',
  },
  {
    id: 'Q4_3M',
    labelFa: '۳ ماهه پایانی (Q4)',
    descriptionFa: 'از ۱ اکتبر تا پایان سال برای ارزیابی عملکرد در ماه‌های پرنوسان پاییز و زمستان',
  },
  {
    id: 'REPLAY_WINDOW',
    labelFa: 'پنجره جاری ریپلی زنده',
    descriptionFa: 'کندل‌های فعال چارت در شبیه‌ساز ریپلی (بررسی فوری ستاپ جاری)',
  },
];

// حافظه کش کلاینت برای جلوگیری از درخواست‌های مکرر شبکه
const memoryCache = new Map<string, Candle[]>();

export function parseCsvToCandles(csvText: string): Candle[] {
  const lines = csvText.trim().split('\n');
  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 5) {
      const timeMs = new Date(parts[0]).getTime();
      const open = parseFloat(parts[1]);
      const high = parseFloat(parts[2]);
      const low = parseFloat(parts[3]);
      const close = parseFloat(parts[4]);
      const volume = parts[5] ? parseFloat(parts[5]) : 100;
      if (!isNaN(timeMs) && !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
        candles.push({
          timestamp: timeMs,
          open,
          high,
          low,
          close,
          volume,
          isClosed: true,
        });
      }
    }
  }
  return candles;
}

export async function loadYearlyDataset(
  symbol: SymbolId,
  timeframe: BacktestTimeframe = '4H',
  year: YearDatasetId = '2025'
): Promise<Candle[]> {
  const cacheKey = `${symbol}-${timeframe}-${year}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  const lowerSymbol = symbol.toLowerCase();
  const lowerTf = timeframe.toLowerCase();
  const url = `/historical/intraday/histdata-${lowerSymbol}-${lowerTf}-${year}.csv`;

  try {
    if (typeof window !== 'undefined') {
      const response = await fetch(url);
      if (!response.ok) {
        // فالبک خودکار به ۲۰۲۴ در صورت نبودن فایل
        if (year === '2025') {
          const fallbackResp = await fetch(`/historical/intraday/histdata-${lowerSymbol}-${lowerTf}-2024.csv`);
          if (fallbackResp.ok) {
            const text = await fallbackResp.text();
            const candles = parseCsvToCandles(text);
            if (candles.length > 0) {
              memoryCache.set(cacheKey, candles);
              return candles;
            }
          }
        }
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
      const text = await response.text();
      const candles = parseCsvToCandles(text);
      if (candles.length > 0) {
        memoryCache.set(cacheKey, candles);
        return candles;
      }
    } else {
      // محیط Node / تست
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      let filePath = resolve(`public/historical/intraday/histdata-${lowerSymbol}-${lowerTf}-${year}.csv`);
      if (!existsSync(filePath) && year === '2025') {
        filePath = resolve(`public/historical/intraday/histdata-${lowerSymbol}-${lowerTf}-2024.csv`);
      }
      if (existsSync(filePath)) {
        const text = readFileSync(filePath, 'utf8');
        const candles = parseCsvToCandles(text);
        if (candles.length > 0) {
          memoryCache.set(cacheKey, candles);
          return candles;
        }
      }
    }
  } catch (err) {
    console.warn(`[YearlyDataLoader] Could not load ${url}, falling back to fixture:`, err);
  }

  // فال‌بک امن در صورت عدم دسترسی به فایل استاتیک
  const fallback = getFallbackCandles(symbol);
  memoryCache.set(cacheKey, fallback);
  return fallback;
}

function getFallbackCandles(symbol: SymbolId): Candle[] {
  switch (symbol) {
    case 'XAUUSD':
      return GOLD_CANDLES_FIXTURE_5M;
    case 'EURUSD':
      return EURUSD_CANDLES_FIXTURE_5M;
    case 'GBPUSD':
      return GBPUSD_CANDLES_FIXTURE_5M;
    case 'USDJPY':
      return USDJPY_CANDLES_FIXTURE_5M;
    default:
      return GOLD_CANDLES_FIXTURE_5M;
  }
}

export function filterCandlesByHorizon(
  candles: Candle[],
  horizon: TimeHorizon,
  replayVisibleCandles?: Candle[],
  year: YearDatasetId = '2025'
): Candle[] {
  if (horizon === 'REPLAY_WINDOW' && replayVisibleCandles && replayVisibleCandles.length > 0) {
    return replayVisibleCandles;
  }

  if (candles.length === 0) return [];

  const firstDate = new Date(candles[0].timestamp);
  const detectedYear = !isNaN(firstDate.getUTCFullYear()) ? firstDate.getUTCFullYear() : parseInt(year, 10);
  const h2Cutoff = new Date(`${detectedYear}-07-01T00:00:00.000Z`).getTime();
  const q4Cutoff = new Date(`${detectedYear}-10-01T00:00:00.000Z`).getTime();

  switch (horizon) {
    case 'H2_6M': {
      const filtered = candles.filter(c => c.timestamp >= h2Cutoff);
      return filtered.length > 0 ? filtered : candles.slice(-Math.floor(candles.length / 2));
    }
    case 'Q4_3M': {
      const filtered = candles.filter(c => c.timestamp >= q4Cutoff);
      return filtered.length > 0 ? filtered : candles.slice(-Math.floor(candles.length / 4));
    }
    case 'FULL_YEAR':
    default:
      return candles;
  }
}
