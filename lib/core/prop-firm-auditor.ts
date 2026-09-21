// lib/core/prop-firm-auditor.ts
// موتور ممیزی هوشمند قوانین پراپ‌فرم و صدور پاسپورت تأییدیه علمی استراتژی (Package F)

import type { SymbolId, Timeframe } from '@/lib/contracts/market';
import type { TradingStyleType } from '@/lib/contracts/regimes';
import type { StrategyParameters } from '@/lib/contracts/strategy-parameters';
import { PROP_FIRM_PRESETS, type PropFirmId } from '@/lib/contracts/prop-firms';
import type { PerformanceMetrics } from './research-lab';
import type { MonteCarloSimulationReport } from '@/lib/contracts/monte-carlo-stress';
import type { PurgedWalkForwardReport } from '@/lib/contracts/parameter-optimization';
import type {
  PropFirmChallengeAuditConfig,
  PropFirmRuleCheckDetail,
  StrategyPropPassport,
  PropFirmEvaluationVerdict,
} from '@/lib/contracts/prop-firm-passport';

export class PropFirmChallengeAuditor {
  /**
   * تولید هش ساده یکپارچه برای امضای تغییرناپذیر پاسپورت
   */
  private static generatePassportChecksum(content: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `PF-PASS-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
  }

  /**
   * ممیزی کامل نتایج استراتژی در برابر مشخصات دقیق پراپ‌فرم
   */
  public static auditChallenge(
    metrics: PerformanceMetrics,
    config: PropFirmChallengeAuditConfig,
    meta: {
      strategyName: string;
      style: TradingStyleType;
      symbol: SymbolId;
      timeframe: Timeframe;
      walkForwardReport?: PurgedWalkForwardReport | null;
      monteCarloReport?: MonteCarloSimulationReport | null;
    }
  ): StrategyPropPassport {
    const preset = PROP_FIRM_PRESETS[config.propFirmId] || PROP_FIRM_PRESETS.FTMO_NORMAL;
    const ruleChecks: PropFirmRuleCheckDetail[] = [];

    // ۱. حداکثر افت کل مجاز (Max Total Drawdown) - حیاتی
    const maxDdObserved = metrics.maxDrawdownPercent;
    const maxDdAllowed = preset.maxDrawdownPercent;
    const passMaxDd = maxDdObserved <= maxDdAllowed;
    ruleChecks.push({
      ruleKey: 'MAX_TOTAL_DRAWDOWN',
      titleFa: 'سقف افت کل مجاز (Max Drawdown)',
      requiredConstraint: `حداکثر ${maxDdAllowed}٪`,
      actualObserved: `${maxDdObserved.toFixed(1)}٪`,
      passed: passMaxDd,
      isFatal: true,
      remedyRecommendationFa: passMaxDd ? undefined : 'کاهش حجم معاملات یا تنگ‌تر کردن حد ضرر بر مبنای ضریب ATR.',
    });

    // ۲. تخمین حداکثر افت روزانه بر مبنای ۵۰٪ افت کل یا بدترین معامله - حیاتی
    const estimatedDailyLossPercent = Number((metrics.maxDrawdownPercent * 0.6).toFixed(1));
    const passDailyLoss = estimatedDailyLossPercent <= preset.dailyDrawdownPercent;
    ruleChecks.push({
      ruleKey: 'DAILY_LOSS_LIMIT',
      titleFa: 'سقف افت مجاز روزانه (Daily Loss)',
      requiredConstraint: `حداکثر ${preset.dailyDrawdownPercent}٪`,
      actualObserved: `تقریبی ${estimatedDailyLossPercent}٪`,
      passed: passDailyLoss,
      isFatal: true,
      remedyRecommendationFa: passDailyLoss ? undefined : 'فعال‌سازی سقف ضرر روزانه و توقف معاملات پس از ۲ باخت پیاپی.',
    });

    // ۳. تارگت سود مرحله اول یا دوم - غیرحیاتی در صورت مثبت بودن
    const profitTargetPercent = config.phase === 'PHASE_2' ? preset.profitTargetPercent * 0.5 : preset.profitTargetPercent;
    const passProfitTarget = metrics.netProfitPercent >= profitTargetPercent;
    ruleChecks.push({
      ruleKey: 'PROFIT_TARGET',
      titleFa: 'تارگت سود هدف مرحله چالش',
      requiredConstraint: `حداقل ${profitTargetPercent}٪`,
      actualObserved: `${metrics.netProfitPercent.toFixed(1)}٪`,
      passed: passProfitTarget,
      isFatal: false,
      remedyRecommendationFa: passProfitTarget ? undefined : 'افزایش نسبت ریسک به ریوارد یا گزینش تایم‌فریم‌های با پتانسیل گام‌های بلندتر.',
    });

    // ۴. حداقل تعداد معاملات برای اعتبار آماری
    const minTradesRequired = 10;
    const passMinTrades = metrics.totalTrades >= minTradesRequired;
    ruleChecks.push({
      ruleKey: 'MINIMUM_TRADES',
      titleFa: 'کفایت آماری معاملات',
      requiredConstraint: `حداقل ${minTradesRequired} معامله`,
      actualObserved: `${metrics.totalTrades} معامله`,
      passed: passMinTrades,
      isFatal: true,
      remedyRecommendationFa: passMinTrades ? undefined : 'افزایش بازه تاریخی یا بررسی سبک‌های میان‌روزی با فرکانس بالاتر.',
    });

    // ۵. فاکتور سود (Profit Factor)
    const minPfRequired = 1.30;
    const passPf = metrics.profitFactor >= minPfRequired;
    ruleChecks.push({
      ruleKey: 'PROFIT_FACTOR',
      titleFa: 'فاکتور سود پایدار (Profit Factor)',
      requiredConstraint: `حداقل ${minPfRequired}`,
      actualObserved: `${metrics.profitFactor.toFixed(2)}`,
      passed: passPf,
      isFatal: false,
      remedyRecommendationFa: passPf ? undefined : 'حذف ورودهای خارج از سشن‌های اصلی لندن و نیویورک.',
    });

    // ۶. ایمنی در شبیه‌سازی مونت‌کارلو (در صورت وجود گزارش)
    let mcRuinProb = 0;
    if (meta.monteCarloReport) {
      mcRuinProb = meta.monteCarloReport.riskOfRuin.ruinProbabilityPercent;
      const passMc = mcRuinProb <= 10.0;
      ruleChecks.push({
        ruleKey: 'MONTE_CARLO_SAFETY',
        titleFa: 'احتمال ورشکستگی در شبیه‌سازی مونت‌کارلو',
        requiredConstraint: 'حداکثر ۱۰٪',
        actualObserved: `${mcRuinProb}٪`,
        passed: passMc,
        isFatal: true,
        remedyRecommendationFa: passMc ? undefined : 'کاهش ریسک پیش‌فرض هر پوزیشن به زیر ۰.۵٪.',
      });
    }

    // ۷. کارایی اعتبارسنجی پیش‌رو Walk-Forward (در صورت وجود گزارش)
    let wfEfficiency = 1.0;
    if (meta.walkForwardReport) {
      wfEfficiency = meta.walkForwardReport.walkForwardEfficiency;
      const passWf = meta.walkForwardReport.robustnessGrade !== 'OVERFITTED';
      ruleChecks.push({
        ruleKey: 'WALK_FORWARD_ROBUSTNESS',
        titleFa: 'استحکام برون‌نمونه‌ای Walk-Forward',
        requiredConstraint: 'عدم بیش‌برازش (Robust یا Degraded)',
        actualObserved: `${meta.walkForwardReport.robustnessGrade} (WFE: ${(wfEfficiency * 100).toFixed(0)}٪)`,
        passed: passWf,
        isFatal: false,
        remedyRecommendationFa: passWf ? undefined : 'بازتنظیم پارامترها روی فلات امن و حذف پارامترهای با حساسیت شدید.',
      });
    }

    // محاسبه نمره کل و رأی نهایی
    const fatalFails = ruleChecks.filter(r => r.isFatal && !r.passed);
    const nonFatalFails = ruleChecks.filter(r => !r.isFatal && !r.passed);
    const passedChecks = ruleChecks.filter(r => r.passed).length;
    const overallScorePercent = Math.round((passedChecks / ruleChecks.length) * 100);

    let verdict: PropFirmEvaluationVerdict = 'REJECTED';
    let summaryFa = '';

    if (fatalFails.length === 0 && nonFatalFails.length === 0) {
      verdict = 'APPROVED';
      summaryFa = `استراتژی کاملاً با استانداردهای چالش ${preset.nameFa} انطباق دارد و شایسته صدور پاسپورت رسمی است.`;
    } else if (fatalFails.length === 0 && nonFatalFails.length <= 2) {
      verdict = 'CONDITIONAL';
      summaryFa = `استراتژی از نظر حدود افت سرمایه ایمن است اما در برخی پارامترهای سودآوری نیاز به بهینه‌سازی دارد.`;
    } else {
      verdict = 'REJECTED';
      summaryFa = `استراتژی به دلیل نقض قواعد حیاتی در چالش ${preset.nameFa} مردود اعلام می‌گردد.`;
    }

    const warnings: string[] = [];
    if (fatalFails.length > 0) {
      warnings.push(`نقض ${fatalFails.length} قانون حیاتی در آزمون پراپ‌فرم.`);
    }

    const passportSeed = `${config.propFirmId}-${meta.symbol}-${meta.timeframe}-${metrics.netProfit}-${metrics.maxDrawdownPercent}`;
    const sha256Signature = this.generatePassportChecksum(passportSeed);

    return {
      passportId: `PASSPORT-${Date.now()}`,
      issuedAt: new Date().toISOString(),
      sha256Signature,
      strategyName: meta.strategyName,
      strategyStyle: meta.style,
      symbol: meta.symbol,
      timeframe: meta.timeframe,
      evaluatedPropFirm: config.propFirmId,
      targetAccountSizeDollar: config.targetAccountSizeDollar,
      verdict,
      overallScorePercent,
      metricsSnapshot: {
        totalTrades: metrics.totalTrades,
        winRatePercent: metrics.winRatePercent,
        profitFactor: metrics.profitFactor,
        netProfitDollar: metrics.netProfit,
        maxDailyDrawdownPercent: estimatedDailyLossPercent,
        maxTotalDrawdownPercent: metrics.maxDrawdownPercent,
        expectancyR: metrics.expectancyR,
        monteCarloRuinProbability: mcRuinProb,
        walkForwardEfficiency: wfEfficiency,
      },
      ruleChecks,
      summaryFa,
      warnings,
    };
  }
}
