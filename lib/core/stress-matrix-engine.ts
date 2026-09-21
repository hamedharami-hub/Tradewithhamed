// lib/core/stress-matrix-engine.ts
// موتور ماتریس چندبعدی تنش و تعیین نقطه شکست اصطکاک (Package E: Stress Matrix Engine)

import type { Candle, SymbolId } from '@/lib/contracts/market';
import type { StrategyParameters } from '@/lib/contracts/strategy-parameters';
import type { TradingStyleType } from '@/lib/contracts/regimes';
import type {
  StressDimensionOptions,
  StressMatrixCell,
  StressMatrixReport,
  StrategyResilienceGrade,
} from '@/lib/contracts/monte-carlo-stress';
import { ResearchLab } from './research-lab';

export class StressMatrixEngine {
  /**
   * ارزیابی ماتریس تنش در شبکه‌ای از شرایط نوسانی و اصطکاکی
   */
  public static evaluateMatrix(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    baseParams: StrategyParameters,
    options: {
      style?: TradingStyleType | 'ALL';
      initialCash?: number;
      dimensions?: Partial<StressDimensionOptions>;
      randomSeed?: number;
    } = {}
  ): StressMatrixReport {
    const startTime = Date.now();
    const seed = options.randomSeed ?? 1337;
    const spreads = options.dimensions?.spreadMultipliers ?? [1.0, 1.5, 2.0, 3.0];
    const slippages = options.dimensions?.additionalSlippagePips ?? [0.0, 0.5, 1.0, 2.0];
    const skips = options.dimensions?.skippedFillsPercents ?? [0, 5];
    const gaps = options.dimensions?.gapShockMultipliers ?? [1.0, 2.0];

    const cells: StressMatrixCell[] = [];

    // اجرای ارزیابی روی تقاطع ابعاد تنش (حداکثر ۱۶ تا ۲۴ سناریو برای عملکرد بالا)
    let scenarioIndex = 1;
    for (const spreadMult of spreads) {
      for (const slipPips of slippages) {
        // برای حفظ سرعت، سطوح skip و gap بالاتر را روی اسلیپیج‌های ماکسیمم لحاظ می‌کنیم
        const skipPercent = slipPips >= 1.0 ? (skips[1] ?? 0) : (skips[0] ?? 0);
        const gapShock = slipPips >= 1.0 ? (gaps[1] ?? 1.0) : (gaps[0] ?? 1.0);

        const scenarioId = `stress-${scenarioIndex++}`;
        const backtestResult = ResearchLab.runBacktest(candles, symbol, {
          strategyParameters: baseParams,
          style: options.style,
          initialCash: options.initialCash,
          stressConfig: {
            spreadMultiplier: spreadMult,
            slippageAdditionPips: slipPips,
            randomSkippedFillsPercent: skipPercent,
            gapShockMultiplier: gapShock,
          },
          randomSeed: seed + scenarioIndex,
        });

        const isProfitable = backtestResult.metrics.netProfit > 0;
        const isPropFirmSafe = backtestResult.metrics.maxDrawdownPercent <= 10.0;

        cells.push({
          scenarioId,
          spreadMultiplier: spreadMult,
          slippageAdditionPips: slipPips,
          skippedFillsPercent: skipPercent,
          gapShockMultiplier: gapShock,
          netProfit: Number(backtestResult.metrics.netProfit.toFixed(1)),
          profitFactor: backtestResult.metrics.profitFactor,
          winRatePercent: backtestResult.metrics.winRatePercent,
          maxDrawdownPercent: backtestResult.metrics.maxDrawdownPercent,
          totalTrades: backtestResult.metrics.totalTrades,
          isProfitable,
          isPropFirmSafe,
        });
      }
    }

    const totalScenarios = cells.length;
    const profitableScenarios = cells.filter(c => c.isProfitable).length;
    const propFirmSafeScenarios = cells.filter(c => c.isPropFirmSafe).length;

    // پیدا کردن نقطه شکست اسلیپیج (Break-even Slippage)
    // بالاترین اسلیپیجی که در آن با اسپرد پایه ۱.۰ همچنان سودآور است
    const baseSpreadCells = cells.filter(c => c.spreadMultiplier === 1.0);
    const profitableSlipCells = baseSpreadCells.filter(c => c.isProfitable);
    const breakEvenSlippageThresholdPips = profitableSlipCells.length > 0
      ? Math.max(...profitableSlipCells.map(c => c.slippageAdditionPips))
      : 0;

    // پیدا کردن بالاترین ضریب اسپرد قابل تحمل با اسلیپیج صفر
    const zeroSlipCells = cells.filter(c => c.slippageAdditionPips === 0.0);
    const profitableSpreadCells = zeroSlipCells.filter(c => c.isProfitable);
    const breakEvenSpreadMultiplier = profitableSpreadCells.length > 0
      ? Math.max(...profitableSpreadCells.map(c => c.spreadMultiplier))
      : 1.0;

    // بدترین سناریو
    const worstCaseScenario = [...cells].sort((a, b) => a.netProfit - b.netProfit)[0] ?? cells[0];

    // تعیین درجه تاب‌آوری (Resilience Grading)
    let resilienceGrade: StrategyResilienceGrade = 'FRAGILE';
    let resilienceSummaryFa = '';

    const resilienceRatio = totalScenarios > 0 ? profitableScenarios / totalScenarios : 0;
    if (resilienceRatio >= 0.75 && breakEvenSlippageThresholdPips >= 1.0) {
      resilienceGrade = 'RESILIENT';
      resilienceSummaryFa = 'استراتژی بسیار تاب‌آور (Resilient): استراتژی در برابر اسپرد تا ۲ برابر و اسلیپیج بیش از ۱ پیپ سودآوری خود را حفظ می‌کند.';
    } else if (resilienceRatio >= 0.40 || breakEvenSlippageThresholdPips >= 0.5) {
      resilienceGrade = 'VULNERABLE';
      resilienceSummaryFa = 'استراتژی حساس به اصطکاک (Vulnerable): با افزایش اسپرد یا اسلیپیج فراتر از حد متوسط، حاشیه سود به شدت کاهش می‌یابد.';
    } else {
      resilienceGrade = 'FRAGILE';
      resilienceSummaryFa = 'استراتژی بسیار شکننده (Fragile): استراتژی تنها در شرایط ایده آل اسپرد پایین سودآور است و در شرایط واقعی بازار دچار زیان می‌شود.';
    }

    return {
      matrixVersion: 'v2-stress-matrix',
      totalScenariosEvaluated: totalScenarios,
      profitableScenariosCount: profitableScenarios,
      propFirmSafeScenariosCount: propFirmSafeScenarios,
      breakEvenSlippageThresholdPips,
      breakEvenSpreadMultiplier,
      resilienceGrade,
      resilienceSummaryFa,
      scenarios: cells,
      worstCaseScenario,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
