// lib/core/risk-guardian-engine.ts
// موتور نگهبان ریسک، کلیدهای قطع نوسان و مدیریت سبد معاملات (Gate W4 Risk Guardian Engine)

import { SymbolId } from '../contracts/market';
import { OrderIntentPayload, PortfolioLedgerState, PositionLedgerEntry } from './ports';
import {
  RiskBudgetConfig,
  CircuitBreakerConfig,
  RiskGuardianState,
  RiskEvaluationResult,
  ProtectionEvent,
} from '../contracts/w4-risk-guardian';
import { TrailingStopManager } from './trailing-stop-manager';
import { DriftMonitor } from './drift-monitor';

export class RiskGuardianEngine {
  private riskConfig: RiskBudgetConfig;
  private circuitConfig: CircuitBreakerConfig;
  private state: RiskGuardianState;
  private trailingManager: TrailingStopManager;
  private protectionHistory: ProtectionEvent[] = [];

  constructor(
    riskConfig?: Partial<RiskBudgetConfig>,
    circuitConfig?: Partial<CircuitBreakerConfig>,
    initialEquity: number = 10000
  ) {
    this.riskConfig = {
      maxDailyLossAmount: 300,            // حداکثر ۳۰۰ دلار زیان در یک روز
      maxDailyLossPercent: 3.0,           // ۳ درصد افت روزانه
      maxDrawdownCapPercent: 10.0,        // ۱۰ درصد سقف افت کل سبد
      maxOpenPositions: 2,                // حداکثر ۲ معامله هم‌زمان باز
      maxAccountLeverage: 10,             // سقف اهرم ۱۰
      maxRiskPerTradePercent: 1.0,        // حداکثر ۱ درصد ریسک در هر معامله
      maxRiskPerTradeAmount: 100,         // حداکثر ۱۰۰ دلار ریسک در هر معامله
      consecutiveLossesLimit: 3,          // پس از ۳ زیان متوالی خنک‌سازی فعال می‌شود
      cooldownPeriodMinutes: 60,          // ۶۰ دقیقه توقف معاملات
      ...riskConfig,
    };

    this.circuitConfig = {
      maxSpreadPips: {
        XAUUSD: 3.5,                      // حداکثر اسپرد مجاز طلا ۳.۵ پیپ
        EURUSD: 2.5,                      // حداکثر اسپرد مجاز یورو ۲.۵ پیپ
      },
      volatilitySpikeThresholdMultiplier: 3.0,
      blockNewsWindowsMinutesBefore: 15,
      blockNewsWindowsMinutesAfter: 15,
      enforceWeekendGapProtection: true,
      fridayCutoffHourUtc: 20,            // جمعه ساعت ۲۰:۰۰ UTC به بعد
      ...circuitConfig,
    };

    this.state = {
      isEmergencyKillSwitchActive: false,
      killSwitchTriggerReason: null,
      killSwitchTimestamp: null,
      dailyStartingEquity: initialEquity,
      dailyRealizedPnl: 0,
      dailyDrawdownPercent: 0,
      isDailyLossCapHit: false,
      consecutiveLossCount: 0,
      cooldownUntilTimestamp: null,
      activeCircuitBreakers: {
        spreadSpike: false,
        volatilitySpike: false,
        sessionClosed: false,
        weekendGap: false,
      },
      todayClosedTradesCount: 0,
    };

    this.trailingManager = new TrailingStopManager();
  }

  public getRiskConfig(): RiskBudgetConfig {
    return { ...this.riskConfig };
  }

  public getCircuitConfig(): CircuitBreakerConfig {
    return { ...this.circuitConfig };
  }

  public getState(): RiskGuardianState {
    return {
      ...this.state,
      activeCircuitBreakers: { ...this.state.activeCircuitBreakers },
    };
  }

  public getTrailingManager(): TrailingStopManager {
    return this.trailingManager;
  }

  public getProtectionHistory(): ProtectionEvent[] {
    return [...this.protectionHistory];
  }

