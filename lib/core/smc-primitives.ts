// lib/core/smc-primitives.ts
// کتابخانه محاسبات قطعی و استاندارد مفاهیم اسمارت‌مانی (SMC Primitives) بدون نگاه به آینده (Anti Look-Ahead)
// کلیه مفاهیم به عنوان «تعاریف عملیاتی آزمون‌پذیر» پیاده‌سازی شده‌اند و ادعای کشف نیت پنهان یا سفارشات بین‌بانکی را ندارند.

import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import { SYMBOL_SPECS } from '../contracts/market';
import { calculateWilderATR } from './atr';

export interface ConfirmedSwing {
  id: string;
  type: 'HIGH' | 'LOW';
  price: number;
  candleIndex: number;
  timestamp: number;
  availableAt: number; // زمانی که پس از confirmation bars قطعی شده است
  method: 'FRACTAL_PIVOT' | 'ATR_REVERSAL';
}

export interface BosResult {
  detected: boolean;
  type?: 'BULLISH' | 'BEARISH';
  breakType?: 'CLOSE_BREAK' | 'WICK_BREAK';
  breakPrice?: number;
  brokenSwing?: ConfirmedSwing;
  candleIndex?: number;
  timestamp?: number;
  availableAt?: number;
  evidenceId?: string;
  reasonCode?: string;
}

export interface ChochResult {
  detected: boolean;
  type?: 'BULLISH_CHOCH' | 'BEARISH_CHOCH';
  brokenSwing?: ConfirmedSwing;
  priorTrend?: 'BULLISH' | 'BEARISH';
  candleIndex?: number;
  timestamp?: number;
  availableAt?: number;
  evidenceId?: string;
}

export interface LiquiditySweepResult {
  detected: boolean;
  type?: 'HIGH_SWEEP' | 'LOW_SWEEP';
  targetLevel?: number;
  extremePrice?: number;
  penetrationPips?: number;
  reclaimMode?: 'CLOSE_RECLAIM' | 'WICK_REJECTION';
  candleIndex?: number;
  timestamp?: number;
  availableAt?: number;
  evidenceId?: string;
  reasonCode?: string;
}

export interface DisplacementResult {
  detected: boolean;
  type?: 'BULLISH_DISPLACEMENT' | 'BEARISH_DISPLACEMENT';
  bodySize: number;
  bodyToAtrRatio: number;
  bodyToRangeRatio: number;
  candleIndex: number;
  timestamp: number;
  availableAt: number;
  evidenceId?: string;
}

export interface FvgPrimitive {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  measurement: 'WICK_TO_WICK' | 'BODY_TO_BODY';
  top: number;
  bottom: number;
  midpoint: number; // Consequent Encroachment (50%)
  formedAtIndex: number;
  formedAtTimestamp: number;
  availableAt: number; // زمان بسته شدن کندل سوم
  status: 'OPEN' | 'FIRST_TOUCH' | 'MIDPOINT_TOUCH' | 'FULL_FILL' | 'INVALIDATED';
  mitigatedAtIndex?: number;
}

export interface OrderBlockPrimitive {
  id: string;
  type: 'BULLISH_OB' | 'BEARISH_OB';
  candleIndex: number;
  timestamp: number;
  open: number;
  close: number;
  high: number;
  low: number;
  zoneTop: number;
  zoneBottom: number;
  zoneMidpoint: number;
  zoneSource: 'BODY' | 'FULL_RANGE';
  confirmedByBosAtIndex: number;
  availableAt: number; // پس از بسته شدن کندل شکست BOS
  status: 'ACTIVE' | 'FIRST_RETEST' | 'MIDPOINT' | 'FULL_MITIGATION' | 'INVALIDATED';
}

export interface PremiumDiscountResult {
  equilibrium: number;
  premiumZoneStart: number;
  discountZoneEnd: number;
  currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  swingHighPrice: number;
  swingLowPrice: number;
  percentile: number; // 0 to 100
}

