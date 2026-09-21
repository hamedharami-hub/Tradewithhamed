// lib/contracts/prop-firm-passport.ts
// قراردادهای جامع ممیزی قوانین پراپ‌فرم و صدور پاسپورت تأییدیه استراتژی (Package F)

import type { SymbolId, Timeframe } from './market';
import type { PropFirmId } from './prop-firms';
import type { TradingStyleType } from './regimes';
import type { StrategyParameters } from './strategy-parameters';
import type { PerformanceMetrics } from '../core/research-lab';
import type { MonteCarloSimulationReport } from './monte-carlo-stress';
import type { PurgedWalkForwardReport } from './parameter-optimization';

export type PropFirmEvaluationVerdict =
  | 'APPROVED'           // واجد شرایط صدور پاسپورت قبولی با رتبه ممتاز
  | 'CONDITIONAL'        // قبولی مشروط با هشدارهای مرزی
  | 'REJECTED';          // مردود به دلیل نقض یک یا چند قانون حیاتی

export interface PropFirmRuleCheckDetail {
  ruleKey: string;
  titleFa: string;
  requiredConstraint: string;
  actualObserved: string;
  passed: boolean;
  isFatal: boolean; // آیا شکست در این قانون منجر به رد فوری می‌شود
  remedyRecommendationFa?: string;
}

export interface PropFirmChallengeAuditConfig {
  propFirmId: PropFirmId;
  targetAccountSizeDollar: number; // e.g. 100000
  phase: 'PHASE_1' | 'PHASE_2' | 'FUNDED_ACCOUNT';
  requireWalkForwardRobustness?: boolean;
  requireMonteCarloSafety?: boolean;
}

export interface StrategyPropPassport {
  passportId: string;
  issuedAt: string;
  sha256Signature: string; // امضای چک‌سام تغییرناپذیر
  strategyName: string;
  strategyStyle: TradingStyleType;
  symbol: SymbolId;
  timeframe: Timeframe;
  evaluatedPropFirm: PropFirmId;
  targetAccountSizeDollar: number;
  verdict: PropFirmEvaluationVerdict;
  overallScorePercent: number; // ۰ تا ۱۰۰
  metricsSnapshot: {
    totalTrades: number;
    winRatePercent: number;
    profitFactor: number;
    netProfitDollar: number;
    maxDailyDrawdownPercent: number;
    maxTotalDrawdownPercent: number;
    expectancyR: number;
    monteCarloRuinProbability: number;
    walkForwardEfficiency: number;
  };
  ruleChecks: PropFirmRuleCheckDetail[];
  summaryFa: string;
  warnings: string[];
}
