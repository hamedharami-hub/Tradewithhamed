// lib/contracts/strategy-parameters.ts
// ساختار داده و تنظیمات تایپ‌سیف پارامترهای استراتژی در دو سطح خانواده و جزییات

import { TradingStyleType } from './regimes';

export type StrategyFamily = TradingStyleType;

export type DirectionMode = 'LONG_ONLY' | 'SHORT_ONLY' | 'BOTH';
export type StopLossMode = 'ATR' | 'STRUCTURE' | 'FIXED_PIPS';
export type OrderExecutionType = 'MARKET' | 'LIMIT';
export type SessionFilter = 'ALL' | 'LONDON' | 'NEW_YORK' | 'ASIAN';
export type StrategyPreset = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

export interface CommonStrategyParameters {
  directionMode: DirectionMode;
  riskRewardRatio: number;
  stopLossMode: StopLossMode;
  atrPeriod: number;
  atrMultiplier: number;
  orderType: OrderExecutionType;
  expiryBars: number;
  maxConcurrentPositions: number;
  cooldownBars: number;
  sessionFilter: SessionFilter;
  higherTimeframeFilter: boolean;
  enableBreakeven: boolean;
  enablePartialTakeProfit: boolean;
}

export interface TrendBreakoutParameters {
  channelPeriod: number;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  breakoutBufferAtr: number;
}

export interface MeanReversionParameters {
  lookbackPeriod: number;
  zScoreThreshold: number;
  exitZScore: number;
  trendFilter: boolean;
}

export interface SmcParameters {
  liquidityLookback: number;
  sweepThreshold: number;
  requireFvg: boolean;
  requireStructureBreak: boolean;
}

export interface ScalpParameters {
  fastEma: number;
  slowEma: number;
  minAtr: number;
  session: SessionFilter;
}

export interface SwingParameters {
  trendEma: number;
  pullbackDepth: number;
  confirmationBars: number;
}

export interface StrategyParameters {
  common: CommonStrategyParameters;
  trendBreakout: TrendBreakoutParameters;
  meanReversion: MeanReversionParameters;
  smc: SmcParameters;
  scalp: ScalpParameters;
  swing: SwingParameters;
}

export const DEFAULT_COMMON_PARAMETERS: Record<StrategyPreset, CommonStrategyParameters> = {
  BALANCED: {
    directionMode: 'BOTH',
    riskRewardRatio: 2.0,
    stopLossMode: 'ATR',
    atrPeriod: 14,
    atrMultiplier: 1.5,
    orderType: 'LIMIT',
    expiryBars: 6,
    maxConcurrentPositions: 3,
    cooldownBars: 2,
    sessionFilter: 'ALL',
    higherTimeframeFilter: false,
    enableBreakeven: true,
    enablePartialTakeProfit: false,
  },
  CONSERVATIVE: {
    directionMode: 'BOTH',
    riskRewardRatio: 2.5,
    stopLossMode: 'STRUCTURE',
    atrPeriod: 20,
    atrMultiplier: 2.0,
    orderType: 'LIMIT',
    expiryBars: 4,
    maxConcurrentPositions: 1,
    cooldownBars: 5,
    sessionFilter: 'LONDON',
    higherTimeframeFilter: true,
    enableBreakeven: true,
    enablePartialTakeProfit: true,
  },
  AGGRESSIVE: {
    directionMode: 'BOTH',
    riskRewardRatio: 1.5,
    stopLossMode: 'ATR',
    atrPeriod: 10,
    atrMultiplier: 1.0,
    orderType: 'MARKET',
    expiryBars: 12,
    maxConcurrentPositions: 5,
    cooldownBars: 1,
    sessionFilter: 'ALL',
    higherTimeframeFilter: false,
    enableBreakeven: false,
    enablePartialTakeProfit: false,
  },
};

export const DEFAULT_TREND_BREAKOUT_PARAMETERS: Record<StrategyPreset, TrendBreakoutParameters> = {
  BALANCED: {
    channelPeriod: 55,
    fastEmaPeriod: 50,
    slowEmaPeriod: 200,
    breakoutBufferAtr: 0.0,
  },
  CONSERVATIVE: {
    channelPeriod: 100,
    fastEmaPeriod: 50,
    slowEmaPeriod: 200,
    breakoutBufferAtr: 0.25,
  },
  AGGRESSIVE: {
    channelPeriod: 20,
    fastEmaPeriod: 20,
    slowEmaPeriod: 100,
    breakoutBufferAtr: 0.0,
  },
};

export const DEFAULT_MEAN_REVERSION_PARAMETERS: Record<StrategyPreset, MeanReversionParameters> = {
  BALANCED: {
    lookbackPeriod: 20,
    zScoreThreshold: 2.0,
    exitZScore: 0.0,
    trendFilter: true,
  },
  CONSERVATIVE: {
    lookbackPeriod: 30,
    zScoreThreshold: 2.5,
    exitZScore: 0.5,
    trendFilter: true,
  },
  AGGRESSIVE: {
    lookbackPeriod: 14,
    zScoreThreshold: 1.5,
    exitZScore: -0.5,
    trendFilter: false,
  },
};

export const DEFAULT_SMC_PARAMETERS: Record<StrategyPreset, SmcParameters> = {
  BALANCED: {
    liquidityLookback: 15,
    sweepThreshold: 0.3,
    requireFvg: false,
    requireStructureBreak: true,
  },
  CONSERVATIVE: {
    liquidityLookback: 25,
    sweepThreshold: 0.5,
    requireFvg: true,
    requireStructureBreak: true,
  },
  AGGRESSIVE: {
    liquidityLookback: 10,
    sweepThreshold: 0.1,
    requireFvg: false,
    requireStructureBreak: false,
  },
};

export const DEFAULT_SCALP_PARAMETERS: Record<StrategyPreset, ScalpParameters> = {
  BALANCED: {
    fastEma: 9,
    slowEma: 21,
    minAtr: 0.0005,
    session: 'ALL',
  },
  CONSERVATIVE: {
    fastEma: 13,
    slowEma: 34,
    minAtr: 0.0008,
    session: 'LONDON',
  },
  AGGRESSIVE: {
    fastEma: 5,
    slowEma: 13,
    minAtr: 0.0002,
    session: 'ALL',
  },
};

export const DEFAULT_SWING_PARAMETERS: Record<StrategyPreset, SwingParameters> = {
  BALANCED: {
    trendEma: 50,
    pullbackDepth: 1.5,
    confirmationBars: 2,
  },
  CONSERVATIVE: {
    trendEma: 100,
    pullbackDepth: 2.0,
    confirmationBars: 3,
  },
  AGGRESSIVE: {
    trendEma: 20,
    pullbackDepth: 1.0,
    confirmationBars: 1,
  },
};

export function getDefaultStrategyParameters(preset: StrategyPreset = 'BALANCED'): StrategyParameters {
  return {
    common: { ...DEFAULT_COMMON_PARAMETERS[preset] },
    trendBreakout: { ...DEFAULT_TREND_BREAKOUT_PARAMETERS[preset] },
    meanReversion: { ...DEFAULT_MEAN_REVERSION_PARAMETERS[preset] },
    smc: { ...DEFAULT_SMC_PARAMETERS[preset] },
    scalp: { ...DEFAULT_SCALP_PARAMETERS[preset] },
    swing: { ...DEFAULT_SWING_PARAMETERS[preset] },
  };
}