export class SmcPrimitives {
  /**
   * ۱. الف: شناسایی پیوت‌های قطعی سووینگ (Confirmed Swing) با فرکتال متقارن
   * تضمین ضد نگاه به آینده: کندل i تنها پس از بسته شدن rightBars کندل بعدی معتبر است.
   */
  public static detectFractalSwings(
    candles: Candle[],
    leftBars = 2,
    rightBars = 2,
    timeframe: Timeframe = '5M'
  ): ConfirmedSwing[] {
    const swings: ConfirmedSwing[] = [];
    if (candles.length < leftBars + rightBars + 1) return swings;

    for (let i = leftBars; i < candles.length - rightBars; i++) {
      const c = candles[i];
      if (!c.isClosed) continue;

      let isHigh = true;
      let isLow = true;

      for (let k = 1; k <= leftBars; k++) {
        if (candles[i - k].high >= c.high) isHigh = false;
        if (candles[i - k].low <= c.low) isLow = false;
      }
      for (let k = 1; k <= rightBars; k++) {
        if (!candles[i + k].isClosed) {
          isHigh = false;
          isLow = false;
          break;
        }
        if (candles[i + k].high >= c.high) isHigh = false;
        if (candles[i + k].low <= c.low) isLow = false;
      }

      const availableAt = candles[i + rightBars].timestamp;

      if (isHigh) {
        swings.push({
          id: `SWING-H-${timeframe}-${c.timestamp}`,
          type: 'HIGH',
          price: c.high,
          candleIndex: i,
          timestamp: c.timestamp,
          availableAt,
          method: 'FRACTAL_PIVOT',
        });
      }
      if (isLow) {
        swings.push({
          id: `SWING-L-${timeframe}-${c.timestamp}`,
          type: 'LOW',
          price: c.low,
          candleIndex: i,
          timestamp: c.timestamp,
          availableAt,
          method: 'FRACTAL_PIVOT',
        });
      }
    }
    return swings;
  }

