// lib/core/__tests__/research-reports-journal.test.ts
// سوئیت تست جامع دامنه‌ای پکیج G: گزارش تجمیعی استراتژی، کارت‌های اشتراک‌گذاری و پل ژورنال معاملات

import { ExecutiveReportGenerator } from '../executive-report-generator';
import { ResearchLab } from '../research-lab';
import type { PerformanceMetrics } from '../research-lab';
import type { StrategyPropPassport } from '@/lib/contracts/prop-firm-passport';
import type { MonteCarloSimulationReport } from '@/lib/contracts/monte-carlo-stress';
import type { PurgedWalkForwardReport } from '@/lib/contracts/parameter-optimization';
import type { PositionLedgerEntry } from '../ports';

export interface DomainCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

function buildMetrics(overrides: Partial<PerformanceMetrics> = {}): PerformanceMetrics {
  return {
    totalTrades: 35,
    winningTrades: 22,
    losingTrades: 13,
    breakEvenTrades: 0,
    winRatePercent: 62.9,
    profitFactor: 1.82,
    payoffRatio: 1.65,
    expectancyR: 0.65,
    netProfit: 8500,
    netProfitPercent: 8.5,
    maxDrawdownAmount: 4200,
    maxDrawdownPercent: 4.2,
    recoveryFactor: 2.02,
    totalCommissions: 280,
    avgMaePips: 6.5,
    avgMfePips: 18.2,
    equityCurve: [],
    ambiguousTradesCount: 0,
    diagnostics: {
      finalEquity: 108500,
    } as any,
    ...overrides,
  };
}

function buildMockPassport(): StrategyPropPassport {
  return {
    passportId: 'PASSPORT-TEST-001',
    issuedAt: new Date().toISOString(),
    sha256Signature: 'PF-PASS-9B1A45FE',
    strategyName: 'Trend Master Alpha',
    strategyStyle: 'TREND_BREAKOUT',
    symbol: 'EURUSD',
    timeframe: '1H',
    evaluatedPropFirm: 'FTMO_NORMAL',
    targetAccountSizeDollar: 100000,
    verdict: 'APPROVED',
    overallScorePercent: 92,
    metricsSnapshot: {
      totalTrades: 35,
      winRatePercent: 62.9,
      profitFactor: 1.82,
      netProfitDollar: 8500,
      maxDailyDrawdownPercent: 2.5,
      maxTotalDrawdownPercent: 4.2,
      expectancyR: 0.65,
      monteCarloRuinProbability: 1.2,
      walkForwardEfficiency: 0.81,
    },
    ruleChecks: [],
    summaryFa: 'استراتژی کاملاً با استانداردهای FTMO انطباق دارد.',
    warnings: [],
  };
}

function buildMockMCReport(ruin = 2.0): MonteCarloSimulationReport {
  return {
    simulationVersion: 'v2-monte-carlo',
    iterations: 500,
    method: 'TRADE_RESHUFFLE',
    seed: 42,
    initialEquity: 100000,
    finalEquityPercentiles: { p5: 102000, p25: 105000, p50: 108500, p75: 112000, p95: 118000 },
    maxDrawdownPercentiles: { p5: 2.5, p25: 3.5, p50: 4.2, p75: 5.5, p95: 7.2 },
    riskOfRuin: {
      ruinProbabilityPercent: ruin,
      p50MaxDrawdownPercent: 4.2,
      p95MaxDrawdownPercent: 7.2,
      propFirmPassProbabilityPercent: 98.8,
      drawdownExceedanceProbabilities: {
        exceeds5Percent: 5.0,
        exceeds10Percent: 2.0,
        exceeds15Percent: 0.5,
        exceeds20Percent: 0.0,
      },
    },
    samplePaths: [],
    executionTimeMs: 150,
  };
}

function buildMockWFReport(grade: 'ROBUST' | 'OVERFITTED' = 'ROBUST'): PurgedWalkForwardReport {
  return {
    evaluatorVersion: 'v2-purged-walk-forward',
    windowType: 'ROLLING',
    totalFolds: 4,
    passedFolds: grade === 'ROBUST' ? 4 : 1,
    aggregateIsProfit: 10000,
    aggregateOosProfit: 8100,
    walkForwardEfficiency: 0.81,
    stabilityScorePercent: grade === 'ROBUST' ? 85 : 30,
    robustnessGrade: grade,
    robustnessSummaryFa: 'پایداری تأیید شده',
    folds: [],
    warnings: [],
    executionTimeMs: 400,
  };
}

