import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import type { RuleProvenance, StrategyCandidate } from '@/lib/contracts/strategy';
import { calculateWilderATR } from '@/lib/core/atr';
import { detectSwingPoints } from '@/lib/core/swings';
import type { StrategyVariantId } from './contracts';
import { timeframeMs } from './dataset';

export interface RuleParameters {
  stopLossAtrBuffer: number;
  targetRiskReward: number;
  expiryBars: number;
  minSweepPenetrationAtr: number;
  minFvgSizeAtr: number;
  meanReversionLookback: number;
  meanReversionEntryZScore: number;
  trendChannelLookback: number;
  trendEmaPeriod: number;
  trendStopAtrMultiple: number;
  trendTargetAtrMultiple: number;
}

export const RESEARCH_RULE_VERSION = 'research-rules-v1' as const;

export const DEFAULT_RULE_PARAMETERS: RuleParameters = {
  stopLossAtrBuffer: 0.2,
  targetRiskReward: 2,
  expiryBars: 12,
  minSweepPenetrationAtr: 0.1,
  minFvgSizeAtr: 0.3,
  meanReversionLookback: 20,
  meanReversionEntryZScore: 2,
  trendChannelLookback: 55,
  trendEmaPeriod: 200,
  trendStopAtrMultiple: 2,
  trendTargetAtrMultiple: 4,
};

