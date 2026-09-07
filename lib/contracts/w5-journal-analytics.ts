// lib/contracts/w5-journal-analytics.ts
// قراردادها و انواع داده‌ای بسته W5: ژورنال خودکار، تفکیک آلفا، ممیزی سوگیری‌های رفتاری و ارزیابی MAE/MFE
// Post-Trade Analytics, Alpha/Friction Attribution, Behavioral Bias Radar & Discipline Scorecard

import { SymbolId } from './market';
import { TradeDirection } from './journal';

/**
 * رکورد کامل چرخه حیات معامله در ژورنال خودکار W5
 */
export interface TradeLifecycleRecord {
  tradeId: string;
  intentId: string;
  correlationId: string;
  causationId: string;
  brokerOrderId?: string;
  symbol: SymbolId;
  direction: TradeDirection;
  volumeLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  exitPrice: number;
  openedAt: number;
  closedAt: number;
  exitReason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'BREAKEVEN_HIT' | 'TRAILING_STOP_HIT' | 'RECONCILED_CLOSED';
  
  // محاسبات مالی پایه
  plannedRiskAmount: number;         // ریسک برنامه‌ریزی‌شده دلاری (1R)
  realizedGrossPnL: number;          // سود/زیان ناخالص دلاری
  brokerCommission: number;          // کارمزد پرداختی بروکر (دلار)
  slippagePips: number;              // لغزش نرخ در ورود و خروج (پیپ)
  slippageCostDollar: number;        // هزینه مالی لغزش نرخ (دلار)
  realizedNetPnL: number;            // سود/زیان خالص نهایی پس از کسر کارمزد و لغزش
  realizedRMultiple: number;         // ضریب بازدهی نسبت به ریسک خالص (R-Multiple)

  // معیارهای نوسان نامطلوب و مطلوب در طول حیات معامله (Excursion Analytics)
  maxAdverseExcursionPips: number;   // MAE: حداکثر نوسان در جهت زیان پیش از خروج
  maxAdverseExcursionDollar: number; // MAE دلاری
  maxFavorableExcursionPips: number; // MFE: حداکثر نوسان در جهت سود پیش از خروج
  maxFavorableExcursionDollar: number;// MFE دلاری
  exitEfficiencyPercent: number;     // نسبت بهره‌وری خروج = سود حاصله تقسیم بر حداکثر سود ممکن در معامله (۰ تا ۱۰۰٪)

  // یادداشت‌های فنی و برچسب‌های ستاپ
  setupGrade?: 'A+' | 'A' | 'B' | 'C';
  traderNotesFa?: string;
  behavioralTags?: string[];
}

/**
 * تفکیک آلفای استراتژی در مقابل اصطکاک اجرای بروکر (Alpha vs Friction Attribution)
 */
export interface AlphaFrictionAttribution {
  totalTrades: number;
  grossAlphaDollar: number;          // سود ناخالص خام استراتژی بدون اصطکاک
  grossAlphaR: number;               // بازدهی ناخالص به R
  totalCommissionsDollar: number;    // کل کارمزد بروکر
  totalCommissionR: number;          // افت R ناشی از کارمزد
  totalSlippageDollar: number;       // کل هزینه لغزش نرخ
  totalSlippageR: number;            // افت R ناشی از لغزش نرخ
  totalFrictionDollar: number;       // مجموع اصطکاک اجرایی (کارمزد + لغزش)
  totalFrictionR: number;            // مجموع افت R ناشی از اصطکاک
  netRealizedProfitDollar: number;   // سود خالص نهایی
  netRealizedR: number;              // بازدهی خالص نهایی به R
  frictionDragPercent: number;       // نسبت فرسایش سود به علت اصطکاک به کل آلفای ناخالص
}

/**
 * نوع و شناسه سوگیری‌های رفتاری و روان‌شناختی معامله‌گر
 */
export type BehavioralBiasType =
  | 'REVENGE_TRADING'     // معامله انتقامی: ورود عجولانه در کمتر از ۱۰ دقیقه پس از یک معامله زیان‌ده
  | 'OVERTRADING'         // بیش‌معامله‌گری: ثبت بیش از ۳ معامله در یک نشست یا پنجره ۲ ساعته
  | 'FOMO_CHASING'        // تعقیب قیمت و فومو: ورود در فاصله‌ای دورتر از محدوده امن FVG
  | 'PREMATURE_EXIT'      // خروج شتاب‌زده: بستن دستی پوزیشن سودده قبل از رسیدن به ۱R در حالی که ستاپ به سمت TP می‌رفته
  | 'RECKLESS_SIZING';    // حجم‌گیری بی‌قاعده: افزایش ناگهانی ریسک به بیش از سقف ۱ درصدی

/**
 * رخداد شناسایی‌شده سوگیری رفتاری
 */
export interface BehavioralAuditFlag {
  id: string;
  tradeId: string;
  biasType: BehavioralBiasType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  detectedAt: number;
  symbol: SymbolId;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  metricDetails: string;
  coolingAdviceFa: string;
}

/**
 * کارنامه انضباط و رعایت قوانین معامله‌گر (Discipline Scorecard)
 */
export interface DisciplineScorecard {
  overallScore: number;              // نمره انضباط کل از ۱۰۰
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  riskSizingAdherencePercent: number;// رعایت سقف ریسک ۱ درصدی
  stopLossAdherencePercent: number;  // پایبندی به عدم دستکاری نامطلوب حد ضرر
  patienceScorePercent: number;      // نمره شکیبایی و عدم ورود در فومو
  activeBiasesCount: number;         // تعداد هشدارهای فعال رفتاری
  totalPenaltyPoints: number;        // کل امتیازات کسرشده به دلیل نقض قوانین
  strengthsFa: string[];             // نقاط قوت عملکرد معامله‌گر
  improvementsFa: string[];          // حوزه‌های نیازمند بهبود و انضباط
}

/**
 * توزیع آماری بازدهی بر حسب ساعات شبانه‌روز و روزهای هفته (Session Edge Distribution)
 */
export interface SessionTimeDistribution {
  hourlyEdge: {
    hourUtc: number;
    tradesCount: number;
    winRatePercent: number;
    netProfitDollar: number;
    netR: number;
  }[];
  dayOfWeekEdge: {
    dayName: string;
    dayNameFa: string;
    tradesCount: number;
    winRatePercent: number;
    netProfitDollar: number;
    netR: number;
  }[];
  bestTradingWindowFa: string;
  worstTradingWindowFa: string;
}
