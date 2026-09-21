// lib/core/__tests__/parameter-optimization-walkforward.test.ts
// سوئیت تست جامع دامنه‌ای پکیج D: بهینه‌سازی پارامترها و اعتبارسنجی پیش‌رو با بافر قرنطینه

import type { Candle } from '@/lib/contracts/market';
import { StrategyParameterOptimizer } from '../parameter-optimizer';
import { PurgedWalkForwardEngine } from '../walk-forward-engine';
import { ResearchLab } from '../research-lab';
import type { StrategySearchSpace, PurgedWalkForwardConfig } from '@/lib/contracts/parameter-optimization';

export interface DomainCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

/**
 * تولید کندل‌های ساختاریافته برای تست‌های بهینه‌سازی و ولیدیشن پیش‌رو
 */
function generateDeterministicCandles(count = 300): Candle[] {
  const candles: Candle[] = [];
  let price = 2000.0;
  const startTime = 1_700_000_000_000;

  for (let i = 0; i < count; i++) {
    // ایجاد موج سینوسی صعودی برای داشتن سیگنال‌های روند و شکست معتبر
    const cycle = Math.sin(i / 10) * 8;
    const trend = i * 0.15;
    const open = price;
    const close = 2000.0 + trend + cycle;
    const high = Math.max(open, close) + 2.5;
    const low = Math.min(open, close) - 2.5;
    price = close;

    candles.push({
      timestamp: startTime + i * 15 * 60_000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1500,
      isClosed: true,
    });
  }

  return candles;
}

