/**
 * قراردادهای فیچرهای ساختاری و پرایس‌اکشن:
 * پیوت‌های سقف و کف، نواحی FVG و سوییپ نقدینگی با تضمین عدم نگاه به آینده
 */
import { Timeframe } from './market';

export interface SwingPoint {
  id: string;
  type: 'HIGH' | 'LOW';
  price: number;
  candleIndex: number;
  timestamp: number;
  confirmedAtIndex: number; // ایندکس کندلی که با بسته شدنش پیوت قطعی شد (جلوگیری از بایاس آینده)
  timeframe: Timeframe;
  broken: boolean;
}

export interface FairValueGap {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  top: number;
  bottom: number;
  candleIndex: number;
  timestamp: number;
  timeframe: Timeframe;
  mitigated: boolean;
}

export interface LiquiditySweep {
  id: string;
  targetSwingId: string;
  swingType: 'HIGH' | 'LOW';
  sweptPrice: number;
  extremePrice: number;
  candleIndex: number;
  timestamp: number;
  timeframe: Timeframe;
  confirmed: boolean;
}