  /**
   * فعال‌سازی کلید قطع اضطراری (Emergency Kill-Switch)
   */
  public triggerEmergencyKillSwitch(reason: string, now: number = Date.now()): void {
    this.state.isEmergencyKillSwitchActive = true;
    this.state.killSwitchTriggerReason = reason;
    this.state.killSwitchTimestamp = now;
  }

  /**
   * بازنشانی دستی کلید قطع اضطراری
   */
  public resetEmergencyKillSwitch(): void {
    this.state.isEmergencyKillSwitchActive = false;
    this.state.killSwitchTriggerReason = null;
    this.state.killSwitchTimestamp = null;
  }

  /**
   * بازنشانی سرفصل روزانه حساب (Daily Rollover)
   */
  public rolloverNewDay(currentEquity: number): void {
    this.state.dailyStartingEquity = currentEquity;
    this.state.dailyRealizedPnl = 0;
    this.state.dailyDrawdownPercent = 0;
    this.state.isDailyLossCapHit = false;
    this.state.todayClosedTradesCount = 0;
  }

  /**
   * ثبت معامله بسته‌شده و به‌روزرسانی شاخص‌های ریسک روزانه و شمارنده زیان متوالی
   */
  public recordClosedTrade(netProfit: number, now: number = Date.now()): void {
    this.state.todayClosedTradesCount++;
    this.state.dailyRealizedPnl += netProfit;

    if (this.state.dailyStartingEquity > 0) {
      const dailyDrop = Math.max(0, -this.state.dailyRealizedPnl);
      this.state.dailyDrawdownPercent = Number(
        ((dailyDrop / this.state.dailyStartingEquity) * 100).toFixed(2)
      );

      if (
        dailyDrop >= this.riskConfig.maxDailyLossAmount ||
        this.state.dailyDrawdownPercent >= this.riskConfig.maxDailyLossPercent
      ) {
        this.state.isDailyLossCapHit = true;
      }
    }

    if (netProfit < 0) {
      this.state.consecutiveLossCount++;
      if (this.state.consecutiveLossCount >= this.riskConfig.consecutiveLossesLimit) {
        this.state.cooldownUntilTimestamp =
          now + this.riskConfig.cooldownPeriodMinutes * 60 * 1000;
      }
    } else {
      this.state.consecutiveLossCount = 0;
      this.state.cooldownUntilTimestamp = null;
    }
  }

