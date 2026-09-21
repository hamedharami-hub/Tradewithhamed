// lib/contracts/strategy-parameters.ts
// ساختار داده و تنظیمات تایپ‌سیف پارامترهای استراتژی در دو سطح خانواده و جزییات

import { Timeframe } from './market';
import { TradingStyleType } from './regimes';

export type StrategyFamily = TradingStyleType;

export type DirectionMode = 'LONG_ONLY' | 'SHORT_ONLY' | 'BOTH';
export type StopLossMode = 'ATR' | 'STRUCTURE' | 'FIXED_PIPS';
export type OrderExecutionType = 'MARKET' | 'LIMIT' | 'STOP';
export type SessionFilter =
  | 'ALL'
  | 'ASIAN'
  | 'LONDON'
  | 'NEW_YORK'
  | 'LONDON_NEW_YORK_OVERLAP'
  | 'CUSTOM';

export type TimezoneOption =
  | 'UTC'
  | 'Europe/London'
  | 'America/New_York'
  | 'Australia/Sydney'
  | 'BROKER_FIXED';

export type AccountCurrency = 'USD' | 'AUD';

export interface AccountConfiguration {
  initialCapital: number; // 100 to 10,000,000
  accountCurrency: AccountCurrency;
  leverage: 1 | 10 | 30 | 50 | 100;
  maxDailyLossPercent?: number; // 0 to 20%
  maxTotalDrawdownPercent?: number; // 0 to 50%
  maxConcurrentPositions: number; // 1 to 20 (legacy/aggregated limit)
  maxOpenPositions?: number; // Separate limit for open positions
  maxPendingOrders?: number; // Separate limit for pending orders
  maxCombinedExposure?: number; // Combined open + pending limit
  minLot: number; // e.g. 0.01
  lotStep: number; // e.g. 0.01
  maxLot: number; // e.g. 10.0 or 100.0
}

export type DateRangeMode =
  | 'FULL'
  | 'CUSTOM'
  | 'FIRST_25'
  | 'MIDDLE_50'
  | 'LAST_25'
  | 'ROLLING_3M'
  | 'ROLLING_6M'
  | 'ROLLING_12M';

export interface DateRangeFilterConfig {
  mode: DateRangeMode;
  customStartDate?: string; // YYYY-MM-DD
  customEndDate?: string; // YYYY-MM-DD
  requiredWarmupBars?: number; // e.g. 210
}

export interface SessionTimezoneConfig {
  session: SessionFilter;
  timezone: TimezoneOption;
  brokerOffsetMinutes?: number; // For BROKER_FIXED, e.g. +120
  customStartTime?: string; // "HH:mm", e.g. "08:00"
  customEndTime?: string; // "HH:mm", e.g. "17:00"
  selectedWeekdays: number[]; // 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri
  useRolloverBlackout: boolean;
  excludeEdgeMinutes?: number; // e.g. 15 to skip first/last 15m of session
}

// ─── Multi-Timeframe (MTF) Data Model (Package 3) ──────────────────────────
export type HigherTimeframeSource =
  | 'NATIVE_DATASET'
  | 'AGGREGATED_FROM_EXECUTION'
  | 'AUTO';

export type HigherTimeframeFilterMode =
  | 'OFF'
  | 'TREND_EMA'
  | 'MARKET_STRUCTURE'
  | 'MOMENTUM'
  | 'VOLATILITY'
  | 'COMBINED';

export interface MtfTrendEmaSettings {
  trendEmaPeriod: number; // default 50
  trendSlopeLookback?: number; // default 3 bars
  minimumSlope?: number; // default 0.0 (points per bar)
}

export interface MtfStructureSettings {
  pivotLeftBars: number; // default 3
  pivotRightBars: number; // default 3
  structureLookback: number; // default 10
  minimumStructurePoints: number; // default 2
}

export interface MtfMomentumSettings {
  momentumMethod: 'EMA_SLOPE' | 'RATE_OF_CHANGE';
  momentumPeriod: number; // default 14
  momentumThreshold: number; // default 0.0
}

export interface MtfVolatilitySettings {
  atrPeriod: number; // default 14
  minimumAtrPercentile: number; // 0 to 100, default 20
  maximumAtrPercentile: number; // 0 to 100, default 90
  percentileLookback: number; // default 50
}

export interface MtfCombinedSettings {
  enabledFilters: ('TREND_EMA' | 'MARKET_STRUCTURE' | 'MOMENTUM' | 'VOLATILITY')[];
  minimumConfirmations: number; // e.g. 2 out of 3
}

