import { SYMBOL_SPECS, type Candle, type SymbolId, type Timeframe } from '@/lib/contracts/market';
import type { MarketRegimeType } from '@/lib/contracts/regimes';
import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { EventDrivenExecutionEngine } from '@/lib/core/event-driven-engine';
import { MarketRegimeClassifier } from '@/lib/core/market-regime-classifier';
import type { OrderIntentPayload, PositionLedgerEntry } from '@/lib/core/ports';
import { timeframeMs } from './dataset';
import { evaluateResearchStrategy, RESEARCH_RULE_VERSION } from './strategy-rules';
import type {
  AIReviewMode,
  AnalysisDimension,
  CandidateDecisionTrace,
  HistoricalDataset,
  PaperForwardSnapshot,
  PerformanceSlice,
  ResearchExperimentConfig,
  ResearchExperimentResult,
  ResearchTrade,
  StrategyRunResult,
  StrategyRunSummary,
  StrategyVariantId,
} from './contracts';

const ENGINE_VERSION = 'research-engine-v1' as const;

interface IntentContext {
  candidateId: string;
  variant: StrategyVariantId;
  aiMode: AIReviewMode;
  regime: MarketRegimeType;
  signalTimestamp: number;
  eligibleFromTimestamp: number;
}

function sessionForTimestamp(timestamp: number): ResearchTrade['sessionUtc'] {
  const hour = new Date(timestamp).getUTCHours();
  if (hour <= 6) return 'ASIA';
  if (hour <= 11) return 'LONDON';
  if (hour <= 16) return 'NEW_YORK';
  return 'OFF_HOURS';
}

function getTradeDateParts(timestamp: number): { hour: number; day: number; month: number } {
  const date = new Date(timestamp);
  return { hour: date.getUTCHours(), day: date.getUTCDay(), month: date.getUTCMonth() + 1 };
}

function labelForDimension(dimension: AnalysisDimension, key: string): string {
  if (dimension === 'HOUR_UTC') return `ساعت ${key}:00 UTC`;
  if (dimension === 'DAY_OF_WEEK_UTC') return ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'][Number(key)] || key;
  if (dimension === 'MONTH_UTC') return `ماه ${key}`;
  if (dimension === 'SESSION_UTC') return ({ ASIA: 'آسیا', LONDON: 'لندن', NEW_YORK: 'نیویورک', OFF_HOURS: 'خارج از جلسه' } as Record<string, string>)[key] || key;
  if (dimension === 'DIRECTION') return key === 'BUY' ? 'خرید' : 'فروش';
  if (dimension === 'AI_MODE') return ({ OFF: 'بدون AI', DETERMINISTIC_COUNCIL: 'فیلتر قطعی', WEBLLM_ADVISORY: 'WebLLM advisory', AGENTIC_OFFLINE: 'شورای چهار agent آفلاین', ONLINE_ADVISORY: 'Online advisory', HYBRID_COMPARE: 'Hybrid local + online' } as Record<string, string>)[key] || key;
  return key;
}

function calculateSlice(key: string, labelFa: string, trades: ResearchTrade[], initialCash: number, timeframe: Timeframe): PerformanceSlice {
  const ordered = [...trades].sort((left, right) => (left.closedTimestamp || Infinity) - (right.closedTimestamp || Infinity));
  const wins = ordered.filter(trade => trade.realizedPnl > 0).length;
  const grossProfit = ordered.filter(trade => trade.realizedPnl > 0).reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const grossLoss = Math.abs(ordered.filter(trade => trade.realizedPnl < 0).reduce((sum, trade) => sum + trade.realizedPnl, 0));
  const netProfit = grossProfit - grossLoss;
  let equity = initialCash;
  let peak = equity;
  let maxDrawdown = 0;
  for (const trade of ordered) {
    equity += trade.realizedPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }
  const averageHoldingBars = ordered.length > 0
    ? ordered.reduce((sum, trade) => sum + Math.max(0, Math.round(((trade.closedTimestamp || trade.openedTimestamp) - trade.openedTimestamp) / timeframeMs(timeframe))), 0) / ordered.length
    : 0;
  return {
    key,
    labelFa,
    tradesCount: ordered.length,
    winRatePercent: ordered.length > 0 ? Number(((wins / ordered.length) * 100).toFixed(1)) : 0,
    netProfit: Number(netProfit.toFixed(2)),
    profitFactor: Number((grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0).toFixed(2)),
    expectancy: Number((ordered.length > 0 ? netProfit / ordered.length : 0).toFixed(2)),
    averageHoldingBars: Number(averageHoldingBars.toFixed(1)),
    maxDrawdownPercent: Number(maxDrawdown.toFixed(2)),
  };
}

