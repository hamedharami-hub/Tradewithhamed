import type { SymbolId, Timeframe } from '@/lib/contracts/market';

export interface BundledHistoricalDataset {
  id: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  source: 'Yahoo Finance' | 'HistData' | 'HistData aggregated';
  providerSymbol: string;
  labelFa: string;
  url: string;
  caveatFa?: string;
}

/**
 * Public static CSVs generated from audited Yahoo Finance chart responses.
 * They are deliberately limited to daily bars: fast, reproducible in browser,
 * and suitable for long-horizon structural research. Intraday work still uses
 * an explicit user CSV import, where broker/source compatibility can be checked.
 */
export const BUNDLED_HISTORICAL_DATASETS: BundledHistoricalDataset[] = [
  { id: 'HISTDATA-EURUSD-5M-2024', symbol: 'EURUSD', timeframe: '5M', source: 'HistData aggregated', providerSymbol: 'EURUSD', labelFa: 'EURUSD پنج‌دقیقه‌ای، سال ۲۰۲۴', url: '/historical/intraday/histdata-eurusd-5m-2024.csv', caveatFa: 'دادهٔ عمومی HistData است و broker-match نیست؛ برای پژوهش و Backtest استفاده شود.' },
  { id: 'HISTDATA-GBPUSD-5M-2024', symbol: 'GBPUSD', timeframe: '5M', source: 'HistData aggregated', providerSymbol: 'GBPUSD', labelFa: 'GBPUSD پنج‌دقیقه‌ای، سال ۲۰۲۴', url: '/historical/intraday/histdata-gbpusd-5m-2024.csv', caveatFa: 'دادهٔ عمومی HistData است و broker-match نیست؛ ۶۰ ردیف تکراری در M1 اولیه حذف شده است.' },
  { id: 'HISTDATA-USDJPY-5M-2024', symbol: 'USDJPY', timeframe: '5M', source: 'HistData aggregated', providerSymbol: 'USDJPY', labelFa: 'USDJPY پنج‌دقیقه‌ای، سال ۲۰۲۴', url: '/historical/intraday/histdata-usdjpy-5m-2024.csv', caveatFa: 'از artifact چندسالهٔ USDJPY استخراج شده؛ دادهٔ عمومی است و broker-match نیست.' },
  { id: 'YAHOO-EURUSD-D1-10Y', symbol: 'EURUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'EURUSD=X', labelFa: 'EURUSD روزانه، حدود ۱۰ سال', url: '/historical/yahoo-eurusd-d1-10y.csv' },
  { id: 'YAHOO-GBPUSD-D1-10Y', symbol: 'GBPUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'GBPUSD=X', labelFa: 'GBPUSD روزانه، حدود ۱۰ سال', url: '/historical/yahoo-gbpusd-d1-10y.csv' },
  { id: 'YAHOO-USDJPY-D1-10Y', symbol: 'USDJPY', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'JPY=X', labelFa: 'USDJPY روزانه، حدود ۱۰ سال', url: '/historical/yahoo-usdjpy-d1-10y.csv' },
  { id: 'YAHOO-XAUUSD-D1-10Y', symbol: 'XAUUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'GC=F', labelFa: 'طلا (GC=F) روزانه، حدود ۱۰ سال', url: '/historical/yahoo-gcf-d1-10y.csv', caveatFa: 'این داده قرارداد آتی COMEX است، نه quote اختصاصی بروکر XAUUSD؛ برای پژوهش ساختاری بلندمدت مناسب است، نه کالیبراسیون اجرای بروکر.' },
  { id: 'YAHOO-BTCUSD-D1-10Y', symbol: 'BTCUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'BTC-USD', labelFa: 'Bitcoin USD روزانه، حدود ۱۰ سال', url: '/historical/yahoo-btcusd-d1-10y.csv' },
];

export function bundledDatasetForSymbol(symbol: SymbolId): BundledHistoricalDataset | undefined {
  return BUNDLED_HISTORICAL_DATASETS.find(dataset => dataset.symbol === symbol && dataset.timeframe === 'D1');
}

export function bundledIntradayDatasetForSymbol(symbol: SymbolId, timeframe: Timeframe = '5M'): BundledHistoricalDataset | undefined {
  if (!['1M', '5M', '15M', '1H', '4H', 'D1', 'W1'].includes(timeframe)) return undefined;
  const labels: Record<Timeframe, string> = {
    '1M': 'یک‌دقیقه‌ای',
    '5M': 'پنج‌دقیقه‌ای',
    '15M': 'پانزده‌دقیقه‌ای',
    '1H': 'یک‌ساعته',
    '4H': 'چهارساعته',
    D1: 'روزانه',
    W1: 'هفتگی',
  };
  if (symbol === 'XAUUSD' && ['1H', '4H', 'D1'].includes(timeframe)) {
    const lower = timeframe.toLowerCase();
    return {
      id: `HISTDATA-XAUUSD-${timeframe}-2024`,
      symbol: 'XAUUSD',
      timeframe,
      source: 'HistData aggregated',
      providerSymbol: 'XAUUSD',
      labelFa: `طلا (XAUUSD) ${labels[timeframe]}، سال ۲۰۲۴`,
      url: `/historical/intraday/histdata-xauusd-${lower}-2024.csv`,
      caveatFa: 'دادهٔ پژوهشی یک‌ساله استخراج‌شده از قرارداد آتی طلا COMEX و شبیه‌سازی ساختار درون‌روز سشن‌ها.',
    };
  }
  if (['1M', '5M', '15M', '1H', '4H', 'D1', 'W1'].includes(timeframe) && ['EURUSD', 'GBPUSD', 'USDJPY'].includes(symbol)) {
    const lower = timeframe.toLowerCase();
    return {
      id: `HISTDATA-${symbol}-${timeframe}-2024`,
      symbol,
      timeframe,
      source: timeframe === '1M' ? 'HistData' : 'HistData aggregated',
      providerSymbol: symbol,
      labelFa: `${symbol} ${labels[timeframe]}، سال ۲۰۲۴`,
      url: `/historical/intraday/histdata-${symbol.toLowerCase()}-${lower}-2024.csv`,
      caveatFa: 'دادهٔ عمومی HistData است و broker-match نیست؛ برای پژوهش و Backtest استفاده شود.',
    };
  }
  return undefined;
}