  /**
   * ارزیابی چندلایه و قطعی سفارش پیش از ارسال به هسته اجرا (Pre-Trade Risk Gate)
   */
  public evaluateOrderRisk(
    intent: OrderIntentPayload,
    ledger: PortfolioLedgerState,
    marketSnapshot?: { bid: number; ask: number; timestamp?: number }
  ): RiskEvaluationResult {
    const now = intent.createdTimestamp || Date.now();
    const contractMultiplier = intent.symbol === 'XAUUSD' ? 100 : 100000;

    // ۱. بررسی کلید قطع اضطراری (Kill-Switch)
    if (this.state.isEmergencyKillSwitchActive) {
      return {
        isApproved: false,
        rejectReasonCode: 'KILL_SWITCH_ACTIVE',
        messageFa: `کلید قطع اضطراری فعال است (${this.state.killSwitchTriggerReason || 'عدم اجازه معامله'}).`,
        evaluatedRiskDollars: 0,
        evaluatedRiskPercent: 0,
        maxAllowedVolumeLots: 0,
      };
    }

    // ۲. بررسی سقف زیان روزانه (Daily Loss Cap)
    if (this.state.isDailyLossCapHit) {
      return {
        isApproved: false,
        rejectReasonCode: 'DAILY_LOSS_LIMIT_EXCEEDED',
        messageFa: `سقف زیان روزانه پر شده است (زیان روزانه: $${Math.abs(this.state.dailyRealizedPnl)}).`,
        evaluatedRiskDollars: 0,
        evaluatedRiskPercent: 0,
        maxAllowedVolumeLots: 0,
      };
    }

    // ۳. بررسی دوره خنک‌سازی زیان‌های متوالی (Consecutive Losses Cooldown)
    if (this.state.cooldownUntilTimestamp && now < this.state.cooldownUntilTimestamp) {
      const remainingMinutes = Math.ceil((this.state.cooldownUntilTimestamp - now) / 60000);
      return {
        isApproved: false,
        rejectReasonCode: 'CONSECUTIVE_LOSS_COOLDOWN',
        messageFa: `توقف اجباری به علت ${this.state.consecutiveLossCount} زیان متوالی (باقی‌مانده: ${remainingMinutes} دقیقه).`,
        evaluatedRiskDollars: 0,
        evaluatedRiskPercent: 0,
        maxAllowedVolumeLots: 0,
      };
    }

    // ۴. سقف کل دراودان حساب (Portfolio Max Drawdown Cap)
    if (ledger.maxDrawdownPercent >= this.riskConfig.maxDrawdownCapPercent) {
      return {
        isApproved: false,
        rejectReasonCode: 'PORTFOLIO_DRAWDOWN_LIMIT_EXCEEDED',
        messageFa: `دراودان کل سبد (${ledger.maxDrawdownPercent}%) از سقف مجاز (${this.riskConfig.maxDrawdownCapPercent}%) فراتر رفته است.`,
        evaluatedRiskDollars: 0,
        evaluatedRiskPercent: 0,
        maxAllowedVolumeLots: 0,
      };
    }

    // ۵. حداکثر تعداد پوزیشن‌های هم‌زمان باز (Concurrent Positions)
    const openPositionsCount = ledger.positions.filter(p => p.isOpen).length;
    if (openPositionsCount >= this.riskConfig.maxOpenPositions) {
      return {
        isApproved: false,
        rejectReasonCode: 'MAX_CONCURRENT_POSITIONS_REACHED',
        messageFa: `تعداد پوزیشن‌های باز جاری (${openPositionsCount}) به حداکثر سقف مجاز (${this.riskConfig.maxOpenPositions}) رسیده است.`,
        evaluatedRiskDollars: 0,
        evaluatedRiskPercent: 0,
        maxAllowedVolumeLots: 0,
      };
    }

    // ۶. بررسی کلید قطع اسپرد در اسنپ‌شات قیمت جاری (Spread Circuit Breaker)
    if (marketSnapshot && marketSnapshot.bid > 0 && marketSnapshot.ask > 0) {
      const pipSize = DriftMonitor.getPipSize(intent.symbol);
      const currentSpreadPips = Number(
        ((marketSnapshot.ask - marketSnapshot.bid) / pipSize).toFixed(2)
      );
      const maxAllowedSpread = this.circuitConfig.maxSpreadPips[intent.symbol];

      if (currentSpreadPips > maxAllowedSpread) {
        this.state.activeCircuitBreakers.spreadSpike = true;
        return {
          isApproved: false,
          rejectReasonCode: 'SPREAD_CIRCUIT_BREAKER_TRIGGERED',
          messageFa: `اسپرد جاری (${currentSpreadPips} پیپ) فراتر از آستانه مجاز کلید قطع (${maxAllowedSpread} پیپ) است.`,
          evaluatedRiskDollars: 0,
          evaluatedRiskPercent: 0,
          maxAllowedVolumeLots: 0,
        };
      } else {
        this.state.activeCircuitBreakers.spreadSpike = false;
      }
    }

    // ۷. محافظت از گپ تعطیلات آخر هفته (Weekend Gap Protection - جمعه بعد از ساعت مشخص شده)
    if (this.circuitConfig.enforceWeekendGapProtection) {
      const date = new Date(now);
      const dayOfWeek = date.getUTCDay(); // 5 = Friday
      const hourUtc = date.getUTCHours();

      if (dayOfWeek === 5 && hourUtc >= this.circuitConfig.fridayCutoffHourUtc) {
        this.state.activeCircuitBreakers.weekendGap = true;
        return {
          isApproved: false,
          rejectReasonCode: 'WEEKEND_PROTECTION_BLOCKED',
          messageFa: `ورود به معامله در ساعات پایانی روز جمعه برای جلوگیری از ریسک گپ دوشنبه مسدود است.`,
          evaluatedRiskDollars: 0,
          evaluatedRiskPercent: 0,
          maxAllowedVolumeLots: 0,
        };
      } else {
        this.state.activeCircuitBreakers.weekendGap = false;
      }
    }

    // ۸. محاسبه دقیق مقدار ریسک دلاری و درصدی سفارش
    const slDistance = Math.abs(intent.entryPrice - intent.stopLossPrice);
    const riskDollars = Number((slDistance * intent.volumeLots * contractMultiplier).toFixed(2));
    const equity = ledger.equity > 0 ? ledger.equity : ledger.initialCash;
    const riskPercent = Number(((riskDollars / equity) * 100).toFixed(2));

    // محاسبه حداکثر حجم مجاز بر اساس ۱ درصد ریسک
    const maxRiskDollarsAllowed = Math.min(
      this.riskConfig.maxRiskPerTradeAmount,
      (equity * this.riskConfig.maxRiskPerTradePercent) / 100
    );
    const maxAllowedLots = Number(
      (maxRiskDollarsAllowed / (slDistance * contractMultiplier)).toFixed(2)
    );

    if (
      riskDollars > this.riskConfig.maxRiskPerTradeAmount ||
      riskPercent > this.riskConfig.maxRiskPerTradePercent
    ) {
      return {
        isApproved: false,
        rejectReasonCode: 'MAX_RISK_PER_TRADE_EXCEEDED',
        messageFa: `ریسک معامله ($${riskDollars} معادل ${riskPercent}%) بیشتر از سقف مجاز (${this.riskConfig.maxRiskPerTradePercent}% معادل $${maxRiskDollarsAllowed}) است.`,
        evaluatedRiskDollars: riskDollars,
        evaluatedRiskPercent: riskPercent,
        maxAllowedVolumeLots: Math.max(0.01, maxAllowedLots),
      };
    }

    // ۹. بررسی حداقل نسبت ریسک به ریوارد (Risk/Reward >= 1.0)
    const tpDistance = Math.abs(intent.takeProfitPrice - intent.entryPrice);
    const rewardRiskRatio = tpDistance / slDistance;
    if (rewardRiskRatio < 1.0) {
      return {
        isApproved: false,
        rejectReasonCode: 'INVALID_RISK_REWARD_RATIO',
        messageFa: `نسبت سود به ریسک (${rewardRiskRatio.toFixed(2)}R) کمتر از حداقل استاندارد (1.0R) است.`,
        evaluatedRiskDollars: riskDollars,
        evaluatedRiskPercent: riskPercent,
        maxAllowedVolumeLots: intent.volumeLots,
      };
    }

    // تاییدیه کامل سفارش
    return {
      isApproved: true,
      messageFa: 'سفارش تمام فیلترها و استانداردهای سخت‌گیرانه محافظ ریسک W4 را با موفقیت پاس کرد.',
      evaluatedRiskDollars: riskDollars,
      evaluatedRiskPercent: riskPercent,
      maxAllowedVolumeLots: intent.volumeLots,
    };
  }

  /**
   * اسکن و اعمال محافظت‌های تریلینگ و سربه‌سر روی تمامی پوزیشن‌های باز
   */
  public applyProtectionsToPositions(
    positions: PositionLedgerEntry[],
    quotes: Record<SymbolId, { bid: number; ask: number }>,
    now: number = Date.now()
  ): ProtectionEvent[] {
    const events: ProtectionEvent[] = [];

    for (const pos of positions) {
      if (!pos.isOpen) continue;
      const quote = quotes[pos.symbol];
      if (!quote) continue;

      const event = this.trailingManager.evaluatePosition(pos, quote.bid, quote.ask, now);
      if (event) {
        // به‌روزرسانی حد ضرر پوزیشن
        pos.stopLossPrice = event.newStopLoss;
        this.protectionHistory.push(event);
        events.push(event);
      }
    }

    return events;
  }
}
