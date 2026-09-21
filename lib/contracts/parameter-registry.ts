// lib/contracts/parameter-registry.ts
// ممیزی تایپ‌سیف و رجیستری اثرگذاری پارامترهای استراتژی و سازگاری با تایم‌فریم‌ها

import { SymbolId, Timeframe } from './market';
import { TradingStyleType } from './regimes';

export type ParameterImplementationStatus =
  | 'ACTIVE'
  | 'PARTIAL'
  | 'NOT_IMPLEMENTED'
  | 'INCOMPATIBLE';

export interface ParameterRegistryEntry {
  parameterKey: string;
  nameFa: string;
  strategyFamily: TradingStyleType | 'COMMON';
  defaultValue: string | number | boolean;
  minimumValue?: number;
  maximumValue?: number;
  implementationStatus: ParameterImplementationStatus;
  consumedBy: string; // Component or function consuming it
  measurableEffects: string; // What measurably changes in the engine or ledger
  diagnosticReasonCodes: string[]; // Reasons logged if this causes rejection
  engineVersion: string;
  notesFa?: string;
}

/**
 * رجیستری جامع ممیزی پارامترهای استراتژی در پکیج ۳
 * تضمین می‌کند که هیچ کنترل فعالی حالت دکوراتیو ندارد و وضعیت همه پارامترها شفاف است.
 */
