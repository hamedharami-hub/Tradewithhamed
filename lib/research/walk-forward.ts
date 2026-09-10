import type { Candle } from '@/lib/contracts/market';
import type {
  HistoricalDataset,
  PerformanceSlice,
  ResearchExperimentConfig,
  ResearchTrade,
  StrategyRunResult,
  StrategyVariantId,
  AIReviewMode,
} from './contracts';
import { ResearchExperimentEngine } from './experiment-engine';
import { ParameterOptimizer, type ParameterOptimizationOptions, type ParameterOptimizationResult } from './parameter-optimizer';
import type { RuleParameters } from './strategy-rules';

export interface WalkForwardFold {
  fold: number;
  trainStartTime: number;
  trainEndTime: number;
  outOfSampleStartTime: number;
  outOfSampleEndTime: number;
  selectedVariant: StrategyVariantId;
  selectedAiMode: AIReviewMode;
  selectedParameters?: RuleParameters;
  optimization?: ParameterOptimizationResult;
  trainSummary: StrategyRunResult['summary'];
  outOfSampleSummary: StrategyRunResult['summary'];
  outOfSampleAnalysis: StrategyRunResult['analysis'];
}

export interface WalkForwardResult {
  evaluatorVersion: 'walk-forward-v1';
  datasetId: string;
  symbol: HistoricalDataset['manifest']['canonicalSymbol'];
  timeframe: HistoricalDataset['manifest']['timeframe'];
  parameters: { trainBars: number; testBars: number; stepBars: number; purgeBars: number };
  folds: WalkForwardFold[];
  outOfSampleTrades: ResearchTrade[];
  outOfSampleAnalysis: {
    SESSION_UTC: PerformanceSlice[];
    DAY_OF_WEEK_UTC: PerformanceSlice[];
    HOUR_UTC: PerformanceSlice[];
  };
  warnings: string[];
}

function sliceMetrics(key: string, labelFa: string, trades: ResearchTrade[], initialCash: number, timeframe: ResearchExperimentConfig['timeframe']): PerformanceSlice {
  const wins = trades.filter(trade => trade.realizedPnl > 0);
  const losses = trades.filter(trade => trade.realizedPnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.realizedPnl, 0));
  const netProfit = trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  let equity = initialCash;
  let peak = equity;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += trade.realizedPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }
  const timeframeMs = ({ '1M': 60_000, '5M': 300_000, '15M': 900_000, '1H': 3_600_000, '4H': 14_400_000, D1: 86_400_000 } as Record<string, number>)[timeframe];
  return {
    key,
    labelFa,
    tradesCount: trades.length,
    winRatePercent: trades.length ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0,
    netProfit: Number(netProfit.toFixed(2)),
    profitFactor: Number((grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0).toFixed(2)),
    expectancy: Number((trades.length ? netProfit / trades.length : 0).toFixed(2)),
    averageHoldingBars: Number((trades.length ? trades.reduce((sum, trade) => sum + Math.max(0, Math.round(((trade.closedTimestamp || trade.openedTimestamp) - trade.openedTimestamp) / timeframeMs)), 0) / trades.length : 0).toFixed(1)),
    maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
  };
}

function segment(trades: ResearchTrade[], selector: (trade: ResearchTrade) => string, label: (key: string) => string, initialCash: number, timeframe: ResearchExperimentConfig['timeframe']): PerformanceSlice[] {
  const groups = new Map<string, ResearchTrade[]>();
  for (const trade of trades) groups.set(selector(trade), [...(groups.get(selector(trade)) || []), trade]);
  return [...groups.entries()].map(([key, values]) => sliceMetrics(key, label(key), values, initialCash, timeframe)).sort((a, b) => b.netProfit - a.netProfit);
}

function datasetWindow(dataset: HistoricalDataset, candles: Candle[]): HistoricalDataset {
  return { ...dataset, candles, manifest: { ...dataset.manifest, startTime: candles[0]?.timestamp || dataset.manifest.startTime, endTime: candles.at(-1)?.timestamp || dataset.manifest.endTime, totalBars: candles.length, acceptedBars: candles.length } };
}