export interface MultiTimeframeConfig {
  enabled?: boolean;
  higherTimeframe?: Timeframe;
  executionTimeframe?: Timeframe;
  confirmationTimeframe?: Timeframe;
  contextTimeframe?: Timeframe;
  higherTimeframeSource?: HigherTimeframeSource;
  higherTimeframeFilterMode: HigherTimeframeFilterMode;
  trendEmaSettings?: MtfTrendEmaSettings;
  structureSettings?: MtfStructureSettings;
  momentumSettings?: MtfMomentumSettings;
  volatilitySettings?: MtfVolatilitySettings;
  combinedSettings?: MtfCombinedSettings;
}

export type CooldownScope = 'PER_SYMBOL' | 'PER_STRATEGY' | 'PER_DIRECTION';
export type PostPartialStopMode = 'UNCHANGED' | 'BREAKEVEN' | 'LOCK_PROFIT';

export type StrategyPreset = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

export interface CommonStrategyParameters {
  directionMode: DirectionMode;
  riskRewardRatio: number;
  stopLossMode: StopLossMode;
  fixedStopPips?: number; // For FIXED_PIPS mode
  atrPeriod: number;
  atrMultiplier: number;
  orderType: OrderExecutionType;
  expiryBars: number;
  maxConcurrentPositions: number;
  maxOpenPositions?: number;
  maxPendingOrders?: number;
  maxCombinedExposure?: number;
  cooldownBars: number;
  cooldownScope?: CooldownScope;
  sessionFilter: SessionFilter;
  higherTimeframeFilter: boolean;
  mtfConfig?: MultiTimeframeConfig;
  enableBreakeven: boolean;
  breakevenTriggerR?: number; // default 1.0 R
  breakevenOffsetPips?: number; // default 0.5 pips
  includeEntryCostsInBreakeven?: boolean; // default true
  enablePartialTakeProfit: boolean;
  partialTakeProfitTriggerR?: number; // default 1.2 R
  partialClosePercent?: number; // default 50%
  moveStopAfterPartial?: boolean; // default true
  postPartialStopMode?: PostPartialStopMode; // default BREAKEVEN
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

export type SlippageModelType = 'FIXED' | 'VOLATILITY_SCALED' | 'VOLUME_WEIGHTED';
export type SpreadModelType = 'FIXED' | 'DYNAMIC_SESSION' | 'NEWS_VOLATILITY';
export type IntrabarAmbiguityMode = 'PESSIMISTIC' | 'OPTIMISTIC' | 'BAR_POLARITY';

export interface ExecutionFrictionParameters {
  slippageModelType: SlippageModelType;
  baseSlippagePips: number;
  volatilityMultiplier: number;
  additionalSlippagePips: number;
  spreadModelType: SpreadModelType;
  intrabarAmbiguityPolicy: IntrabarAmbiguityMode;
  randomSkippedFillsPercent: number;
}

export interface StrategyParameters {
  common: CommonStrategyParameters;
  trendBreakout: TrendBreakoutParameters;
  meanReversion: MeanReversionParameters;
  smc: SmcParameters;
  scalp: ScalpParameters;
  swing: SwingParameters;
  executionFriction?: ExecutionFrictionParameters;
}

export const DEFAULT_COMMON_PARAMETERS: Record<StrategyPreset, CommonStrategyParameters> = {
  BALANCED: {
    directionMode: 'BOTH',
    riskRewardRatio: 2.0,
    stopLossMode: 'ATR',
    fixedStopPips: 20,
    atrPeriod: 14,
    atrMultiplier: 1.5,
    orderType: 'LIMIT',
    expiryBars: 6,
    maxConcurrentPositions: 3,
    maxOpenPositions: 3,
    maxPendingOrders: 3,
    maxCombinedExposure: 5,
    cooldownBars: 2,
    cooldownScope: 'PER_SYMBOL',
    sessionFilter: 'ALL',
    higherTimeframeFilter: false,
    mtfConfig: {
      executionTimeframe: '15M',
      confirmationTimeframe: '1H',
      higherTimeframeSource: 'AUTO',
      higherTimeframeFilterMode: 'OFF',
      trendEmaSettings: {
        trendEmaPeriod: 50,
        trendSlopeLookback: 3,
        minimumSlope: 0.0,
      },
    },
    enableBreakeven: true,
    breakevenTriggerR: 1.0,
    breakevenOffsetPips: 0.5,
    includeEntryCostsInBreakeven: true,
    enablePartialTakeProfit: false,
    partialTakeProfitTriggerR: 1.2,
    partialClosePercent: 50,
    moveStopAfterPartial: true,
    postPartialStopMode: 'BREAKEVEN',
  },
  CONSERVATIVE: {
    directionMode: 'BOTH',
    riskRewardRatio: 2.5,
    stopLossMode: 'STRUCTURE',
    fixedStopPips: 25,
    atrPeriod: 20,
    atrMultiplier: 2.0,
    orderType: 'LIMIT',
    expiryBars: 4,
    maxConcurrentPositions: 1,
    maxOpenPositions: 1,
    maxPendingOrders: 2,
    maxCombinedExposure: 2,
    cooldownBars: 5,
    cooldownScope: 'PER_SYMBOL',
    sessionFilter: 'LONDON',
    higherTimeframeFilter: true,
    mtfConfig: {
      executionTimeframe: '15M',
      confirmationTimeframe: '1H',
      higherTimeframeSource: 'AUTO',
      higherTimeframeFilterMode: 'TREND_EMA',
      trendEmaSettings: {
        trendEmaPeriod: 50,
        trendSlopeLookback: 3,
        minimumSlope: 0.0,
      },
    },
    enableBreakeven: true,
    breakevenTriggerR: 1.0,
    breakevenOffsetPips: 1.0,
    includeEntryCostsInBreakeven: true,
    enablePartialTakeProfit: true,
    partialTakeProfitTriggerR: 1.5,
    partialClosePercent: 50,
    moveStopAfterPartial: true,
    postPartialStopMode: 'BREAKEVEN',
  },
  AGGRESSIVE: {
    directionMode: 'BOTH',
    riskRewardRatio: 1.5,
    stopLossMode: 'ATR',
    fixedStopPips: 15,
    atrPeriod: 10,
    atrMultiplier: 1.0,
    orderType: 'MARKET',
    expiryBars: 12,
    maxConcurrentPositions: 5,
    maxOpenPositions: 5,
    maxPendingOrders: 5,
    maxCombinedExposure: 8,
    cooldownBars: 1,
    cooldownScope: 'PER_SYMBOL',
    sessionFilter: 'ALL',
    higherTimeframeFilter: false,
    mtfConfig: {
      executionTimeframe: '5M',
      confirmationTimeframe: '15M',
      higherTimeframeSource: 'AUTO',
      higherTimeframeFilterMode: 'OFF',
      trendEmaSettings: {
        trendEmaPeriod: 30,
        trendSlopeLookback: 2,
        minimumSlope: 0.0,
      },
    },
    enableBreakeven: false,
    breakevenTriggerR: 1.0,
    breakevenOffsetPips: 0.0,
    includeEntryCostsInBreakeven: false,
    enablePartialTakeProfit: false,
    partialTakeProfitTriggerR: 1.0,
    partialClosePercent: 50,
    moveStopAfterPartial: false,
    postPartialStopMode: 'UNCHANGED',
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

export const DEFAULT_EXECUTION_FRICTION_PARAMETERS: Record<StrategyPreset, ExecutionFrictionParameters> = {
  BALANCED: {
    slippageModelType: 'VOLATILITY_SCALED',
    baseSlippagePips: 0.2,
    volatilityMultiplier: 0.1,
    additionalSlippagePips: 0.0,
    spreadModelType: 'FIXED',
    intrabarAmbiguityPolicy: 'PESSIMISTIC',
    randomSkippedFillsPercent: 0,
  },
  CONSERVATIVE: {
    slippageModelType: 'VOLATILITY_SCALED',
    baseSlippagePips: 0.4,
    volatilityMultiplier: 0.2,
    additionalSlippagePips: 0.2,
    spreadModelType: 'DYNAMIC_SESSION',
    intrabarAmbiguityPolicy: 'PESSIMISTIC',
    randomSkippedFillsPercent: 1.0,
  },
  AGGRESSIVE: {
    slippageModelType: 'FIXED',
    baseSlippagePips: 0.1,
    volatilityMultiplier: 0.0,
    additionalSlippagePips: 0.0,
    spreadModelType: 'FIXED',
    intrabarAmbiguityPolicy: 'BAR_POLARITY',
    randomSkippedFillsPercent: 0,
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
    executionFriction: { ...DEFAULT_EXECUTION_FRICTION_PARAMETERS[preset] },
  };
}
