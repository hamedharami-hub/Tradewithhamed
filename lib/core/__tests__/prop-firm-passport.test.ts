// lib/core/__tests__/prop-firm-passport.test.ts
// سوئیت تست جامع دامنه‌ای پکیج F: ممیزی قوانین پراپ‌فرم و صدور پاسپورت تأییدیه علمی استراتژی

import { PropFirmChallengeAuditor } from '../prop-firm-auditor';
import { ResearchLab } from '../research-lab';
import type { PropFirmChallengeAuditConfig } from '@/lib/contracts/prop-firm-passport';
import type { PerformanceMetrics } from '../research-lab';
import type { MonteCarloSimulationReport } from '@/lib/contracts/monte-carlo-stress';
import type { PurgedWalkForwardReport } from '@/lib/contracts/parameter-optimization';

export interface DomainCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

// ساخت یک شیء PerformanceMetrics نمونه با فیلدهای واقعی
function buildMetrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    totalTrades: 45,
    winningTrades: 28,
    losingTrades: 17,
    breakEvenTrades: 0,
    winRatePercent: 62.2,
    profitFactor: 1.85,
    payoffRatio: 1.87,
    expectancyR: 0.72,
    netProfit: 11200,
    netProfitPercent: 11.2,
    maxDrawdownAmount: 5500,
    maxDrawdownPercent: 5.5,
    recoveryFactor: 2.04,
    totalCommissions: 320,
    avgMaePips: 8.2,
    avgMfePips: 22.4,
    equityCurve: [],
    ambiguousTradesCount: 0,
    ...overrides,
  };
}

// پیکربندی نمونه برای چالش FTMO فاز ۱
function buildFtmoConfig(overrides: Partial<PropFirmChallengeAuditConfig> = {}): PropFirmChallengeAuditConfig {
  return {
    propFirmId: 'FTMO_NORMAL',
    targetAccountSizeDollar: 100_000,
    phase: 'PHASE_1',
    ...overrides,
  };
}

// متادیتای نمونه با مقادیر معتبر از TradingStyleType، SymbolId، Timeframe
const sampleMeta = {
  strategyName: 'Test Trend Strategy',
  style: 'TREND_BREAKOUT' as const,
  symbol: 'EURUSD' as const,
  timeframe: '1H' as const,
};

// گزارش مونت‌کارلو نمونه با تمام فیلدهای اجباری
function buildMCReport(ruinProbabilityPercent: number): MonteCarloSimulationReport {
  return {
    simulationVersion: 'v2-monte-carlo',
    iterations: 500,
    method: 'TRADE_RESHUFFLE',
    seed: 42,
    initialEquity: 100_000,
    finalEquityPercentiles: { p5: 102000, p25: 108000, p50: 112000, p75: 118000, p95: 125000 },
    maxDrawdownPercentiles: { p5: 3.0, p25: 4.0, p50: 5.5, p75: 7.0, p95: 9.0 },
    riskOfRuin: {
      ruinProbabilityPercent,
      p50MaxDrawdownPercent: 5.5,
      p95MaxDrawdownPercent: 9.0,
      propFirmPassProbabilityPercent: 100 - ruinProbabilityPercent,
      drawdownExceedanceProbabilities: {
        exceeds5Percent: ruinProbabilityPercent * 2,
        exceeds10Percent: ruinProbabilityPercent,
        exceeds15Percent: ruinProbabilityPercent * 0.5,
        exceeds20Percent: ruinProbabilityPercent * 0.1,
      },
    },
    samplePaths: [],
    executionTimeMs: 220,
  };
}

// گزارش Walk-Forward نمونه با تمام فیلدهای اجباری
function buildWFReport(grade: 'ROBUST' | 'DEGRADED' | 'OVERFITTED', wfe = 0.79): PurgedWalkForwardReport {
  return {
    evaluatorVersion: 'v2-purged-walk-forward',
    windowType: 'ROLLING',
    totalFolds: 5,
    passedFolds: grade === 'OVERFITTED' ? 1 : 4,
    aggregateIsProfit: 12000,
    aggregateOosProfit: 9500,
    walkForwardEfficiency: wfe,
    stabilityScorePercent: grade === 'ROBUST' ? 80 : grade === 'DEGRADED' ? 55 : 20,
    robustnessGrade: grade,
    robustnessSummaryFa: `رتبه استحکام: ${grade}`,
    folds: [],
    warnings: [],
    executionTimeMs: 850,
  };
}