export const PARAMETER_EFFECT_REGISTRY: Record<string, ParameterRegistryEntry> = {
  // ─── Common Parameters ──────────────────────────────────────────────────
  directionMode: {
    parameterKey: 'directionMode',
    nameFa: 'جهت معامله مجاز',
    strategyFamily: 'COMMON',
    defaultValue: 'BOTH',
    implementationStatus: 'ACTIVE',
    consumedBy: 'ResearchLab.runBacktest & MultiStyleEngine',
    measurableEffects: 'فیلتر کامل کاندیداها بر اساس جهت BUY یا SELL؛ رد هر سفارشی که با جهت مجاز مغایرت دارد.',
    diagnosticReasonCodes: ['DIRECTION_FILTER_REJECTED'],
    engineVersion: '2.3.0',
  },
  riskRewardRatio: {
    parameterKey: 'riskRewardRatio',
    nameFa: 'نسبت ریسک به ریوارد هدف (R:R)',
    strategyFamily: 'COMMON',
    defaultValue: 2.0,
    minimumValue: 0.5,
    maximumValue: 10.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine (all styles)',
    measurableEffects: 'تعیین مستقیم قیمت حد سود (Take Profit) بر مبنای ضرب فاصله حد ضرر در نسبت R:R.',
    diagnosticReasonCodes: ['RR_TOO_LOW', 'INVALID_TP_PRICE'],
    engineVersion: '2.3.0',
  },
  stopLossMode: {
    parameterKey: 'stopLossMode',
    nameFa: 'شیوه محاسبه حد ضرر',
    strategyFamily: 'COMMON',
    defaultValue: 'ATR',
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine & ResearchLab.runBacktest',
    measurableEffects: 'محاسبه فاصله حد ضرر بر اساس ATR، پیوت‌های ساختار گذشته (STRUCTURE)، یا پیپ ثابت (FIXED_PIPS).',
    diagnosticReasonCodes: ['ZERO_STOP_DISTANCE', 'STOP_ON_WRONG_SIDE', 'STOP_TOO_CLOSE', 'STOP_TOO_FAR', 'INSUFFICIENT_ATR', 'INSUFFICIENT_STRUCTURE'],
    engineVersion: '2.3.0',
  },
  atrPeriod: {
    parameterKey: 'atrPeriod',
    nameFa: 'دوره زمانی ATR',
    strategyFamily: 'COMMON',
    defaultValue: 14,
    minimumValue: 5,
    maximumValue: 50,
    implementationStatus: 'ACTIVE',
    consumedBy: 'calculateWilderATR در تمام استراتژی‌ها',
    measurableEffects: 'تغییر نوسان‌پذیری مبنا در محاسبه فواصل حد ضرر پویا و بافر شکست کانال.',
    diagnosticReasonCodes: ['INSUFFICIENT_ATR_CANDLES'],
    engineVersion: '2.3.0',
  },
  atrMultiplier: {
    parameterKey: 'atrMultiplier',
    nameFa: 'ضریب ATR برای حد ضرر',
    strategyFamily: 'COMMON',
    defaultValue: 1.5,
    minimumValue: 0.1,
    maximumValue: 5.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine (Scalp, SMC, Breakout, Swing, MeanReversion)',
    measurableEffects: 'فاصله قیمت ورود تا حد ضرر مستقیماً بر اساس این ضریب تعیین و حجم معامله بازتنظیم می‌شود.',
    diagnosticReasonCodes: ['STOP_TOO_FAR', 'STOP_TOO_CLOSE'],
    engineVersion: '2.3.0',
  },
  orderType: {
    parameterKey: 'orderType',
    nameFa: 'نوع ارزیابی و ورود سفارش',
    strategyFamily: 'COMMON',
    defaultValue: 'LIMIT',
    implementationStatus: 'ACTIVE',
    consumedBy: 'EventDrivenExecutionEngine.processCandle',
    measurableEffects: 'سفارش MARKET در کندل بعد با اسپرد/اسلیپیج پر می‌شود؛ LIMIT فقط با رسیدن قیمت؛ STOP با عبور از سقف/کف.',
    diagnosticReasonCodes: ['LIMIT_EXPIRED_UNFILLED', 'STOP_NOT_TRIGGERED'],
    engineVersion: '2.3.0',
  },
  expiryBars: {
    parameterKey: 'expiryBars',
    nameFa: 'انقضای سفارش‌های معلق (بر حسب کندل)',
    strategyFamily: 'COMMON',
    defaultValue: 6,
    minimumValue: 1,
    maximumValue: 48,
    implementationStatus: 'ACTIVE',
    consumedBy: 'EventDrivenExecutionEngine.processCandle',
    measurableEffects: 'لغو خودکار سفارش‌های لیمیت و استاپ در صورتی که تا N کندل بعد فعال نشوند.',
    diagnosticReasonCodes: ['EXPIRED'],
    engineVersion: '2.3.0',
  },
  maxConcurrentPositions: {
    parameterKey: 'maxConcurrentPositions',
    nameFa: 'سقف پوزیشن‌های باز همزمان',
    strategyFamily: 'COMMON',
    defaultValue: 3,
    minimumValue: 1,
    maximumValue: 20,
    implementationStatus: 'ACTIVE',
    consumedBy: 'ResearchLab.runBacktest',
    measurableEffects: 'جلوگیری از ثبت سفارش جدید هنگامی که تعداد معاملات باز به این سقف رسیده باشد.',
    diagnosticReasonCodes: ['EXPOSURE_LIMIT_REACHED'],
    engineVersion: '2.3.0',
  },
  cooldownBars: {
    parameterKey: 'cooldownBars',
    nameFa: 'کندل‌های استراحت پس از بسته‌شدن معامله',
    strategyFamily: 'COMMON',
    defaultValue: 2,
    minimumValue: 0,
    maximumValue: 20,
    implementationStatus: 'ACTIVE',
    consumedBy: 'ResearchLab.runBacktest',
    measurableEffects: 'پس از بسته شدن یک پوزیشن، تا N کندل اجازه صدور کاندیدای جدید برای آن نماد/استراتژی داده نمی‌شود.',
    diagnosticReasonCodes: ['COOLDOWN_ACTIVE'],
    engineVersion: '2.3.0',
  },
  sessionFilter: {
    parameterKey: 'sessionFilter',
    nameFa: 'فیلتر سشن معاملاتی',
    strategyFamily: 'COMMON',
    defaultValue: 'ALL',
    implementationStatus: 'ACTIVE',
    consumedBy: 'SessionTimezoneEngine.isEntryAllowed',
    measurableEffects: 'رد کاندیداهایی که خارج از ساعات مجاز سشن یا پنجره‌های رول‌اور تشکیل شوند.',
    diagnosticReasonCodes: ['SESSION_REJECTED'],
    engineVersion: '2.3.0',
  },
  higherTimeframeFilter: {
    parameterKey: 'higherTimeframeFilter',
    nameFa: 'تاییدیه تایم‌فریم بالاتر (MTF)',
    strategyFamily: 'COMMON',
    defaultValue: false,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MtfFilterEngine & ResearchLab.runBacktest',
    measurableEffects: 'ارزیابی ترند، ساختار، مومنتوم یا نوسان‌پذیری در تایم‌فریم تاییدیه بدون نگاه به آینده.',
    diagnosticReasonCodes: ['MTF_TREND_OPPOSITE', 'MTF_STRUCTURE_INVALID', 'MTF_DATA_MISSING'],
    engineVersion: '2.3.0',
  },
  enableBreakeven: {
    parameterKey: 'enableBreakeven',
    nameFa: 'ریسک‌فری خودکار (Breakeven)',
    strategyFamily: 'COMMON',
    defaultValue: true,
    implementationStatus: 'ACTIVE',
    consumedBy: 'EventDrivenExecutionEngine.evaluatePositionExitOnCandle',
    measurableEffects: 'انتقال حد ضرر به قیمت ورود (یا ورود + هزینه) پس از رسیدن به آستانه R تعیین‌شده.',
    diagnosticReasonCodes: ['BREAKEVEN_TRIGGERED'],
    engineVersion: '2.3.0',
  },
  enablePartialTakeProfit: {
    parameterKey: 'enablePartialTakeProfit',
    nameFa: 'سیو سود پله‌ای (Partial Take-Profit)',
    strategyFamily: 'COMMON',
    defaultValue: false,
    implementationStatus: 'ACTIVE',
    consumedBy: 'EventDrivenExecutionEngine.evaluatePositionExitOnCandle',
    measurableEffects: 'بستن درصدی از حجم پوزیشن در آستانه R اولیه و تبدیل باقی حجم به معامله ریسک‌فری.',
    diagnosticReasonCodes: ['PARTIAL_TP_EXECUTED'],
    engineVersion: '2.3.0',
  },

  // ─── Trend Breakout Parameters ──────────────────────────────────────────
  channelPeriod: {
    parameterKey: 'channelPeriod',
    nameFa: 'دوره کانال دانچیان شکست',
    strategyFamily: 'TREND_BREAKOUT',
    defaultValue: 55,
    minimumValue: 10,
    maximumValue: 200,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateTrendBreakout',
    measurableEffects: 'تعداد کندل‌های گذشته برای تعیین سقف و کف کانال پرایس‌اکشن که شکست آن ملاک ورود است.',
    diagnosticReasonCodes: ['NO_CHANNEL_BREAKOUT'],
    engineVersion: '2.3.0',
  },
  fastEmaPeriod: {
    parameterKey: 'fastEmaPeriod',
    nameFa: 'دوره میانگین متحرک سریع',
    strategyFamily: 'TREND_BREAKOUT',
    defaultValue: 20,
    minimumValue: 5,
    maximumValue: 50,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateTrendBreakout',
    measurableEffects: 'تایید شیب شتاب مومنتوم کوتاه‌مدت در شکست کانال.',
    diagnosticReasonCodes: ['FAST_EMA_MISALIGNED'],
    engineVersion: '2.3.0',
  },
  slowEmaPeriod: {
    parameterKey: 'slowEmaPeriod',
    nameFa: 'دوره میانگین متحرک کند روند',
    strategyFamily: 'TREND_BREAKOUT',
    defaultValue: 200,
    minimumValue: 50,
    maximumValue: 500,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateTrendBreakout',
    measurableEffects: 'فیلتر روند کلان که شیب آن باید هم‌جهت با شکست کانال باشد.',
    diagnosticReasonCodes: ['SLOW_EMA_OPPOSITE'],
    engineVersion: '2.3.0',
  },
  breakoutBufferAtr: {
    parameterKey: 'breakoutBufferAtr',
    nameFa: 'بافر نفوذ فراتر از کانال (بر حسب ATR)',
    strategyFamily: 'TREND_BREAKOUT',
    defaultValue: 0.1,
    minimumValue: 0.0,
    maximumValue: 1.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateTrendBreakout',
    measurableEffects: 'نیاز به نفوذ کلوز کندل بیش از سقف/کف کانال به اندازه این ضریب از ATR جهت فیلتر شکست‌های جعلی.',
    diagnosticReasonCodes: ['BUFFER_INSUFFICIENT'],
    engineVersion: '2.3.0',
  },

  // ─── Mean Reversion Parameters ──────────────────────────────────────────
  lookbackPeriod: {
    parameterKey: 'lookbackPeriod',
    nameFa: 'دوره محاسبات انحراف معیار',
    strategyFamily: 'MEAN_REVERSION',
    defaultValue: 20,
    minimumValue: 10,
    maximumValue: 100,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateMeanReversion',
    measurableEffects: 'اندازه نمونه آماری برای میانگین و انحراف معیار Z-Score.',
    diagnosticReasonCodes: ['INSUFFICIENT_SAMPLE_SIZE'],
    engineVersion: '2.3.0',
  },
  zScoreThreshold: {
    parameterKey: 'zScoreThreshold',
    nameFa: 'آستانه انحراف ورود (Z-Score)',
    strategyFamily: 'MEAN_REVERSION',
    defaultValue: 2.0,
    minimumValue: 1.0,
    maximumValue: 4.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateMeanReversion',
    measurableEffects: 'فاصله قیمت از میانگین بر حسب مضرب انحراف معیار برای شناسایی اشباع خرید/فروش.',
    diagnosticReasonCodes: ['Z_SCORE_NOT_REACHED'],
    engineVersion: '2.3.0',
  },
  exitZScore: {
    parameterKey: 'exitZScore',
    nameFa: 'آستانه خروج تعادل (Z-Score)',
    strategyFamily: 'MEAN_REVERSION',
    defaultValue: 0.0,
    minimumValue: -1.0,
    maximumValue: 1.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateMeanReversion',
    measurableEffects: 'سطح هدف خروج که روی میانگین آماری باند تنظیم می‌شود.',
    diagnosticReasonCodes: ['MEAN_NOT_REACHED'],
    engineVersion: '2.3.0',
  },
  trendFilter: {
    parameterKey: 'trendFilter',
    nameFa: 'فیلتر روند کلان در بازگشت به میانگین',
    strategyFamily: 'MEAN_REVERSION',
    defaultValue: true,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateMeanReversion',
    measurableEffects: 'جلوگیری از معاملات خلاف روند قوی و ورود صرفاً در بازارهای خنثی یا پولبک‌های اصلاحی.',
    diagnosticReasonCodes: ['TREND_FILTER_BLOCKED_MR'],
    engineVersion: '2.3.0',
  },

  // ─── SMC Parameters ─────────────────────────────────────────────────────
  liquidityLookback: {
    parameterKey: 'liquidityLookback',
    nameFa: 'تعداد پیوت‌های نقدینگی اخیر',
    strategyFamily: 'SMC_INTRADAY',
    defaultValue: 3,
    minimumValue: 1,
    maximumValue: 10,
    implementationStatus: 'ACTIVE',
    consumedBy: 'evaluateS0Strategy (SMC Engine)',
    measurableEffects: 'تعداد پیوت‌های ماژور اخیر که نفوذ شدو به آن‌ها برای تایید سوییپ نقدینگی اسکن می‌شود.',
    diagnosticReasonCodes: ['NO_LIQUIDITY_SWEEP'],
    engineVersion: '2.3.0',
  },
  sweepThreshold: {
    parameterKey: 'sweepThreshold',
    nameFa: 'حداقل عمق سوییپ نقدینگی (پیپ)',
    strategyFamily: 'SMC_INTRADAY',
    defaultValue: 0.5,
    minimumValue: 0.1,
    maximumValue: 10.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'evaluateS0Strategy',
    measurableEffects: 'شدو باید حداقل به اندازه این آستانه از پیوت عبور کند و سپس کلوز داخل سطح بسته شود.',
    diagnosticReasonCodes: ['SWEEP_DEPTH_TOO_SMALL'],
    engineVersion: '2.3.0',
  },
  requireFvg: {
    parameterKey: 'requireFvg',
    nameFa: 'الزام وجود گپ ارزش منصفانه (FVG)',
    strategyFamily: 'SMC_INTRADAY',
    defaultValue: false,
    implementationStatus: 'PARTIAL',
    consumedBy: 'evaluateS0Strategy',
    measurableEffects: 'در نسخه فعلی عدم تعادل ۳ کندلی بررسی می‌شود؛ در صورت فعال بودن وزن امتیاز ستاپ را افزایش می‌دهد.',
    diagnosticReasonCodes: ['NO_FVG_CONFLUENCE'],
    engineVersion: '2.3.0',
    notesFa: 'در این نسخه پیاده‌سازی به صورت امتیاز کمکی است؛ فیلتر مسدودکننده کامل در پکیج بعد نهایی می‌شود.',
  },
  requireStructureBreak: {
    parameterKey: 'requireStructureBreak',
    nameFa: 'الزام شکست ساختار داخلی (mBOS/CHoCH)',
    strategyFamily: 'SMC_INTRADAY',
    defaultValue: true,
    implementationStatus: 'ACTIVE',
    consumedBy: 'evaluateS0Strategy',
    measurableEffects: 'تایید شکست سقف/کف ماینور قبل از صدور سیگنال سوییپ نقدینگی.',
    diagnosticReasonCodes: ['NO_STRUCTURE_BREAK'],
    engineVersion: '2.3.0',
  },

  // ─── Scalp Parameters ───────────────────────────────────────────────────
  'scalp.fastEma': {
    parameterKey: 'scalp.fastEma',
    nameFa: 'EMA سریع اسکلپ',
    strategyFamily: 'SCALP_M1_M5',
    defaultValue: 9,
    minimumValue: 3,
    maximumValue: 20,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateScalp',
    measurableEffects: 'تایید مومنتوم فوق‌سریع در راستای نفوذ کندل میکرو.',
    diagnosticReasonCodes: ['SCALP_FAST_EMA_MISALIGNED'],
    engineVersion: '2.3.0',
  },
  'scalp.slowEma': {
    parameterKey: 'scalp.slowEma',
    nameFa: 'EMA کند اسکلپ',
    strategyFamily: 'SCALP_M1_M5',
    defaultValue: 21,
    minimumValue: 10,
    maximumValue: 50,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateScalp',
    measurableEffects: 'تایید سوگیری جهت اسکلپ کوتاه‌مدت.',
    diagnosticReasonCodes: ['SCALP_SLOW_EMA_MISALIGNED'],
    engineVersion: '2.3.0',
  },
  'scalp.minAtr': {
    parameterKey: 'scalp.minAtr',
    nameFa: 'حداقل ATR برای فعال‌سازی اسکلپ',
    strategyFamily: 'SCALP_M1_M5',
    defaultValue: 0.0002,
    minimumValue: 0.00005,
    maximumValue: 0.01,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateScalp',
    measurableEffects: 'در بازارهای مرده و بدون نوسان از ورود اسکلپ جلوگیری می‌کند.',
    diagnosticReasonCodes: ['SCALP_ATR_TOO_LOW'],
    engineVersion: '2.3.0',
  },
  'scalp.session': {
    parameterKey: 'scalp.session',
    nameFa: 'سشن اختصاصی اسکلپ',
    strategyFamily: 'SCALP_M1_M5',
    defaultValue: 'LONDON_NEW_YORK_OVERLAP',
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateScalp',
    measurableEffects: 'محدود کردن اسکلپ فقط به پرنوسان‌ترین سشن‌ها.',
    diagnosticReasonCodes: ['SCALP_OUTSIDE_ALLOWED_SESSION'],
    engineVersion: '2.3.0',
  },

  // ─── Swing Parameters ───────────────────────────────────────────────────
  'swing.trendEma': {
    parameterKey: 'swing.trendEma',
    nameFa: 'EMA جهت روند سوئینگ',
    strategyFamily: 'SWING_MACRO',
    defaultValue: 50,
    minimumValue: 20,
    maximumValue: 200,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateSwing',
    measurableEffects: 'مبنای تعیین موقعیت قیمت نسبت به میانگین در حرکات سوئینگ.',
    diagnosticReasonCodes: ['SWING_EMA_OPPOSITE'],
    engineVersion: '2.3.0',
  },
  'swing.pullbackDepth': {
    parameterKey: 'swing.pullbackDepth',
    nameFa: 'حداقل عمق اصلاحی پولبک (بر حسب ATR)',
    strategyFamily: 'SWING_MACRO',
    defaultValue: 1.0,
    minimumValue: 0.2,
    maximumValue: 3.0,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateSwing',
    measurableEffects: 'اطمینان از اینکه معامله سوئینگ پس از اصلاح کافی وارد می‌شود نه در نوک قله/کف.',
    diagnosticReasonCodes: ['PULLBACK_INSUFFICIENT'],
    engineVersion: '2.3.0',
  },
  'swing.confirmationBars': {
    parameterKey: 'swing.confirmationBars',
    nameFa: 'کندل‌های تایید چرخش سوئینگ',
    strategyFamily: 'SWING_MACRO',
    defaultValue: 2,
    minimumValue: 1,
    maximumValue: 5,
    implementationStatus: 'ACTIVE',
    consumedBy: 'MultiStyleEngine.evaluateSwing',
    measurableEffects: 'تعداد کندل‌های بسته متوالی در جهت روند پس از پولبک برای صدور سیگنال تاییدشده.',
    diagnosticReasonCodes: ['SWING_CONFIRMATION_FAILED'],
    engineVersion: '2.3.0',
  },
};

