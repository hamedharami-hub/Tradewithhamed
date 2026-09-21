// lib/core/monte-carlo-engine.ts
// موتور محاسباتی پیشرفته شبیه‌سازی مونت‌کارلو و برآورد ریسک ورشکستگی (Package E)

import type { PositionLedgerEntry } from './ports';
import type {
  MonteCarloSimulationConfig,
  MonteCarloPercentileBands,
  SimulatedEquityPath,
  RiskOfRuinAnalysis,
  MonteCarloSimulationReport,
} from '@/lib/contracts/monte-carlo-stress';

export class AdvancedMonteCarloEngine {
  /**
   * تولید عدد تصادفی با بذر اولیه (PRNG دترمنیستیک)
   */
  private static createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = Math.imul(1664525, state) + 1013904223;
      return (state >>> 0) / 4294967296;
    };
  }

  /**
   * استخراج آرایه بازدهی یا سود خالص معاملات بسته شده
   */
  public static extractTradePnls(closedPositions: PositionLedgerEntry[]): number[] {
    return closedPositions.map(p => p.realizedPnl);
  }

  /**
   * محاسبه صدک مشخصی از یک آرایه مرتب‌شده
   */
  public static calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sortedValues[lower];
    return Number((sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(2));
  }

  /**
   * اجرای شبیه‌سازی مونت‌کارلو بر روی معاملات تاریخی
   */
  public static simulate(
    tradePnls: number[],
    config: MonteCarloSimulationConfig
  ): MonteCarloSimulationReport {
    const startTime = Date.now();
    const iterations = Math.max(10, Math.min(5000, config.iterations || 500));
    const initialEquity = config.initialEquity ?? 10000;
    const ruinThresholdPercent = config.ruinDrawdownThresholdPercent ?? 10;
    const maxDailyLossPercent = config.maxAllowedDailyLossPercent ?? 5;
    const method = config.method || 'TRADE_RESHUFFLE';
    const seed = config.seed ?? 1337;
    const blockSize = Math.max(2, config.blockSize ?? 5);

    const rng = this.createSeededRandom(seed);

    if (tradePnls.length === 0) {
      const zeroBands: MonteCarloPercentileBands = { p5: initialEquity, p25: initialEquity, p50: initialEquity, p75: initialEquity, p95: initialEquity };
      const zeroDd: MonteCarloPercentileBands = { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 };
      return {
        simulationVersion: 'v2-monte-carlo',
        iterations: 0,
        method,
        seed,
        initialEquity,
        finalEquityPercentiles: zeroBands,
        maxDrawdownPercentiles: zeroDd,
        riskOfRuin: {
          ruinProbabilityPercent: 0,
          p50MaxDrawdownPercent: 0,
          p95MaxDrawdownPercent: 0,
          propFirmPassProbabilityPercent: 100,
          drawdownExceedanceProbabilities: {
            exceeds5Percent: 0,
            exceeds10Percent: 0,
            exceeds15Percent: 0,
            exceeds20Percent: 0,
          },
        },
        samplePaths: [],
        executionTimeMs: Date.now() - startTime,
      };
    }

    const finalEquities: number[] = [];
    const maxDrawdowns: number[] = [];
    const simulatedPaths: SimulatedEquityPath[] = [];
    let ruinedCount = 0;
    let propFirmFailedCount = 0;
    let exceeds5Count = 0;
    let exceeds10Count = 0;
    let exceeds15Count = 0;
    let exceeds20Count = 0;

    for (let iter = 0; iter < iterations; iter++) {
      // بازنمونه‌گیری (Resampling)
      let sequence: number[] = [];

      if (method === 'TRADE_RESHUFFLE') {
        // فیشر-یتز شافل با حفظ کل معاملات
        sequence = [...tradePnls];
        for (let i = sequence.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          const temp = sequence[i];
          sequence[i] = sequence[j];
          sequence[j] = temp;
        }
      } else if (method === 'BLOCK_BOOTSTRAP') {
        // نمونه‌گیری بلوکی پیوسته برای بازتولید خوشه‌های زیان متوالی
        while (sequence.length < tradePnls.length) {
          const maxStart = Math.max(0, tradePnls.length - blockSize);
          const start = Math.floor(rng() * (maxStart + 1));
          const block = tradePnls.slice(start, start + blockSize);
          sequence.push(...block);
        }
        sequence = sequence.slice(0, tradePnls.length);
      } else {
        // بازنمونه‌گیری جایگزینی ساده با نویز تصادفی
        sequence = Array.from({ length: tradePnls.length }, () => {
          const idx = Math.floor(rng() * tradePnls.length);
          const perturbation = 1 + (rng() - 0.5) * 0.05; // ±2.5% نویز
          return tradePnls[idx] * perturbation;
        });
      }

      // محاسبه مسیر اکوئیتی و حداکثر افت سرمایه
      let currentEquity = initialEquity;
      let peakEquity = initialEquity;
      let pathMaxDd = 0;
      const equityPoints: number[] = [initialEquity];

      for (const pnl of sequence) {
        currentEquity += pnl;
        if (currentEquity > peakEquity) {
          peakEquity = currentEquity;
        }
        const currentDd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
        if (currentDd > pathMaxDd) {
          pathMaxDd = currentDd;
        }

        // نمونه‌برداری گام‌ها (حداکثر تا ۵۰ نقطه در هر مسیر)
        if (equityPoints.length < 50 || sequence.length < 50) {
          equityPoints.push(Number(currentEquity.toFixed(2)));
        }
      }

      finalEquities.push(Number(currentEquity.toFixed(2)));
      maxDrawdowns.push(Number(pathMaxDd.toFixed(2)));

      const isRuined = pathMaxDd >= ruinThresholdPercent;
      if (isRuined) ruinedCount++;

      // ارزیابی نقض قوانین پراپ‌فرم
      const violatesPropFirm = pathMaxDd >= ruinThresholdPercent;
      if (violatesPropFirm) propFirmFailedCount++;

      if (pathMaxDd >= 5) exceeds5Count++;
      if (pathMaxDd >= 10) exceeds10Count++;
      if (pathMaxDd >= 15) exceeds15Count++;
      if (pathMaxDd >= 20) exceeds20Count++;

      // ذخیره نمونه برای ترسیم چارت
      if (iter < 15) {
        simulatedPaths.push({
          pathIndex: iter + 1,
          finalEquity: Number(currentEquity.toFixed(2)),
          netProfit: Number((currentEquity - initialEquity).toFixed(2)),
          maxDrawdownPercent: Number(pathMaxDd.toFixed(2)),
          isRuined,
          equityPoints,
        });
      }
    }

    // محاسبه صدک‌ها
    finalEquities.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);

    const finalEquityPercentiles: MonteCarloPercentileBands = {
      p5: this.calculatePercentile(finalEquities, 5),
      p25: this.calculatePercentile(finalEquities, 25),
      p50: this.calculatePercentile(finalEquities, 50),
      p75: this.calculatePercentile(finalEquities, 75),
      p95: this.calculatePercentile(finalEquities, 95),
    };

    const maxDrawdownPercentiles: MonteCarloPercentileBands = {
      p5: this.calculatePercentile(maxDrawdowns, 5),
      p25: this.calculatePercentile(maxDrawdowns, 25),
      p50: this.calculatePercentile(maxDrawdowns, 50),
      p75: this.calculatePercentile(maxDrawdowns, 75),
      p95: this.calculatePercentile(maxDrawdowns, 95),
    };

    const ruinProbabilityPercent = Number(((ruinedCount / iterations) * 100).toFixed(1));
    const propFirmPassProbabilityPercent = Number((((iterations - propFirmFailedCount) / iterations) * 100).toFixed(1));

    const riskOfRuin: RiskOfRuinAnalysis = {
      ruinProbabilityPercent,
      p50MaxDrawdownPercent: maxDrawdownPercentiles.p50,
      p95MaxDrawdownPercent: maxDrawdownPercentiles.p95,
      propFirmPassProbabilityPercent,
      drawdownExceedanceProbabilities: {
        exceeds5Percent: Number(((exceeds5Count / iterations) * 100).toFixed(1)),
        exceeds10Percent: Number(((exceeds10Count / iterations) * 100).toFixed(1)),
        exceeds15Percent: Number(((exceeds15Count / iterations) * 100).toFixed(1)),
        exceeds20Percent: Number(((exceeds20Count / iterations) * 100).toFixed(1)),
      },
    };

    return {
      simulationVersion: 'v2-monte-carlo',
      iterations,
      method,
      seed,
      initialEquity,
      finalEquityPercentiles,
      maxDrawdownPercentiles,
      riskOfRuin,
      samplePaths: simulatedPaths,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