function buildMockTrades(): PositionLedgerEntry[] {
  return [
    {
      positionId: 'POS-01',
      intentId: 'INT-01',
      environment: 'BACKTEST',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 1.0850,
      currentPrice: 1.0920,
      stopLossPrice: 1.0820,
      takeProfitPrice: 1.0920,
      unrealizedPnl: 0,
      realizedPnl: 70,
      commissionPaid: 0.7,
      financingSwap: 0,
      isOpen: false,
      openedTimestamp: 1700000000000,
      closedTimestamp: 1700003600000,
      maePips: 2.1,
      mfePips: 7.0,
    },
    {
      positionId: 'POS-02',
      intentId: 'INT-02',
      environment: 'BACKTEST',
      symbol: 'EURUSD',
      direction: 'SELL',
      volumeLots: 0.1,
      entryPrice: 1.0900,
      currentPrice: 1.0935,
      stopLossPrice: 1.0935,
      takeProfitPrice: 1.0830,
      unrealizedPnl: 0,
      realizedPnl: -35,
      commissionPaid: 0.7,
      financingSwap: 0,
      isOpen: false,
      openedTimestamp: 1700007200000,
      closedTimestamp: 1700010800000,
      maePips: 3.5,
      mfePips: 1.2,
    },
    {
      positionId: 'POS-03',
      intentId: 'INT-03',
      environment: 'BACKTEST',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 1.0880,
      currentPrice: 1.0890,
      stopLossPrice: 1.0850,
      takeProfitPrice: 1.0950,
      unrealizedPnl: 10,
      realizedPnl: 0,
      commissionPaid: 0.7,
      financingSwap: 0,
      isOpen: true, // Still open!
      openedTimestamp: 1700014400000,
      maePips: 0.5,
      mfePips: 1.5,
    },
  ];
}

