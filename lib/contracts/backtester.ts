// lib/contracts/backtester.ts
// قراردادهای موتور جامع بک‌تست تاریخی چند سبکه و اعتبارسنجی مونت‌کارلو
// ۱۰۰٪ کلاینت‌ساید و آفلاین بدون وابستگی ابری

import { SymbolId, Timeframe } from './market';
import { MarketRegimeType, TradingStyleType } from './regimes';

export interface BacktestConfig {
  symbol: SymbolId;
  timeframe: Timeframe;
  style: TradingStyleType | 'ALL';
  initialCapital: number;
  riskPerTradePercent: number; // e.g. 0.5%
  minAlphaConsensusScore: number; // e.g. 70
  requireQuorum: boolean;
  minMonteCarloTpProbability: number; // e.g. 55%
  enablePartialTp: boolean; // خروج ۵۰٪ در ۱.۲R و ریسک‌فری خودکار
  spreadPips: number;
  slippagePips: number;
  commissionPerLotRoundTrip?: number; // e.g. $6.0 / lot round-trip
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbol: 'XAUUSD',
  timeframe: '5M',
  style: 'ALL',
  initialCapital: 10000,
  riskPerTradePercent: 0.5,
  minAlphaConsensusScore: 70,
  requireQuorum: true,
  minMonteCarloTpProbability: 55,
  enablePartialTp: true,
  spreadPips: 1.5,
  slippagePips: 0.2,
  commissionPerLotRoundTrip: 6.0,
};

export type BacktestExitReason =
  | 'TP_FULL'
  | 'TP_PARTIAL_RUNNER_TP'
  | 'TP_PARTIAL_RUNNER_BE'
  | 'SL'
  | 'TIMEOUT_CLOSE';

export interface BacktestTrade {
  id: string;
  candidateId: string;
  symbol: SymbolId;
  style: TradingStyleType;
  regime: MarketRegimeType;
  direction: 'BUY' | 'SELL';
  entryIndex: number;
  entryTimestamp: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  volumeLots: number;
  exitIndex: number;
  exitTimestamp: number;
  exitPrice: number;
  exitReason: BacktestExitReason;
  pnlDollar: number;
  pnlPercent: number;
  riskRewardAchieved: number;
  holdingBars: number;
  alphaConsensusScore: number;
  monteCarloTpProbability: number;
}

export interface BacktestSummaryMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePercent: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  profitFactor: number;
  maxDrawdownDollar: number;
  maxDrawdownPercent: number;
  expectedPayoff: number;
  sharpeRatio: number;
  avgHoldingBars: number;
  avgRiskRewardRatio: number;
}

export interface EquityCurvePoint {
  barIndex: number;
  timestamp: number;
  equity: number;
  drawdownPercent: number;
}

export interface BacktestReport {
  config: BacktestConfig;
  summary: BacktestSummaryMetrics;
  equityCurve: EquityCurvePoint[];
  regimePerformance: Partial<Record<MarketRegimeType, { tradesCount: number; winRate: number; netProfit: number }>>;
  stylePerformance: Partial<Record<TradingStyleType, { tradesCount: number; winRate: number; netProfit: number }>>;
  monteCarloAccuracy: {
    highProbTradesCount: number;
    highProbWinRate: number;
    lowProbTradesCount: number;
    lowProbWinRate: number;
    correlationNoteFa: string;
  };
  trades: BacktestTrade[];
}
