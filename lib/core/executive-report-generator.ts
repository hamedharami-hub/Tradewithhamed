// lib/core/executive-report-generator.ts
// موتور تولید گزارش تجمیعی جامع اجرایی، تبدیل به کارت‌های اشتراک‌گذاری و همگام‌ساز ژورنال (Package G)

import type { SymbolId, Timeframe } from '../contracts/market';
import type { TradingStyleType } from '../contracts/regimes';
import type { PerformanceMetrics } from './research-lab';
import type { StrategyPropPassport } from '../contracts/prop-firm-passport';
import type { MonteCarloSimulationReport } from '../contracts/monte-carlo-stress';
import type { PurgedWalkForwardReport } from '../contracts/parameter-optimization';
import type { PositionLedgerEntry } from './ports';
import type {
  StrategyExecutiveReport,
  ShareablePassportCardData,
  JournalExportBatch,
} from '../contracts/research-reports-journal';

export class ExecutiveReportGenerator {
  /**
   * تولید گزارش جامع اجرایی (Executive Report) از ترکیب معیارهای بکتست، پاسپورت، مونت‌کارلو و واک‌فوروارد
   */
  public static generateExecutiveReport(
    metrics: PerformanceMetrics,
    options: {
      strategyName: string;
      strategyStyle: TradingStyleType;
      symbol: SymbolId;
      timeframe: Timeframe;
      initialCapital: number;
      passport?: StrategyPropPassport | null;
      monteCarlo?: MonteCarloSimulationReport | null;
      walkForward?: PurgedWalkForwardReport | null;
    }
  ): StrategyExecutiveReport {
    const finalEquity = metrics.diagnostics?.finalEquity ?? (options.initialCapital + metrics.netProfit);
    const strengths: string[] = [];
    const vulnerabilities: string[] = [];

    // ۱. ارزیابی فاکتور سود و امید ریاضی
    if (metrics.profitFactor >= 1.6) {
      strengths.push(`فاکتور سود قدرتمند (${metrics.profitFactor.toFixed(2)})`);
    } else if (metrics.profitFactor < 1.2) {
      vulnerabilities.push(`حاشیه سودآوری شکننده (${metrics.profitFactor.toFixed(2)})`);
    }

    if (metrics.expectancyR >= 0.5) {
      strengths.push(`امید ریاضی بسیار مثبت (${metrics.expectancyR.toFixed(2)}R در هر معامله)`);
    } else if (metrics.expectancyR <= 0) {
      vulnerabilities.push(`امید ریاضی منفی یا صفر (${metrics.expectancyR.toFixed(2)}R)`);
    }

    // ۲. ارزیابی ریسک دروداون
    if (metrics.maxDrawdownPercent <= 6.0) {
      strengths.push(`کنترل افت عالی (حداکثر ${metrics.maxDrawdownPercent.toFixed(1)}٪)`);
    } else if (metrics.maxDrawdownPercent > 12.0) {
      vulnerabilities.push(`افت شدید سرمایه (${metrics.maxDrawdownPercent.toFixed(1)}٪) و فراتر از حدود استاندارد`);
    }

    // ۳. ارزیابی شبیه‌سازی مونت‌کارلو در صورت وجود
    if (options.monteCarlo) {
      const mcRuin = options.monteCarlo.riskOfRuin.ruinProbabilityPercent;
      if (mcRuin <= 3.0) {
        strengths.push(`ریسک ورشکستگی مونت‌کارلو نزدیک به صفر (${mcRuin.toFixed(1)}٪)`);
      } else if (mcRuin > 10.0) {
        vulnerabilities.push(`ریسک ورشکستگی بالای ۱۰٪ در آزمون جایگشت شبیه‌سازی (${mcRuin.toFixed(1)}٪)`);
      }
    }

    // ۴. ارزیابی واک‌فوروارد
    if (options.walkForward) {
      if (options.walkForward.robustnessGrade === 'ROBUST') {
        strengths.push(`پایداری اعتبارسنجی برون‌نمونه‌ای (WFE: ${(options.walkForward.walkForwardEfficiency * 100).toFixed(0)}٪)`);
      } else if (options.walkForward.robustnessGrade === 'OVERFITTED') {
        vulnerabilities.push('علائم بیش‌برازش در پنجره‌های تست آینده (Overfitted Walk-Forward)');
      }
    }

    // محاسبه نمره اجرایی ۰ تا ۱۰۰
    let score = 50;
    if (metrics.netProfit > 0) score += 15;
    else score -= 15;

    if (metrics.profitFactor >= 1.5) score += 10;
    else if (metrics.profitFactor < 1.0) score -= 10;

    if (metrics.maxDrawdownPercent <= 8.0) score += 10;
    else if (metrics.maxDrawdownPercent > 15.0) score -= 15;

    if (metrics.totalTrades >= 15) score += 5;
    if (options.passport?.verdict === 'APPROVED') score += 10;
    if (options.passport?.verdict === 'REJECTED') score -= 20;

    if (options.monteCarlo) {
      if (options.monteCarlo.riskOfRuin.ruinProbabilityPercent <= 5) score += 5;
      else if (options.monteCarlo.riskOfRuin.ruinProbabilityPercent > 15) score -= 15;
    }

    if (options.walkForward) {
      if (options.walkForward.robustnessGrade === 'ROBUST') score += 5;
      else if (options.walkForward.robustnessGrade === 'OVERFITTED') score -= 15;
    }

    score = Math.max(5, Math.min(99, score));

    let qualityTier: StrategyExecutiveReport['qualityTier'] = 'GRADE_C_RISKY';
    let readinessSummaryFa = '';

    if (score >= 80) {
      qualityTier = 'GRADE_A_PRIME';
      readinessSummaryFa = 'استراتژی در بالاترین سطح استاندارد ساختاری قرار دارد و آماده ارزیابی و معامله در حساب‌های حرفه‌ای است.';
    } else if (score >= 60) {
      qualityTier = 'GRADE_B_VIABLE';
      readinessSummaryFa = 'استراتژی بازدهی قابل‌قبول دارد اما در شرایط خاص بازار نیازمند کنترل و مانیتورینگ دقیق است.';
    } else if (score >= 40) {
      qualityTier = 'GRADE_C_RISKY';
      readinessSummaryFa = 'استراتژی پرریسک ارزیابی می‌شود؛ توصیه به بهینه‌سازی مجدد پارامترها و کاهش حجم معاملات.';
    } else {
      qualityTier = 'GRADE_F_REJECTED';
      readinessSummaryFa = 'استراتژی با پارامترهای کنونی غیرقابل اتکا بوده و استانداردهای لازم را احراز نکرده است.';
    }

    return {
      reportId: `EXEC-REP-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      strategyName: options.strategyName,
      strategyStyle: options.strategyStyle,
      symbol: options.symbol,
      timeframe: options.timeframe,
      initialCapitalDollar: options.initialCapital,
      finalEquityDollar: Number(finalEquity.toFixed(2)),
      netProfitDollar: Number(metrics.netProfit.toFixed(2)),
      netProfitPercent: Number(metrics.netProfitPercent.toFixed(1)),
      maxDrawdownPercent: Number(metrics.maxDrawdownPercent.toFixed(1)),
      winRatePercent: Number(metrics.winRatePercent.toFixed(1)),
      profitFactor: Number(metrics.profitFactor.toFixed(2)),
      expectancyR: Number(metrics.expectancyR.toFixed(2)),
      totalTrades: metrics.totalTrades,
      passport: options.passport || null,
      monteCarlo: options.monteCarlo || null,
      walkForward: options.walkForward || null,
      executiveScorePercent: score,
      qualityTier,
      keyStrengthsFa: strengths.length > 0 ? strengths : ['عملکرد مقدماتی قابل بررسی'],
      vulnerabilitiesFa: vulnerabilities.length > 0 ? vulnerabilities : ['نقطه ضعف بحرانی مشاهده نشد'],
      readinessSummaryFa,
    };
  }

  /**
   * تبدیل پاسپورت یا متریک‌های استراتژی به ساختار اختصاصی کارت تصویری قابل اشتراک‌گذاری
   */
  public static createPassportCardPayload(
    passport: StrategyPropPassport,
    options: {
      propFirmNameFa?: string;
    } = {}
  ): ShareablePassportCardData {
    return {
      passportId: passport.passportId,
      strategyName: passport.strategyName,
      style: passport.strategyStyle,
      symbol: passport.symbol,
      timeframe: passport.timeframe,
      verdict: passport.verdict,
      overallScorePercent: passport.overallScorePercent,
      winRatePercent: passport.metricsSnapshot.winRatePercent,
      profitFactor: passport.metricsSnapshot.profitFactor,
      maxDrawdownPercent: passport.metricsSnapshot.maxTotalDrawdownPercent,
      netProfitPercent: Number(((passport.metricsSnapshot.netProfitDollar / passport.targetAccountSizeDollar) * 100).toFixed(1)),
      propFirmName: options.propFirmNameFa || passport.evaluatedPropFirm,
      accountSizeDollar: passport.targetAccountSizeDollar,
      issuedAt: passport.issuedAt,
      sha256Signature: passport.sha256Signature,
      verificationUrl: `https://tradewithhamed.app/verify/${passport.passportId}`,
    };
  }

  /**
   * آماده‌سازی و تبدیل معاملات بسته شده بکتست برای صدور و بارگذاری در ژورنال معاملات
   */
  public static exportTradesToJournalBatch(
    trades: PositionLedgerEntry[],
    meta: {
      strategyName: string;
      symbol: SymbolId;
    }
  ): JournalExportBatch {
    const closed = trades.filter(t => !t.isOpen);
    const totalPnl = closed.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);

    return {
      batchId: `BATCH-JOURNAL-${Date.now()}`,
      exportedAt: new Date().toISOString(),
      sourceEnvironment: 'RESEARCH',
      strategyName: meta.strategyName,
      symbol: meta.symbol,
      totalExportedTrades: closed.length,
      totalRealizedNetPnL: Number(totalPnl.toFixed(2)),
      trades: closed,
    };
  }
}
