// lib/core/walk-forward-engine.ts
// موتور اعتبارسنجی پیش‌رو چندپنجره‌ای با بافر قرنطینه و شاخص کارایی (Package D: Purged Walk-Forward Engine)

import type { Candle, SymbolId } from '@/lib/contracts/market';
import type { StrategyParameters } from '@/lib/contracts/strategy-parameters';
import type { TradingStyleType } from '@/lib/contracts/regimes';
import type {
  PurgedWalkForwardConfig,
  PurgedWalkForwardFold,
  PurgedWalkForwardReport,
  StrategyRobustnessGrade,
} from '@/lib/contracts/parameter-optimization';
import { ResearchLab } from './research-lab';
import { StrategyParameterOptimizer } from './parameter-optimizer';

export class PurgedWalkForwardEngine {
  /**
   * اجرای ارزیابی پیش‌رو برون‌نمونه‌ای قرنطینه‌شده
   */
  public static run(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    baseParams: StrategyParameters,
    config: PurgedWalkForwardConfig,
    options: {
      style?: TradingStyleType | 'ALL';
      initialCash?: number;
      commissionPerLot?: number;
      defaultSpreadPips?: number;
      additionalSlippagePips?: number;
    } = {}
  ): PurgedWalkForwardReport {
    const startTime = Date.now();
    const windowCount = Math.max(2, Math.min(10, config.windowCount || 3));
    const windowType = config.windowType || 'ANCHORED';
    const totalCandles = candles.length;
    const minTrades = config.minTradesPerWindow ?? 2;

    // بافر حائل قرنطینه (Embargo buffer): حداقل به اندازه ماکسیمم نگاه به گذشته اندیکاتورها یا انقضای سفارش
    const lookbackBars = Math.max(
      baseParams.common.atrPeriod,
      baseParams.trendBreakout.channelPeriod,
      baseParams.meanReversion.lookbackPeriod,
      baseParams.smc.liquidityLookback,
      baseParams.common.expiryBars
    );
    const purgeBars = Math.max(5, config.purgeBars ?? lookbackBars);

    if (totalCandles < 100) {
      return {
        evaluatorVersion: 'v2-purged-walk-forward',
        windowType,
        totalFolds: 0,
        passedFolds: 0,
        aggregateIsProfit: 0,
        aggregateOosProfit: 0,
        walkForwardEfficiency: 0,
        stabilityScorePercent: 0,
        robustnessGrade: 'OVERFITTED',
        robustnessSummaryFa: 'داده‌های تاریخی برای ارزیابی پیش‌رو کافی نیست (حداقل ۱۰۰ کندل لازم است).',
        folds: [],
        warnings: ['تعداد کندل‌های ورودی کمتر از حد نصاب است.'],
        executionTimeMs: Date.now() - startTime,
      };
    }

    const folds: PurgedWalkForwardFold[] = [];

    // تقسیم داده‌ها به قطعات زمانی متوالی
    // هر فولد شامل یک بخش Train، یک بافر Purge، و یک بخش Test (OOS) است.
    const segmentSize = Math.floor(totalCandles / (windowCount + 1));
    const testSize = segmentSize;

    for (let f = 0; f < windowCount; f++) {
      let trainStart = 0;
      let trainEnd = 0;
      let purgeStart = 0;
      let purgeEnd = 0;
      let testStart = 0;
      let testEnd = 0;

      if (windowType === 'ANCHORED') {
        // در حالت ANCHORED پنجره آموزش از ابتدا گسترش می‌یابد
        trainStart = 0;
        trainEnd = Math.floor(totalCandles * ((f + 1) / (windowCount + 1))) - purgeBars;
        if (trainEnd <= trainStart + 30) continue;

        purgeStart = trainEnd;
        purgeEnd = trainEnd + purgeBars;

        testStart = purgeEnd;
        testEnd = Math.min(totalCandles, testStart + testSize);
      } else {
        // در حالت ROLLING پنجره آموزش با طول ثابت لغزان حرکت می‌کند
        const rollingTrainSize = Math.max(50, Math.floor(segmentSize * 1.5));
        testStart = Math.floor(totalCandles * ((f + 1) / (windowCount + 1)));
        purgeEnd = testStart;
        purgeStart = Math.max(0, purgeEnd - purgeBars);
        trainEnd = purgeStart;
        trainStart = Math.max(0, trainEnd - rollingTrainSize);

        testEnd = Math.min(totalCandles, testStart + testSize);
      }

      if (testEnd <= testStart || trainEnd <= trainStart) continue;

      const trainSlice = candles.slice(trainStart, trainEnd);
      const purgeSlice = candles.slice(purgeStart, purgeEnd);
      const testSlice = candles.slice(testStart, testEnd);

      if (trainSlice.length < 30 || testSlice.length < 15) continue;

      // در صورت وجود تنظیمات بهینه‌سازی پارامتر، بهینه‌سازی فقط روی Train انجام می‌شود
      let selectedParams = StrategyParameterOptimizer.cloneParameters(baseParams);
      if (config.parameterOptimization) {
        const optReport = StrategyParameterOptimizer.optimize(
          trainSlice,
          symbol,
          baseParams,
          {
            ...config.parameterOptimization,
            style: options.style,
            maxEvaluations: Math.min(30, config.parameterOptimization.maxEvaluations ?? 20),
          }
        );
        if (optReport.bestCandidate && optReport.bestCandidate.isAccepted) {
          selectedParams = optReport.bestCandidate.parameters;
        }
      }

      // ۱. اجرای بک‌تست روی داده‌های آموزش (In-Sample)
      const trainRun = ResearchLab.runBacktest(trainSlice, symbol, {
        strategyParameters: selectedParams,
        style: options.style,
        initialCash: options.initialCash,
        commissionPerLot: options.commissionPerLot,
        defaultSpreadPips: options.defaultSpreadPips,
        additionalSlippagePips: options.additionalSlippagePips,
      });

      // ۲. اجرای بک‌تست روی داده‌های آزمون خارج از نمونه (Out-of-Sample)
      const testRun = ResearchLab.runBacktest(testSlice, symbol, {
        strategyParameters: selectedParams,
        style: options.style,
        initialCash: options.initialCash,
        commissionPerLot: options.commissionPerLot,
        defaultSpreadPips: options.defaultSpreadPips,
        additionalSlippagePips: options.additionalSlippagePips,
      });

      // محاسبه کارایی فولد (WFE) با نرمال‌سازی طول زمانی
      const trainBarsCount = trainSlice.length;
      const testBarsCount = testSlice.length;
      const normalizedTrainProfit = trainBarsCount > 0 ? (trainRun.metrics.netProfit / trainBarsCount) * 100 : 0;
      const normalizedTestProfit = testBarsCount > 0 ? (testRun.metrics.netProfit / testBarsCount) * 100 : 0;

      let foldEfficiency = 0;
      if (normalizedTrainProfit > 0) {
        foldEfficiency = Number((normalizedTestProfit / normalizedTrainProfit).toFixed(3));
      } else if (normalizedTestProfit > 0) {
        foldEfficiency = 1.0;
      }

      const isProfitableOos = testRun.metrics.netProfit > 0;
      const isPassed = isProfitableOos && (foldEfficiency >= 0.3 || testRun.metrics.totalTrades >= minTrades);

      folds.push({
        foldIndex: f + 1,
        trainStartTime: trainSlice[0].timestamp,
        trainEndTime: trainSlice[trainSlice.length - 1].timestamp,
        purgeStartTime: purgeSlice[0]?.timestamp ?? trainSlice[trainSlice.length - 1].timestamp,
        purgeEndTime: purgeSlice[purgeSlice.length - 1]?.timestamp ?? testSlice[0].timestamp,
        testStartTime: testSlice[0].timestamp,
        testEndTime: testSlice[testSlice.length - 1].timestamp,
        trainCandlesCount: trainSlice.length,
        testCandlesCount: testSlice.length,
        purgeCandlesCount: purgeSlice.length,
        selectedParameters: selectedParams,
        trainMetrics: trainRun.metrics,
        testMetrics: testRun.metrics,
        foldEfficiencyRatio: foldEfficiency,
        isFoldProfitableOos: isProfitableOos,
        isFoldPassed: isPassed,
      });
    }

    const totalFolds = folds.length;
    const passedFolds = folds.filter(f => f.isFoldPassed).length;
    const aggregateIsProfit = folds.reduce((sum, f) => sum + f.trainMetrics.netProfit, 0);
    const aggregateOosProfit = folds.reduce((sum, f) => sum + f.testMetrics.netProfit, 0);

    // محاسبه شاخص کارایی کلی پیش‌رو (Aggregate Walk-Forward Efficiency)
    let walkForwardEfficiency = 0;
    if (aggregateIsProfit > 0) {
      walkForwardEfficiency = Number((aggregateOosProfit / aggregateIsProfit).toFixed(2));
    } else if (aggregateOosProfit > 0) {
      walkForwardEfficiency = 1.0;
    }

    // درصد پایداری فولدها
    const stabilityScorePercent = totalFolds > 0 ? Math.round((passedFolds / totalFolds) * 100) : 0;

    // درجه‌بندی استحکام استراتژی (Robustness Grading)
    let robustnessGrade: StrategyRobustnessGrade = 'OVERFITTED';
    let robustnessSummaryFa = '';

    if (walkForwardEfficiency >= 0.5 && stabilityScorePercent >= 60 && aggregateOosProfit > 0) {
      robustnessGrade = 'ROBUST';
      robustnessSummaryFa = 'استراتژی مستحکم (Robust): سودآوری خارج از نمونه با نسبت کارایی بالاتر از ۵۰٪ حفظ شده و برازش بیش‌ازحد مشاهده نشد.';
    } else if (walkForwardEfficiency >= 0.25 || (stabilityScorePercent >= 50 && aggregateOosProfit >= 0)) {
      robustnessGrade = 'DEGRADED';
      robustnessSummaryFa = 'افت کارایی (Degraded): استراتژی در محیط خارج از نمونه مقداری از توان خود را حفظ کرده اما افت راندمان ملموس است.';
    } else {
      robustnessGrade = 'OVERFITTED';
      robustnessSummaryFa = 'بیش‌برازش شدید (Overfitted): عملکرد خارج از نمونه به شدت افت کرده یا منفی شده است. پارامترها به داده‌های گذشته وابسته بوده‌اند.';
    }

    const warnings: string[] = [];
    if (robustnessGrade === 'OVERFITTED') {
      warnings.push('هشدار رد صلاحیت برون‌نمونه‌ای: سیستم در پنجره‌های آزمایشی فاقد ثبات لازم است.');
    }
    if (folds.some(f => f.testMetrics.totalTrades < minTrades)) {
      warnings.push('برخی پنجره‌های آزمایشی دارای تعداد معامله کمتری از حد نرمال آماری بودند.');
    }

    return {
      evaluatorVersion: 'v2-purged-walk-forward',
      windowType,
      totalFolds,
      passedFolds,
      aggregateIsProfit: Number(aggregateIsProfit.toFixed(1)),
      aggregateOosProfit: Number(aggregateOosProfit.toFixed(1)),
      walkForwardEfficiency,
      stabilityScorePercent,
      robustnessGrade,
      robustnessSummaryFa,
      folds,
      warnings,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
