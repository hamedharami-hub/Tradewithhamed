import { Candle, SymbolId, SYMBOL_SPECS } from '../contracts/market';
import { CandidateDirection } from '../contracts/strategy';
import { SimulatedPosition } from '../contracts/orders';
import {
  DEFAULT_PARTIAL_TP_CONFIG,
  InstantOrderIntent,
  KillSwitchEvent,
  PartialTPConfig,
} from '../contracts/tactical-cockpit';
import { SimulatedBroker } from './simulated-broker';

/**
 * موتور مدیریت تاکتیکی پوزیشن، خروج پله‌ای و فیوز اضطراری (Tactical Position & Scaling Engine 2026)
 */
export class PositionScalingEngine {
  /**
   * محاسبه آنی پارامترهای اردر براکت ۱-کلیکی متناسب با درصد ریسک و نوسان جاری
   */
  public static calculateInstantBracket(
    symbol: SymbolId,
    direction: CandidateDirection,
    currentPrice: number,
    currentAtr: number,
    riskPercent: number,
    accountEquity: number,
    config: PartialTPConfig = DEFAULT_PARTIAL_TP_CONFIG
  ): InstantOrderIntent {
    const spec = SYMBOL_SPECS[symbol];
    const atr = Math.max(currentAtr, symbol === 'XAUUSD' ? 1.5 : 0.001);

    // محاسبه فاصله حد ضرر (1.2 برابر ATR)
    const slPipsDistance = Number((atr * 1.2).toFixed(symbol === 'XAUUSD' ? 2 : 5));
    const stopLossPrice =
      direction === 'BUY'
        ? Number((currentPrice - slPipsDistance).toFixed(symbol === 'XAUUSD' ? 2 : 5))
        : Number((currentPrice + slPipsDistance).toFixed(symbol === 'XAUUSD' ? 2 : 5));

    const slDistance = Math.abs(currentPrice - stopLossPrice);

    // محاسبه دقیق لات معامله بر مبنای ارزش ریسک
    const riskAmount = (accountEquity * riskPercent) / 100;
    const lossPerLot = slDistance * spec.contractSize;
    let calculatedLots = lossPerLot > 0 ? riskAmount / lossPerLot : spec.minLots;

    // رند کردن و کلمپ به حدود مجاز بروکر
    calculatedLots = Math.max(spec.minLots, Math.min(spec.maxLots, Number(calculatedLots.toFixed(2))));

    // محاسبه تارگت‌های پله‌ای ۱ و ۲
    const tp1Distance = slDistance * config.tp1RRMultiplier;
    const tp2Distance = slDistance * config.tp2RRMultiplier;

    const tp1Price =
      direction === 'BUY'
        ? Number((currentPrice + tp1Distance).toFixed(symbol === 'XAUUSD' ? 2 : 5))
        : Number((currentPrice - tp1Distance).toFixed(symbol === 'XAUUSD' ? 2 : 5));

    const tp2Price =
      direction === 'BUY'
        ? Number((currentPrice + tp2Distance).toFixed(symbol === 'XAUUSD' ? 2 : 5))
        : Number((currentPrice - tp2Distance).toFixed(symbol === 'XAUUSD' ? 2 : 5));

    return {
      id: `INSTANT-${direction}-${Date.now()}`,
      symbol,
      direction,
      riskPercent,
      calculatedLots,
      entryPrice: currentPrice,
      stopLossPrice,
      takeProfitPrice: config.enabled ? tp2Price : tp1Price,
      tp1Price,
      tp2Price,
      partialTP: config,
      timestamp: Date.now(),
    };
  }

  /**
   * ارزیابی خروج پله‌ای (Partial Take-Profit) و انتقال خودکار به نقطه ورود (Breakeven)
   */
  public static evaluatePositionLifecycle(
    position: SimulatedPosition,
    candle: Candle,
    tp1TargetPrice: number,
    config: PartialTPConfig = DEFAULT_PARTIAL_TP_CONFIG
  ): {
    actionTaken: 'NONE' | 'PARTIAL_CLOSE_AND_BREAKEVEN' | 'CLOSED_SL' | 'CLOSED_TP';
    realizedPnl: number;
    remainingLots: number;
    newStopLoss?: number;
    logFa?: string;
  } {
    if (!position.isOpen) {
      return { actionTaken: 'NONE', realizedPnl: 0, remainingLots: 0 };
    }

    const spec = SYMBOL_SPECS[position.symbol];

    // ۱. بررسی برخورد با TP1 (در صورتی که قبلاً پله‌ای بسته نشده باشد)
    const isTP1Hit =
      position.direction === 'BUY'
        ? candle.high >= tp1TargetPrice
        : candle.low <= tp1TargetPrice;

    if (config.enabled && isTP1Hit && (!position.partialCloseCount || position.partialCloseCount === 0)) {
      const closeVolume = Number((position.volumeLots * config.tp1Ratio).toFixed(2));
      const remainingLots = Number((position.volumeLots - closeVolume).toFixed(2));

      const winPips = Math.abs(tp1TargetPrice - position.entryPrice);
      const realizedPnl = Number((closeVolume * winPips * spec.contractSize).toFixed(2));

      // محاسبه حد ضرر جدید در نقطه ورود همراه با بافر اسپرد (Risk-Free)
      const buffer = config.breakevenBufferPips * spec.pipSize;
      const newStopLoss =
        position.direction === 'BUY'
          ? Number((position.entryPrice + buffer).toFixed(position.symbol === 'XAUUSD' ? 2 : 5))
          : Number((position.entryPrice - buffer).toFixed(position.symbol === 'XAUUSD' ? 2 : 5));

      return {
        actionTaken: 'PARTIAL_CLOSE_AND_BREAKEVEN',
        realizedPnl,
        remainingLots,
        newStopLoss,
        logFa: `تارگت اول (TP1) در قیمت ${tp1TargetPrice} لمس شد؛ ۵۰٪ حجم (${closeVolume} لات) با سود $${realizedPnl} ذخیره شد و حد ضرر به نقطه ورود (${newStopLoss}) منتقل گردید (معامله کاملاً ریسک‌فری شد).`,
      };
    }

    return { actionTaken: 'NONE', realizedPnl: 0, remainingLots: position.volumeLots };
  }

  /**
   * اجرای کلید فیوز اضطراری (Panic Kill-Switch): بستن آنی کلیه پوزیشن‌ها و لغو تمام سفارش‌ها
   */
  public static triggerPanicKillSwitch(
    broker: SimulatedBroker,
    source: 'MANUAL_PANIC' | 'DAILY_DRAWDOWN_FUSE' | 'HIGH_VOLATILITY' = 'MANUAL_PANIC'
  ): KillSwitchEvent {
    const result = broker.panicCloseAll();
    const eventId = `KILL-SWITCH-${Date.now()}`;

    const summaryFa = `کلید اضطراری با منشا ${
      source === 'MANUAL_PANIC' ? 'دستی تریدر' : source === 'DAILY_DRAWDOWN_FUSE' ? 'فیوز دراودان روزانه' : 'تلاطم غیرعادی'
    } فعال شد: تعداد ${result.closedPositionsCount} پوزیشن فورا بسته و ${result.cancelledOrdersCount} سفارش معلق لغو شدند. سود/زیان خالص محقق‌شده: $${result.netRealizedPnl}.`;

    return {
      id: eventId,
      timestamp: Date.now(),
      triggerSource: source,
      closedPositionsCount: result.closedPositionsCount,
      cancelledOrdersCount: result.cancelledOrdersCount,
      netRealizedPnl: result.netRealizedPnl,
      summaryFa,
    };
  }
}
