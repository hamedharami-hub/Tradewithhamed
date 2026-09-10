// lib/core/equity-curve-monte-carlo.ts
// موتور شبیه‌سازی مونت‌کارلو توالی معاملات و احتمال ورشکستگی (Equity Curve Bootstrap & Ruin Monte Carlo)
// پیاده‌سازی ۱۰۰٪ قطعی، مبتنی بر آمار بوت‌استرپ و جایگشت تصادفی با قابلیت تکرارپذیری

export type ResamplingMode = 'PERMUTATION' | 'BOOTSTRAP_RESAMPLE';

export interface EquityMonteCarloConfig {
  iterations?: number;                       // تعداد مسیرهای شبیه‌سازی (پیش‌فرض ۲۰۰۰)
  mode?: ResamplingMode;                    // جابجایی ترتیبی یا نمونه‌گیری با جایگذاری
  initialEquity?: number;                   // سرمایه اولیه (پیش‌فرض ۱۰,۰۰۰ دلار)
  dailyDrawdownThresholdPercent?: number;   // سقف افت روزانه مجاز پراپ‌فرم (مثلاً ۵.۰٪)
  maxDrawdownThresholdPercent?: number;     // سقف افت کل مجاز پراپ‌فرم/حساب (مثلاً ۱۰.۰٪ یا ۸.۰٪)
  profitTargetPercent?: number;             // تارگت سود مرحله ارزیابی (مثلاً ۸.۰٪ یا ۱۰.۰٪)
  seed?: number;                            // سید قطعی جهت تکرارپذیری آزمون‌ها
}

export interface EquityMonteCarloResult {
  initialEquity: number;
  tradeCount: number;
  iterations: number;
  mode: ResamplingMode;

  // توزیع صدک‌های ماکزیمم دراودان (Max Drawdown Percentiles)
  drawdownDistribution: {
    p05: number;
    p25: number;
    p50: number; // میانه دراودان محتمل
    p75: number;
    p90: number;
    p95: number; // آستانه ریسک استاندارد ۹۵٪
    p99: number; // بدترین حالت شبه فاجعه
    worstCase: number;
  };

  // شاخص‌های بقا و پایداری حساب در چالش‌های پراپ‌فرم
  riskMetrics: {
    ruinProbabilityPercent: number;           // احتمال نقض سقف کل دراودان (Bust / Fail)
    dailyBreachProbabilityPercent: number;     // احتمال نقض سقف روزانه
    propFirmPassProbabilityPercent: number;    // احتمال دستیابی به تارگت پیش از نقض دراودان
    medianMaxConsecutiveLosses: number;        // میانه طولانی‌ترین زنجیره ضرر
    p95MaxConsecutiveLosses: number;           // صدک ۹۵ بدترین زنجیره ضرر
    worstConsecutiveLosses: number;
  };

  // وضعیت بازدهی و سرمایه نهایی
  returnDistribution: {
    p05FinalEquity: number;
    medianFinalEquity: number;
    p95FinalEquity: number;
    medianProfitFactor: number;
  };

  // رتبه‌بندی کیفی پایداری حساب
  safetyRating: 'INSTITUTIONAL_SAFE' | 'ROBUST_EDGE' | 'MODERATE_RISK' | 'HIGH_RUIN_RISK';
  summaryFa: string;
}

