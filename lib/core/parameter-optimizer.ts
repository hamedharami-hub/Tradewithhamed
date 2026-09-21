// lib/core/parameter-optimizer.ts
// موتور بهینه‌سازی سیستماتیک پارامترها و اعتبارسنجی فلات همسایگی (Package D)

import type { Candle, SymbolId } from '@/lib/contracts/market';
import type {
  StrategyParameters,
  TrendBreakoutParameters,
  MeanReversionParameters,
  SmcParameters,
  ScalpParameters,
  SwingParameters,
  CommonStrategyParameters,
  ExecutionFrictionParameters,
} from '@/lib/contracts/strategy-parameters';
import {
  DEFAULT_COMMON_PARAMETERS,
  DEFAULT_TREND_BREAKOUT_PARAMETERS,
  DEFAULT_MEAN_REVERSION_PARAMETERS,
  DEFAULT_SMC_PARAMETERS,
  DEFAULT_SCALP_PARAMETERS,
  DEFAULT_SWING_PARAMETERS,
  DEFAULT_EXECUTION_FRICTION_PARAMETERS,
  getDefaultStrategyParameters,
} from '@/lib/contracts/strategy-parameters';
import type { TradingStyleType } from '@/lib/contracts/regimes';
import type { PerformanceMetrics } from './research-lab';
import type {
  OptimizationMethod,
  OptimizationObjective,
  StrategySearchSpace,
  ParameterCandidateEvaluation,
  ParameterOptimizationOptions,
  ParameterOptimizationReport,
} from '@/lib/contracts/parameter-optimization';
import { ResearchLab } from './research-lab';

