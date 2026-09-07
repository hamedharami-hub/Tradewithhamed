import { SymbolId } from './market';
import { CandidateDirection } from './strategy';

/**
 * قراردادها و ساختارهای داده برای کاکپیت تاکتیکی ترید سریع، خروج پله‌ای و Kill-Switch
 * Tactical Cockpit & Instant Execution Contracts (Phase 2 Evolution)
 */

export interface PartialTPConfig {
  enabled: boolean;
  tp1Ratio: number;          // درصد حجم خروج در تارگت اول (پیش‌فرض ۰٫۵۰ معادل ۵۰٪)
  tp1RRMultiplier: number;   // ضریب R:R تارگت اول (مثلاً 1.2R یا 1.5R)
  tp2Ratio: number;          // درصد حجم باقیمانده (۵۰٪)
  tp2RRMultiplier: number;   // ضریب R:R تارگت دوم (مثلاً 2.5R یا 3.0R)
  autoBreakevenOnTP1: boolean; // جابجایی خودکار استاپ به نقطه ورود در زمان تاچ TP1
  breakevenBufferPips: number; // بافر اضافی اسپرد جهت تضمین سود صفر خالص (۰٫۱ پیپ)
}

export interface InstantOrderIntent {
  id: string;
  symbol: SymbolId;
  direction: CandidateDirection;
  riskPercent: number;
  calculatedLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  tp1Price?: number;
  tp2Price?: number;
  partialTP: PartialTPConfig;
  timestamp: number;
}

export interface KillSwitchEvent {
  id: string;
  timestamp: number;
  triggerSource: 'MANUAL_PANIC' | 'DAILY_DRAWDOWN_FUSE' | 'HIGH_VOLATILITY';
  closedPositionsCount: number;
  cancelledOrdersCount: number;
  netRealizedPnl: number;
  summaryFa: string;
}

export const DEFAULT_PARTIAL_TP_CONFIG: PartialTPConfig = {
  enabled: true,
  tp1Ratio: 0.5,
  tp1RRMultiplier: 1.2,
  tp2Ratio: 0.5,
  tp2RRMultiplier: 2.5,
  autoBreakevenOnTP1: true,
  breakevenBufferPips: 0.1,
};
