// lib/core/drift-monitor.ts
// پایشگر کیفیت اجرا، لغزش قیمت (Slippage) و تأخیر شبکه (Latency) در بسته W3

import { SymbolId } from '../contracts/market';
import { CandidateDirection } from '../contracts/strategy';
import { ExecutionQualityMetric } from '../contracts/w3-ems';

export interface DriftMonitorConfig {
  maxAcceptableSlippagePips: number; // حداکثر لغزش مجاز (مثلاً ۲ پیپ)
  maxAcceptableLatencyMs: number;     // حداکثر تأخیر مجاز (مثلاً ۵۰۰ میلی‌ثانیه)
  warningSpreadPips: number;          // آستانه هشدار اسپرد گسترده
}

export class DriftMonitor {
  private config: DriftMonitorConfig;
  private history: ExecutionQualityMetric[] = [];

  constructor(config?: Partial<DriftMonitorConfig>) {
    this.config = {
      maxAcceptableSlippagePips: config?.maxAcceptableSlippagePips ?? 2.0,
      maxAcceptableLatencyMs: config?.maxAcceptableLatencyMs ?? 500,
      warningSpreadPips: config?.warningSpreadPips ?? 3.0,
    };
  }

  /**
   * محاسبه اندازه پیپ متناسب با نماد معاملاتی
   */
  public static getPipSize(symbol: SymbolId): number {
    switch (symbol) {
      case 'XAUUSD':
        return 0.1; // در انس طلا هر ۰.۱ دلار برابر ۱ پیپ است
      case 'USDJPY':
        return 0.01;
      case 'BTCUSD':
        return 1;
      case 'EURUSD':
      default:
        return 0.0001; // در یورو برابر ۰.۰۰۰۱ است
    }
  }

  /**
   * تحلیل کیفیت اجرای یک سفارش و ارزیابی لغزش و تأخیر
   */
  public evaluateExecution(params: {
    symbol: SymbolId;
    direction: CandidateDirection;
    requestedPrice: number;
    executedPrice: number;
    submittedAt: number;
    acknowledgedAt: number;
    filledAt: number;
    spreadPipsAtExecution: number;
  }): ExecutionQualityMetric {
    const {
      symbol,
      direction,
      requestedPrice,
      executedPrice,
      submittedAt,
      acknowledgedAt,
      filledAt,
      spreadPipsAtExecution,
    } = params;

    const pipSize = DriftMonitor.getPipSize(symbol);
    const submissionLatencyMs = Math.max(0, acknowledgedAt - submittedAt);
    const fillLatencyMs = Math.max(0, filledAt - acknowledgedAt);
    const totalExecutionMs = Math.max(0, filledAt - submittedAt);

    // محاسبه لغزش
    let priceDiff = 0;
    let slippageDirection: 'FAVORABLE' | 'UNFAVORABLE' | 'ZERO' = 'ZERO';

    if (direction === 'BUY') {
      // خرید در قیمتی کمتر = مطلوب؛ خرید در قیمتی بالاتر = نامطلوب
      priceDiff = (executedPrice - requestedPrice) / pipSize;
    } else {
      // فروش در قیمتی بالاتر = مطلوب؛ فروش در قیمتی کمتر = نامطلوب
      priceDiff = (requestedPrice - executedPrice) / pipSize;
    }

    const slippagePips = Math.abs(priceDiff);

    if (Math.abs(priceDiff) < 0.05) {
      slippageDirection = 'ZERO';
    } else if (priceDiff < 0) {
      // برای Buy: executed < requested (ارزان‌تر خریدیم = Favorable)
      // برای Sell: requested < executed (گران‌تر فروختیم = Favorable)
      slippageDirection = 'FAVORABLE';
    } else {
      slippageDirection = 'UNFAVORABLE';
    }

    // محاسبه امتیاز کیفیت اجرا (EQS) از ۱۰۰
    let score = 100;

    // کسر نمره بر اساس لغزش نامطلوب
    if (slippageDirection === 'UNFAVORABLE') {
      const slipPenalty = (slippagePips / this.config.maxAcceptableSlippagePips) * 40;
      score -= Math.min(40, slipPenalty);
    }

    // کسر نمره بر اساس تأخیر
    if (totalExecutionMs > this.config.maxAcceptableLatencyMs) {
      const latPenalty = ((totalExecutionMs - this.config.maxAcceptableLatencyMs) / this.config.maxAcceptableLatencyMs) * 30;
      score -= Math.min(30, latPenalty);
    }

    // کسر نمره بر اساس اسپرد نامتعارف
    if (spreadPipsAtExecution > this.config.warningSpreadPips) {
      score -= 15;
    }

    const executionQualityScore = Math.max(10, Math.round(score));

    // پرچم هشدار انحراف (Drift Flag)
    const flaggedForDrift =
      (slippageDirection === 'UNFAVORABLE' && slippagePips > this.config.maxAcceptableSlippagePips) ||
      totalExecutionMs > this.config.maxAcceptableLatencyMs * 1.5;

    const metric: ExecutionQualityMetric = {
      submissionLatencyMs,
      fillLatencyMs,
      totalExecutionMs,
      requestedPrice,
      executedPrice,
      slippagePips: Number(slippagePips.toFixed(2)),
      slippageDirection,
      spreadPipsAtExecution: Number(spreadPipsAtExecution.toFixed(2)),
      executionQualityScore,
      flaggedForDrift,
    };

    this.history.push(metric);
    return metric;
  }

  /**
   * آمار تجمعی کیفیت اجرا
   */
  public getAggregateStats(): {
    totalExecutions: number;
    avgLatencyMs: number;
    avgSlippagePips: number;
    maxSlippagePips: number;
    driftViolations: number;
    averageQualityScore: number;
  } {
    if (this.history.length === 0) {
      return {
        totalExecutions: 0,
        avgLatencyMs: 0,
        avgSlippagePips: 0,
        maxSlippagePips: 0,
        driftViolations: 0,
        averageQualityScore: 100,
      };
    }

    const total = this.history.length;
    const sumLatency = this.history.reduce((acc, h) => acc + h.totalExecutionMs, 0);
    const sumSlip = this.history.reduce((acc, h) => acc + h.slippagePips, 0);
    const maxSlip = Math.max(...this.history.map(h => h.slippagePips));
    const violations = this.history.filter(h => h.flaggedForDrift).length;
    const sumScore = this.history.reduce((acc, h) => acc + h.executionQualityScore, 0);

    return {
      totalExecutions: total,
      avgLatencyMs: Math.round(sumLatency / total),
      avgSlippagePips: Number((sumSlip / total).toFixed(2)),
      maxSlippagePips: Number(maxSlip.toFixed(2)),
      driftViolations: violations,
      averageQualityScore: Math.round(sumScore / total),
    };
  }

  public clear(): void {
    this.history = [];
  }
}