/**
 * ماتریس جامع تطابق سبک‌های معاملاتی با تایم‌فریم‌ها
 */
export interface StyleTimeframeCompatibility {
  style: TradingStyleType;
  nameFa: string;
  recommendedTimeframes: Timeframe[];
  allowedTimeframes: Timeframe[];
  notRecommendedTimeframes: Timeframe[];
  incompatibleExplanationFa: string;
}

export const STRATEGY_TIMEFRAME_COMPATIBILITY: Record<TradingStyleType, StyleTimeframeCompatibility> = {
  SCALP_M1_M5: {
    style: 'SCALP_M1_M5',
    nameFa: 'اسکلپینگ سریع مومنتوم',
    recommendedTimeframes: ['1M', '5M'],
    allowedTimeframes: ['1M', '5M', '15M'],
    notRecommendedTimeframes: ['1H', '4H', 'D1', 'W1'],
    incompatibleExplanationFa: 'سبک اسکلپ بر پایه ریزساختار و سوییپ‌های فرار طراحی شده و اجرای آن در تایم‌فریم‌های ۴ ساعته و روزانه رفتار روندی ضعیفی ایجاد می‌کند.',
  },
  SMC_INTRADAY: {
    style: 'SMC_INTRADAY',
    nameFa: 'اسمارت‌مانی درون‌روز S0',
    recommendedTimeframes: ['5M', '15M', '1H'],
    allowedTimeframes: ['1M', '5M', '15M', '1H', '4H'],
    notRecommendedTimeframes: ['D1', 'W1'],
    incompatibleExplanationFa: 'سبک SMC برای سشن‌های روزانه و سوییپ نقدینگی در بازه‌های چندساعته بهینه‌سازی شده است.',
  },
  TREND_BREAKOUT: {
    style: 'TREND_BREAKOUT',
    nameFa: 'شکست کانال روندی',
    recommendedTimeframes: ['15M', '1H', '4H', 'D1'],
    allowedTimeframes: ['5M', '15M', '1H', '4H', 'D1'],
    notRecommendedTimeframes: ['1M'],
    incompatibleExplanationFa: 'شکست کانال نیازمند پایداری روند است و در تایم‌فریم ۱ دقیقه نویز و شکست‌های جعلی بسیار بالاست.',
  },
  MEAN_REVERSION: {
    style: 'MEAN_REVERSION',
    nameFa: 'بازگشت به میانگین آماری',
    recommendedTimeframes: ['5M', '15M', '1H'],
    allowedTimeframes: ['5M', '15M', '1H', '4H'],
    notRecommendedTimeframes: ['1M', 'D1', 'W1'],
    incompatibleExplanationFa: 'بازگشت به میانگین نیازمند حداقل ۶۰ کندل در رژیم رِنج است و در تایم‌فریم‌های بسیار بالا فرصت‌های اندک پدید می‌آورد.',
  },
  SWING_MACRO: {
    style: 'SWING_MACRO',
    nameFa: 'سوئینگ و ترند کلان',
    recommendedTimeframes: ['1H', '4H', 'D1'],
    allowedTimeframes: ['15M', '1H', '4H', 'D1', 'W1'],
    notRecommendedTimeframes: ['1M', '5M'],
    incompatibleExplanationFa: 'سوئینگ کلان اهداف بلندمدت دارد و در تایم‌فریم‌های ۱ و ۵ دقیقه اسلیپیج و کارمزد بیش از سود خواهد بود.',
  },
};

/**
 * بررسی سازگاری سبک با تایم‌فریم
 */
export function checkStyleTimeframeCompatibility(
  style: TradingStyleType,
  timeframe: Timeframe
): {
  isRecommended: boolean;
  isAllowed: boolean;
  isNotRecommended: boolean;
  explanationFa: string;
} {
  const config = STRATEGY_TIMEFRAME_COMPATIBILITY[style];
  if (!config) {
    return {
      isRecommended: true,
      isAllowed: true,
      isNotRecommended: false,
      explanationFa: '',
    };
  }

  const isRecommended = config.recommendedTimeframes.includes(timeframe);
  const isAllowed = config.allowedTimeframes.includes(timeframe);
  const isNotRecommended = config.notRecommendedTimeframes.includes(timeframe);

  return {
    isRecommended,
    isAllowed,
    isNotRecommended,
    explanationFa: isNotRecommended ? config.incompatibleExplanationFa : '',
  };
}

/**
 * شمارش پارامترهای ممیزی‌شده رجیستری
 */
export function getAuditedParameterCount(): number {
  return Object.keys(PARAMETER_EFFECT_REGISTRY).length;
}
