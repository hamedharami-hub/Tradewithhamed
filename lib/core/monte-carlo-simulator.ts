// lib/core/monte-carlo-simulator.ts
// موتور شبیه‌سازی ۱۰۰۰ مسیره استوکاستیک مونت‌کارلو (Monte Carlo Simulation Engine)
// پیاده‌سازی ۱۰۰٪ آفلاین با مدل حرکت براونی هندسی (GBM) و صدک‌های مخروطی احتمالاتی

import {
  MonteCarloSimulationConfig,
  MonteCarloSimulationResult,
  PercentileStepPoint,
} from '../contracts/monte-carlo';

export class MonteCarloSimulator {
  /**
   * تولیدکننده اعداد شبه‌تصادفی معین (Deterministic Pseudo-Random Generator)
   * با الگوریتم LCG برای تضمین تکرارپذیری آزمون‌های بنچمارک
   */
  private static createPrng(seed: number = 42) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * تبدیل توزیع یکنواخت به توزیع نرمال استاندارد N(0, 1) با تبدیل Box-Muller
   */
  private static standardNormal(randomFn: () => number): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = randomFn();
    while (v === 0) v = randomFn();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * محاسبه صدک مشخص از یک آرایه مرتب‌شده
   */
  private static getPercentile(sortedArr: number[], percentile: number): number {
    if (sortedArr.length === 0) return 0;
    const index = (percentile / 100) * (sortedArr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sortedArr[lower];
    return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
  }

  /**
   * اجرای کامل ۱۰۰۰ مسیر شبیه‌سازی تصادفی
   */
  public static runSimulation(
    partialConfig: Partial<MonteCarloSimulationConfig> & {
      initialPrice: number;
      targetPrice: number;
      stopLossPrice: number;
    }
  ): MonteCarloSimulationResult {
    const config: MonteCarloSimulationConfig = {
      iterations: partialConfig.iterations || 1000,
      steps: partialConfig.steps || 50,
      initialPrice: partialConfig.initialPrice,
      targetPrice: partialConfig.targetPrice,
      stopLossPrice: partialConfig.stopLossPrice,
      annualizedVolatility: partialConfig.annualizedVolatility || 0.16, // نوسان‌پذیری متعارف طلا
      drift: partialConfig.drift !== undefined ? partialConfig.drift : 0.02,
      seed: partialConfig.seed,
    };

    const isBuy = config.targetPrice > config.initialPrice;
    const dt = 1 / (252 * 24); // گام زمانی تقریبی یک‌ساعته
    const mu = config.drift;
    const sigma = config.annualizedVolatility;
    const driftStep = (mu - 0.5 * sigma * sigma) * dt;
    const volStep = sigma * Math.sqrt(dt);

    const randomFn = config.seed !== undefined ? this.createPrng(config.seed) : Math.random;

    let tpFirstCount = 0;
    let slFirstCount = 0;
    let neitherCount = 0;

    const maxDrawdowns: number[] = [];
    const finalReturns: number[] = [];

    // ماتریس نگه‌داری قیمت تمام گام‌ها برای استخراج مخروط صدک‌ها
    // stepMatrix[stepIndex] = number[]
    const stepMatrix: number[][] = Array.from({ length: config.steps + 1 }, () => []);

    for (let path = 0; path < config.iterations; path++) {
      let currentPrice = config.initialPrice;
      stepMatrix[0].push(currentPrice);

      let peakPrice = currentPrice;
      let troughPrice = currentPrice;
      let pathMaxDrawdown = 0;

      let hitTp = false;
      let hitSl = false;
      let firstEvent: 'TP' | 'SL' | null = null;

      for (let step = 1; step <= config.steps; step++) {
        const z = this.standardNormal(randomFn);
        currentPrice = currentPrice * Math.exp(driftStep + volStep * z);
        stepMatrix[step].push(currentPrice);

        // پایش بیشینه افت مسیر (Drawdown)
        if (isBuy) {
          if (currentPrice > peakPrice) peakPrice = currentPrice;
          const dd = (peakPrice - currentPrice) / peakPrice;
          if (dd > pathMaxDrawdown) pathMaxDrawdown = dd;

          // بررسی رویدادهای حد سود و حد ضرر
          if (!hitTp && !hitSl) {
            if (currentPrice >= config.targetPrice) {
              hitTp = true;
              firstEvent = 'TP';
            } else if (currentPrice <= config.stopLossPrice) {
              hitSl = true;
              firstEvent = 'SL';
            }
          }
        } else {
          // موقعیت فروش (SELL)
          if (currentPrice < troughPrice) troughPrice = currentPrice;
          const dd = (currentPrice - troughPrice) / troughPrice;
          if (dd > pathMaxDrawdown) pathMaxDrawdown = dd;

          if (!hitTp && !hitSl) {
            if (currentPrice <= config.targetPrice) {
              hitTp = true;
              firstEvent = 'TP';
            } else if (currentPrice >= config.stopLossPrice) {
              hitSl = true;
              firstEvent = 'SL';
            }
          }
        }
      }

      maxDrawdowns.push(pathMaxDrawdown);
      const totalReturn = (currentPrice - config.initialPrice) / config.initialPrice;
      finalReturns.push(isBuy ? totalReturn : -totalReturn);

      if (firstEvent === 'TP') tpFirstCount++;
      else if (firstEvent === 'SL') slFirstCount++;
      else neitherCount++;
    }

    // محاسبه صدک‌های مخروط برای هر گام
    const percentileCone: PercentileStepPoint[] = [];
    for (let step = 0; step <= config.steps; step++) {
      const sortedPrices = [...stepMatrix[step]].sort((a, b) => a - b);
      percentileCone.push({
        step,
        p5: Number(this.getPercentile(sortedPrices, 5).toFixed(2)),
        p25: Number(this.getPercentile(sortedPrices, 25).toFixed(2)),
        p50: Number(this.getPercentile(sortedPrices, 50).toFixed(2)),
        p75: Number(this.getPercentile(sortedPrices, 75).toFixed(2)),
        p95: Number(this.getPercentile(sortedPrices, 95).toFixed(2)),
      });
    }

    // محاسبه معیارهای ریسک تجمیعی
    const probabilityOfProfit = Number(((tpFirstCount / config.iterations) * 100).toFixed(1));
    const probabilityOfStopLoss = Number(((slFirstCount / config.iterations) * 100).toFixed(1));

    const avgMaxDrawdown = maxDrawdowns.reduce((a, b) => a + b, 0) / maxDrawdowns.length;
    const expectedMaxDrawdownPercent = Number((avgMaxDrawdown * 100).toFixed(2));

    const sortedReturns = [...finalReturns].sort((a, b) => a - b);
    const var95Return = this.getPercentile(sortedReturns, 5);
    const var95Percent = Number((Math.abs(Math.min(0, var95Return)) * 100).toFixed(2));

    // CVaR 95% (میانگین زیان‌های زیر صدک ۵)
    const tailReturns = sortedReturns.slice(0, Math.floor(sortedReturns.length * 0.05));
    const cvarAvg = tailReturns.length > 0
      ? tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length
      : var95Return;
    const cvar95Percent = Number((Math.abs(Math.min(0, cvarAvg)) * 100).toFixed(2));

    // احتمال خرابی/ابطال بر مبنای لمس استاپ یا افت بیش از ۳.۵ برابر ریسک
    const riskOfRuin = Number(((slFirstCount / config.iterations) * 100).toFixed(1));
    const medianFinalPrice = percentileCone[percentileCone.length - 1].p50;

    const isTradeViable = probabilityOfProfit >= 50 && probabilityOfProfit > probabilityOfStopLoss;

    let persianRiskAssessment = '';
    if (probabilityOfProfit >= 65) {
      persianRiskAssessment = `وضعیت بسیار مطلوب: احتمال لمس حد سود (${probabilityOfProfit}٪) با غلبه قاطع بر حد ضرر (${probabilityOfStopLoss}٪). حداکثر افت مورد انتظار در طول مسیر ${expectedMaxDrawdownPercent}٪ است.`;
    } else if (probabilityOfProfit >= 50) {
      persianRiskAssessment = `وضعیت متعادل و قابل قبول: برتری آماری حد سود (${probabilityOfProfit}٪ در برابر ${probabilityOfStopLoss}٪ استاپ). ارزش در معرض ریسک ۹۵٪ برابر با ${var95Percent}٪ است.`;
    } else {
      persianRiskAssessment = `هشدار عدم توجیه آماری: احتمال لمس استاپ (${probabilityOfStopLoss}٪) از حد سود پیشی گرفته یا برابر است. توصیه به پرهیز از معامله مستقیم تا تثبیت ساختار.`;
    }

    return {
      config,
      probabilityOfProfit,
      probabilityOfStopLoss,
      expectedMaxDrawdownPercent,
      riskOfRuin,
      medianFinalPrice,
      var95Percent,
      cvar95Percent,
      percentileCone,
      totalPaths: config.iterations,
      tpFirstCount,
      slFirstCount,
      neitherCount,
      persianRiskAssessment,
      isTradeViable,
    };
  }
}
