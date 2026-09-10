// lib/contracts/w4-risk-guardian.ts
// قراردادها و انواع داده‌ای بسته W4: سامانه محافظ ریسک بلادرنگ، مدیریت سبد و کلید قطع اضطراری
// Real-Time Risk Guardian, Dynamic Portfolio Sizing, Circuit Breakers & Trailing Engine

import { SymbolId } from './market';
import { OrderIntentPayload } from '../core/ports';

/**
 * پیکربندی بودجه ریسک و محدودیت‌های سرمایه‌گذاری
 */
export interface RiskBudgetConfig {
  maxDailyLossAmount: number;         // حداکثر زیان مجاز در یک روز معاملاتی (مثلاً ۳۰۰ دلار)
  maxDailyLossPercent: number;        // حداکثر درصد افت روزانه (مثلاً ۳.۰٪)
  maxDrawdownCapPercent: number;      // سقف زیان کل سبد (مثلاً ۱۰٪)
  maxOpenPositions: number;           // حداکثر تعداد پوزیشن‌های هم‌زمان باز (مثلاً ۲)
  maxAccountLeverage: number;         // سقف اهرم موثر کل حساب (مثلاً ۱۰:۱)
  maxRiskPerTradePercent: number;     // سقف ریسک در هر تک معامله (مثلاً ۱.۰٪)
  maxRiskPerTradeAmount: number;      // سقف دلاری ریسک هر معامله (مثلاً ۱۰۰ دلار)
  consecutiveLossesLimit: number;     // حداکثر زیان‌های متوالی پیش از فعال‌سازی خنک‌سازی (مثلاً ۳)
  cooldownPeriodMinutes: number;      // مدت زمان مسدودسازی پس از زیان‌های متوالی (مثلاً ۶۰ دقیقه)
  enableAdaptiveRiskScaling?: boolean; // کاهش تطبیقی ریسک پس از زیان‌های متوالی (ضد تیلت)
}

/**
 * قوانین کلیدهای قطع نوسان و اخبار (Circuit Breakers)
 */
export interface CircuitBreakerConfig {
  maxSpreadPips: {
    XAUUSD: number;                   // حداکثر اسپرد مجاز طلا (مثلاً ۳.۵ پیپ = ۰.۳۵ دلار)
    EURUSD: number;                   // حداکثر اسپرد مجاز یورو (مثلاً ۲.۵ پیپ)
    GBPUSD: number;
    USDJPY: number;
    BTCUSD: number;
  };
  volatilitySpikeThresholdMultiplier: number; // ضریب جهش ناگهانی نوسان نسبت به میانگین ATR (مثلاً ۳.۰ برابر)
  blockNewsWindowsMinutesBefore: number;      // دقایق مسدودی پیش از اخبار قرمز
  blockNewsWindowsMinutesAfter: number;       // دقایق مسدودی پس از اخبار قرمز
  enforceWeekendGapProtection: boolean;       // جلوگیری از باز ماندن پوزیشن در تعطیلات آخر هفته
  fridayCutoffHourUtc: number;                // ساعت خروج اجباری جمعه (مثلاً ۲۱:۰۰ UTC)
}

/**
 * قوانین انتقال به نقطه سربه‌سر و تریلینگ استاپ (Breakeven & Trailing Protection)
 */
export interface ProtectionRuleConfig {
  enableAutoBreakeven: boolean;               // فعال بودن انتقال خودکار حد ضرر به نقطه ورود
  breakevenTriggerR: number;                  // ضریب سود جهت انتقال به سربه‌سر (مثلاً ۱.۵R یا ۲.۰R)
  breakevenBufferPips: number;                // بافر سود تضمینی بالای نقطه ورود برای پوشش کارمزد (مثلاً ۱ پیپ)
  enableTrailingStop: boolean;                // فعال بودن حد ضرر شناور
  trailingStepPips: number;                   // گام پیشروی تریلینگ استاپ
  trailingTriggerR: number;                   // ضریب سود جهت آغاز تریلینگ استاپ (مثلاً ۲.۵R)
  allowPartialProfitTaking: boolean;          // مجاز بودن سیو سود پله‌ای
  partialTakeProfitPercent: number;           // درصد حجم خروجی در تارگت اول (مثلاً ۵۰٪)
}

/**
 * وضعیت لحظه‌ای محافظ ریسک (Risk Guardian State)
 */
export interface RiskGuardianState {
  isEmergencyKillSwitchActive: boolean;       // آیا کلید قطع سراسری فعال است؟
  killSwitchTriggerReason: string | null;     // دلیل فعال‌سازی قطع سراسری
  killSwitchTimestamp: number | null;         // زمان فعال‌سازی
  dailyStartingEquity: number;                // ارزش کل حساب در ابتدای روز معاملاتی
  dailyRealizedPnl: number;                   // سود/زیان محقق‌شده در طول روز
  dailyDrawdownPercent: number;               // افت فعلی روز بر حسب درصد
  isDailyLossCapHit: boolean;                 // آیا سقف زیان روزانه پر شده است؟
  consecutiveLossCount: number;               // تعداد معاملات متوالی زیان‌ده
  cooldownUntilTimestamp: number | null;      // زمان خاتمه دوره خنک‌سازی
  activeCircuitBreakers: {
    spreadSpike: boolean;
    volatilitySpike: boolean;
    sessionClosed: boolean;
    weekendGap: boolean;
    newsSpike?: boolean;
  };
  todayClosedTradesCount: number;
}

/**
 * ارزیابی تایید یا رد سفارش از دیدگاه محافظ ریسک
 */
export interface RiskEvaluationResult {
  isApproved: boolean;
  rejectReasonCode?:
    | 'KILL_SWITCH_ACTIVE'
    | 'DAILY_LOSS_LIMIT_EXCEEDED'
    | 'PORTFOLIO_DRAWDOWN_LIMIT_EXCEEDED'
    | 'MAX_CONCURRENT_POSITIONS_REACHED'
    | 'MAX_RISK_PER_TRADE_EXCEEDED'
    | 'CONSECUTIVE_LOSS_COOLDOWN'
    | 'SPREAD_CIRCUIT_BREAKER_TRIGGERED'
    | 'VOLATILITY_SPIKE_DETECTED'
    | 'WEEKEND_PROTECTION_BLOCKED'
    | 'NEWS_BLACKOUT_ACTIVE'
    | 'INVALID_RISK_REWARD_RATIO';
  messageFa: string;
  evaluatedRiskDollars: number;
  evaluatedRiskPercent: number;
  maxAllowedVolumeLots: number;
}

/**
 * رویدادهای محافظتی پوزیشن‌های باز (سربه‌سر، تریلینگ و سیو سود)
 */
export interface ProtectionEvent {
  eventId: string;
  positionId: string;
  symbol: SymbolId;
  eventType: 'BREAKEVEN_MIGRATION' | 'TRAILING_STOP_UPDATED' | 'PARTIAL_TP_EXECUTED' | 'EMERGENCY_LIQUIDATION';
  previousStopLoss: number;
  newStopLoss: number;
  timestamp: number;
  notes: string;
}