function analysisForTrades(trades: ResearchTrade[], initialCash: number, timeframe: Timeframe): StrategyRunResult['analysis'] {
  const dimensions: Array<{ dimension: AnalysisDimension; selector: (trade: ResearchTrade) => string }> = [
    { dimension: 'VARIANT', selector: trade => trade.variant },
    { dimension: 'AI_MODE', selector: trade => trade.aiMode },
    { dimension: 'HOUR_UTC', selector: trade => String(trade.entryHourUtc).padStart(2, '0') },
    { dimension: 'DAY_OF_WEEK_UTC', selector: trade => String(trade.entryDayOfWeekUtc) },
    { dimension: 'MONTH_UTC', selector: trade => String(trade.entryMonthUtc).padStart(2, '0') },
    { dimension: 'SESSION_UTC', selector: trade => trade.sessionUtc },
    { dimension: 'REGIME', selector: trade => trade.regime },
    { dimension: 'DIRECTION', selector: trade => trade.direction },
  ];
  const result: StrategyRunResult['analysis'] = {};
  for (const { dimension, selector } of dimensions) {
    const grouped = new Map<string, ResearchTrade[]>();
    for (const trade of trades) {
      const key = selector(trade);
      const existing = grouped.get(key) || [];
      existing.push(trade);
      grouped.set(key, existing);
    }
    result[dimension] = [...grouped.entries()]
      .map(([key, groupedTrades]) => calculateSlice(key, labelForDimension(dimension, key), groupedTrades, initialCash, timeframe))
      .sort((left, right) => right.netProfit - left.netProfit || right.tradesCount - left.tradesCount);
  }
  return result;
}

function allowCandidateByAiMode(candidate: { id?: string; riskRewardRatio: number; evidenceIds: { fvgId?: string } }, variant: StrategyVariantId, regime: MarketRegimeType, aiMode: AIReviewMode, approvedCandidateIds?: string[]): { accepted: boolean; reasons: string[] } {
  if (aiMode === 'OFF') return { accepted: true, reasons: ['AI_OFF_BASELINE'] };
  if (aiMode === 'WEBLLM_ADVISORY') {
    return { accepted: false, reasons: ['WEBLLM_BATCH_NOT_EXECUTED', 'WebLLM فقط در مرورگر و با مدل resident برای review تک‌ستاپ اجرا می‌شود؛ بک‌تست batch نباید نتیجهٔ ساختگی تولید کند.'] };
  }
  if (aiMode === 'ONLINE_ADVISORY' || aiMode === 'HYBRID_COMPARE') {
    const approved = candidate.id !== undefined && approvedCandidateIds?.includes(candidate.id) === true;
    return approved ? { accepted: true, reasons: ['ASYNC_PROVIDER_APPROVED'] } : { accepted: false, reasons: ['ASYNC_PROVIDER_GATE_REQUIRED'] };
  }
  if (aiMode === 'AGENTIC_OFFLINE') {
    return { accepted: true, reasons: ['AGENTIC_REVIEW_REQUIRED'] };
  }
  const reasons: string[] = [];
  if (candidate.riskRewardRatio < 2) reasons.push('RISK_REWARD_BELOW_2');
  if (['S0_SWEEP_FVG', 'FVG_EQUILIBRIUM_V1'].includes(variant) && !candidate.evidenceIds.fvgId) reasons.push('MISSING_FVG_EVIDENCE');
  if (regime === 'HIGH_VOL_NEWS') reasons.push('HIGH_VOLATILITY_REGIME_BLOCK');
  if (variant === 'MEAN_REVERSION_V1' && !['CHOPPY_RANGING', 'COMPRESSION'].includes(regime)) reasons.push('MEAN_REVERSION_REGIME_BLOCK');
  if (variant === 'TREND_BREAKOUT_55_EMA200_V1' && !['TRENDING_BULLISH', 'TRENDING_BEARISH', 'COMPRESSION'].includes(regime)) reasons.push('TREND_BREAKOUT_REGIME_BLOCK');
  return { accepted: reasons.length === 0, reasons: reasons.length === 0 ? ['DETERMINISTIC_COUNCIL_APPROVED'] : reasons };
}

