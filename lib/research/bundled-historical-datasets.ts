import type { SymbolId } from '@/lib/contracts/market';

export interface BundledHistoricalDataset {
  id: string;
  symbol: SymbolId;
  timeframe: 'D1';
  source: 'Yahoo Finance';
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
  { id: 'YAHOO-EURUSD-D1-10Y', symbol: 'EURUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'EURUSD=X', labelFa: 'EURUSD روزانه، حدود ۱۰ سال', url: '/historical/yahoo-eurusd-d1-10y.csv' },
  { id: 'YAHOO-GBPUSD-D1-10Y', symbol: 'GBPUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'GBPUSD=X', labelFa: 'GBPUSD روزانه، حدود ۱۰ سال', url: '/historical/yahoo-gbpusd-d1-10y.csv' },
  { id: 'YAHOO-USDJPY-D1-10Y', symbol: 'USDJPY', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'JPY=X', labelFa: 'USDJPY روزانه، حدود ۱۰ سال', url: '/historical/yahoo-usdjpy-d1-10y.csv' },
  { id: 'YAHOO-XAUUSD-D1-10Y', symbol: 'XAUUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'GC=F', labelFa: 'طلا (GC=F) روزانه، حدود ۱۰ سال', url: '/historical/yahoo-gcf-d1-10y.csv', caveatFa: 'این داده قرارداد آتی COMEX است، نه quote اختصاصی بروکر XAUUSD؛ برای پژوهش ساختاری بلندمدت مناسب است، نه کالیبراسیون اجرای بروکر.' },
  { id: 'YAHOO-BTCUSD-D1-10Y', symbol: 'BTCUSD', timeframe: 'D1', source: 'Yahoo Finance', providerSymbol: 'BTC-USD', labelFa: 'Bitcoin USD روزانه، حدود ۱۰ سال', url: '/historical/yahoo-btcusd-d1-10y.csv' },
];

export function bundledDatasetForSymbol(symbol: SymbolId): BundledHistoricalDataset | undefined {
  return BUNDLED_HISTORICAL_DATASETS.find(dataset => dataset.symbol === symbol);
}