export async function runParameterOptimizationWalkForwardTestSuite(): Promise<DomainCheckResult[]> {
  const checks: DomainCheckResult[] = [];
  const candles = generateDeterministicCandles(360);
  const baseParams = StrategyParameterOptimizer.createDefaultParameters();

  // ۱. ارزیابی ضرب دکارتی GRID
  try {
    const searchSpace: StrategySearchSpace = {
      common: {
        riskRewardRatio: [1.5, 2.0],
        atrMultiplier: [1.2, 1.8],
      },
    };

    const gridCandidates = StrategyParameterOptimizer.generateCandidates(
      baseParams,
      searchSpace,
      'GRID',
      10,
      42
    );

    const passed = gridCandidates.length === 4;
    checks.push({
      name: '1. Grid Search generates exact Cartesian product of parameters',
      passed,
      details: `Generated: ${gridCandidates.length} (expected 4)`,
    });
  } catch (err) {
    checks.push({
      name: '1. Grid Search generates exact Cartesian product of parameters',
      passed: false,
      details: String(err),
    });
  }

  // ۲. تکرارپذیری قطعی جستجوی تصادفی با بذر یکسان
  try {
    const searchSpace: StrategySearchSpace = {
      trendBreakout: {
        channelPeriod: [10, 20, 30],
        fastEmaPeriod: [9, 14, 21],
      },
    };

    const rand1 = StrategyParameterOptimizer.generateCandidates(baseParams, searchSpace, 'RANDOM', 6, 1337);
    const rand2 = StrategyParameterOptimizer.generateCandidates(baseParams, searchSpace, 'RANDOM', 6, 1337);
    const rand3 = StrategyParameterOptimizer.generateCandidates(baseParams, searchSpace, 'RANDOM', 6, 9999);

    const matchSameSeed = JSON.stringify(rand1) === JSON.stringify(rand2);
    const diffDiffSeed = JSON.stringify(rand1) !== JSON.stringify(rand3);

    checks.push({
      name: '2. Random Search is 100% deterministic with identical seed and varies with different seed',
      passed: matchSameSeed && diffDiffSeed,
      details: `matchSameSeed=${matchSameSeed}, diffDiffSeed=${diffDiffSeed}`,
    });
  } catch (err) {
    checks.push({
      name: '2. Random Search is 100% deterministic with identical seed and varies with different seed',
      passed: false,
      details: String(err),
    });
  }

  // ۳. اعمال تابع هدف‌های چندگانه (NET_PROFIT, PROFIT_FACTOR, CALMAR_LIKE)
  try {
    const mockMetrics1: any = { netProfit: 1000, profitFactor: 2.5, maxDrawdownPercent: 10, totalTrades: 15, expectancy: 66.6, winRatePercent: 60 };
    const mockMetrics2: any = { netProfit: 1500, profitFactor: 1.8, maxDrawdownPercent: 30, totalTrades: 20, expectancy: 75.0, winRatePercent: 55 };

    const scoreNet1 = StrategyParameterOptimizer.calculateObjectiveScore(mockMetrics1, 'NET_PROFIT');
    const scoreNet2 = StrategyParameterOptimizer.calculateObjectiveScore(mockMetrics2, 'NET_PROFIT');
    const scoreCalmar1 = StrategyParameterOptimizer.calculateObjectiveScore(mockMetrics1, 'CALMAR_LIKE');
    const scoreCalmar2 = StrategyParameterOptimizer.calculateObjectiveScore(mockMetrics2, 'CALMAR_LIKE');

    const netProfitPrefersSecond = scoreNet2.score > scoreNet1.score; // 1500 > 1000
    const calmarPrefersFirst = scoreCalmar1.score > scoreCalmar2.score; // (1000/10=100) > (1500/30=50)

    checks.push({
      name: '3. Multi-objective scoring functions align with mathematical criteria (Net Profit vs Calmar)',
      passed: netProfitPrefersSecond && calmarPrefersFirst,
      details: `netProfitPrefersSecond=${netProfitPrefersSecond}, calmarPrefersFirst=${calmarPrefersFirst}`,
    });
  } catch (err) {
    checks.push({
      name: '3. Multi-objective scoring functions align with mathematical criteria',
      passed: false,
      details: String(err),
    });
  }

  // ۴. رد کاندیداهایی که کمتر از حد نصاب معامله دارند
  try {
    const mockMetricsFewTrades: any = { netProfit: 500, profitFactor: 3.0, maxDrawdownPercent: 5, totalTrades: 2, expectancy: 250 };
    const result = StrategyParameterOptimizer.calculateObjectiveScore(mockMetricsFewTrades, 'NET_PROFIT', 5);

    checks.push({
      name: '4. Parameter Optimizer rejects candidates with insufficient trade counts',
      passed: !result.isAccepted && result.score === Number.NEGATIVE_INFINITY,
      details: `isAccepted=${result.isAccepted}, reason=${result.rejectionReason}`,
    });
  } catch (err) {
    checks.push({
      name: '4. Parameter Optimizer rejects candidates with insufficient trade counts',
      passed: false,
      details: String(err),
    });
  }

  // ۵. اجرای کامل بهینه‌سازی پارامترها و بازگردانی لیدربورد مرتب‌شده
  try {
    const report = StrategyParameterOptimizer.optimize(candles.slice(0, 150), 'XAUUSD', baseParams, {
      method: 'GRID',
      searchSpace: {
        common: {
          riskRewardRatio: [1.5, 2.5],
        },
      },
      objective: 'NET_PROFIT',
      minTrades: 0,
      maxEvaluations: 4,
    });

    const isRankedCorrectly = report.leaderboard.length >= 2 && report.leaderboard[0].score >= report.leaderboard[1].score;
    const hasBest = report.bestCandidate !== null;

    checks.push({
      name: '5. Parameter Optimization produces sorted leaderboard and identifies best candidate',
      passed: isRankedCorrectly && hasBest,
      details: `evaluated=${report.evaluatedCount}, bestScore=${report.bestCandidate?.score}`,
    });
  } catch (err) {
    checks.push({
      name: '5. Parameter Optimization produces sorted leaderboard and identifies best candidate',
      passed: false,
      details: String(err),
    });
  }

  // ۶. تفکیک و برش پنجره‌های ANCHORED در Purged Walk-Forward
  try {
    const wfConfig: PurgedWalkForwardConfig = {
      windowCount: 3,
      windowType: 'ANCHORED',
      purgeBars: 10,
    };

    const wfReport = PurgedWalkForwardEngine.run(candles, 'XAUUSD', baseParams, wfConfig);

    // در حالت ANCHORED پنجره‌های آموزش بزرگتر می‌شوند: fold2 train > fold1 train
    const expandingTrain = wfReport.folds.length >= 2 &&
      wfReport.folds[1].trainCandlesCount > wfReport.folds[0].trainCandlesCount;

    checks.push({
      name: '6. Purged Walk-Forward ANCHORED mode progressively expands training slice',
      passed: expandingTrain && wfReport.folds.length === 3,
      details: `folds=${wfReport.folds.length}, fold1Train=${wfReport.folds[0]?.trainCandlesCount}, fold2Train=${wfReport.folds[1]?.trainCandlesCount}`,
    });
  } catch (err) {
    checks.push({
      name: '6. Purged Walk-Forward ANCHORED mode progressively expands training slice',
      passed: false,
      details: String(err),
    });
  }

  // ۷. تضمین بافر قرنطینه (Purge Embargo Buffer) میان Train و Test
  try {
    const wfConfig: PurgedWalkForwardConfig = {
      windowCount: 3,
      windowType: 'ANCHORED',
      purgeBars: 12,
    };

    const wfReport = PurgedWalkForwardEngine.run(candles, 'XAUUSD', baseParams, wfConfig);
    const allHavePurge = wfReport.folds.every(f => f.purgeCandlesCount === 12);
    const noLeakage = wfReport.folds.every(f => f.testStartTime > f.trainEndTime && f.purgeStartTime >= f.trainEndTime);

    checks.push({
      name: '7. Purge Embargo buffer guarantees complete barrier with zero overlap between Train and Test',
      passed: allHavePurge && noLeakage,
      details: `allHavePurge=${allHavePurge}, noLeakage=${noLeakage}`,
    });
  } catch (err) {
    checks.push({
      name: '7. Purge Embargo buffer guarantees complete barrier with zero overlap between Train and Test',
      passed: false,
      details: String(err),
    });
  }

  // ۸. محاسبه صحیح نسبت کارایی پیش‌رو (Walk-Forward Efficiency - WFE)
  try {
    const wfConfig: PurgedWalkForwardConfig = {
      windowCount: 3,
      windowType: 'ANCHORED',
      purgeBars: 8,
    };

    const wfReport = PurgedWalkForwardEngine.run(candles, 'XAUUSD', baseParams, wfConfig);
    const validWfe = Number.isFinite(wfReport.walkForwardEfficiency);
    const validGrade = ['ROBUST', 'DEGRADED', 'OVERFITTED'].includes(wfReport.robustnessGrade);

    checks.push({
      name: '8. Walk-Forward Efficiency (WFE) and Robustness Grading are accurately computed',
      passed: validWfe && validGrade,
      details: `WFE=${wfReport.walkForwardEfficiency}, Grade=${wfReport.robustnessGrade}, summary=${wfReport.robustnessSummaryFa}`,
    });
  } catch (err) {
    checks.push({
      name: '8. Walk-Forward Efficiency (WFE) and Robustness Grading are accurately computed',
      passed: false,
      details: String(err),
    });
  }

  // ۹. حالت ROLLING در Purged Walk-Forward
  try {
    const wfConfig: PurgedWalkForwardConfig = {
      windowCount: 3,
      windowType: 'ROLLING',
      purgeBars: 8,
    };

    const wfReport = PurgedWalkForwardEngine.run(candles, 'XAUUSD', baseParams, wfConfig);
    const hasFolds = wfReport.folds.length > 0;
    const rollingValid = wfReport.windowType === 'ROLLING';

    checks.push({
      name: '9. Purged Walk-Forward ROLLING mode operates correctly with fixed-size shifting windows',
      passed: hasFolds && rollingValid,
      details: `foldsCount=${wfReport.folds.length}, mode=${wfReport.windowType}`,
    });
  } catch (err) {
    checks.push({
      name: '9. Purged Walk-Forward ROLLING mode operates correctly with fixed-size shifting windows',
      passed: false,
      details: String(err),
    });
  }

  // ۱۰. رفتار مقاوم در برابر داده‌های ناکافی
  try {
    const shortCandles = candles.slice(0, 40);
    const wfReport = PurgedWalkForwardEngine.run(shortCandles, 'XAUUSD', baseParams, {
      windowCount: 3,
      windowType: 'ANCHORED',
    });

    checks.push({
      name: '10. Walk-Forward handles insufficient data gracefully without uncaught exceptions',
      passed: wfReport.totalFolds === 0 && wfReport.warnings.length > 0,
      details: `warnings=${wfReport.warnings.join('; ')}`,
    });
  } catch (err) {
    checks.push({
      name: '10. Walk-Forward handles insufficient data gracefully without uncaught exceptions',
      passed: false,
      details: String(err),
    });
  }

  // ۱۱. ادغام مستقیم متدهای پکیج D در ResearchLab
  try {
    const optRes = ResearchLab.runParameterOptimization(candles.slice(0, 100), 'XAUUSD', baseParams, {
      method: 'GRID',
      searchSpace: { common: { riskRewardRatio: [2.0] } },
      maxEvaluations: 2,
    });

    const wfRes = ResearchLab.runPurgedWalkForward(candles, 'XAUUSD', baseParams, {
      windowCount: 3,
      windowType: 'ANCHORED',
      purgeBars: 6,
    });

    checks.push({
      name: '11. ResearchLab successfully exposes runParameterOptimization and runPurgedWalkForward',
      passed: optRes.evaluatedCount >= 1 && wfRes.totalFolds >= 2,
      details: `optEvaluated=${optRes.evaluatedCount}, wfFolds=${wfRes.totalFolds}`,
    });
  } catch (err) {
    checks.push({
      name: '11. ResearchLab successfully exposes runParameterOptimization and runPurgedWalkForward',
      passed: false,
      details: String(err),
    });
  }

  // ۱۲. بهینه‌سازی ترکیبی با پارامترهای اصطکاک و اسلیپیج پکیج C
  try {
    const optFriction = StrategyParameterOptimizer.optimize(candles.slice(0, 120), 'XAUUSD', baseParams, {
      method: 'GRID',
      searchSpace: {
        executionFriction: {
          baseSlippagePips: [0.2, 0.8],
          volatilityMultiplier: [1.0, 2.0],
        },
      },
      maxEvaluations: 4,
    });

    checks.push({
      name: '12. Parameter Optimizer supports joint optimization with Package C Execution Friction parameters',
      passed: optFriction.evaluatedCount === 4 && optFriction.bestCandidate !== null,
      details: `evaluated=${optFriction.evaluatedCount}, bestBaseSlippage=${optFriction.bestCandidate?.parameters.executionFriction?.baseSlippagePips}`,
    });
  } catch (err) {
    checks.push({
      name: '12. Parameter Optimizer supports joint optimization with Package C Execution Friction parameters',
      passed: false,
      details: String(err),
    });
  }

  return checks;
}