function buildIntent(resolved: StrategyCandidate, config: ResearchExperimentConfig, timestamp: number): OrderIntentPayload {
  const contractSize = SYMBOL_SPECS[config.symbol].contractSize;
  const dollarRisk = config.initialCash * (config.riskPerTradePercent / 100);
  const riskDistance = Math.abs(resolved.entryPrice - resolved.stopLossPrice);
  // EURUSD/GBPUSD/XAUUSD quote in USD; USDJPY quote is JPY and must be converted
  // back to account USD using the entry price. Without this, USDJPY lots round to
  // zero and the backtest silently reports no trades.
  const quoteToAccount = config.symbol === 'USDJPY' ? 1 / resolved.entryPrice : 1;
  const rawVolume = riskDistance > 0 ? dollarRisk / (riskDistance * contractSize * quoteToAccount) : 0;
  const volumeLots = Math.floor(rawVolume * 100) / 100;
  return {
    intentId: `INT-${config.experimentId}-${resolved.id}`,
    environment: config.environment || 'BACKTEST',
    accountNamespace: config.experimentId,
    candidateId: resolved.id,
    symbol: config.symbol,
    orderType: 'MARKET',
    direction: resolved.direction,
    volumeLots,
    entryPrice: resolved.entryPrice,
    stopLossPrice: resolved.stopLossPrice,
    takeProfitPrice: resolved.takeProfitPrice,
    maxSlippagePips: config.costModel.slippagePips,
    expiryTimestamp: resolved.expiresAtTimestamp,
    reasonCode: resolved.strategyName,
    createdTimestamp: timestamp,
    idempotencyKey: `IDEMP-${config.experimentId}-${resolved.id}`,
  };
}

