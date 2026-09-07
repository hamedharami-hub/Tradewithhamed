/**
 * قراردادها و ساختارهای داده برای طبقه‌بندی رژیم‌های بازار و سبک‌های معاملاتی چندگانه
 * Market Regimes & Multi-Style Trading Contracts (2026 Evolution)
 */

export type MarketRegimeType =
  | 'TRENDING_BULLISH'   // روند صعودی پرقدرت و یک‌طرفه
  | 'TRENDING_BEARISH'   // روند نزولی پرقدرت و یک‌طرفه
  | 'CHOPPY_RANGING'     // بازار ساید‌وی، نوسانی و کم‌عمق
  | 'HIGH_VOL_NEWS'      // تلاطم غیرعادی و شوک اخبار (اسپایک‌های قیمت)
  | 'COMPRESSION';       // انقباض شدید دامنه و حجم، در آستانه شکست

export type TradingStyleType =
  | 'SCALP_M1_M5'        // اسکلپینگ سریع ۱ و ۵ دقیقه با خروج‌های نقطه‌ای
  | 'SMC_INTRADAY'       // اسمارت مانی / پرایس‌اکشن کلاسیک (FVG + BOS + سشن‌ها)
  | 'SWING_MACRO'        // سوئینگ کلان H1 تا D1 با اهداف چندروزه
  | 'MEAN_REVERSION';    // بازگشت به میانگین در باندهای اشباع و بازارهای رنج

export interface MarketRegimeMetrics {
  adxTrendStrength: number;     // شاخص قدرت روند (۰ تا ۱۰۰)
  emaSlope: number;              // شیب میانگین متحرک (مثبت صعودی، منفی نزولی)
  atrRatio: number;              // نسبت ATR فعلی به میانگین ۵۰ کندل اخیر
  compressionRatio: number;      // نسبت پهنای باند نوسان به میانگین (کوچک = فشرده)
  volumeZScore: number;          // انحراف معیار حجم نسبت به میانگین
  priceVsEmaPercent: number;     // فاصله درصدی قیمت تا خط مرکزی
}

export interface MarketRegimeAnalysis {
  regime: MarketRegimeType;
  confidence: number;            // درصد اطمینان مدل از تشخیص رژیم (۰ تا ۱۰۰)
  headlineFa: string;            // تیتر فارسی رژیم جاری
  summaryFa: string;             // شرح تحلیلی به زبان فارسی
  recommendedStyles: TradingStyleType[]; // سبک‌های دارای مزیت در این شرایط
  blockedStyles: TradingStyleType[];     // سبک‌های پرریسک و مسدودشده
  metrics: MarketRegimeMetrics;
  timestamp: number;
}

export interface TradingStyleConfig {
  id: TradingStyleType;
  nameFa: string;
  nameEn: string;
  recommendedTf: string;
  defaultRiskReward: number;
  maxHoldingTimeMinutes: number;
  favorableRegimes: MarketRegimeType[];
  prohibitedRegimes: MarketRegimeType[];
}

export const TRADING_STYLES_CONFIG: Record<TradingStyleType, TradingStyleConfig> = {
  SCALP_M1_M5: {
    id: 'SCALP_M1_M5',
    nameFa: 'اسکلپینگ سریع (M1/M5)',
    nameEn: 'Fast Momentum Scalp',
    recommendedTf: '5M',
    defaultRiskReward: 1.5,
    maxHoldingTimeMinutes: 20,
    favorableRegimes: ['CHOPPY_RANGING', 'COMPRESSION', 'TRENDING_BULLISH', 'TRENDING_BEARISH'],
    prohibitedRegimes: ['HIGH_VOL_NEWS'],
  },
  SMC_INTRADAY: {
    id: 'SMC_INTRADAY',
    nameFa: 'اسمارت‌مانی درون‌روز (SMC/S0)',
    nameEn: 'SMC Intraday Price Action',
    recommendedTf: '5M / 15M',
    defaultRiskReward: 2.5,
    maxHoldingTimeMinutes: 240,
    favorableRegimes: ['TRENDING_BULLISH', 'TRENDING_BEARISH', 'COMPRESSION'],
    prohibitedRegimes: ['HIGH_VOL_NEWS'],
  },
  SWING_MACRO: {
    id: 'SWING_MACRO',
    nameFa: 'سوئینگ و ترند کلان (H1/H4)',
    nameEn: 'Macro Trend Swing',
    recommendedTf: '1H / 4H',
    defaultRiskReward: 3.5,
    maxHoldingTimeMinutes: 2880, // ۲ روز
    favorableRegimes: ['TRENDING_BULLISH', 'TRENDING_BEARISH'],
    prohibitedRegimes: ['CHOPPY_RANGING', 'HIGH_VOL_NEWS'],
  },
  MEAN_REVERSION: {
    id: 'MEAN_REVERSION',
    nameFa: 'بازگشت به میانگین (Mean Reversion)',
    nameEn: 'Statistical Mean Reversion',
    recommendedTf: '5M / 15M',
    defaultRiskReward: 1.8,
    maxHoldingTimeMinutes: 60,
    favorableRegimes: ['CHOPPY_RANGING', 'COMPRESSION'],
    prohibitedRegimes: ['TRENDING_BULLISH', 'TRENDING_BEARISH', 'HIGH_VOL_NEWS'],
  },
};
