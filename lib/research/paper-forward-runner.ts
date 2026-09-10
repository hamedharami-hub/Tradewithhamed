import type { Candle, SymbolId, Timeframe } from '@/lib/contracts/market';
import { createDatasetFromCandles } from './dataset';
import { createBaselineResearchConfig } from './default-config';
import { ResearchExperimentEngine } from './experiment-engine';
import { evaluateResearchStrategy } from './strategy-rules';
import type { RuleParameters } from './strategy-rules';
import { reviewCandidateWithFourAgents } from '@/lib/ai/agentic-reviewer';
import { DEFAULT_MULTI_AGENT_CONFIG } from '@/lib/contracts/multi-agent-system';
import { isRolloverBlackout } from '@/lib/core/market-microstructure';
import type { AIReviewMode, PaperForwardSnapshot, PaperForwardState, StrategyVariantId } from './contracts';

interface PaperForwardRun {
  state: PaperForwardState;
  bars: Candle[];
  snapshot: PaperForwardSnapshot;
  approvedCandidateIds: Set<string>;
  reviewedCandidateIds: Set<string>;
  ruleOverrides?: Partial<RuleParameters>;
}

const globalStore = globalThis as unknown as { paperForwardRuns?: Map<string, PaperForwardRun> };
const runs = globalStore.paperForwardRuns || new Map<string, PaperForwardRun>();
if (!globalStore.paperForwardRuns) globalStore.paperForwardRuns = runs;

function key(symbol: SymbolId, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}

export class PaperForwardRunner {
  public static start(input: { symbol: SymbolId; timeframe: Timeframe; strategyVariants?: StrategyVariantId[]; aiMode?: AIReviewMode; ruleOverrides?: Partial<RuleParameters> }): PaperForwardSnapshot {
    const runKey = key(input.symbol, input.timeframe);
    const existing = runs.get(runKey);
    if (existing) return existing.snapshot;
    const state: PaperForwardState = {
      paperRunId: `PAPER-FORWARD-${input.symbol}-${input.timeframe}`,
      symbol: input.symbol,
      timeframe: input.timeframe,
      startedAt: Date.now(),
      receivedBars: 0,
      acceptedBars: 0,
      rejectedBars: 0,
      strategyVariants: input.strategyVariants || ['S0_SWEEP_FVG'],
      aiMode: input.aiMode || 'OFF',
      isRunning: true,
    };
    const snapshot: PaperForwardSnapshot = { state, result: null, recentTraces: [] };
    runs.set(runKey, { state, bars: [], snapshot, approvedCandidateIds: new Set(), reviewedCandidateIds: new Set(), ruleOverrides: input.ruleOverrides });
    return snapshot;
  }