export async function runPropFirmPassportTestSuite(): Promise<DomainCheckResult[]> {
  const checks: DomainCheckResult[] = [];

  // ─────────────────────────────────────────────────────────────
  // بررسی ۱: رأی APPROVED وقتی همه قوانین pass می‌شوند
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics({
      maxDrawdownPercent: 5.5,   // < 10% FTMO
      netProfitPercent: 11.2,    // > 10% FTMO target
      totalTrades: 45,           // >= 10
      profitFactor: 1.85,        // >= 1.30
    });
    const config = buildFtmoConfig();
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, sampleMeta);
    checks.push({
      name: '۱. رأی APPROVED وقتی همه قوانین pass می‌شوند (FTMO Phase 1)',
      passed: passport.verdict === 'APPROVED',
      details: `verdict=${passport.verdict} | score=${passport.overallScorePercent}٪ | rules=${passport.ruleChecks.length}`,
    });
  } catch (e) {
    checks.push({ name: '۱. رأی APPROVED', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۲: رأی REJECTED وقتی maxDrawdown از حد مجاز فراتر رفته (fatal)
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics({ maxDrawdownPercent: 13.5 }); // > 10% FTMO → fatal
    const config = buildFtmoConfig();
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, sampleMeta);
    const ddCheck = passport.ruleChecks.find(r => r.ruleKey === 'MAX_TOTAL_DRAWDOWN');
    checks.push({
      name: '۲. رأی REJECTED به دلیل تجاوز maxDrawdown از سقف مجاز (fatal)',
      passed: passport.verdict === 'REJECTED' && ddCheck?.passed === false && ddCheck?.isFatal === true,
      details: `verdict=${passport.verdict} | ddCheck.passed=${ddCheck?.passed} | isFatal=${ddCheck?.isFatal}`,
    });
  } catch (e) {
    checks.push({ name: '۲. رأی REJECTED maxDrawdown', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۳: رأی REJECTED وقتی totalTrades < 10 (fatal)
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics({ totalTrades: 7, winningTrades: 4, losingTrades: 3 }); // < 10 → fatal
    const config = buildFtmoConfig();
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, sampleMeta);
    const tradeCheck = passport.ruleChecks.find(r => r.ruleKey === 'MINIMUM_TRADES');
    checks.push({
      name: '۳. رأی REJECTED وقتی totalTrades < ۱۰ (fatal)',
      passed: passport.verdict === 'REJECTED' && tradeCheck?.passed === false,
      details: `verdict=${passport.verdict} | trades=7 | tradeCheck.passed=${tradeCheck?.passed}`,
    });
  } catch (e) {
    checks.push({ name: '۳. رأی REJECTED کمبود معاملات', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۴: رأی CONDITIONAL وقتی فقط non-fatal fails وجود دارد
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics({
      maxDrawdownPercent: 4.0,   // safe - dailyDD estimate ~2.4% < 5% → OK
      totalTrades: 20,
      winningTrades: 12,
      losingTrades: 8,
      netProfitPercent: 7.0,     // below 10% FTMO target → non-fatal fail
      profitFactor: 1.10,        // below 1.30 → non-fatal fail
    });
    const config = buildFtmoConfig();
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, sampleMeta);
    const fatalFails = passport.ruleChecks.filter(r => r.isFatal && !r.passed);
    const nonFatalFails = passport.ruleChecks.filter(r => !r.isFatal && !r.passed);
    checks.push({
      name: '۴. رأی CONDITIONAL با non-fatal fails و بدون fatal fails',
      passed: passport.verdict === 'CONDITIONAL' && fatalFails.length === 0 && nonFatalFails.length >= 1,
      details: `verdict=${passport.verdict} | fatalFails=${fatalFails.length} | nonFatalFails=${nonFatalFails.length}`,
    });
  } catch (e) {
    checks.push({ name: '۴. رأی CONDITIONAL', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۵: یکپارچگی احتمال ورشکستگی Monte Carlo در passport
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics();
    const config = buildFtmoConfig();
    const monteCarloReport = buildMCReport(3.5); // ruin=3.5% → should PASS (≤ 10%)
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, { ...sampleMeta, monteCarloReport });
    const mcCheck = passport.ruleChecks.find(r => r.ruleKey === 'MONTE_CARLO_SAFETY');
    checks.push({
      name: '۵. یکپارچگی مونت‌کارلو (ruinProb=3.5٪ ≤ 10٪) → MC check PASS',
      passed: mcCheck !== undefined && mcCheck.passed === true && passport.metricsSnapshot.monteCarloRuinProbability === 3.5,
      details: `mcCheck.passed=${mcCheck?.passed} | snapshotRuin=${passport.metricsSnapshot.monteCarloRuinProbability}`,
    });
  } catch (e) {
    checks.push({ name: '۵. یکپارچگی Monte Carlo', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۶: یکپارچگی Walk-Forward robustness grade در passport
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics();
    const config = buildFtmoConfig();
    const walkForwardReport = buildWFReport('ROBUST', 0.79);
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, { ...sampleMeta, walkForwardReport });
    const wfCheck = passport.ruleChecks.find(r => r.ruleKey === 'WALK_FORWARD_ROBUSTNESS');
    checks.push({
      name: '۶. یکپارچگی Walk-Forward Robustness grade ROBUST → WF check PASS',
      passed: wfCheck !== undefined && wfCheck.passed === true && passport.metricsSnapshot.walkForwardEfficiency === 0.79,
      details: `wfCheck.passed=${wfCheck?.passed} | wfe=${passport.metricsSnapshot.walkForwardEfficiency}`,
    });
  } catch (e) {
    checks.push({ name: '۶. یکپارچگی Walk-Forward', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۷: یکتایی checksum امضا برای ورودی‌های متفاوت
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics1 = buildMetrics({ netProfit: 8000, maxDrawdownPercent: 4.0 });
    const metrics2 = buildMetrics({ netProfit: 14000, maxDrawdownPercent: 7.0 });
    const config = buildFtmoConfig();
    const p1 = PropFirmChallengeAuditor.auditChallenge(metrics1, config, { ...sampleMeta, symbol: 'EURUSD' });
    const p2 = PropFirmChallengeAuditor.auditChallenge(metrics2, config, { ...sampleMeta, symbol: 'GBPUSD' });
    const unique = p1.sha256Signature !== p2.sha256Signature;
    const validFormat = p1.sha256Signature.startsWith('PF-PASS-') && p2.sha256Signature.startsWith('PF-PASS-');
    checks.push({
      name: '۷. یکتایی checksum امضا و فرمت PF-PASS-XXXXXXXX برای ورودی‌های مختلف',
      passed: unique && validFormat,
      details: `sig1=${p1.sha256Signature} | sig2=${p2.sha256Signature} | unique=${unique}`,
    });
  } catch (e) {
    checks.push({ name: '۷. یکتایی checksum', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۸: همه ۴ پرست پراپ‌فرم قابل ممیزی هستند
  // ─────────────────────────────────────────────────────────────
  try {
    const propFirms: Array<PropFirmChallengeAuditConfig['propFirmId']> = [
      'FTMO_NORMAL', 'THE5ERS_HIGH_STAKES', 'FUNDEDNEXT_STELLAR', 'PERSONAL_STRICT',
    ];
    const metrics = buildMetrics({ maxDrawdownPercent: 2.5, totalTrades: 30, winningTrades: 18, losingTrades: 12, netProfitPercent: 15 });
    let allOk = true;
    const results: string[] = [];
    for (const pfId of propFirms) {
      const config: PropFirmChallengeAuditConfig = { propFirmId: pfId, targetAccountSizeDollar: 50_000, phase: 'PHASE_1' };
      const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, sampleMeta);
      const ok = ['APPROVED', 'CONDITIONAL', 'REJECTED'].includes(passport.verdict);
      if (!ok) allOk = false;
      results.push(`${pfId}:${passport.verdict}`);
    }
    checks.push({
      name: '۸. همه ۴ پرست پراپ‌فرم (FTMO, 5ers, FundedNext, Personal) قابل ممیزی',
      passed: allOk,
      details: results.join(' | '),
    });
  } catch (e) {
    checks.push({ name: '۸. ممیزی ۴ پرست', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۹: PHASE_2 از نصف profitTargetPercent استفاده می‌کند
  // ─────────────────────────────────────────────────────────────
  try {
    // FTMO phase1 target = 10% → phase2 target = 5%
    const metrics5Pct = buildMetrics({ netProfitPercent: 6.0 }); // > 5% but < 10%
    const configPhase2 = buildFtmoConfig({ phase: 'PHASE_2' });
    const configPhase1 = buildFtmoConfig({ phase: 'PHASE_1' });
    const passportP2 = PropFirmChallengeAuditor.auditChallenge(metrics5Pct, configPhase2, sampleMeta);
    const passportP1 = PropFirmChallengeAuditor.auditChallenge(metrics5Pct, configPhase1, sampleMeta);
    const ptCheckP2 = passportP2.ruleChecks.find(r => r.ruleKey === 'PROFIT_TARGET');
    const ptCheckP1 = passportP1.ruleChecks.find(r => r.ruleKey === 'PROFIT_TARGET');
    // Phase2 should pass (6% > 5%), Phase1 should fail (6% < 10%)
    checks.push({
      name: '۹. فاز ۲ از نصف profitTarget استفاده می‌کند (6% > 5% ✓ vs 6% < 10% ✗)',
      passed: ptCheckP2?.passed === true && ptCheckP1?.passed === false,
      details: `phase2.profitTarget.passed=${ptCheckP2?.passed} | phase1.profitTarget.passed=${ptCheckP1?.passed}`,
    });
  } catch (e) {
    checks.push({ name: '۹. PHASE_2 نصف target', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۱۰: فیلدهای metricsSnapshot به درستی پر می‌شوند
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics({
      totalTrades: 38,
      winningTrades: 22,
      losingTrades: 16,
      winRatePercent: 57.9,
      profitFactor: 1.65,
      netProfit: 9500,
      maxDrawdownPercent: 6.3,
      expectancyR: 0.55,
    });
    const config = buildFtmoConfig();
    const passport = PropFirmChallengeAuditor.auditChallenge(metrics, config, sampleMeta);
    const snap = passport.metricsSnapshot;
    const correctFields =
      snap.totalTrades === 38 &&
      snap.winRatePercent === 57.9 &&
      snap.profitFactor === 1.65 &&
      snap.netProfitDollar === 9500 &&
      snap.maxTotalDrawdownPercent === 6.3 &&
      snap.expectancyR === 0.55;
    checks.push({
      name: '۱۰. فیلدهای metricsSnapshot به درستی از PerformanceMetrics نگاشت می‌شوند',
      passed: correctFields,
      details: `trades=${snap.totalTrades} | wr=${snap.winRatePercent} | pf=${snap.profitFactor} | net=${snap.netProfitDollar} | dd=${snap.maxTotalDrawdownPercent}`,
    });
  } catch (e) {
    checks.push({ name: '۱۰. metricsSnapshot fields', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۱۱: ResearchLab.auditPropFirmChallenge() به درستی با auditor یکپارچه می‌شود
  // ─────────────────────────────────────────────────────────────
  try {
    const metrics = buildMetrics();
    const config = buildFtmoConfig();
    const passport = ResearchLab.auditPropFirmChallenge(metrics, config, sampleMeta);
    const hasRequiredFields =
      typeof passport.passportId === 'string' &&
      typeof passport.verdict === 'string' &&
      Array.isArray(passport.ruleChecks) &&
      passport.ruleChecks.length >= 5;
    checks.push({
      name: '۱۱. ResearchLab.auditPropFirmChallenge() یکپارچه‌سازی موفق با PropFirmChallengeAuditor',
      passed: hasRequiredFields,
      details: `passportId=${passport.passportId} | verdict=${passport.verdict} | checks=${passport.ruleChecks.length}`,
    });
  } catch (e) {
    checks.push({ name: '۱۱. ResearchLab integration', passed: false, details: String(e) });
  }

  // ─────────────────────────────────────────────────────────────
  // بررسی ۱۲: summaryFa برای همه سه نوع رأی غیر‌خالی و معنادار است
  // ─────────────────────────────────────────────────────────────
  try {
    const summaries: Record<string, string> = {};

    // APPROVED
    const mApproved = buildMetrics({ maxDrawdownPercent: 3, netProfitPercent: 12, profitFactor: 2.0, totalTrades: 30, winningTrades: 18, losingTrades: 12 });
    const pApproved = PropFirmChallengeAuditor.auditChallenge(mApproved, buildFtmoConfig(), sampleMeta);
    summaries['APPROVED'] = pApproved.summaryFa;

    // CONDITIONAL (non-fatal fails only)
    const mConditional = buildMetrics({ maxDrawdownPercent: 3, netProfitPercent: 7, profitFactor: 1.15, totalTrades: 30, winningTrades: 18, losingTrades: 12 });
    const pConditional = PropFirmChallengeAuditor.auditChallenge(mConditional, buildFtmoConfig(), sampleMeta);
    summaries['CONDITIONAL'] = pConditional.summaryFa;

    // REJECTED (fatal fail - very high drawdown)
    const mRejected = buildMetrics({ maxDrawdownPercent: 15, totalTrades: 5, winningTrades: 2, losingTrades: 3 });
    const pRejected = PropFirmChallengeAuditor.auditChallenge(mRejected, buildFtmoConfig(), sampleMeta);
    summaries['REJECTED'] = pRejected.summaryFa;

    const allNonEmpty = Object.values(summaries).every(s => typeof s === 'string' && s.length > 10);
    const approvedText = summaries['APPROVED'];
    const rejectedText = summaries['REJECTED'];
    const allDistinct = approvedText !== rejectedText;

    checks.push({
      name: '۱۲. summaryFa برای APPROVED/CONDITIONAL/REJECTED غیر‌خالی و متمایز است (فارسی)',
      passed: allNonEmpty && allDistinct,
      details: `approved="${summaries['APPROVED'].substring(0, 30)}..." | rejected="${summaries['REJECTED'].substring(0, 30)}..."`,
    });
  } catch (e) {
    checks.push({ name: '۱۲. summaryFa verdicts', passed: false, details: String(e) });
  }

  return checks;
}
