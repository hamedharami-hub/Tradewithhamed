import { Candle, SymbolId, Timeframe } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { detectSwingPoints } from './swings';
import { calculateWilderATR } from './atr';
import { StrategyParameters, getDefaultStrategyParameters } from '../contracts/strategy-parameters';

function timeframeToMs(timeframe: Timeframe): number {
  const durations: Record<Timeframe, number> = {
    '1M': 60_000,
    '5M': 5 * 60_000,
    '15M': 15 * 60_000,
    '1H': 60 * 60_000,
    '4H': 4 * 60 * 60_000,
    D1: 24 * 60 * 60_000,
    W1: 7 * 24 * 60 * 60_000,
  };
  return durations[timeframe] || 300_000;
}

/**
 * موتور استراتژی S0 بر مبنای سوییپ سطوح نقدینگی و تاییدیه کندل برگشتی
 */
export function evaluateS0Strategy(
  symbol: SymbolId,
  candles5M: Candle[],
  candles15M: Candle[],
  timeframe: Timeframe = '5M',
  params?: StrategyParameters
): StrategyCandidate | null {
  if (candles5M.length < 15) return null;

  const common = params?.common || getDefaultStrategyParameters('BALANCED').common;
  const smcParams = params?.smc || getDefaultStrategyParameters('BALANCED').smc;

  const canBuy = common.directionMode === 'BOTH' || common.directionMode === 'LONG_ONLY';
  const canSell = common.directionMode === 'BOTH' || common.directionMode === 'SHORT_ONLY';
  const rr = common.riskRewardRatio || 2.5;
  const expiryMs = (common.expiryBars || 6) * timeframeToMs(timeframe);
  const atrMultiplier = common.atrMultiplier || 0.3;
  const atrPeriod = common.atrPeriod || 14;
  const swingLookback = smcParams.liquidityLookback || 3;

  const currentIdx = candles5M.length - 1;
  const currentCandle = candles5M[currentIdx];
  if (!currentCandle.isClosed) return null;

  const swings = detectSwingPoints(candles5M, timeframe);
  // فقط پیوت‌هایی که تایید شده‌اند مجازند
  const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= currentIdx);
  if (confirmedSwings.length < 2) return null;

  const atrs = calculateWilderATR(candles5M, atrPeriod);
  const currentATR = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 2.5 : 0.0015;

  // بررسی سوییپ کف (کاندیدای BUY)
  if (canBuy) {
    const recentLows = confirmedSwings.filter(s => s.type === 'LOW').slice(-swingLookback);
    for (const low of recentLows) {
      // شرط سوییپ: شدو نفوذ کرده ولی کلوز کندل بالاتر از سطح بسته شده باشد
      if (currentCandle.low < low.price && currentCandle.close > low.price) {
        const entryPrice = currentCandle.close;
        const stopLossPrice = Number((currentCandle.low - currentATR * atrMultiplier).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        const slDistance = entryPrice - stopLossPrice;
        if (slDistance <= 0) continue;

        const takeProfitPrice = Number((entryPrice + slDistance * rr).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        const riskRewardRatio = Number(((takeProfitPrice - entryPrice) / slDistance).toFixed(2));

        return {
          id: `CAND-BUY-${currentCandle.timestamp}`,
          strategyName: 'S0-proposed Intraday (Sweep Reversal)',
          symbol,
          timeframe,
          direction: 'BUY',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio,
          evidenceIds: {
            sweepId: `SWEEP-${low.id}`,
            contextSwingId: low.id,
          },
          rationale: `سوییپ نقدینگی کف قیمتی ${low.price} با برگشت در تایم‌فریم ${timeframe} و ریسک به ریوارد ۱ به ${riskRewardRatio}`,
          status: 'CONFIRMED',
        };
      }
    }
  }

  // بررسی سوییپ سقف (کاندیدای SELL)
  if (canSell) {
    const recentHighs = confirmedSwings.filter(s => s.type === 'HIGH').slice(-swingLookback);
    for (const high of recentHighs) {
      if (currentCandle.high > high.price && currentCandle.close < high.price) {
        const entryPrice = currentCandle.close;
        const stopLossPrice = Number((currentCandle.high + currentATR * atrMultiplier).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        const slDistance = stopLossPrice - entryPrice;
        if (slDistance <= 0) continue;

        const takeProfitPrice = Number((entryPrice - slDistance * rr).toFixed(symbol === 'XAUUSD' ? 2 : 5));
        const riskRewardRatio = Number(((entryPrice - takeProfitPrice) / slDistance).toFixed(2));

        return {
          id: `CAND-SELL-${currentCandle.timestamp}`,
          strategyName: 'S0-proposed Intraday (Sweep Reversal)',
          symbol,
          timeframe,
          direction: 'SELL',
          createdAtTimestamp: currentCandle.timestamp,
          expiresAtTimestamp: currentCandle.timestamp + expiryMs,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio,
          evidenceIds: {
            sweepId: `SWEEP-${high.id}`,
            contextSwingId: high.id,
          },
          rationale: `سوییپ نقدینگی سقف قیمتی ${high.price} با برگشت در تایم‌فریم ${timeframe} و ریسک به ریوارد ۱ به ${riskRewardRatio}`,
          status: 'CONFIRMED',
        };
      }
    }
  }

  return null;
}

export class S0Engine {
  public static evaluateSlice(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    tf: Timeframe = '5M',
    params?: StrategyParameters
  ): StrategyCandidate | null {
    return evaluateS0Strategy(symbol, candles, candles, tf, params);
  }
}