  public static ingestClosedBar(symbol: SymbolId, timeframe: Timeframe, candle: Candle, runReplay = true): PaperForwardSnapshot {
    const runKey = key(symbol, timeframe);
    const run = runs.get(runKey) || { state: this.start({ symbol, timeframe }).state, bars: [], snapshot: this.start({ symbol, timeframe }), approvedCandidateIds: new Set<string>(), reviewedCandidateIds: new Set<string>(), ruleOverrides: undefined };
    if (!runs.has(runKey)) runs.set(runKey, run);
    run.state.receivedBars++;
    if (!run.state.isRunning || !candle.isClosed || !Number.isFinite(candle.timestamp)) {
      run.state.rejectedBars++;
      run.state.lastError = !run.state.isRunning ? 'Paper-forward متوقف شده است.' : 'فقط کندل بسته و معتبر برای paper-forward پذیرفته می‌شود.';
      run.snapshot = { ...run.snapshot, state: { ...run.state } };
      return run.snapshot;
    }
    const latest = run.bars.at(-1);
    if (latest && candle.timestamp <= latest.timestamp) {
      run.state.rejectedBars++;
      run.state.lastError = 'کندل تکراری یا خارج از ترتیب برای paper-forward رد شد.';
      run.snapshot = { ...run.snapshot, state: { ...run.state } };
      return run.snapshot;
    }
    run.bars.push({ ...candle, isClosed: true });
    run.state.acceptedBars++;
    run.state.latestProcessedTimestamp = candle.timestamp;
    run.state.lastError = undefined;

    if (runReplay && run.bars.length >= 140) {
      const dataset = createDatasetFromCandles({
        candles: run.bars,
        provider: 'Paper-forward bar feed',
        providerSymbol: symbol,
        canonicalSymbol: symbol,
        instrumentLabel: `${symbol} closed-bar paper-forward feed`,
        timeframe,
        rawSourcePath: 'paper-forward://memory',
        contentSha256: `PAPER-FORWARD-${run.state.paperRunId}`,
        sourceLicense: 'No broker order execution; local paper-forward simulation only.',
      });
      const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe, experimentId: run.state.paperRunId });
      config.environment = 'PAPER_REPLAY';
    config.strategyVariants = run.state.strategyVariants;
    config.aiModes = [run.state.aiMode];
    Object.assign(config, run.ruleOverrides || {});
      const experiment = ResearchExperimentEngine.run(dataset, config);
      const result = experiment.runs[0] || null;
      run.snapshot = { state: { ...run.state }, result, recentTraces: result?.traces.slice(-20) || [] };
    } else {
      run.snapshot = { state: { ...run.state }, result: null, recentTraces: [] };
    }
    return run.snapshot;
  }

  public static stop(symbol: SymbolId, timeframe: Timeframe): PaperForwardSnapshot | null {
    const run = runs.get(key(symbol, timeframe));
    if (!run) return null;
    run.state.isRunning = false;
    run.snapshot = { ...run.snapshot, state: { ...run.state } };
    return run.snapshot;
  }

  public static async ingestClosedBarWithAgents(symbol: SymbolId, timeframe: Timeframe, candle: Candle, agentConfig = DEFAULT_MULTI_AGENT_CONFIG): Promise<PaperForwardSnapshot> {
    const snapshot = this.ingestClosedBar(symbol, timeframe, candle, false);
    const run = runs.get(key(symbol, timeframe));
    if (!run || !run.state.isRunning || run.bars.length < 140) return snapshot;
    if (isRolloverBlackout(candle.timestamp)) {
      run.state.lastError = 'بازهٔ رول‌اور شبانه (۲۱:۰۰ تا ۲۲:۳۰ UTC): بررسی کاندید جدید مسدود شد.';
      return run.snapshot;
    }
    const candidate = evaluateResearchStrategy(run.bars, symbol, timeframe, run.state.strategyVariants[0] || 'S0_SWEEP_FVG');
    if (!candidate || run.reviewedCandidateIds.has(candidate.id)) return run.snapshot;
    const review = await reviewCandidateWithFourAgents(candidate, agentConfig);
    run.reviewedCandidateIds.add(candidate.id);
    if (review.finalDecision === 'PAPER_TRADE') run.approvedCandidateIds.add(candidate.id);
    const dataset = createDatasetFromCandles({ candles: run.bars, provider: 'Paper-forward bar feed', providerSymbol: symbol, canonicalSymbol: symbol, instrumentLabel: `${symbol} closed-bar paper-forward feed`, timeframe, rawSourcePath: 'paper-forward://memory', contentSha256: `PAPER-FORWARD-${run.state.paperRunId}`, sourceLicense: 'No broker order execution; local paper-forward simulation only.' });
    const config = createBaselineResearchConfig({ datasetId: dataset.manifest.datasetId, symbol, timeframe, experimentId: run.state.paperRunId });
    config.environment = 'PAPER_REPLAY';
    config.strategyVariants = run.state.strategyVariants;
    config.aiModes = ['AGENTIC_OFFLINE'];
    Object.assign(config, run.ruleOverrides || {});
    config.approvedCandidateIds = [...run.approvedCandidateIds];
    const result = ResearchExperimentEngine.run(dataset, config).runs[0] || null;
    run.snapshot = { state: { ...run.state, aiMode: 'AGENTIC_OFFLINE' }, result, recentTraces: result?.traces.slice(-20) || [] };
    return run.snapshot;
  }

  public static getSnapshot(symbol: SymbolId, timeframe: Timeframe): PaperForwardSnapshot | null {
    return runs.get(key(symbol, timeframe))?.snapshot || null;
  }
}
