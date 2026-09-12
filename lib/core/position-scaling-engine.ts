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
import { calculateDeterministicRisk } from './risk-calculator';

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
    const minAtr = symbol === 'XAUUSD' ? 1.5 : symbol === 'USDJPY' ? 0.15 : symbol === 'BTCUSD' ? 250 : 0.001;
    const atr = Math.max(currentAtr, minAtr);
    const priceDecimals = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;

    // محاسبه فاصله حد ضرر (1.2 برابر ATR)
    const slPipsDistance = Number((atr * 1.2).toFixed(priceDecimals));
    const stopLossPrice =
      direction === 'BUY'
        ? Number((currentPrice - slPipsDistance).toFixed(priceDecimals))
        : Number((currentPrice + slPipsDistance).toFixed(priceDecimals));

    const slDistance = Math.abs(currentPrice - stopLossPrice);

    // محاسبه تارگت‌های پله‌ای ۱ و ۲
    const tp1Distance = slDistance * config.tp1RRMultiplier;
    const tp2Distance = slDistance * config.tp2RRMultiplier;

    const tp1Price =
      direction === 'BUY'
        ? Number((currentPrice + tp1Distance).toFixed(priceDecimals))
        : Number((currentPrice - tp1Distance).toFixed(priceDecimals));

    const tp2Price =
      direction === 'BUY'
        ? Number((currentPrice + tp2Distance).toFixed(priceDecimals))
        : Number((currentPrice - tp2Distance).toFixed(priceDecimals));

    const takeProfitPrice = config.enabled ? tp2Price : tp1Price;

    // محاسبه قطعی و یکپارچه ریسک با سقف ۰٫۲۵٪ و گردکردن رو به پایین (Floor)
    const riskResult = calculateDeterministicRisk({
      symbol,
      direction,
      entryPrice: currentPrice,
      stopLossPrice,
      takeProfitPrice,
      accountEquity,
      riskPercentage: riskPercent,
    });

    const calculatedLots = riskResult.adjustedVolumeLots;

    return {
      id: `INSTANT-${direction}-${Date.now()}`,
      symbol,
      direction,
      riskPercent: riskResult.plannedRiskPercent || riskPercent,
      calculatedLots,
      entryPrice: currentPrice,
      stopLossPrice,
      takeProfitPrice,
      tp1Price,
      tp2Price,
      partialTP: config,
      timestamp: Date.now(),
      isValid: riskResult.isValid && calculatedLots >= 0.01,
      errorFa: riskResult.isValid ? undefined : riskResult.explanation,
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
      const commission = Number((closeVolume * 6.0).toFixed(2));
      const quoteToUsdRate = position.symbol === 'USDJPY' ? 1 / Math.max(position.entryPrice, 0.0001) : 1;
      const realizedPnl = Number((closeVolume * winPips * spec.contractSize * quoteToUsdRate - commission).toFixed(2));

      // محاسبه حد ضرر جدید در نقطه ورود همراه با بافر اسپرد (Risk-Free)
      const buffer = config.breakevenBufferPips * spec.pipSize;
      const priceDecimals = position.symbol === 'XAUUSD' || position.symbol === 'BTCUSD' ? 2 : position.symbol === 'USDJPY' ? 3 : 5;
      const newStopLoss =
        position.direction === 'BUY'
          ? Number((position.entryPrice + buffer).toFixed(priceDecimals))
          : Number((position.entryPrice - buffer).toFixed(priceDecimals));

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
