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
  return {
    sourceKind: 'HISTORICAL_RESEARCH', provider: 'HistData M1 bid bars; derived closed buckets where applicable', labelFa: `دادهٔ تاریخی HistData ${symbol} ${timeframe}، سال ${year}`,
    isSynthetic: false, isBrokerMatched: false, warnings: ['OHLC این داده بر پایهٔ قیمت Bid عمومی HistData است.', 'تطابق با قیمت، اسپرد و زمان‌بندی بروکر به‌صورت مستقل تأیید نشده است.'],
  };
}
