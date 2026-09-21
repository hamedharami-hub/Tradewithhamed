// lib/core/s0-engine.ts
// موتور استراتژی S0 بر مبنای سوییپ سطوح نقدینگی، FVG و شکست ساختار داخلی
// با اتصال کامل پارامترهای liquidityLookback, sweepThreshold, requireStructureBreak, requireFvg

import { Candle, SymbolId, SYMBOL_SPECS, Timeframe } from '../contracts/market';
import { StrategyCandidate, RuleProvenance } from '../contracts/strategy';
import { detectSwingPoints } from './swings';
import { calculateWilderATR } from './atr';
import { StrategyParameters, getDefaultStrategyParameters } from '../contracts/strategy-parameters';
import { StopLossCalculator } from './stop-loss-calculator';

function calculateParameterHash(params: Record<string, number>): string {
  const keys = Object.keys(params).sort();
  let hash = 2166136261;
  for (const key of keys) {
    const str = `${key}:${params[key]};`;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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
  _candles15M: Candle[],
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
  const sweepThresholdPips = smcParams.sweepThreshold ?? 0.3;
  const pipVal = SYMBOL_SPECS[symbol].pipSize;
  const minSweepDistance = sweepThresholdPips * pipVal;
  const slMode = common.stopLossMode || 'ATR';

  const currentIdx = candles5M.length - 1;
  const currentCandle = candles5M[currentIdx];
  if (!currentCandle.isClosed) return null;

  const swings = detectSwingPoints(candles5M, timeframe);
  const confirmedSwings = swings.filter(s => s.confirmedAtIndex <= currentIdx);
  if (confirmedSwings.length < 2) return null;

  // بررسی شرط FVG (گپ ارزش منصفانه) در صورت الزام
  if (smcParams.requireFvg && candles5M.length >= 3) {
    const c1 = candles5M[currentIdx - 2];
    const c3 = currentCandle;
    const hasBullishFvg = c3.low > c1.high;
    const hasBearishFvg = c3.high < c1.low;
    if (!hasBullishFvg && !hasBearishFvg) {
      return null;
    }
  }

  // بررسی سوییپ کف (کاندیدای BUY)
  if (canBuy) {
    const recentLows = confirmedSwings.filter(s => s.type === 'LOW').slice(-swingLookback);
    for (const low of recentLows) {
      const sweepDepth = low.price - currentCandle.low;
      // شرط سوییپ: نفوذ شدو حداقل به اندازه minSweepDistance ولی کلوز بالاتر از سطح بسته شده باشد
      if (sweepDepth >= minSweepDistance && currentCandle.close > low.price) {
        // در صورت الزام شکست ساختار (requireStructureBreak): کلوز باید بالاتر از اوپن کندل قبلی باشد
        if (smcParams.requireStructureBreak && currentCandle.close <= candles5M[currentIdx - 1].high) {
          continue;
        }

        const entryPrice = currentCandle.close;
        const slRes = StopLossCalculator.calculate(slMode, 'BUY', entryPrice, candles5M, symbol, timeframe, {
          atrPeriod,
          atrMultiplier,
          fixedStopPips: common.fixedStopPips ?? 20,
          structureLookback: 3,
        });

        if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
          const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
          const takeProfitPrice = Number((entryPrice + slRes.riskDistancePrice * rr).toFixed(precision));
          const riskRewardRatio = Number(((takeProfitPrice - entryPrice) / slRes.riskDistancePrice).toFixed(2));

          const resolvedParameters: Record<string, number> = {
            liquidityLookback: swingLookback,
            sweepThreshold: sweepThresholdPips,
            requireStructureBreak: smcParams.requireStructureBreak ? 1 : 0,
            requireFvg: smcParams.requireFvg ? 1 : 0,
            atrPeriod,
            atrMultiplier,
            riskRewardRatio: rr,
          };
          const parameterHash = calculateParameterHash(resolvedParameters);
          const evidenceAvailableAtTimestamp = currentCandle.timestamp + timeframeToMs(timeframe);

          return {
            id: `CAND-BUY-${currentCandle.timestamp}`,
            strategyName: 'S0-proposed Intraday (Sweep Reversal)',
            symbol,
            timeframe,
            direction: 'BUY',
            createdAtTimestamp: currentCandle.timestamp,
            expiresAtTimestamp: currentCandle.timestamp + expiryMs,
            entryPrice,
            stopLossPrice: slRes.stopLossPrice,
            takeProfitPrice,
            riskRewardRatio,
            ruleProvenance: {
              ruleVersion: '2.4.0',
              parameterHash,
              resolvedParameters,
              signalCandleTimestamp: currentCandle.timestamp,
              evidenceAvailableAtTimestamp,
              lifecycle: 'CONFIRMED',
            },
            evidenceIds: {
              sweepId: `SWEEP-${low.id}`,
              contextSwingId: low.id,
            },
            rationale: `سوییپ نقدینگی کف قیمتی ${low.price} با نفوذ ${(sweepDepth / pipVal).toFixed(1)} پیپ و تایید در تایم‌فریم ${timeframe}؛ نسبت سود به ضرر ۱ به ${riskRewardRatio}`,
            status: 'CONFIRMED',
          };
        }
      }
    }
  }

  // بررسی سوییپ سقف (کاندیدای SELL)
  if (canSell) {
    const recentHighs = confirmedSwings.filter(s => s.type === 'HIGH').slice(-swingLookback);
    for (const high of recentHighs) {
      const sweepDepth = currentCandle.high - high.price;
      if (sweepDepth >= minSweepDistance && currentCandle.close < high.price) {
        if (smcParams.requireStructureBreak && currentCandle.close >= candles5M[currentIdx - 1].low) {
          continue;
        }

        const entryPrice = currentCandle.close;
        const slRes = StopLossCalculator.calculate(slMode, 'SELL', entryPrice, candles5M, symbol, timeframe, {
          atrPeriod,
          atrMultiplier,
          fixedStopPips: common.fixedStopPips ?? 20,
          structureLookback: 3,
        });

        if (slRes.status === 'VALID' && slRes.riskDistancePrice > 0) {
          const precision = symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
          const takeProfitPrice = Number((entryPrice - slRes.riskDistancePrice * rr).toFixed(precision));
          const riskRewardRatio = Number(((entryPrice - takeProfitPrice) / slRes.riskDistancePrice).toFixed(2));

          const resolvedParameters: Record<string, number> = {
            liquidityLookback: swingLookback,
            sweepThreshold: sweepThresholdPips,
            requireStructureBreak: smcParams.requireStructureBreak ? 1 : 0,
            requireFvg: smcParams.requireFvg ? 1 : 0,
            atrPeriod,
            atrMultiplier,
            riskRewardRatio: rr,
          };
          const parameterHash = calculateParameterHash(resolvedParameters);
          const evidenceAvailableAtTimestamp = currentCandle.timestamp + timeframeToMs(timeframe);

          return {
            id: `CAND-SELL-${currentCandle.timestamp}`,
            strategyName: 'S0-proposed Intraday (Sweep Reversal)',
            symbol,
            timeframe,
            direction: 'SELL',
            createdAtTimestamp: currentCandle.timestamp,
            expiresAtTimestamp: currentCandle.timestamp + expiryMs,
            entryPrice,
            stopLossPrice: slRes.stopLossPrice,
            takeProfitPrice,
            riskRewardRatio,
            ruleProvenance: {
              ruleVersion: '2.4.0',
              parameterHash,
              resolvedParameters,
              signalCandleTimestamp: currentCandle.timestamp,
              evidenceAvailableAtTimestamp,
              lifecycle: 'CONFIRMED',
            },
            evidenceIds: {
              sweepId: `SWEEP-${high.id}`,
              contextSwingId: high.id,
            },
            rationale: `سوییپ نقدینگی سقف قیمتی ${high.price} با نفوذ ${(sweepDepth / pipVal).toFixed(1)} پیپ و تایید در تایم‌فریم ${timeframe}؛ نسبت سود به ضرر ۱ به ${riskRewardRatio}`,
            status: 'CONFIRMED',
          };
        }
      }
    }
  }

  return null;
}