export class WalkForwardEvaluator {
  public static run(dataset: HistoricalDataset, config: ResearchExperimentConfig, options: { trainBars?: number; testBars?: number; stepBars?: number; purgeBars?: number; parameterOptimization?: Omit<ParameterOptimizationOptions, 'variant' | 'aiMode'> } = {}): WalkForwardResult {
    const candles = dataset.candles.filter(candle => candle.isClosed);
    const trainBars = options.trainBars ?? Math.max(500, Math.floor(candles.length * 0.45));
    const testBars = options.testBars ?? Math.max(150, Math.floor(candles.length * 0.15));
    const stepBars = options.stepBars ?? testBars;
    const purgeBars = options.purgeBars ?? Math.max(1, config.entryExpiryBars);
    const folds: WalkForwardFold[] = [];
    const outOfSampleTrades: ResearchTrade[] = [];
    let fold = 1;

    for (let trainStart = 0; trainStart + trainBars + purgeBars + testBars <= candles.length; trainStart += stepBars) {
      const trainEndIndex = trainStart + trainBars;
      const oosStartIndex = trainEndIndex + purgeBars;
      const oosEndIndex = oosStartIndex + testBars;
      const trainData = datasetWindow(dataset, candles.slice(trainStart, trainEndIndex));
      const trainResult = ResearchExperimentEngine.run(trainData, { ...config, experimentId: `${config.experimentId}-WF${fold}-TRAIN` });
      const eligibleTrainRuns = trainResult.runs.filter(run => run.summary.totalTrades >= 10);
      const selected = [...(eligibleTrainRuns.length ? eligibleTrainRuns : trainResult.runs)].sort((a, b) => b.summary.netProfit - a.summary.netProfit)[0];
      let optimization: ParameterOptimizationResult | undefined;
      let selectedParameters: RuleParameters | undefined;
      let selectedRun = selected;
      if (options.parameterOptimization) {
        optimization = ParameterOptimizer.run(trainData, { ...config, experimentId: `${config.experimentId}-WF${fold}-OPT` }, {
          ...options.parameterOptimization,
          variant: config.strategyVariants[0],
          aiMode: config.aiModes[0],
        });
        if (optimization.best) {
          selectedParameters = optimization.best.parameters;
          selectedRun = trainResult.runs.find(run => run.summary.variant === optimization?.best?.summary.variant && run.summary.aiMode === optimization?.best?.summary.aiMode) || selected;
        }
      }
      if (!selectedRun) break;
      const oosData = datasetWindow(dataset, candles.slice(0, oosEndIndex));
      const oosConfig: ResearchExperimentConfig = {
        ...config,
        experimentId: `${config.experimentId}-WF${fold}-OOS`,
        strategyVariants: [optimization?.best?.summary.variant || selectedRun.summary.variant],
        aiModes: [optimization?.best?.summary.aiMode || selectedRun.summary.aiMode],
        ...(selectedParameters ? { ruleParameters: selectedParameters } : {}),
        evaluationStartTime: candles[oosStartIndex].timestamp,
      };
      const oosResult = ResearchExperimentEngine.run(oosData, oosConfig);
      const oosRun = oosResult.runs[0];
      if (!oosRun) break;
      folds.push({
        fold,
        trainStartTime: candles[trainStart].timestamp,
        trainEndTime: candles[trainEndIndex - 1].timestamp,
        outOfSampleStartTime: candles[oosStartIndex].timestamp,
        outOfSampleEndTime: candles[oosEndIndex - 1].timestamp,
        selectedVariant: optimization?.best?.summary.variant || selectedRun.summary.variant,
        selectedAiMode: optimization?.best?.summary.aiMode || selectedRun.summary.aiMode,
        ...(selectedParameters ? { selectedParameters } : {}),
        ...(optimization ? { optimization } : {}),
        trainSummary: optimization?.best?.summary || selectedRun.summary,
        outOfSampleSummary: oosRun.summary,
        outOfSampleAnalysis: oosRun.analysis,
      });
      outOfSampleTrades.push(...oosRun.trades.filter(trade => !trade.isOpen));
      fold++;
    }

    return {
      evaluatorVersion: 'walk-forward-v1',
      datasetId: dataset.manifest.datasetId,
      symbol: dataset.manifest.canonicalSymbol,
      timeframe: dataset.manifest.timeframe,
      parameters: { trainBars, testBars, stepBars, purgeBars },
      folds,
      outOfSampleTrades,
      outOfSampleAnalysis: {
        SESSION_UTC: segment(outOfSampleTrades, trade => trade.sessionUtc, key => ({ ASIA: 'آسیا', LONDON: 'لندن', NEW_YORK: 'نیویورک', OFF_HOURS: 'خارج از سشن' } as Record<string, string>)[key] || key, config.initialCash, config.timeframe),
        DAY_OF_WEEK_UTC: segment(outOfSampleTrades, trade => String(trade.entryDayOfWeekUtc), key => ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'][Number(key)] || key, config.initialCash, config.timeframe),
        HOUR_UTC: segment(outOfSampleTrades, trade => String(trade.entryHourUtc).padStart(2, '0'), key => `${key}:00 UTC`, config.initialCash, config.timeframe),
      },
      warnings: [
        'این ارزیابی پارامترها را از هر fold خارج از نمونه انتخاب می‌کند؛ انتخاب بر اساس OOS ممنوع است.',
        'فاصله purge برابر entryExpiryBars برای جلوگیری از آلودگی مرزی بین train و OOS اعمال شده است.',
        'نتایج OOS برای تصمیم Paper-Forward مناسب‌تر از نتایج in-sample هستند، اما هنوز تضمین سودآوری نیستند.',
      ],
    };
  }
}

export const WALK_FORWARD_ENGINE_VERSION = 'walk-forward-v1' as const;

export function writeableWalkForwardResult(result: WalkForwardResult): WalkForwardResult {
  return JSON.parse(JSON.stringify(result)) as WalkForwardResult;
}