function parameterHash(parameters: RuleParameters): string {
  const canonical = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  let hash = 2166136261;
  for (const character of canonical) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

interface FairValueGap {
  id: string;
  direction: 'BUY' | 'SELL';
  lower: number;
  upper: number;
  formedAtTimestamp: number;
}

function pricePrecision(symbol: SymbolId): number {
  return symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : 5;
}

function pipSize(symbol: SymbolId): number {
  if (symbol === 'XAUUSD') return 0.1;
  if (symbol === 'USDJPY') return 0.01;
  if (symbol === 'BTCUSD') return 1;
  return 0.0001;
}

function roundPrice(value: number, symbol: SymbolId): number {
  return Number(value.toFixed(pricePrecision(symbol)));
}

function lastClosedCandle(candles: Candle[]): Candle | null {
  const candle = candles.at(-1);
  return candle?.isClosed ? candle : null;
}

function detectCurrentFairValueGap(candles: Candle[], symbol: SymbolId, minSize: number): FairValueGap | null {
  if (candles.length < 3) return null;
  const left = candles[candles.length - 3];
  const current = candles[candles.length - 1];
  const direction = current.low > left.high ? 'BUY' : current.high < left.low ? 'SELL' : null;
  if (!direction) return null;

  const lower = direction === 'BUY' ? left.high : current.high;
  const upper = direction === 'BUY' ? current.low : left.low;
  if (upper - lower < minSize) return null;

  return {
    id: `FVG-${direction}-${current.timestamp}-${roundPrice(lower, symbol)}-${roundPrice(upper, symbol)}`,
    direction,
    lower: roundPrice(lower, symbol),
    upper: roundPrice(upper, symbol),
    formedAtTimestamp: current.timestamp,
  };
}

function createCandidate(input: {
  symbol: SymbolId;
  timeframe: Timeframe;
  variant: StrategyVariantId;
  direction: 'BUY' | 'SELL';
  candle: Candle;
  entryPrice: number;
  stopLossPrice: number;
  riskReward: number;
  expiryBars: number;
  evidenceIds: StrategyCandidate['evidenceIds'];
  rationale: string;
  parameters: RuleParameters;
}): StrategyCandidate | null {
  const risk = input.direction === 'BUY'
    ? input.entryPrice - input.stopLossPrice
    : input.stopLossPrice - input.entryPrice;
  if (!Number.isFinite(risk) || risk <= 0) return null;
  const takeProfitPrice = input.direction === 'BUY'
    ? input.entryPrice + risk * input.riskReward
    : input.entryPrice - risk * input.riskReward;
  const expiry = input.candle.timestamp + input.expiryBars * timeframeMs(input.timeframe);

  const provenance: RuleProvenance = {
    ruleVersion: RESEARCH_RULE_VERSION,
    parameterHash: parameterHash(input.parameters),
    resolvedParameters: Object.fromEntries(Object.entries(input.parameters).map(([key, value]) => [key, Number(value)])),
    signalCandleTimestamp: input.candle.timestamp,
    evidenceAvailableAtTimestamp: input.candle.timestamp,
    lifecycle: 'CONFIRMED',
  };
  return {
    id: `RS-${RESEARCH_RULE_VERSION}-${input.variant}-${input.direction}-${input.candle.timestamp}`,
    strategyName: input.variant,
    symbol: input.symbol,
    timeframe: input.timeframe,
    direction: input.direction,
    createdAtTimestamp: input.candle.timestamp,
    expiresAtTimestamp: expiry,
    entryPrice: roundPrice(input.entryPrice, input.symbol),
    stopLossPrice: roundPrice(input.stopLossPrice, input.symbol),
    takeProfitPrice: roundPrice(takeProfitPrice, input.symbol),
    riskRewardRatio: input.riskReward,
    style: input.variant === 'MEAN_REVERSION_V1'
      ? 'MEAN_REVERSION'
      : input.variant === 'TREND_BREAKOUT_55_EMA200_V1'
      ? 'TREND_BREAKOUT'
      : 'SMC_INTRADAY',
    evidenceIds: input.evidenceIds,
    rationale: input.rationale,
    ruleProvenance: provenance,
    status: 'PENDING_CONFIRMATION',
  };
}

function evaluateSweep(candles: Candle[], symbol: SymbolId, timeframe: Timeframe, variant: StrategyVariantId, parameters: RuleParameters): StrategyCandidate | null {
  const candle = lastClosedCandle(candles);
  if (!candle || candles.length < 20) return null;
  const atr = calculateWilderATR(candles, 14).at(-1);
  if (!atr || atr <= 0) return null;
  const minimumPenetration = Math.max(pipSize(symbol), atr * parameters.minSweepPenetrationAtr);
  const swings = detectSwingPoints(candles, timeframe).filter(swing => swing.confirmedAtIndex <= candles.length - 1);
  const fvg = variant === 'S0_SWEEP_FVG'
    ? detectCurrentFairValueGap(candles, symbol, atr * parameters.minFvgSizeAtr)
    : null;

  if (variant === 'S0_SWEEP_FVG' && !fvg) return null;

  for (const swing of swings.filter(item => item.type === 'LOW').slice(-6).reverse()) {
    const penetration = swing.price - candle.low;
    const reclaimed = candle.close > swing.price;
    const fvgAligned = !fvg || fvg.direction === 'BUY';
    if (penetration >= minimumPenetration && reclaimed && fvgAligned) {
      return createCandidate({
        symbol,
        timeframe,
        variant,
        direction: 'BUY',
        candle,
        entryPrice: candle.close,
        stopLossPrice: candle.low - atr * parameters.stopLossAtrBuffer,
        riskReward: parameters.targetRiskReward,
        expiryBars: parameters.expiryBars,
        evidenceIds: { sweepId: `SWEEP-${swing.id}-${candle.timestamp}`, contextSwingId: swing.id, ...(fvg ? { fvgId: fvg.id } : {}) },
        rationale: `sweep کف تاییدشده با نفوذ ${penetration.toFixed(pricePrecision(symbol))} و reclaim در کندل بسته؛ rule=${RESEARCH_RULE_VERSION}`,
        parameters,
      });
    }
  }

  for (const swing of swings.filter(item => item.type === 'HIGH').slice(-6).reverse()) {
    const penetration = candle.high - swing.price;
    const reclaimed = candle.close < swing.price;
    const fvgAligned = !fvg || fvg.direction === 'SELL';
    if (penetration >= minimumPenetration && reclaimed && fvgAligned) {
      return createCandidate({
        symbol,
        timeframe,
        variant,
        direction: 'SELL',
        candle,
        entryPrice: candle.close,
        stopLossPrice: candle.high + atr * parameters.stopLossAtrBuffer,
        riskReward: parameters.targetRiskReward,
        expiryBars: parameters.expiryBars,
        evidenceIds: { sweepId: `SWEEP-${swing.id}-${candle.timestamp}`, contextSwingId: swing.id, ...(fvg ? { fvgId: fvg.id } : {}) },
        rationale: `sweep سقف تاییدشده با نفوذ ${penetration.toFixed(pricePrecision(symbol))} و reclaim در کندل بسته؛ rule=${RESEARCH_RULE_VERSION}`,
        parameters,
      });
    }
  }

  return null;
}

function evaluateMeanReversion(candles: Candle[], symbol: SymbolId, timeframe: Timeframe, parameters: RuleParameters): StrategyCandidate | null {
  const candle = lastClosedCandle(candles);
  const lookback = parameters.meanReversionLookback;
  if (!candle || candles.length < lookback + 1) return null;
  const priorCloses = candles.slice(-(lookback + 1), -1).map(item => item.close);
  const mean = priorCloses.reduce((sum, value) => sum + value, 0) / priorCloses.length;
  const variance = priorCloses.reduce((sum, value) => sum + (value - mean) ** 2, 0) / priorCloses.length;
  const standardDeviation = Math.sqrt(variance);
  const atr = calculateWilderATR(candles, 14).at(-1);
  if (!atr || standardDeviation <= 0) return null;
  const zScore = (candle.close - mean) / standardDeviation;

  if (zScore <= -parameters.meanReversionEntryZScore && candle.close > candle.low) {
    return createCandidate({
      symbol, timeframe, variant: 'MEAN_REVERSION_V1', direction: 'BUY', candle,
      entryPrice: candle.close,
      stopLossPrice: candle.low - atr * parameters.stopLossAtrBuffer,
      riskReward: parameters.targetRiskReward,
      expiryBars: parameters.expiryBars,
      evidenceIds: {},
      rationale: `بازگشت به میانگین با z-score=${zScore.toFixed(2)}؛ آمار فقط از ${lookback} کندل قبل از trigger ساخته شد.`,
      parameters,
    });
  }
  if (zScore >= parameters.meanReversionEntryZScore && candle.close < candle.high) {
    return createCandidate({
      symbol, timeframe, variant: 'MEAN_REVERSION_V1', direction: 'SELL', candle,
      entryPrice: candle.close,
      stopLossPrice: candle.high + atr * parameters.stopLossAtrBuffer,
      riskReward: parameters.targetRiskReward,
      expiryBars: parameters.expiryBars,
      evidenceIds: {},
      rationale: `بازگشت به میانگین با z-score=${zScore.toFixed(2)}؛ آمار فقط از ${lookback} کندل قبل از trigger ساخته شد.`,
      parameters,
    });
  }
  return null;
}

function evaluateBosOrderBlock(candles: Candle[], symbol: SymbolId, timeframe: Timeframe, parameters: RuleParameters): StrategyCandidate | null {
  const candle = lastClosedCandle(candles);
  if (!candle || candles.length < 25) return null;
  const atr = calculateWilderATR(candles, 14).at(-1);
  if (!atr || atr <= 0) return null;
  const swings = detectSwingPoints(candles, timeframe).filter(swing => swing.confirmedAtIndex <= candles.length - 1);
  const previous = candles.at(-2);

  const high = swings.filter(swing => swing.type === 'HIGH').at(-1);
  if (high && previous && previous.close <= high.price && candle.close > high.price) {
    const orderBlock = [...candles.slice(Math.max(0, high.candleIndex), -1)].reverse().find(item => item.close < item.open);
    const stop = (orderBlock?.low ?? high.price) - atr * parameters.stopLossAtrBuffer;
    return createCandidate({
      symbol, timeframe, variant: 'BOS_ORDER_BLOCK_V1', direction: 'BUY', candle,
      entryPrice: candle.close, stopLossPrice: stop, riskReward: parameters.targetRiskReward,
      expiryBars: parameters.expiryBars,
      evidenceIds: { bosId: `BOS-BUY-${high.id}-${candle.timestamp}`, contextSwingId: high.id },
      rationale: `BOS صعودی با عبور بسته‌شدن از سقف تاییدشده؛ order block=${orderBlock ? 'bearish candle' : 'fallback swing'}؛ بدون استفاده از کندل آینده.`,
      parameters,
    });
  }

  const low = swings.filter(swing => swing.type === 'LOW').at(-1);
  if (low && previous && previous.close >= low.price && candle.close < low.price) {
    const orderBlock = [...candles.slice(Math.max(0, low.candleIndex), -1)].reverse().find(item => item.close > item.open);
    const stop = (orderBlock?.high ?? low.price) + atr * parameters.stopLossAtrBuffer;
    return createCandidate({
      symbol, timeframe, variant: 'BOS_ORDER_BLOCK_V1', direction: 'SELL', candle,
      entryPrice: candle.close, stopLossPrice: stop, riskReward: parameters.targetRiskReward,
      expiryBars: parameters.expiryBars,
      evidenceIds: { bosId: `BOS-SELL-${low.id}-${candle.timestamp}`, contextSwingId: low.id },
      rationale: `BOS نزولی با عبور بسته‌شدن از کف تاییدشده؛ order block=${orderBlock ? 'bullish candle' : 'fallback swing'}؛ بدون استفاده از کندل آینده.`,
      parameters,
    });
  }
  return null;
}

function fairValueGapAt(candles: Candle[], index: number, symbol: SymbolId, minimumSize: number): FairValueGap | null {
  if (index < 2) return null;
  const left = candles[index - 2];
  const current = candles[index];
  const direction = current.low > left.high ? 'BUY' : current.high < left.low ? 'SELL' : null;
  if (!direction) return null;
  const lower = direction === 'BUY' ? left.high : current.high;
  const upper = direction === 'BUY' ? current.low : left.low;
  if (upper - lower < minimumSize) return null;
  return { id: `FVG-${direction}-${current.timestamp}-${roundPrice(lower, symbol)}-${roundPrice(upper, symbol)}`, direction, lower, upper, formedAtTimestamp: current.timestamp };
}

function calculateEma(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const ema = [values[0]];
  for (let index = 1; index < values.length; index++) {
    ema.push(values[index] * multiplier + ema[index - 1] * (1 - multiplier));
  }
  return ema;
}

/**
 * Donchian-55 breakout with an EMA-200 slope filter. The channel excludes the
 * current closed candle, and the execution engine fills only on the next bar.
 * Therefore neither signal construction nor fill can use future prices.
 */
function evaluateTrendBreakout(candles: Candle[], symbol: SymbolId, timeframe: Timeframe, parameters: RuleParameters): StrategyCandidate | null {
  const candle = lastClosedCandle(candles);
  const requiredBars = Math.max(parameters.trendChannelLookback + 1, parameters.trendEmaPeriod + 1);
  if (!candle || candles.length < requiredBars) return null;
  const history = candles.slice(0, -1);
  const channel = history.slice(-parameters.trendChannelLookback);
  const priorHigh = Math.max(...channel.map(item => item.high));
  const priorLow = Math.min(...channel.map(item => item.low));
  const ema = calculateEma(candles.map(item => item.close), parameters.trendEmaPeriod);
  const currentEma = ema.at(-1);
  const previousEma = ema.at(-2);
  const atr = calculateWilderATR(candles, 20).at(-1);
  if (!atr || !currentEma || !previousEma) return null;
  if (candle.close > priorHigh && currentEma >= previousEma) {
    return createCandidate({
      symbol, timeframe, variant: 'TREND_BREAKOUT_55_EMA200_V1', direction: 'BUY', candle,
      entryPrice: candle.close,
      stopLossPrice: candle.close - atr * parameters.trendStopAtrMultiple,
      riskReward: parameters.trendTargetAtrMultiple / parameters.trendStopAtrMultiple,
      expiryBars: parameters.expiryBars,
      evidenceIds: { contextSwingId: `DONCHIAN55-HIGH-${roundPrice(priorHigh, symbol)}` },
      rationale: `بسته‌شدن بالای کانال ${parameters.trendChannelLookback} دوره‌ای و شیب غیرمنفی EMA${parameters.trendEmaPeriod}; ورود فقط در کندل بعدی شبیه‌سازی می‌شود.`,
      parameters,
    });
  }
  if (candle.close < priorLow && currentEma <= previousEma) {
    return createCandidate({
      symbol, timeframe, variant: 'TREND_BREAKOUT_55_EMA200_V1', direction: 'SELL', candle,
      entryPrice: candle.close,
      stopLossPrice: candle.close + atr * parameters.trendStopAtrMultiple,
      riskReward: parameters.trendTargetAtrMultiple / parameters.trendStopAtrMultiple,
      expiryBars: parameters.expiryBars,
      evidenceIds: { contextSwingId: `DONCHIAN55-LOW-${roundPrice(priorLow, symbol)}` },
      rationale: `بسته‌شدن زیر کانال ${parameters.trendChannelLookback} دوره‌ای و شیب غیرمثبت EMA${parameters.trendEmaPeriod}; ورود فقط در کندل بعدی شبیه‌سازی می‌شود.`,
      parameters,
    });
  }
  return null;
}

function evaluateFvgEquilibrium(candles: Candle[], symbol: SymbolId, timeframe: Timeframe, parameters: RuleParameters): StrategyCandidate | null {
  const candle = lastClosedCandle(candles);
  if (!candle || candles.length < 25) return null;
  const atr = calculateWilderATR(candles, 14).at(-1);
  if (!atr || atr <= 0) return null;
  const lastFormationIndex = candles.length - 2;
  for (let index = lastFormationIndex; index >= Math.max(2, candles.length - parameters.expiryBars - 8); index--) {
    const fvg = fairValueGapAt(candles, index, symbol, atr * parameters.minFvgSizeAtr);
    if (!fvg) continue;
    const midpoint = (fvg.lower + fvg.upper) / 2;
    const touched = candle.low <= midpoint && candle.high >= midpoint;
    if (!touched) continue;
    const buy = fvg.direction === 'BUY' && candle.close >= midpoint;
    const sell = fvg.direction === 'SELL' && candle.close <= midpoint;
    if (buy || sell) {
      const direction = buy ? 'BUY' : 'SELL';
      return createCandidate({
        symbol, timeframe, variant: 'FVG_EQUILIBRIUM_V1', direction, candle,
        entryPrice: candle.close,
        stopLossPrice: direction === 'BUY' ? fvg.lower - atr * parameters.stopLossAtrBuffer : fvg.upper + atr * parameters.stopLossAtrBuffer,
        riskReward: parameters.targetRiskReward, expiryBars: parameters.expiryBars,
        evidenceIds: { fvgId: fvg.id },
        rationale: `بازگشت قیمت به equilibrium پنجاه‌درصد FVG تشکیل‌شده در ${fvg.formedAtTimestamp}؛ تشکیل FVG پیش از کندل trigger بوده است.`,
        parameters,
      });
    }
  }
  return null;
}

export function evaluateResearchStrategy(
  candles: Candle[],
  symbol: SymbolId,
  timeframe: Timeframe,
  variant: StrategyVariantId,
  overrides: Partial<RuleParameters> = {},
): StrategyCandidate | null {
  const parameters = { ...DEFAULT_RULE_PARAMETERS, ...overrides };
  if (variant === 'MEAN_REVERSION_V1') return evaluateMeanReversion(candles, symbol, timeframe, parameters);
  if (variant === 'BOS_ORDER_BLOCK_V1') return evaluateBosOrderBlock(candles, symbol, timeframe, parameters);
  if (variant === 'FVG_EQUILIBRIUM_V1') return evaluateFvgEquilibrium(candles, symbol, timeframe, parameters);
  if (variant === 'TREND_BREAKOUT_55_EMA200_V1') return evaluateTrendBreakout(candles, symbol, timeframe, parameters);
  return evaluateSweep(candles, symbol, timeframe, variant, parameters);
}