  /**
   * ۱. ب: شناسایی سووینگ‌ها با مدل بازگشت ATR (ATR Reversal)
   */
  public static detectAtrReversalSwings(
    candles: Candle[],
    atrPeriod = 14,
    reversalMultiplier = 2.0,
    timeframe: Timeframe = '5M'
  ): ConfirmedSwing[] {
    const swings: ConfirmedSwing[] = [];
    if (candles.length < atrPeriod + 5) return swings;

    const atrs = calculateWilderATR(candles, atrPeriod);
    let trend: 'UP' | 'DOWN' = 'UP';
    let extremePrice = candles[0].high;
    let extremeIdx = 0;

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      if (!c.isClosed) continue;
      const currentAtr = atrs[Math.min(i, atrs.length - 1)] || 0.0010;
      const reversalDist = currentAtr * reversalMultiplier;

      if (trend === 'UP') {
        if (c.high > extremePrice) {
          extremePrice = c.high;
          extremeIdx = i;
        } else if (extremePrice - c.close >= reversalDist) {
          // چرخش روند از صعودی به نزولی؛ ثبت سقف در extremeIdx
          swings.push({
            id: `ATR-SWING-H-${timeframe}-${candles[extremeIdx].timestamp}`,
            type: 'HIGH',
            price: extremePrice,
            candleIndex: extremeIdx,
            timestamp: candles[extremeIdx].timestamp,
            availableAt: c.timestamp, // زمان کندل تاییدکننده چرخش
            method: 'ATR_REVERSAL',
          });
          trend = 'DOWN';
          extremePrice = c.low;
          extremeIdx = i;
        }
      } else {
        if (c.low < extremePrice) {
          extremePrice = c.low;
          extremeIdx = i;
        } else if (c.close - extremePrice >= reversalDist) {
          // چرخش روند از نزولی به صعودی؛ ثبت کف در extremeIdx
          swings.push({
            id: `ATR-SWING-L-${timeframe}-${candles[extremeIdx].timestamp}`,
            type: 'LOW',
            price: extremePrice,
            candleIndex: extremeIdx,
            timestamp: candles[extremeIdx].timestamp,
            availableAt: c.timestamp,
            method: 'ATR_REVERSAL',
          });
          trend = 'UP';
          extremePrice = c.high;
          extremeIdx = i;
        }
      }
    }
    return swings;
  }

  /**
   * ۲. شکست ساختار (BOS): تفکیک میان شکست با کلوز (CLOSE_BREAK) و نفوذ سایه (WICK_BREAK)
   */
  public static evaluateBos(
    candle: Candle,
    candleIndex: number,
    confirmedSwings: ConfirmedSwing[],
    symbol: SymbolId,
    mode: 'CLOSE_BREAK' | 'WICK_BREAK' = 'CLOSE_BREAK',
    bufferPips = 0
  ): BosResult {
    const pipVal = SYMBOL_SPECS[symbol]?.pipSize || 0.0001;
    const bufferDist = bufferPips * pipVal;

    // فقط سووینگ‌هایی که قبل از این کندل قطعی شده‌اند قابل مقایسه هستند
    const visibleSwings = confirmedSwings.filter(s => s.availableAt <= candle.timestamp && s.candleIndex < candleIndex);
    if (visibleSwings.length === 0) return { detected: false };

    const lastHigh = visibleSwings.filter(s => s.type === 'HIGH').slice(-1)[0];
    const lastLow = visibleSwings.filter(s => s.type === 'LOW').slice(-1)[0];

    // شکست سقف (BULLISH BOS)
    if (lastHigh) {
      const targetPrice = lastHigh.price + bufferDist;
      const isBroken = mode === 'CLOSE_BREAK' ? candle.close > targetPrice : candle.high > targetPrice;
      if (isBroken) {
        return {
          detected: true,
          type: 'BULLISH',
          breakType: mode,
          breakPrice: mode === 'CLOSE_BREAK' ? candle.close : candle.high,
          brokenSwing: lastHigh,
          candleIndex,
          timestamp: candle.timestamp,
          availableAt: candle.timestamp,
          evidenceId: `BOS-BULL-${lastHigh.id}-${candle.timestamp}`,
        };
      }
    }

    // شکست کف (BEARISH BOS)
    if (lastLow) {
      const targetPrice = lastLow.price - bufferDist;
      const isBroken = mode === 'CLOSE_BREAK' ? candle.close < targetPrice : candle.low < targetPrice;
      if (isBroken) {
        return {
          detected: true,
          type: 'BEARISH',
          breakType: mode,
          breakPrice: mode === 'CLOSE_BREAK' ? candle.close : candle.low,
          brokenSwing: lastLow,
          candleIndex,
          timestamp: candle.timestamp,
          availableAt: candle.timestamp,
          evidenceId: `BOS-BEAR-${lastLow.id}-${candle.timestamp}`,
        };
      }
    }

    return { detected: false };
  }

  /**
   * ۳. تغییر فاز روند / ساختار (CHoCH / MSS):
   * نقض آخرین سووینگ مخالف در راستای تغییر جهت روند
   */
  public static evaluateChoch(
    candle: Candle,
    candleIndex: number,
    confirmedSwings: ConfirmedSwing[],
    currentTrend: 'BULLISH' | 'BEARISH'
  ): ChochResult {
    const visibleSwings = confirmedSwings.filter(s => s.availableAt <= candle.timestamp && s.candleIndex < candleIndex);
    if (visibleSwings.length === 0) return { detected: false };

    if (currentTrend === 'BULLISH') {
      // در روند صعودی، شکست آخرین کف تاییدشده نشانه CHoCH نزولی است
      const lastLow = visibleSwings.filter(s => s.type === 'LOW').slice(-1)[0];
      if (lastLow && candle.close < lastLow.price) {
        return {
          detected: true,
          type: 'BEARISH_CHOCH',
          brokenSwing: lastLow,
          priorTrend: 'BULLISH',
          candleIndex,
          timestamp: candle.timestamp,
          availableAt: candle.timestamp,
          evidenceId: `CHOCH-BEAR-${lastLow.id}-${candle.timestamp}`,
        };
      }
    } else {
      // در روند نزولی، شکست آخرین سقف تاییدشده نشانه CHoCH صعودی است
      const lastHigh = visibleSwings.filter(s => s.type === 'HIGH').slice(-1)[0];
      if (lastHigh && candle.close > lastHigh.price) {
        return {
          detected: true,
          type: 'BULLISH_CHOCH',
          brokenSwing: lastHigh,
          priorTrend: 'BEARISH',
          candleIndex,
          timestamp: candle.timestamp,
          availableAt: candle.timestamp,
          evidenceId: `CHOCH-BULL-${lastHigh.id}-${candle.timestamp}`,
        };
      }
    }
    return { detected: false };
  }

  /**
   * ۴. سوییپ نقدینگی (Liquidity Sweep):
   * تفکیک حالت Reclaim کلوز داخل سطح و Rejection صرف شدو
   */
  public static evaluateLiquiditySweep(
    candle: Candle,
    candleIndex: number,
    confirmedSwings: ConfirmedSwing[],
    symbol: SymbolId,
    mode: 'CLOSE_RECLAIM' | 'WICK_REJECTION' = 'CLOSE_RECLAIM',
    minPenetrationPips = 0.5
  ): LiquiditySweepResult {
    const pipVal = SYMBOL_SPECS[symbol]?.pipSize || 0.0001;
    const minPenetrationDist = minPenetrationPips * pipVal;

    const visibleSwings = confirmedSwings.filter(s => s.availableAt <= candle.timestamp && s.candleIndex < candleIndex);
    if (visibleSwings.length === 0) return { detected: false };

    // بررسی سوییپ سقف (HIGH_SWEEP -> کاندیدای فروش)
    const recentHighs = visibleSwings.filter(s => s.type === 'HIGH').slice(-3);
    for (const high of recentHighs) {
      const penetration = candle.high - high.price;
      if (penetration >= minPenetrationDist) {
        const isReclaimed = mode === 'CLOSE_RECLAIM' ? candle.close < high.price : candle.close < candle.high;
        if (isReclaimed) {
          return {
            detected: true,
            type: 'HIGH_SWEEP',
            targetLevel: high.price,
            extremePrice: candle.high,
            penetrationPips: Number((penetration / pipVal).toFixed(1)),
            reclaimMode: mode,
            candleIndex,
            timestamp: candle.timestamp,
            availableAt: candle.timestamp,
            evidenceId: `SWEEP-H-${high.id}-${candle.timestamp}`,
            reasonCode: 'HIGH_LIQUIDITY_SWEPT',
          };
        }
      }
    }

    // بررسی سوییپ کف (LOW_SWEEP -> کاندیدای خرید)
    const recentLows = visibleSwings.filter(s => s.type === 'LOW').slice(-3);
    for (const low of recentLows) {
      const penetration = low.price - candle.low;
      if (penetration >= minPenetrationDist) {
        const isReclaimed = mode === 'CLOSE_RECLAIM' ? candle.close > low.price : candle.close > candle.low;
        if (isReclaimed) {
          return {
            detected: true,
            type: 'LOW_SWEEP',
            targetLevel: low.price,
            extremePrice: candle.low,
            penetrationPips: Number((penetration / pipVal).toFixed(1)),
            reclaimMode: mode,
            candleIndex,
            timestamp: candle.timestamp,
            availableAt: candle.timestamp,
            evidenceId: `SWEEP-L-${low.id}-${candle.timestamp}`,
            reasonCode: 'LOW_LIQUIDITY_SWEPT',
          };
        }
      }
    }

    return { detected: false };
  }

  /**
   * ۵. شتاب و جابجایی تهاجمی قیمت (Displacement)
   */
  public static evaluateDisplacement(
    candle: Candle,
    candleIndex: number,
    atrValue: number,
    bodyToAtrMin = 1.2,
    bodyToRangeMin = 0.6
  ): DisplacementResult {
    const range = candle.high - candle.low;
    const bodySize = Math.abs(candle.close - candle.open);
    const bodyToRange = range > 0 ? bodySize / range : 0;
    const bodyToAtr = atrValue > 0 ? bodySize / atrValue : 0;

    const isBullish = candle.close > candle.open;
    const isDisplacement = bodyToAtr >= bodyToAtrMin && bodyToRange >= bodyToRangeMin;

    return {
      detected: isDisplacement,
      type: isDisplacement ? (isBullish ? 'BULLISH_DISPLACEMENT' : 'BEARISH_DISPLACEMENT') : undefined,
      bodySize,
      bodyToAtrRatio: Number(bodyToAtr.toFixed(2)),
      bodyToRangeRatio: Number(bodyToRange.toFixed(2)),
      candleIndex,
      timestamp: candle.timestamp,
      availableAt: candle.timestamp,
      evidenceId: isDisplacement ? `DISP-${isBullish ? 'BULL' : 'BEAR'}-${candle.timestamp}` : undefined,
    };
  }

  /**
   * ۶. گپ ارزش منصفانه ۳ کندلی (FVG)
   * تفکیک WICK_TO_WICK و BODY_TO_BODY
   */
  public static detectFvg(
    candles: Candle[],
    index: number,
    mode: 'WICK_TO_WICK' | 'BODY_TO_BODY' = 'WICK_TO_WICK',
    minGapPips = 0,
    symbol: SymbolId = 'EURUSD'
  ): FvgPrimitive | null {
    if (index < 2 || index >= candles.length) return null;
    const c1 = candles[index - 2];
    const c2 = candles[index - 1];
    const c3 = candles[index];

    if (!c1.isClosed || !c2.isClosed || !c3.isClosed) return null;

    const pipVal = SYMBOL_SPECS[symbol]?.pipSize || 0.0001;
    const minGapDist = minGapPips * pipVal;

    // FVG صعودی (Bullish): کف کندل ۳ بالاتر از سقف کندل ۱ است
    const bullBottom = mode === 'WICK_TO_WICK' ? c1.high : Math.max(c1.open, c1.close);
    const bullTop = mode === 'WICK_TO_WICK' ? c3.low : Math.min(c3.open, c3.close);

    if (bullTop - bullBottom > minGapDist) {
      return {
        id: `FVG-BULL-${mode}-${c2.timestamp}`,
        type: 'BULLISH',
        measurement: mode,
        top: bullTop,
        bottom: bullBottom,
        midpoint: Number(((bullTop + bullBottom) / 2).toFixed(5)),
        formedAtIndex: index - 1,
        formedAtTimestamp: c2.timestamp,
        availableAt: c3.timestamp, // دقیقاً در زمان بسته شدن کندل سوم
        status: 'OPEN',
      };
    }

    // FVG نزولی (Bearish): سقف کندل ۳ پایین‌تر از کف کندل ۱ است
    const bearTop = mode === 'WICK_TO_WICK' ? c1.low : Math.min(c1.open, c1.close);
    const bearBottom = mode === 'WICK_TO_WICK' ? c3.high : Math.max(c3.open, c3.close);

    if (bearTop - bearBottom > minGapDist) {
      return {
        id: `FVG-BEAR-${mode}-${c2.timestamp}`,
        type: 'BEARISH',
        measurement: mode,
        top: bearTop,
        bottom: bearBottom,
        midpoint: Number(((bearTop + bearBottom) / 2).toFixed(5)),
        formedAtIndex: index - 1,
        formedAtTimestamp: c2.timestamp,
        availableAt: c3.timestamp,
        status: 'OPEN',
      };
    }

    return null;
  }

  /**
   * ۷. اردر بلاک (Order Block)
   * آخرین کندل مخالف قبل از شکست BOS تاییدشده
   */
  public static extractOrderBlock(
    candles: Candle[],
    bos: BosResult,
    zoneSource: 'BODY' | 'FULL_RANGE' = 'BODY'
  ): OrderBlockPrimitive | null {
    if (!bos.detected || !bos.brokenSwing || bos.candleIndex === undefined) return null;

    const startIdx = Math.max(0, bos.brokenSwing.candleIndex);
    const endIdx = bos.candleIndex - 1;

    if (bos.type === 'BULLISH') {
      // جستجوی آخرین کندل نزولی (خرسی) قبل از شکست صعودی
      for (let k = endIdx; k >= startIdx; k--) {
        const c = candles[k];
        if (c.close < c.open) {
          const zoneTop = zoneSource === 'BODY' ? c.open : c.high;
          const zoneBottom = zoneSource === 'BODY' ? c.close : c.low;
          return {
            id: `OB-BULL-${c.timestamp}`,
            type: 'BULLISH_OB',
            candleIndex: k,
            timestamp: c.timestamp,
            open: c.open,
            close: c.close,
            high: c.high,
            low: c.low,
            zoneTop,
            zoneBottom,
            zoneMidpoint: Number(((zoneTop + zoneBottom) / 2).toFixed(5)),
            zoneSource,
            confirmedByBosAtIndex: bos.candleIndex,
            availableAt: bos.availableAt || candles[bos.candleIndex].timestamp,
            status: 'ACTIVE',
          };
        }
      }
    } else if (bos.type === 'BEARISH') {
      // جستجوی آخرین کندل صعودی (گاوی) قبل از شکست نزولی
      for (let k = endIdx; k >= startIdx; k--) {
        const c = candles[k];
        if (c.close > c.open) {
          const zoneTop = zoneSource === 'BODY' ? c.close : c.high;
          const zoneBottom = zoneSource === 'BODY' ? c.open : c.low;
          return {
            id: `OB-BEAR-${c.timestamp}`,
            type: 'BEARISH_OB',
            candleIndex: k,
            timestamp: c.timestamp,
            open: c.open,
            close: c.close,
            high: c.high,
            low: c.low,
            zoneTop,
            zoneBottom,
            zoneMidpoint: Number(((zoneTop + zoneBottom) / 2).toFixed(5)),
            zoneSource,
            confirmedByBosAtIndex: bos.candleIndex,
            availableAt: bos.availableAt || candles[bos.candleIndex].timestamp,
            status: 'ACTIVE',
          };
        }
      }
    }
    return null;
  }

  /**
   * ۸. ناحیه تعادل، گران و ارزان (Premium / Discount)
   * محاسبه صرفاً از روی سووینگ‌های تاییدشده گذشته بدون نگاه به آینده
   */
  public static calculatePremiumDiscount(
    currentPrice: number,
    confirmedSwings: ConfirmedSwing[],
    evaluatedTimestamp: number
  ): PremiumDiscountResult | null {
    const visibleSwings = confirmedSwings.filter(s => s.availableAt <= evaluatedTimestamp);
    const lastHigh = visibleSwings.filter(s => s.type === 'HIGH').slice(-1)[0];
    const lastLow = visibleSwings.filter(s => s.type === 'LOW').slice(-1)[0];

    if (!lastHigh || !lastLow || lastHigh.price <= lastLow.price) return null;

    const range = lastHigh.price - lastLow.price;
    const equilibrium = lastLow.price + range * 0.5;
    const percentile = ((currentPrice - lastLow.price) / range) * 100;

    let currentZone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM' = 'EQUILIBRIUM';
    if (percentile > 52) currentZone = 'PREMIUM';
    else if (percentile < 48) currentZone = 'DISCOUNT';

    return {
      equilibrium: Number(equilibrium.toFixed(5)),
      premiumZoneStart: Number((lastLow.price + range * 0.52).toFixed(5)),
      discountZoneEnd: Number((lastLow.price + range * 0.48).toFixed(5)),
      currentZone,
      swingHighPrice: lastHigh.price,
      swingLowPrice: lastLow.price,
      percentile: Number(percentile.toFixed(1)),
    };
  }
}
