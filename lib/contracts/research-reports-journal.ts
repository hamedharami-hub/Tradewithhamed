// lib/contracts/research-reports-journal.ts
// قراردادهای جامع گزارش‌گیری تجمیعی استراتژی، صدور کارت گرافیکی و همگام‌سازی با ژورنال معاملات (Package G)

import type { SymbolId, Timeframe } from './market';
import type { TradingStyleType } from './regimes';
import type { PerformanceMetrics } from '../core/research-lab';
import type { StrategyPropPassport } from './prop-firm-passport';
import type { MonteCarloSimulationReport } from './monte-carlo-stress';
import type { PurgedWalkForwardReport } from './parameter-optimization';
import type { PositionLedgerEntry } from '../core/ports';

/**
 * خروجی جامع بسته تحقیقاتی (Full Executive Research Report)
 */
export interface StrategyExecutiveReport {
  reportId: string;
  generatedAt: string;
  strategyName: string;
  strategyStyle: TradingStyleType;
  symbol: SymbolId;
  timeframe: Timeframe;
  initialCapitalDollar: number;
  finalEquityDollar: number;
  netProfitDollar: number;
  netProfitPercent: number;
  maxDrawdownPercent: number;
  winRatePercent: number;
  profitFactor: number;
  expectancyR: number;
  totalTrades: number;

  // گزارش‌های متصل بسته‌های قبلی (در صورت وجود)
  passport?: StrategyPropPassport | null;
  monteCarlo?: MonteCarloSimulationReport | null;
  walkForward?: PurgedWalkForwardReport | null;

  // رتبه‌بندی کیفی استراتژی
  executiveScorePercent: number; // 0..100
  qualityTier: 'GRADE_A_PRIME' | 'GRADE_B_VIABLE' | 'GRADE_C_RISKY' | 'GRADE_F_REJECTED';
  keyStrengthsFa: string[];
  vulnerabilitiesFa: string[];
  readinessSummaryFa: string;

  // جدول خلاصه عملکرد بر حسب سشن‌ها
  sessionBreakdown?: Record<string, { trades: number; profit: number }>;
}

/**
 * ساختار داده‌ای استاندارد کارت اشتراک‌گذاری استراتژی / معامله (Shareable Card Payload)
 */
export interface ShareablePassportCardData {
  passportId: string;
  strategyName: string;
  style: TradingStyleType;
  symbol: SymbolId;
  timeframe: Timeframe;
  verdict: 'APPROVED' | 'CONDITIONAL' | 'REJECTED';
  overallScorePercent: number;
  winRatePercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  netProfitPercent: number;
  propFirmName: string;
  accountSizeDollar: number;
  issuedAt: string;
  sha256Signature: string;
  verificationUrl?: string;
}

/**
 * ساختار همگام‌سازی معامله‌های پژوهشی با ژورنال معاملات (Journal Bridge)
 */
export interface JournalExportBatch {
  batchId: string;
  exportedAt: string;
  sourceEnvironment: 'RESEARCH';
  strategyName: string;
  symbol: SymbolId;
  totalExportedTrades: number;
  totalRealizedNetPnL: number;
  trades: PositionLedgerEntry[];
}
