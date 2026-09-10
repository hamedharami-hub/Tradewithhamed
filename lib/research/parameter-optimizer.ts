import type { Candle } from '@/lib/contracts/market';
import { ResearchExperimentEngine } from './experiment-engine';
import type {
  HistoricalDataset,
  ResearchExperimentConfig,
  StrategyRunResult,
  StrategyVariantId,
  AIReviewMode,
} from './contracts';
import { DEFAULT_RULE_PARAMETERS, type RuleParameters } from './strategy-rules';

export type OptimizationMethod = 'GRID' | 'RANDOM';
export type OptimizationObjective = 'NET_PROFIT' | 'EXPECTANCY' | 'PROFIT_FACTOR' | 'CALMAR_LIKE';
export type OptimizationSearchSpace = Partial<{ [K in keyof RuleParameters]: readonly number[] }>;

export interface ParameterOptimizationOptions {
  method?: OptimizationMethod;
  searchSpace: OptimizationSearchSpace;
  maxEvaluations?: number;
  seed?: number;
  minTrades?: number;
  objective?: OptimizationObjective;
  variant?: StrategyVariantId;
  aiMode?: AIReviewMode;
}

export interface ParameterOptimizationCandidate {
  rank: number;
  parameters: RuleParameters;
  score: number;
  acceptedForSelection: boolean;
  summary: StrategyRunResult['summary'];
}

export interface ParameterOptimizationResult {
  optimizerVersion: 'parameter-optimizer-v1';
  method: OptimizationMethod;
  objective: OptimizationObjective;
  evaluatedCandidates: number;
  searchSpace: OptimizationSearchSpace;
  best: ParameterOptimizationCandidate | null;
  leaderboard: ParameterOptimizationCandidate[];
  warnings: string[];
}

const PARAMETER_KEYS = Object.keys(DEFAULT_RULE_PARAMETERS) as Array<keyof RuleParameters>;

function normalizeParameters(config: ResearchExperimentConfig, candidate: Partial<RuleParameters>): RuleParameters {
  return {
    ...DEFAULT_RULE_PARAMETERS,
    stopLossAtrBuffer: config.stopLossAtrBuffer,
    targetRiskReward: config.targetRiskReward,
    expiryBars: config.entryExpiryBars,
    ...(config.minSweepPenetrationAtr !== undefined ? { minSweepPenetrationAtr: config.minSweepPenetrationAtr } : {}),
    ...(config.minFvgSizeAtr !== undefined ? { minFvgSizeAtr: config.minFvgSizeAtr } : {}),
    ...(config.trendMinEmaDistanceAtr !== undefined ? { trendMinEmaDistanceAtr: config.trendMinEmaDistanceAtr } : {}),
    ...config.ruleParameters,
    ...candidate,
  };
}

