import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { detectSwingPoints } from './swings';
import { calculateWilderATR } from './atr';

/**
 * موتور استراتژی S0 بر مبنای سوییپ سطوح نقدینگی و تاییدیه کندل برگشتی
 */
export function evaluateS0Strategy(
  symbol: SymbolId,
  candles5M: Candle[],
  candles15M: Candle[]
): StrategyCandidate | null {
  if (candles5M.length < 15) return null;

  const currentIdx = candles5M.length - 1;
  const currentCandle = candles5M[currentIdx];
  if (!currentCandle.isClosed) return null;

  const swings = detectSwingPoints(candles5M, '5M');
  // فقط پیوت‌هایی که تایید شده‌اند مجازند
  const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= currentIdx);
  if (confirmedSwings.length < 2) return null;

  const atrs = calculateWilderATR(candles5M, 14);
  const currentATR = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 2.5 : 0.0015;

  // بررسی سوییپ کف (کاندیدای BUY)
  const recentLows = confirmedSwings.filter(s => s.type === 'LOW').slice(-3);
  for (const low of recentLows) {
    // شرط سوییپ: شدو نفوذ کرده ولی کلوز کندل بالاتر از سطح بسته شده باشد
    if (currentCandle.low < low.price && currentCandle.close > low.price) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.low - currentATR * 0.3).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDistance = entryPrice - stopLossPrice;
      if (slDistance <= 0) continue;

      const takeProfitPrice = Number((entryPrice + slDistance * 2.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const riskRewardRatio = Number(((takeProfitPrice - entryPrice) / slDistance).toFixed(2));

      return {
        id: `CAND-BUY-${currentCandle.timestamp}`,
        strategyName: 'S0-proposed Intraday (Sweep Reversal)',
        symbol,
        timeframe: '5M',
        direction: 'BUY',
        createdAtTimestamp: currentCandle.timestamp,
        expiresAtTimestamp: currentCandle.timestamp + 6 * 15 * 60 * 1000, // انقضا تا ۶ کندل ۱۵ دقیقه
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        riskRewardRatio,
        evidenceIds: {
          sweepId: `SWEEP-${low.id}`,
          contextSwingId: low.id,
        },
        rationale: `سوییپ نقدینگی کف قیمتی ${low.price} با برگشت کندل ۵ دقیقه و ریسک به ریوارد ۱ به ${riskRewardRatio}`,
        status: 'CONFIRMED',
      };
    }
  }

  // بررسی سوییپ سقف (کاندیدای SELL)
  const recentHighs = confirmedSwings.filter(s => s.type === 'HIGH').slice(-3);
  for (const high of recentHighs) {
    if (currentCandle.high > high.price && currentCandle.close < high.price) {
      const entryPrice = currentCandle.close;
      const stopLossPrice = Number((currentCandle.high + currentATR * 0.3).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const slDistance = stopLossPrice - entryPrice;
      if (slDistance <= 0) continue;

      const takeProfitPrice = Number((entryPrice - slDistance * 2.5).toFixed(symbol === 'XAUUSD' ? 2 : 5));
      const riskRewardRatio = Number(((entryPrice - takeProfitPrice) / slDistance).toFixed(2));

      return {
        id: `CAND-SELL-${currentCandle.timestamp}`,
        strategyName: 'S0-proposed Intraday (Sweep Reversal)',
        symbol,
        timeframe: '5M',
        direction: 'SELL',
        createdAtTimestamp: currentCandle.timestamp,
        expiresAtTimestamp: currentCandle.timestamp + 6 * 15 * 60 * 1000,
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
        riskRewardRatio,
        evidenceIds: {
          sweepId: `SWEEP-${high.id}`,
          contextSwingId: high.id,
        },
        rationale: `سوییپ نقدینگی سقف قیمتی ${high.price} با برگشت کندل ۵ دقیقه و ریسک به ریوارد ۱ به ${riskRewardRatio}`,
        status: 'CONFIRMED',
      };
    }
  }

  return null;
}

export class S0Engine {
  public static evaluateSlice(
    candles: Candle[],
    symbol: SymbolId = 'XAUUSD',
    _tf: string = '5M'
  ): StrategyCandidate | null {
    return evaluateS0Strategy(symbol, candles, candles);
  }
}

