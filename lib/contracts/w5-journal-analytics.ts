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

/**
 * نمونه داده‌های تاریخی غنی‌شده W5 با تضمین ثبات و عدم نیاز به بارگذاری سنگین
 */
export const DEFAULT_W5_TRADES: TradeLifecycleRecord[] = [
  {
    tradeId: 'TR-101',
    intentId: 'INT-W5-01',
    correlationId: 'CORR-01',
    causationId: 'CAUSE-01',
    brokerOrderId: 'CT-ORD-110291',
    symbol: 'XAUUSD',
    direction: 'BUY',
    volumeLots: 0.05,
    entryPrice: 2642.5,
    stopLossPrice: 2637.5,
    takeProfitPrice: 2657.5,
    exitPrice: 2657.5,
    openedAt: 1725613200000,
    closedAt: 1725615600000,
    exitReason: 'TP_HIT',
    plannedRiskAmount: 25.0,
    realizedGrossPnL: 75.0,
    brokerCommission: 0.35,
    slippagePips: 0.3,
    slippageCostDollar: 0.15,
    realizedNetPnL: 74.5,
    realizedRMultiple: 2.98,
    maxAdverseExcursionPips: 8.0,
    maxAdverseExcursionDollar: 4.0,
    maxFavorableExcursionPips: 155.0,
    maxFavorableExcursionDollar: 77.5,
    exitEfficiencyPercent: 96.8,
    setupGrade: 'A+',
    traderNotesFa: 'جاروب نقدینگی کف آسیا با تایید کندل تهاجمی ۵ دقیقه‌ای و خروج در سقف FVG ۴ ساعته.',
  },
  {
    tradeId: 'TR-102',
    intentId: 'INT-W5-02',
    correlationId: 'CORR-02',
    causationId: 'CAUSE-02',
    brokerOrderId: 'CT-ORD-110292',
    symbol: 'EURUSD',
    direction: 'SELL',
    volumeLots: 0.06,
    entryPrice: 1.0865,
    stopLossPrice: 1.0895,
    takeProfitPrice: 1.0775,
    exitPrice: 1.0895,
    openedAt: 1725610200000,
    closedAt: 1725611400000,
    exitReason: 'SL_HIT',
    plannedRiskAmount: 18.0,
    realizedGrossPnL: -18.0,
    brokerCommission: 0.36,
    slippagePips: 0.5,
    slippageCostDollar: 0.3,
    realizedNetPnL: -18.66,
    realizedRMultiple: -1.04,
    maxAdverseExcursionPips: 30.0,
    maxAdverseExcursionDollar: 18.0,
    maxFavorableExcursionPips: 6.0,
    maxFavorableExcursionDollar: 3.6,
    exitEfficiencyPercent: 0,
    setupGrade: 'B',
    traderNotesFa: 'شکست سقف ساختار قبل از زمان بهینه سشن. خروج با حد ضرر استاندارد بدون دستکاری.',
  },
  {
    tradeId: 'TR-103',
    intentId: 'INT-W5-03',
    correlationId: 'CORR-03',
    causationId: 'CAUSE-03',
    brokerOrderId: 'CT-ORD-110293',
    symbol: 'XAUUSD',
    direction: 'BUY',
    volumeLots: 0.04,
    entryPrice: 2640.0,
    stopLossPrice: 2635.0,
    takeProfitPrice: 2655.0,
    exitPrice: 2655.0,
    openedAt: 1725616800000,
    closedAt: 1725619200000,
    exitReason: 'TP_HIT',
    plannedRiskAmount: 20.0,
    realizedGrossPnL: 60.0,
    brokerCommission: 0.28,
    slippagePips: 0.2,
    slippageCostDollar: 0.08,
    realizedNetPnL: 59.64,
    realizedRMultiple: 2.98,
    maxAdverseExcursionPips: 4.0,
    maxAdverseExcursionDollar: 1.6,
    maxFavorableExcursionPips: 152.0,
    maxFavorableExcursionDollar: 60.8,
    exitEfficiencyPercent: 98.7,
    setupGrade: 'A',
    traderNotesFa: 'ورود مجدد پس از اصلاح سالم در نشست لندن. انضباط کامل در حفظ حد سود.',
  },
  {
    tradeId: 'TR-104',
    intentId: 'INT-W5-04',
    correlationId: 'CORR-04',
    causationId: 'CAUSE-04',
    brokerOrderId: 'CT-ORD-110294',
    symbol: 'XAUUSD',
    direction: 'SELL',
    volumeLots: 0.03,
    entryPrice: 2656.0,
    stopLossPrice: 2661.0,
    takeProfitPrice: 2641.0,
    exitPrice: 2650.0,
    openedAt: 1725624000000,
    closedAt: 1725626400000,
    exitReason: 'MANUAL_CLOSE',
    plannedRiskAmount: 15.0,
    realizedGrossPnL: 18.0,
    brokerCommission: 0.21,
    slippagePips: 0.4,
    slippageCostDollar: 0.12,
    realizedNetPnL: 17.67,
    realizedRMultiple: 1.18,
    maxAdverseExcursionPips: 12.0,
    maxAdverseExcursionDollar: 3.6,
    maxFavorableExcursionPips: 150.0,
    maxFavorableExcursionDollar: 45.0,
    exitEfficiencyPercent: 40.0,
    setupGrade: 'B',
    traderNotesFa: 'خروج دستی قبل از تارگت به علت انتشار خبر نوسانی FOMC.',
  },
];