function product(space: OptimizationSearchSpace, base: RuleParameters): Partial<RuleParameters>[] {
  let values: Partial<RuleParameters>[] = [{}];
  for (const key of PARAMETER_KEYS) {
    const options = space[key];
    if (!options?.length) continue;
    values = values.flatMap(current => options.map(value => ({ ...current, [key]: value })));
  }
  return values.map(value => ({ ...base, ...value }));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function randomParameters(space: OptimizationSearchSpace, base: RuleParameters, random: () => number): Partial<RuleParameters> {
  const result: Partial<RuleParameters> = { ...base };
  for (const key of PARAMETER_KEYS) {
    const options = space[key];
    if (options?.length) result[key] = options[Math.floor(random() * options.length)];
  }
  return result;
}

function score(summary: StrategyRunResult['summary'], objective: OptimizationObjective, minTrades: number): { value: number; accepted: boolean } {
  const accepted = summary.totalTrades >= minTrades && summary.status !== 'INSUFFICIENT_DATA';
  if (!accepted) return { value: Number.NEGATIVE_INFINITY, accepted: false };
  if (objective === 'EXPECTANCY') return { value: summary.expectancy, accepted: true };
  if (objective === 'PROFIT_FACTOR') return { value: summary.profitFactor, accepted: true };
  if (objective === 'CALMAR_LIKE') return { value: summary.maxDrawdownPercent > 0 ? summary.netProfit / summary.maxDrawdownPercent : summary.netProfit, accepted: true };
  return { value: summary.netProfit, accepted: true };
}

export class ParameterOptimizer {
  public static run(dataset: HistoricalDataset, config: ResearchExperimentConfig, options: ParameterOptimizationOptions): ParameterOptimizationResult {
    const method = options.method ?? 'GRID';
    const objective = options.objective ?? 'NET_PROFIT';
    const maxEvaluations = Math.max(1, Math.floor(options.maxEvaluations ?? 200));
    const minTrades = Math.max(0, Math.floor(options.minTrades ?? 10));
    const variant = options.variant ?? config.strategyVariants[0];
    const aiMode = options.aiMode ?? config.aiModes[0];
    if (!variant || !aiMode) throw new Error('برای optimizer حداقل یک strategy variant و AI mode لازم است.');

    const base = normalizeParameters(config, {});
    const candidates = method === 'GRID'
      ? product(options.searchSpace, base).slice(0, maxEvaluations)
      : Array.from({ length: maxEvaluations }, (_, index) => index === 0 ? { ...base } : randomParameters(options.searchSpace, base, seededRandom((options.seed ?? config.seed) + index)));

    const leaderboard: ParameterOptimizationCandidate[] = [];
    candidates.forEach((parameters, index) => {
      const run = ResearchExperimentEngine.run(dataset, {
        ...config,
        experimentId: `${config.experimentId}-OPT-${index + 1}`,
        strategyVariants: [variant],
        aiModes: [aiMode],
        ruleParameters: parameters,
      }).runs[0];
      if (!run) return;
      const result = score(run.summary, objective, minTrades);
      leaderboard.push({ rank: 0, parameters: normalizeParameters(config, parameters), score: Number.isFinite(result.value) ? Number(result.value.toFixed(6)) : Number.NEGATIVE_INFINITY, acceptedForSelection: result.accepted, summary: run.summary });
    });

    leaderboard.sort((left, right) => right.score - left.score || right.summary.totalTrades - left.summary.totalTrades);
    leaderboard.forEach((entry, index) => { entry.rank = index + 1; });
    const best = leaderboard.find(entry => entry.acceptedForSelection) ?? leaderboard[0] ?? null;
    return {
      optimizerVersion: 'parameter-optimizer-v1',
      method,
      objective,
      evaluatedCandidates: leaderboard.length,
      searchSpace: options.searchSpace,
      best,
      leaderboard,
      warnings: [
        'هر candidate فقط روی داده‌ای که به optimizer داده شده ارزیابی می‌شود؛ optimizer نباید به کندل‌های OOS دسترسی داشته باشد.',
        `انتخاب با objective=${objective} و حداقل ${minTrades} معامله انجام شد؛ این حداقل، جایگزین ارزیابی پایداری نیست.`,
        method === 'GRID' && product(options.searchSpace, base).length > maxEvaluations ? `تعداد grid از سقف ${maxEvaluations} بیشتر بود و truncate شد.` : 'ترتیب و seed اجرای optimizer قابل تکرار است.',
      ],
    };
  }

  public static runOnCandles(candles: Candle[], dataset: HistoricalDataset, config: ResearchExperimentConfig, options: ParameterOptimizationOptions): ParameterOptimizationResult {
    const scopedDataset: HistoricalDataset = { ...dataset, candles, manifest: { ...dataset.manifest, totalBars: candles.length, acceptedBars: candles.length, startTime: candles[0]?.timestamp ?? dataset.manifest.startTime, endTime: candles.at(-1)?.timestamp ?? dataset.manifest.endTime } };
    return this.run(scopedDataset, config, options);
  }
}

export const PARAMETER_OPTIMIZER_VERSION = 'parameter-optimizer-v1' as const;
