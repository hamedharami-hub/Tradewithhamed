// lib/contracts/backtester.ts
// قراردادهای موتور جامع بک‌تست تاریخی چند سبکه و اعتبارسنجی مونت‌کارلو
// ۱۰۰٪ کلاینت‌ساید و آفلاین بدون وابستگی ابری

import { SymbolId, Timeframe } from './market';
import { MarketRegimeType, TradingStyleType } from './regimes';
import { EquityMonteCarloResult } from '../core/equity-curve-monte-carlo';

export type BacktestSessionFilter =
  | 'ALL'
  | 'LONDON'
  | 'LONDON_NY_OVERLAP'
  | 'NEW_YORK'
  | 'ASIA';

export type BacktestAIMode =
  | 'AI_OFF'                 // بدون فیلتر هوش مصنوعی (محاسباتی و تکنیکال خالص)
  | 'AI_COUNCIL_S0'          // شورای ۴ عاملی S0 (اسکنر، بستر، منتقد، داور حدنصاب)
  | 'AI_DUAL_GUARD_STRICT'   // سپر دوگانه هوش مصنوعی (شورا + وتوی سدهای نقدینگی و تله‌ها)
  | 'AI_ADAPTIVE_CONFIDENCE';// تخصیص پویای حجم بر اساس درصد اطمینان هوش مصنوعی

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
  sessionFilter?: BacktestSessionFilter;
  useDynamicSpread?: boolean;
  rolloverBlackout?: boolean;
  intraBarModel?: 'PESSIMISTIC' | 'BAR_POLARITY';
  newsFilter?: boolean;
  adaptiveRiskScaling?: boolean;
  aiMode?: BacktestAIMode;
  aiModelNameFa?: string;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbol: 'XAUUSD',
  timeframe: '5M',
  style: 'ALL',
  initialCapital: 10000,
  riskPerTradePercent: 0.5,
  minAlphaConsensusScore: 70,
  requireQuorum: true,
  minMonteCarloTpProbability: 35,
  enablePartialTp: true,
  spreadPips: 1.5,
  slippagePips: 0.2,
  commissionPerLotRoundTrip: 6.0,
  sessionFilter: 'ALL',
  useDynamicSpread: true,
  rolloverBlackout: true,
  intraBarModel: 'BAR_POLARITY',
  newsFilter: true,
  adaptiveRiskScaling: false,
  aiMode: 'AI_COUNCIL_S0',
  aiModelNameFa: 'شورای ۴ عاملی S0 (پیش‌فرض سریع)',
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

export interface BacktestDatasetContext {
  mode: 'HISTORICAL' | 'REPLAY';
  symbol: SymbolId;
  timeframe: Timeframe;
  year?: string;
  horizon: string;
  sourceLabelFa: string;
  dateRangeFa: string;
  candleCount: number;
  warnings: string[];
  isSynthetic: boolean;
}

export interface BacktestVetoedTrade {
  id: string;
  timestamp: number;
  symbol: SymbolId;
  style: TradingStyleType;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  councilScore?: number;
  vetoReasonFa: string;
  hypotheticalOutcome: 'AVOIDED_LOSS' | 'MISSED_PROFIT' | 'TIMEOUT';
}

export interface BacktestAIMetrics {
  mode: BacktestAIMode;
  modelNameFa: string;
  totalCandidatesGenerated: number;
  approvedCandidatesCount: number;
  vetoedCandidatesCount: number;
  vetoRatePercent: number;
  avoidedLossesCount: number; // موقعیت‌های باختی که هوش مصنوعی وتو کرد و مانع ضرر شد
  missedProfitsCount: number; // موقعیت‌هایی که به تارگت می‌رسیدند ولی وتو شدند
  capitalSavedDollars: number; // تخمین کل سرمایه نجات‌یافته توسط فیلتر هوش مصنوعی
  winRateWithoutAI: number; // وین‌ریت کل کاندیداها بدون فیلتر هوش مصنوعی
  winRateWithAI: number;    // وین‌ریت پس از اعمال فیلتر شورا و منتقد
  winRateImprovementPercent: number; // درصد ارتقای وین‌ریت با هوش مصنوعی
  vetoedTradesSample: BacktestVetoedTrade[];
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
  equityMonteCarlo?: EquityMonteCarloResult;
  trades: BacktestTrade[];
  datasetContext?: BacktestDatasetContext;
  aiMetrics?: BacktestAIMetrics;
}