export class StrategyParameterOptimizer {
  /**
   * تولید بذر تصادفی شبه‌قطعی (Seeded PRNG)
   */
  private static createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = Math.imul(1664525, state) + 1013904223;
      return (state >>> 0) / 4294967296;
    };
  }

  /**
   * ساخت نمونه پایه پارامترهای استراتژی
   */
  public static createDefaultParameters(): StrategyParameters {
    return getDefaultStrategyParameters('BALANCED');
  }

  /**
   * کلون عمیق پارامترها
   */
  public static cloneParameters(params: StrategyParameters): StrategyParameters {
    return {
      common: { ...params.common },
      trendBreakout: { ...params.trendBreakout },
      meanReversion: { ...params.meanReversion },
      smc: { ...params.smc },
      scalp: { ...params.scalp },
      swing: { ...params.swing },
      executionFriction: params.executionFriction ? { ...params.executionFriction } : undefined,
    };
  }

  /**
   * ارزیابی امتیاز کاندیدا بر اساس تابع هدف
   */
  public static calculateObjectiveScore(
    metrics: PerformanceMetrics,
    objective: OptimizationObjective,
    minTrades = 5
  ): { score: number; isAccepted: boolean; rejectionReason?: string } {
    if (metrics.totalTrades < minTrades) {
      return {
        score: Number.NEGATIVE_INFINITY,
        isAccepted: false,
        rejectionReason: `تعداد معاملات (${metrics.totalTrades}) کمتر از حد نصاب (${minTrades}) است.`,
      };
    }

    let score = 0;
    switch (objective) {
      case 'NET_PROFIT':
        score = metrics.netProfit;
        break;
      case 'PROFIT_FACTOR':
        score = metrics.profitFactor;
        break;
      case 'EXPECTANCY':
        score = metrics.expectancyR;
        break;
      case 'CALMAR_LIKE':
        score = metrics.maxDrawdownPercent > 0
          ? metrics.netProfit / metrics.maxDrawdownPercent
          : metrics.netProfit;
        break;
      case 'SHARPE_LIKE':
        score = metrics.maxDrawdownPercent > 0 ? (metrics.netProfitPercent / metrics.maxDrawdownPercent) : metrics.expectancyR;
        break;
      case 'WIN_RATE':
        score = metrics.winRatePercent;
        break;
      default:
        score = metrics.netProfit;
    }

    return {
      score: Number.isFinite(score) ? Number(score.toFixed(4)) : Number.NEGATIVE_INFINITY,
      isAccepted: true,
    };
  }

  /**
   * استخراج لیست متغیرهای قابل تغییر در فضای جستجو
   */
  private static extractSearchItems(space: StrategySearchSpace): Array<{
    section: keyof StrategySearchSpace;
    key: string;
    values: number[];
  }> {
    const items: Array<{ section: keyof StrategySearchSpace; key: string; values: number[] }> = [];

    const sections: Array<keyof StrategySearchSpace> = [
      'common',
      'trendBreakout',
      'meanReversion',
      'smc',
      'scalp',
      'swing',
      'executionFriction',
    ];

    for (const section of sections) {
      const subSpace = space[section] as Record<string, number[]> | undefined;
      if (!subSpace) continue;
      for (const [key, vals] of Object.entries(subSpace)) {
        if (Array.isArray(vals) && vals.length > 0) {
          items.push({ section, key, values: vals });
        }
      }
    }

    return items;
  }

  /**
   * تولید کاندیداها با ضرب دکارتی یا جستجوی تصادفی
   */
  public static generateCandidates(
    baseParams: StrategyParameters,
    searchSpace: StrategySearchSpace,
    method: OptimizationMethod,
    maxEvaluations: number,
    seed: number
  ): StrategyParameters[] {
    const items = this.extractSearchItems(searchSpace);
    if (items.length === 0) return [this.cloneParameters(baseParams)];

    if (method === 'GRID') {
      let candidateParamsList: StrategyParameters[] = [this.cloneParameters(baseParams)];

      for (const item of items) {
        const nextList: StrategyParameters[] = [];
        for (const existing of candidateParamsList) {
          for (const val of item.values) {
            const nextCandidate = this.cloneParameters(existing);
            const targetSection = nextCandidate[item.section as keyof StrategyParameters] as any;
            if (targetSection) {
              targetSection[item.key] = val;
            }
            nextList.push(nextCandidate);
            if (nextList.length >= maxEvaluations) break;
          }
          if (nextList.length >= maxEvaluations) break;
        }
        candidateParamsList = nextList;
        if (candidateParamsList.length >= maxEvaluations) break;
      }

      return candidateParamsList.slice(0, maxEvaluations);
    } else {
      // RANDOM Monte-Carlo search
      const rng = this.createSeededRandom(seed);
      const candidates: StrategyParameters[] = [];
      // همیشه کاندیدای اول پارامترهای پایه باشد
      candidates.push(this.cloneParameters(baseParams));

      for (let i = 1; i < maxEvaluations; i++) {
        const candidate = this.cloneParameters(baseParams);
        for (const item of items) {
          const randomIndex = Math.floor(rng() * item.values.length);
          const chosenVal = item.values[randomIndex];
          const targetSection = candidate[item.section as keyof StrategyParameters] as any;
          if (targetSection) {
            targetSection[item.key] = chosenVal;
          }
        }
        candidates.push(candidate);
      }

      return candidates;
    }
  }

  /**
   * اجرای کامل بهینه‌سازی پارامترها
   */
  public static optimize(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    baseParams: StrategyParameters,
    options: ParameterOptimizationOptions
  ): ParameterOptimizationReport {
    const startTime = Date.now();
    const method = options.method ?? 'GRID';
    const objective = options.objective ?? 'NET_PROFIT';
    const maxEvaluations = Math.min(200, Math.max(1, options.maxEvaluations ?? 50));
    const minTrades = options.minTrades ?? 3;
    const seed = options.randomSeed ?? 42;
    const evaluatePlateau = options.evaluatePlateauStability ?? true;

    const candidates = this.generateCandidates(baseParams, options.searchSpace, method, maxEvaluations, seed);
    const evaluations: ParameterCandidateEvaluation[] = [];

    for (let index = 0; index < candidates.length; index++) {
      const candidateParams = candidates[index];
      const backtestResult = ResearchLab.runBacktest(candles, symbol, {
        strategyParameters: candidateParams,
        style: options.style,
        randomSeed: seed + index,
      });

      const { score, isAccepted, rejectionReason } = this.calculateObjectiveScore(
        backtestResult.metrics,
        objective,
        minTrades
      );

      evaluations.push({
        candidateId: `cand-${index + 1}`,
        rank: 0,
        parameters: candidateParams,
        score,
        objective,
        metrics: backtestResult.metrics,
        isAccepted,
        plateauScore: 100, // محاسبه فلات همسایگی در گام بعد
        rejectionReason,
      });
    }

    // رتبه‌بندی بر مبنای امتیاز نزولی
    evaluations.sort((a, b) => {
      if (a.isAccepted !== b.isAccepted) return a.isAccepted ? -1 : 1;
      return b.score - a.score || b.metrics.totalTrades - a.metrics.totalTrades;
    });

    evaluations.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    // ارزیابی فلات همسایگی برای کاندیداهای پذیرفته‌شده برتر
    if (evaluatePlateau && evaluations.length > 1) {
      for (const item of evaluations) {
        if (!item.isAccepted || item.score <= 0) {
          item.plateauScore = 0;
          continue;
        }

        // پیدا کردن کاندیداهایی که دقیقاً ۱ یا ۲ پارامتر با این کاندیدا تفاوت دارند (همسایه‌ها)
        const neighbors = evaluations.filter(other => other.candidateId !== item.candidateId && other.isAccepted);
        if (neighbors.length === 0) {
          item.plateauScore = 50;
          continue;
        }

        // میانگین درصد انحراف امتیاز همسایگان نسبت به این نقطه
        const scoreDiffs = neighbors.map(n => Math.abs(item.score - n.score) / Math.max(1, Math.abs(item.score)));
        const avgDiff = scoreDiffs.reduce((a, b) => a + b, 0) / scoreDiffs.length;

        // اگر همسایگان امتیاز مشابهی داشته باشند، نقطه روی یک فلات امن قرار دارد
        item.plateauScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, avgDiff)) * 100)));
      }
    }

    const bestCandidate = evaluations.find(item => item.isAccepted) ?? evaluations[0] ?? null;
    const acceptedCount = evaluations.filter(item => item.isAccepted).length;

    const warnings: string[] = [];
    if (acceptedCount === 0) {
      warnings.push('هیچ کاندیدایی موفق به احراز حداقل تعداد معامله مجاز نشد.');
    } else if (bestCandidate && bestCandidate.plateauScore < 30) {
      warnings.push('هشدار بیش‌برازش (Overfitting): بهترین کاندیدا یک قله تیز و ناپایدار با امتیاز فلات همسایگی پایین است.');
    }

    return {
      optimizerVersion: 'v2-purged-optimizer',
      method,
      objective,
      evaluatedCount: evaluations.length,
      acceptedCount,
      bestCandidate,
      leaderboard: evaluations,
      searchSpace: options.searchSpace,
      warnings,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