export async function runResearchReportsJournalTestSuite(): Promise<DomainCheckResult[]> {
  const checks: DomainCheckResult[] = [];

  // ۱. تولید گزارش جامع اجرایی با رتبه GRADE_A_PRIME
  try {
    const metrics = buildMetrics({ profitFactor: 1.9, expectancyR: 0.75, maxDrawdownPercent: 3.8, netProfit: 9500 });
    const passport = buildMockPassport();
    const mc = buildMockMCReport(1.5);
    const wf = buildMockWFReport('ROBUST');

    const report = ExecutiveReportGenerator.generateExecutiveReport(metrics, {
      strategyName: 'Alpha Trend Breakout',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 100000,
      passport,
      monteCarlo: mc,
      walkForward: wf,
    });

    checks.push({
      name: '۱. تولید گزارش جامع اجرایی و احراز GRADE_A_PRIME',
      passed: report.qualityTier === 'GRADE_A_PRIME' && report.executiveScorePercent >= 80,
      details: `score=${report.executiveScorePercent} | tier=${report.qualityTier} | reportId=${report.reportId}`,
    });
  } catch (e) {
    checks.push({ name: '۱. گزارش اجرایی GRADE_A_PRIME', passed: false, details: String(e) });
  }

  // ۲. استخراج دقیق نقاط قوت و آسیب‌پذیری‌ها در گزارش
  try {
    const metrics = buildMetrics({ profitFactor: 1.85, expectancyR: 0.65, maxDrawdownPercent: 4.0 });
    const report = ExecutiveReportGenerator.generateExecutiveReport(metrics, {
      strategyName: 'Alpha Trend',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 100000,
      monteCarlo: buildMockMCReport(1.0),
      walkForward: buildMockWFReport('ROBUST'),
    });

    const hasStrengths = report.keyStrengthsFa.length >= 3;
    checks.push({
      name: '۲. استخراج حداقل ۳ نقطه قوت کلیدی به زبان فارسی',
      passed: hasStrengths,
      details: `strengthsCount=${report.keyStrengthsFa.length} | first="${report.keyStrengthsFa[0]}"`,
    });
  } catch (e) {
    checks.push({ name: '۲. نقاط قوت گزارش', passed: false, details: String(e) });
  }

  // ۳. ارزیابی استراتژی شکننده با رتبه GRADE_C_RISKY یا GRADE_F_REJECTED
  try {
    const poorMetrics = buildMetrics({
      netProfit: -2500,
      netProfitPercent: -2.5,
      profitFactor: 0.85,
      expectancyR: -0.25,
      maxDrawdownPercent: 16.5,
      winRatePercent: 35,
    });
    const report = ExecutiveReportGenerator.generateExecutiveReport(poorMetrics, {
      strategyName: 'Failing Strategy',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 100000,
      monteCarlo: buildMockMCReport(25.0), // high ruin
      walkForward: buildMockWFReport('OVERFITTED'),
    });

    const isFailing = report.qualityTier === 'GRADE_C_RISKY' || report.qualityTier === 'GRADE_F_REJECTED';
    checks.push({
      name: '۳. شناسایی صحیح استراتژی پرریسک یا مردود با امتیاز پایین',
      passed: isFailing && report.executiveScorePercent < 50,
      details: `score=${report.executiveScorePercent} | tier=${report.qualityTier}`,
    });
  } catch (e) {
    checks.push({ name: '۳. ارزیابی استراتژی شکننده', passed: false, details: String(e) });
  }

  // ۴. تولید ساختار کارت تصویری اشتراک‌گذاری پاسپورت (Passport Card Payload)
  try {
    const passport = buildMockPassport();
    const cardData = ExecutiveReportGenerator.createPassportCardPayload(passport, {
      propFirmNameFa: 'چالش استاندارد FTMO',
    });

    const isDataValid =
      cardData.passportId === passport.passportId &&
      cardData.sha256Signature === passport.sha256Signature &&
      cardData.verdict === 'APPROVED' &&
      cardData.propFirmName === 'چالش استاندارد FTMO' &&
      typeof cardData.verificationUrl === 'string';

    checks.push({
      name: '۴. تولید ساختار کارت اشتراک‌گذاری با امضای تغییرناپذیر و آدرس تأییدیه',
      passed: isDataValid,
      details: `sig=${cardData.sha256Signature} | url=${cardData.verificationUrl}`,
    });
  } catch (e) {
    checks.push({ name: '۴. کارت اشتراک‌گذاری', passed: false, details: String(e) });
  }

  // ۵. آماده‌سازی دسته معاملات برای صدور به ژورنال (فیلتر معاملات باز)
  try {
    const trades = buildMockTrades();
    const batch = ExecutiveReportGenerator.exportTradesToJournalBatch(trades, {
      strategyName: 'Alpha Trend',
      symbol: 'EURUSD',
    });

    // POS-03 باز است و نباید در خروجی بسته شده بیاید
    const onlyClosed = batch.trades.every(t => !t.isOpen);
    const correctCount = batch.totalExportedTrades === 2 && batch.trades.length === 2;
    // 70 + (-35) = 35
    const correctNetPnL = batch.totalRealizedNetPnL === 35;

    checks.push({
      name: '۵. تفکیک دقیق معاملات بسته‌شده و محاسبه مجموع PnL در صدور به ژورنال',
      passed: onlyClosed && correctCount && correctNetPnL,
      details: `exportedTrades=${batch.totalExportedTrades} | totalPnL=${batch.totalRealizedNetPnL}`,
    });
  } catch (e) {
    checks.push({ name: '۵. صدور به ژورنال', passed: false, details: String(e) });
  }

  // ۶. یکپارچه‌سازی متدهای ResearchLab.generateExecutiveReport و exportTradesToJournal
  try {
    const metrics = buildMetrics();
    const rep = ResearchLab.generateExecutiveReport(metrics, {
      strategyName: 'Integration Test Strategy',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 100000,
    });
    const batch = ResearchLab.exportTradesToJournal(buildMockTrades(), {
      strategyName: 'Integration Test Strategy',
      symbol: 'EURUSD',
    });

    const isValid = Boolean(rep.reportId && batch.batchId && batch.totalExportedTrades === 2);
    checks.push({
      name: '۶. یکپارچگی موفق متدهای گزارش‌گیری و ژورنال در هسته ResearchLab',
      passed: isValid,
      details: `repId=${rep.reportId} | batchId=${batch.batchId} | trades=${batch.totalExportedTrades}`,
    });
  } catch (e) {
    checks.push({ name: '۶. یکپارچگی ResearchLab', passed: false, details: String(e) });
  }

  // ۷. محاسبه دقیق اکوئیتی نهایی و سود درصدی در گزارش اجرایی
  try {
    const metrics = buildMetrics({ netProfit: 12500, netProfitPercent: 12.5 });
    const rep = ExecutiveReportGenerator.generateExecutiveReport(metrics, {
      strategyName: 'Equity Calc Strategy',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 100000,
    });

    const isEquityAccurate = rep.finalEquityDollar === 108500 && rep.netProfitDollar === 12500;
    checks.push({
      name: '۷. دقت انطباق ارقام سود ناخالص/خالص و اکوئیتی نهایی در گزارش',
      passed: isEquityAccurate,
      details: `finalEquity=${rep.finalEquityDollar} | netProfit=${rep.netProfitDollar}`,
    });
  } catch (e) {
    checks.push({ name: '۷. محاسبات اکوئیتی', passed: false, details: String(e) });
  }

  // ۸. تأیید فارسی بودن و کامل بودن متن جمع‌بندی آمادگی استراتژی (readinessSummaryFa)
  try {
    const metrics = buildMetrics();
    const rep = ExecutiveReportGenerator.generateExecutiveReport(metrics, {
      strategyName: 'Summary Test',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 100000,
    });

    const isPersianSummary = typeof rep.readinessSummaryFa === 'string' && rep.readinessSummaryFa.length > 20;
    checks.push({
      name: '۸. وجود متن تفسیر و جمع‌بندی آمادگی استراتژی به زبان فارسی',
      passed: isPersianSummary,
      details: `summary="${rep.readinessSummaryFa.substring(0, 40)}..."`,
    });
  } catch (e) {
    checks.push({ name: '۸. خلاصه آمادگی فارسی', passed: false, details: String(e) });
  }

  // ۹. عدم وابستگی به گزارش‌های اختیاری (حالت بدون مونت‌کارلو و بدون واک‌فوروارد)
  try {
    const metrics = buildMetrics();
    const rep = ExecutiveReportGenerator.generateExecutiveReport(metrics, {
      strategyName: 'Minimal Strategy',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 50000,
      passport: null,
      monteCarlo: null,
      walkForward: null,
    });

    const handlesNulls = rep.passport === null && rep.monteCarlo === null && rep.walkForward === null && rep.executiveScorePercent > 0;
    checks.push({
      name: '۹. پایداری موتور گزارش‌گیری در صورت غیاب گزارش‌های اختیاری پیشرفته',
      passed: handlesNulls,
      details: `score=${rep.executiveScorePercent} | nullsHandled=true`,
    });
  } catch (e) {
    checks.push({ name: '۹. هندل کردن نال‌ها', passed: false, details: String(e) });
  }

  // ۱۰. تخصیص فرمت شناسه یکتا برای گزارش‌ها و بسته‌های ژورنال
  try {
    const metrics = buildMetrics();
    const rep1 = ExecutiveReportGenerator.generateExecutiveReport(metrics, {
      strategyName: 'Test 1',
      strategyStyle: 'TREND_BREAKOUT',
      symbol: 'EURUSD',
      timeframe: '1H',
      initialCapital: 10000,
    });
    const batch1 = ExecutiveReportGenerator.exportTradesToJournalBatch([], {
      strategyName: 'Test 1',
      symbol: 'EURUSD',
    });

    const validRepId = rep1.reportId.startsWith('EXEC-REP-');
    const validBatchId = batch1.batchId.startsWith('BATCH-JOURNAL-');
    checks.push({
      name: '۱۰. استانداردسازی پیشوندهای شناسه رهگیری گزارش و ژورنال',
      passed: validRepId && validBatchId,
      details: `repId=${rep1.reportId} | batchId=${batch1.batchId}`,
    });
  } catch (e) {
    checks.push({ name: '۱۰. شناسه‌های رهگیری', passed: false, details: String(e) });
  }

  // ۱۱. اعتبار داده‌های درصد برد و دروداون در کارت پاسپورت
  try {
    const passport = buildMockPassport();
    const cardData = ExecutiveReportGenerator.createPassportCardPayload(passport);

    const matchSnapshot =
      cardData.winRatePercent === passport.metricsSnapshot.winRatePercent &&
      cardData.profitFactor === passport.metricsSnapshot.profitFactor &&
      cardData.maxDrawdownPercent === passport.metricsSnapshot.maxTotalDrawdownPercent;

    checks.push({
      name: '۱۱. تطابق ۱۰۰٪ مقادیر شاخص‌های کلیدی بین پاسپورت و کارت اشتراک‌گذاری',
      passed: matchSnapshot,
      details: `wr=${cardData.winRatePercent}% | pf=${cardData.profitFactor} | dd=${cardData.maxDrawdownPercent}%`,
    });
  } catch (e) {
    checks.push({ name: '۱۱. تطابق مقادیر کارت', passed: false, details: String(e) });
  }

  // ۱۲. قابلیت ثبت منبع معامله پژوهشی در صدور به ژورنال (Source Environment)
  try {
    const batch = ExecutiveReportGenerator.exportTradesToJournalBatch(buildMockTrades(), {
      strategyName: 'Attribution Test',
      symbol: 'EURUSD',
    });

    const isResearchEnv = batch.sourceEnvironment === 'RESEARCH';
    checks.push({
      name: '۱۲. الصاق برچسب منشأ پژوهش (sourceEnvironment=RESEARCH) به داده‌های صادره',
      passed: isResearchEnv,
      details: `sourceEnvironment=${batch.sourceEnvironment} | strategyName=${batch.strategyName}`,
    });
  } catch (e) {
    checks.push({ name: '۱۲. منشأ داده پژوهش', passed: false, details: String(e) });
  }

  return checks;
}