export class EquityCurveMonteCarloEngine {
  /**
   * تولیدکننده اعداد شبه‌تصادفی معین (Deterministic Pseudo-Random Generator)
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
   * محاسبه صدک از آرایه مرتب‌شده
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
   * اجرای کامل شبیه‌سازی مونت‌کارلو توالی معاملات
   */
  public static runSimulation(
    tradesPnL: number[],
    partialConfig: EquityMonteCarloConfig = {}
  ): EquityMonteCarloResult {
    const config: Required<EquityMonteCarloConfig> = {
      iterations: partialConfig.iterations || 2000,
      mode: partialConfig.mode || 'BOOTSTRAP_RESAMPLE',
      initialEquity: partialConfig.initialEquity || 10000,
      dailyDrawdownThresholdPercent: partialConfig.dailyDrawdownThresholdPercent || 4.5,
      maxDrawdownThresholdPercent: partialConfig.maxDrawdownThresholdPercent || 10.0,
      profitTargetPercent: partialConfig.profitTargetPercent || 8.0,
      seed: partialConfig.seed ?? 20260911,
    };

    if (tradesPnL.length === 0) {
      return this.createEmptyResult(config);
    }

    const randomFn = this.createPrng(config.seed);
    const n = tradesPnL.length;
    const targetEquity = config.initialEquity * (1 + config.profitTargetPercent / 100);
    const bustEquity = config.initialEquity * (1 - config.maxDrawdownThresholdPercent / 100);

    const maxDrawdowns: number[] = [];
    const finalEquities: number[] = [];
    const maxConsecutiveLossesList: number[] = [];

    let ruinHits = 0;
    let targetReachedFirst = 0;

    for (let iter = 0; iter < config.iterations; iter++) {
      // تولید توالی جدید معاملات
      const sequence: number[] = [];
      if (config.mode === 'PERMUTATION') {
        // روش جایگشت تصادفی با الگوریتم Fisher-Yates
        const shuffled = [...tradesPnL];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(randomFn() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        sequence.push(...shuffled);
      } else {
        // روش بوت‌استرپ با جایگذاری (Bootstrap Resampling)
        for (let i = 0; i < n; i++) {
          const idx = Math.floor(randomFn() * n);
          sequence.push(tradesPnL[idx]);
        }
      }

      // شبیه‌سازی مسیر سرمایه (Equity Path)
      let equity = config.initialEquity;
      let peakEquity = equity;
      let pathMaxDdPercent = 0;
      let hitBust = false;
      let hitTarget = false;
      let currentLossStreak = 0;
      let maxLossStreak = 0;

      for (const pnl of sequence) {
        equity += pnl;

        // شمارش زنجیره ضرر متوالی
        if (pnl < 0) {
          currentLossStreak++;
          if (currentLossStreak > maxLossStreak) {
            maxLossStreak = currentLossStreak;
          }
        } else {
          currentLossStreak = 0;
        }

        // بررسی قله و دراودان
        if (equity > peakEquity) {
          peakEquity = equity;
        } else {
          const ddDollar = peakEquity - equity;
          const ddPercent = (ddDollar / peakEquity) * 100;
          if (ddPercent > pathMaxDdPercent) {
            pathMaxDdPercent = ddPercent;
          }
        }

        // بررسی نقض قوانین پراپ‌فرم در طول مسیر
        if (!hitBust && !hitTarget) {
          if (equity <= bustEquity) {
            hitBust = true;
          } else if (equity >= targetEquity) {
            hitTarget = true;
          }
        }
      }

      if (hitBust || pathMaxDdPercent >= config.maxDrawdownThresholdPercent) {
        ruinHits++;
      } else if (hitTarget) {
        targetReachedFirst++;
      }

      maxDrawdowns.push(Number(pathMaxDdPercent.toFixed(2)));
      finalEquities.push(Number(equity.toFixed(2)));
      maxConsecutiveLossesList.push(maxLossStreak);
    }

    // مرتب‌سازی مقادیر جهت استخراج صدک‌ها
    maxDrawdowns.sort((a, b) => a - b);
    finalEquities.sort((a, b) => a - b);
    maxConsecutiveLossesList.sort((a, b) => a - b);

    const p05Dd = this.getPercentile(maxDrawdowns, 5);
    const p25Dd = this.getPercentile(maxDrawdowns, 25);
    const p50Dd = this.getPercentile(maxDrawdowns, 50);
    const p75Dd = this.getPercentile(maxDrawdowns, 75);
    const p90Dd = this.getPercentile(maxDrawdowns, 90);
    const p95Dd = this.getPercentile(maxDrawdowns, 95);
    const p99Dd = this.getPercentile(maxDrawdowns, 99);
    const worstCaseDd = maxDrawdowns[maxDrawdowns.length - 1];

    const ruinProbability = Number(((ruinHits / config.iterations) * 100).toFixed(2));
    const passProbability = Number(((targetReachedFirst / config.iterations) * 100).toFixed(2));

    // تقریب نقض سقف روزانه بر اساس بدترین روزها
    const dailyBreachCount = maxDrawdowns.filter(dd => dd >= config.dailyDrawdownThresholdPercent).length;
    const dailyBreachProb = Number(((dailyBreachCount / config.iterations) * 100).toFixed(2));

    // محاسبه سود ناخالص / زیان ناخالص برای Profit Factor میانه
    const grossProfit = tradesPnL.filter(p => p > 0).reduce((acc, v) => acc + v, 0);
    const grossLoss = Math.abs(tradesPnL.filter(p => p < 0).reduce((acc, v) => acc + v, 0));
    const medianProfitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : 99.0;

    // رتبه‌بندی ایمنی
    let safetyRating: EquityMonteCarloResult['safetyRating'] = 'INSTITUTIONAL_SAFE';
    let summaryFa = '';

    if (ruinProbability > 15 || p95Dd >= config.maxDrawdownThresholdPercent) {
      safetyRating = 'HIGH_RUIN_RISK';
      summaryFa = `هشدار: احتمال ورشکستگی بالا (${ruinProbability}٪). در سناریوی بدبینانه ۹۵٪ دراودان به ${p95Dd.toFixed(1)}٪ می‌رسد که سقف حساب را نقض می‌کند. حجم معاملات باید حداقل نصف شود.`;
    } else if (ruinProbability > 5 || p95Dd >= config.maxDrawdownThresholdPercent * 0.75) {
      safetyRating = 'MODERATE_RISK';
      summaryFa = `ریسک متوسط: احتمال ورشکستگی ${ruinProbability}٪ و میانه دراودان ${p50Dd.toFixed(1)}٪ است. سیستم دارای برتری آماری است اما در زنجیره ضررهای سنگین تحت فشار قرار می‌گیرد.`;
    } else if (passProbability >= 50 && p95Dd < config.maxDrawdownThresholdPercent * 0.6) {
      safetyRating = 'INSTITUTIONAL_SAFE';
      summaryFa = `پایداری سطح سازمانی: احتمال ورشکستگی کمتر از ۵٪ (${ruinProbability}٪)، شانس قبولی در آزمون پراپ‌فرم ${passProbability}٪ و حداکثر دراودان سناریوی ۹۵٪ تنها ${p95Dd.toFixed(1)}٪ است.`;
    } else {
      safetyRating = 'ROBUST_EDGE';
      summaryFa = `برتری آماری مستحکم: سیستم با احتمال بقای ${(100 - ruinProbability).toFixed(1)}٪ آزمون برهم‌زدن توالی مونت‌کارلو را با موفقیت پشت سر گذاشت.`;
    }

    return {
      initialEquity: config.initialEquity,
      tradeCount: n,
      iterations: config.iterations,
      mode: config.mode,
      drawdownDistribution: {
        p05: Number(p05Dd.toFixed(2)),
        p25: Number(p25Dd.toFixed(2)),
        p50: Number(p50Dd.toFixed(2)),
        p75: Number(p75Dd.toFixed(2)),
        p90: Number(p90Dd.toFixed(2)),
        p95: Number(p95Dd.toFixed(2)),
        p99: Number(p99Dd.toFixed(2)),
        worstCase: Number(worstCaseDd.toFixed(2)),
      },
      riskMetrics: {
        ruinProbabilityPercent: ruinProbability,
        dailyBreachProbabilityPercent: dailyBreachProb,
        propFirmPassProbabilityPercent: passProbability,
        medianMaxConsecutiveLosses: Math.round(this.getPercentile(maxConsecutiveLossesList, 50)),
        p95MaxConsecutiveLosses: Math.round(this.getPercentile(maxConsecutiveLossesList, 95)),
        worstConsecutiveLosses: maxConsecutiveLossesList[maxConsecutiveLossesList.length - 1],
      },
      returnDistribution: {
        p05FinalEquity: Number(this.getPercentile(finalEquities, 5).toFixed(2)),
        medianFinalEquity: Number(this.getPercentile(finalEquities, 50).toFixed(2)),
        p95FinalEquity: Number(this.getPercentile(finalEquities, 95).toFixed(2)),
        medianProfitFactor,
      },
      safetyRating,
      summaryFa,
    };
  }

  private static createEmptyResult(config: Required<EquityMonteCarloConfig>): EquityMonteCarloResult {
    return {
      initialEquity: config.initialEquity,
      tradeCount: 0,
      iterations: config.iterations,
      mode: config.mode,
      drawdownDistribution: {
        p05: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, worstCase: 0,
      },
      riskMetrics: {
        ruinProbabilityPercent: 0,
        dailyBreachProbabilityPercent: 0,
        propFirmPassProbabilityPercent: 0,
        medianMaxConsecutiveLosses: 0,
        p95MaxConsecutiveLosses: 0,
        worstConsecutiveLosses: 0,
      },
      returnDistribution: {
        p05FinalEquity: config.initialEquity,
        medianFinalEquity: config.initialEquity,
        p95FinalEquity: config.initialEquity,
        medianProfitFactor: 0,
      },
      safetyRating: 'MODERATE_RISK',
      summaryFa: 'معامله‌ای برای ارزیابی مونت‌کارلو وجود ندارد.',
    };
  }
}