function evaluateRun(candles: Candle[], config: ResearchExperimentConfig, variant: StrategyVariantId, aiMode: AIReviewMode): StrategyRunResult {
  const traces: CandidateDecisionTrace[] = [];
  const contexts = new Map<string, IntentContext>();
  const engine = new EventDrivenExecutionEngine({
    environment: config.environment || 'BACKTEST',
    accountNamespace: config.experimentId,
    initialCash: config.initialCash,
    commissionPerLot: config.costModel.commissionPerLotRoundTrip,
    defaultSpreadPips: config.costModel.spreadPips,
    ambiguityPolicy: 'PESSIMISTIC',
    slippageModel: { baseSlippagePips: config.costModel.slippagePips, volatilityMultiplier: 0 },
  });
  const equityCurve: StrategyRunResult['equityCurve'] = [];
  let totalSignals = 0;
  let submittedOrders = 0;
  let hasPendingOrder = false;
  const startIndex = Math.max(config.warmupBars, 20);

  for (let index = startIndex; index < candles.length; index++) {
    const currentCandle = candles[index];
    const executionEvents = engine.processCandle(currentCandle, config.symbol);
    for (const event of executionEvents) {
      if (contexts.has(event.intentId) && ['FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(event.status)) hasPendingOrder = false;
    }
    const ledger = engine.getLedger();
    equityCurve.push({ timestamp: currentCandle.timestamp, equity: ledger.equity, drawdownPercent: ledger.maxDrawdownPercent });

    const openPositions = ledger.positions.filter(position => position.isOpen).length;
    if (openPositions >= config.maxConcurrentPositions || hasPendingOrder) continue;
    if (config.evaluationStartTime !== undefined && currentCandle.timestamp < config.evaluationStartTime) continue;
    if (config.allowedSessions && !config.allowedSessions.includes(sessionForTimestamp(currentCandle.timestamp))) continue;
    const slice = candles.slice(0, index + 1);
    const candidate = evaluateResearchStrategy(slice, config.symbol, config.timeframe, variant, {
      stopLossAtrBuffer: config.stopLossAtrBuffer,
      targetRiskReward: config.targetRiskReward,
      expiryBars: config.entryExpiryBars,
      ...(config.minSweepPenetrationAtr !== undefined ? { minSweepPenetrationAtr: config.minSweepPenetrationAtr } : {}),
      ...(config.minFvgSizeAtr !== undefined ? { minFvgSizeAtr: config.minFvgSizeAtr } : {}),
    });
    if (!candidate) continue;
    totalSignals++;
    const regime = MarketRegimeClassifier.classify(slice).regime;
    const eligibleFromTimestamp = index + 1 < candles.length ? candles[index + 1].timestamp : currentCandle.timestamp + 1;
    const evidenceIds = Object.values(candidate.evidenceIds).filter((value): value is string => Boolean(value));
    const decision = allowCandidateByAiMode(candidate, variant, regime, aiMode, config.approvedCandidateIds);
    if (aiMode === 'AGENTIC_OFFLINE' || aiMode === 'ONLINE_ADVISORY' || aiMode === 'HYBRID_COMPARE') {
      const approved = config.approvedCandidateIds?.includes(candidate.id) === true;
      if (!approved) {
        traces.push({ candidateId: candidate.id, variant, aiMode, timestamp: currentCandle.timestamp, eligibleFromTimestamp, status: 'FILTERED', reasonCodes: [aiMode === 'AGENTIC_OFFLINE' ? 'AGENTIC_REVIEW_NOT_APPROVED' : 'ADVISORY_PROVIDER_NOT_APPROVED'], regime, evidenceIds });
        continue;
      }
    }
    if (!decision.accepted) {
      traces.push({ candidateId: candidate.id, variant, aiMode, timestamp: currentCandle.timestamp, eligibleFromTimestamp, status: 'FILTERED', reasonCodes: decision.reasons, regime, evidenceIds });
      continue;
    }
    const intent = buildIntent(candidate, config, currentCandle.timestamp);
    if (intent.volumeLots <= 0) {
      traces.push({ candidateId: candidate.id, variant, aiMode, timestamp: currentCandle.timestamp, eligibleFromTimestamp, status: 'FILTERED', reasonCodes: ['VOLUME_BELOW_MINIMUM_RISK_BUDGET'], regime, evidenceIds });
      continue;
    }
    engine.submitOrder(intent);
    contexts.set(intent.intentId, { candidateId: candidate.id, variant, aiMode, regime, signalTimestamp: currentCandle.timestamp, eligibleFromTimestamp });
    hasPendingOrder = true;
    submittedOrders++;
    traces.push({ candidateId: candidate.id, variant, aiMode, timestamp: currentCandle.timestamp, eligibleFromTimestamp, status: 'SUBMITTED', reasonCodes: decision.reasons, regime, evidenceIds });
  }

  const ledger = engine.getLedger();
  const researchTrades: ResearchTrade[] = ledger.positions.map(position => {
    const context = contexts.get(position.intentId);
    const entryParts = getTradeDateParts(position.openedTimestamp);
    return {
      ...position,
      candidateId: context?.candidateId || position.intentId,
      variant: context?.variant || variant,
      aiMode: context?.aiMode || aiMode,
      regime: context?.regime || 'UNCLASSIFIED',
      sessionUtc: sessionForTimestamp(position.openedTimestamp),
      entryHourUtc: entryParts.hour,
      entryDayOfWeekUtc: entryParts.day,
      entryMonthUtc: entryParts.month,
      signalTimestamp: context?.signalTimestamp || position.openedTimestamp,
      eligibleFromTimestamp: context?.eligibleFromTimestamp || position.openedTimestamp,
    };
  });
  const closedTrades = researchTrades.filter(trade => !trade.isOpen);
  const wins = closedTrades.filter(trade => trade.realizedPnl > 0);
  const losses = closedTrades.filter(trade => trade.realizedPnl < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.realizedPnl, 0));
  const netProfit = closedTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const status: StrategyRunSummary['status'] = candles.length <= startIndex ? 'INSUFFICIENT_DATA' : closedTrades.length === 0 ? 'NO_TRADES' : 'COMPLETE';
  const summary: StrategyRunSummary = {
    variant,
    aiMode,
    totalSignals,
    submittedOrders,
    totalTrades: closedTrades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRatePercent: closedTrades.length > 0 ? Number(((wins.length / closedTrades.length) * 100).toFixed(1)) : 0,
    netProfit: Number(netProfit.toFixed(2)),
    profitFactor: Number((grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0).toFixed(2)),
    expectancy: Number((closedTrades.length > 0 ? netProfit / closedTrades.length : 0).toFixed(2)),
    maxDrawdownPercent: ledger.maxDrawdownPercent,
    totalCommission: ledger.totalCommissions,
    totalSlippagePips: Number((closedTrades.length * config.costModel.slippagePips * 2).toFixed(2)),
    startEquity: config.initialCash,
    endEquity: ledger.equity,
    openPositionsAtEnd: ledger.positions.filter(position => position.isOpen).length,
    status,
  };
  return { summary, traces, trades: researchTrades, equityCurve, analysis: analysisForTrades(closedTrades, config.initialCash, config.timeframe) };
}

export class ResearchExperimentEngine {
  public static run(dataset: HistoricalDataset, config: ResearchExperimentConfig): ResearchExperimentResult {
    if (dataset.manifest.canonicalSymbol !== config.symbol) throw new Error('نماد canonical دیتاست با نماد پیکربندی آزمایش یکسان نیست.');
    if (dataset.manifest.timeframe !== config.timeframe) throw new Error('تایم‌فریم دیتاست با پیکربندی آزمایش یکسان نیست.');
    const candles = dataset.candles.filter(candle => candle.isClosed && (!config.startTime || candle.timestamp >= config.startTime) && (!config.endTime || candle.timestamp <= config.endTime));
    const runs = config.strategyVariants.flatMap(variant => config.aiModes.map(aiMode => evaluateRun(candles, config, variant, aiMode)));
    const comparisons = runs.map(run => ({
      key: `${run.summary.variant}::${run.summary.aiMode}`,
      labelFa: `${run.summary.variant} / ${labelForDimension('AI_MODE', run.summary.aiMode)}`,
      tradesCount: run.summary.totalTrades,
      winRatePercent: run.summary.winRatePercent,
      netProfit: run.summary.netProfit,
      profitFactor: run.summary.profitFactor,
      expectancy: run.summary.expectancy,
      averageHoldingBars: run.analysis.VARIANT?.[0]?.averageHoldingBars || 0,
      maxDrawdownPercent: run.summary.maxDrawdownPercent,
    })).sort((left, right) => right.netProfit - left.netProfit);
    const warnings = [...dataset.manifest.notes];
    if (dataset.manifest.status !== 'READY') warnings.push('دیتاست کامل و بی‌نقص نیست؛ نتایج آن صرفاً پژوهشی و مشروط به بررسی کیفیت منبع است.');
    if (config.aiModes.includes('WEBLLM_ADVISORY')) warnings.push('WebLLM در این اجرای batch عمداً سفارش نمی‌سازد؛ برای جلوگیری از نسبت‌دادن خروجی ساختگی به مدل مرورگری.');
    if (config.aiModes.includes('AGENTIC_OFFLINE')) warnings.push('این اجرا فقط candidateهایی را معاملهٔ paper می‌کند که قبلاً از Scanner، Analyst، Critic و Judge عبور کرده‌اند.');
    if (config.aiModes.includes('ONLINE_ADVISORY')) warnings.push('Online advisory فقط از candidateهای از قبل تأییدشده توسط provider gate عبور می‌کند و دسترسی broker ندارد.');
    if (config.aiModes.includes('HYBRID_COMPARE')) warnings.push('Hybrid compare اختلاف یا نبود provider را به عدم معامله تبدیل می‌کند.');
    warnings.push('طبقه‌بندی regime در این نسخه heuristic است و فقط برای segment analysis استفاده می‌شود، نه اثبات علت یا edge.');
    return {
      manifest: { experimentId: config.experimentId, createdAt: new Date().toISOString(), datasetId: dataset.manifest.datasetId, datasetContentSha256: dataset.manifest.contentSha256, config, engineVersion: ENGINE_VERSION },
      runs,
      comparisons,
      warnings,
    };
  }

  public static snapshotForPaperForward(state: PaperForwardSnapshot['state'], result: StrategyRunResult | null, recentTraces: CandidateDecisionTrace[]): PaperForwardSnapshot {
    return { state, result, recentTraces };
  }
}

export const RESEARCH_ENGINE_RULE_VERSION = RESEARCH_RULE_VERSION;
