// lib/contracts/alerts.ts
// قراردادهای سیستم هشدار هوشمند چندتایم‌فریمه و ارسال رویدادهای معاملاتی
// ۱۰۰٪ آفلاین با پشتیبانی از وب‌پوش، وب‌هوک و صدای سنتز شده

import { SymbolId, Timeframe } from './market';
import { MarketRegimeType, TradingStyleType } from './regimes';

export type AlertSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type AlertTriggerType =
  | 'MULTITF_CONFLUENCE'      // همگرایی جهت H1 با ستاپ ورود M5
  | 'ALPHA_COUNCIL_QUORUM'    // تاییدیه با نمره بالای شورای هوش مصنوعی
  | 'MONTE_CARLO_HIGH_PROB'   // احتمال بالای ۷۰٪ در شبیه‌سازی ۱۰۰۰ مسیره مونت‌کارلو
  | 'REGIME_SHIFT'            // تغییر رژیم بازار (مثلاً از رنج به پرنوسان اخباری)
  | 'KEY_LEVEL_APPROACH'      // نزدیک شدن قیمت به سطوح PDH / PDL / آسیا
  | 'KILL_SWITCH_ENGAGED';    // فعال‌سازی فیوز اضطراری

export interface SignalAlert {
  id: string;
  timestamp: number;
  symbol: SymbolId;
  timeframe: Timeframe;
  triggerType: AlertTriggerType;
  severity: AlertSeverity;
  titleFa: string;
  titleEn: string;
  messageFa: string;
  messageEn: string;
  direction?: 'BUY' | 'SELL';
  priceAtTrigger: number;
  entryPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  riskRewardRatio?: number;
  tradingStyle?: TradingStyleType;
  marketRegime?: MarketRegimeType;
  alphaConsensusScore?: number;
  monteCarloTpProbability?: number;
  isRead: boolean;
  actionTaken?: 'EXECUTED' | 'DISMISSED' | 'EXPIRED';
}

export interface AlertDispatcherConfig {
  enableAudio: boolean;
  enableBrowserNotifications: boolean;
  enableWebhook: boolean;
  webhookUrl?: string;
  minAlphaConsensusScore: number;     // حداقل نمره شورا برای ارسال هشدار (پیش‌فرض: ۷۰)
  minMonteCarloTpProbability: number; // حداقل احتمال تارگت مونت‌کارلو (پیش‌فرض: ۶۰٪)
  activeStyles: TradingStyleType[];   // سبک‌های مجاز برای صدور هشدار
  cooldownMs: number;                 // فاصله زمانی بین دو هشدار یکسان برای جلوگیری از اسپم (پیش‌فرض: ۶۰۰۰۰ میلی‌ثانیه)
}

export const DEFAULT_ALERT_DISPATCHER_CONFIG: AlertDispatcherConfig = {
  enableAudio: true,
  enableBrowserNotifications: false,
  enableWebhook: false,
  minAlphaConsensusScore: 70,
  minMonteCarloTpProbability: 60,
  activeStyles: ['SCALP_M1_M5', 'SMC_INTRADAY', 'SWING_MACRO', 'MEAN_REVERSION'],
  cooldownMs: 60000,
};
