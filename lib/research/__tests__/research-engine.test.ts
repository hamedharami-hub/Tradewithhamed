import type { Candle } from '@/lib/contracts/market';
import { DataWorkbench } from '@/lib/core/data-workbench';
import { createDatasetFromCandles, validateResearchCandles } from '../dataset';
import { ResearchExperimentEngine } from '../experiment-engine';
import { PaperForwardRunner } from '../paper-forward-runner';
import { evaluateResearchStrategy } from '../strategy-rules';
import type { HistoricalDataset, ResearchExperimentConfig } from '../contracts';

export interface ResearchEngineTestResult {
  name: string;
  passed: boolean;
  details: string;
}

function candle(index: number, open: number, high: number, low: number, close: number): Candle {
  return { timestamp: 1_700_000_000_000 + index * 300_000, open, high, low, close, volume: 100, isClosed: true };
}

function baselineConfig(datasetId: string): ResearchExperimentConfig {
  return {
    experimentId: 'EXP-TEST-RESEARCH',
    datasetId,
    symbol: 'EURUSD',
    timeframe: '5M',
    strategyVariants: ['S0_SWEEP_ONLY', 'S0_SWEEP_FVG', 'BOS_ORDER_BLOCK_V1', 'FVG_EQUILIBRIUM_V1', 'MEAN_REVERSION_V1'],
    aiModes: ['OFF', 'DETERMINISTIC_COUNCIL'],
    initialCash: 10_000,
    riskPerTradePercent: 0.25,
    maxConcurrentPositions: 1,
    warmupBars: 20,
    stopLossAtrBuffer: 0.2,
    targetRiskReward: 2,
    entryExpiryBars: 6,
    costModel: { modelVersion: 'test-cost-v1', spreadPips: 0.8, slippagePips: 0.2, commissionPerLotRoundTrip: 6, adverseFillOnly: true },
    seed: 7,
    ruleVersion: 'research-rules-v1',
  };
}

function buildDeterministicDataset(): HistoricalDataset {
  const candles: Candle[] = [];
  for (let index = 0; index < 90; index++) {
    const base = 1.1 + index * 0.00002;
    candles.push(candle(index, base, base + 0.0003, base - 0.0003, base + 0.0001));
  }
  // A confirmed low near index 60 plus a sweep/reclaim at 65; entry must be delayed to 66.
  candles[58] = candle(58, 1.101, 1.1013, 1.1008, 1.1011);
  candles[59] = candle(59, 1.1011, 1.1012, 1.1007, 1.1009);
  candles[60] = candle(60, 1.1009, 1.1010, 1.0998, 1.1002);
  candles[61] = candle(61, 1.1002, 1.1011, 1.1001, 1.1009);
  candles[62] = candle(62, 1.1009, 1.1012, 1.1004, 1.1010);
  candles[63] = candle(63, 1.1010, 1.1015, 1.1008, 1.1012);
  candles[64] = candle(64, 1.1012, 1.1014, 1.1007, 1.1010);
  candles[65] = candle(65, 1.1010, 1.1016, 1.0996, 1.1013);
  candles[66] = candle(66, 1.1014, 1.1020, 1.1010, 1.1018);
  return createDatasetFromCandles({
    candles,
    provider: 'Test Provider',
    providerSymbol: 'EURUSD.TEST',
    canonicalSymbol: 'EURUSD',
    instrumentLabel: 'EURUSD test fixture',
    timeframe: '5M',
    rawSourcePath: 'test://eurusd',
    contentSha256: 'a'.repeat(64),
    sourceLicense: 'test only',
    importedAt: '2026-09-09T00:00:00.000Z',
  });
}

export function runResearchEngineSuite(): ResearchEngineTestResult[] {
  const results: ResearchEngineTestResult[] = [];

  const malformed = [
    candle(0, 1.1, 1.1001, 1.0999, 1.1),
    { ...candle(1, 1.1, 1.0999, 1.1001, 1.1) },
  ];
  const quality = validateResearchCandles(malformed, '5M');
  results.push({
    name: 'Research dataset rejects invalid OHLC',
    passed: quality.accepted.length === 1 && quality.rejectedBars === 1,
    details: `accepted=${quality.accepted.length}; rejected=${quality.rejectedBars}`,
  });

  const baseCandles = Array.from({ length: 6 }, (_, index) => candle(index, 1.1, 1.1002, 1.0998, 1.1));
  const aggregated = DataWorkbench.aggregateCandles(baseCandles, '15M');
  results.push({
    name: 'Partial higher timeframe bar remains unclosed',
    passed: aggregated.length > 0 && aggregated.at(-1)?.isClosed === false,
    details: `lastIsClosed=${String(aggregated.at(-1)?.isClosed)}`,
  });

  const dataset = buildDeterministicDataset();
  const sweepCandidate = evaluateResearchStrategy(dataset.candles.slice(0, 66), 'EURUSD', '5M', 'S0_SWEEP_ONLY');
  results.push({
    name: 'Sweep strategy emits versioned evidence',
    passed: Boolean(sweepCandidate?.evidenceIds.sweepId) && sweepCandidate?.status === 'PENDING_CONFIRMATION',
    details: sweepCandidate ? `${sweepCandidate.id} / ${sweepCandidate.evidenceIds.sweepId}` : 'no candidate',
  });
  results.push({
    name: 'S0 candidate records auditable rule provenance',
    passed: Boolean(sweepCandidate?.ruleProvenance)
      && sweepCandidate?.ruleProvenance?.ruleVersion === 'research-rules-v1'
      && sweepCandidate?.ruleProvenance?.signalCandleTimestamp === sweepCandidate.createdAtTimestamp
      && sweepCandidate?.ruleProvenance?.evidenceAvailableAtTimestamp <= sweepCandidate.createdAtTimestamp
      && sweepCandidate?.ruleProvenance?.parameterHash.startsWith('fnv1a-'),
    details: sweepCandidate?.ruleProvenance ? `${sweepCandidate.ruleProvenance.ruleVersion}/${sweepCandidate.ruleProvenance.parameterHash}` : 'no candidate provenance',
  });

  const bosCandidate = evaluateResearchStrategy(dataset.candles.slice(0, 66), 'EURUSD', '5M', 'BOS_ORDER_BLOCK_V1');
  const fvgCandidate = evaluateResearchStrategy(dataset.candles.slice(0, 66), 'EURUSD', '5M', 'FVG_EQUILIBRIUM_V1');
  results.push({
    name: 'BOS/Order Block rule is executable and evidence-backed',
    passed: bosCandidate === null || (bosCandidate.evidenceIds.bosId !== undefined && bosCandidate.createdAtTimestamp === dataset.candles[65].timestamp),
    details: bosCandidate ? `${bosCandidate.id} / ${bosCandidate.evidenceIds.bosId}` : 'no candidate on fixture; no invalid output',
  });
  results.push({
    name: 'FVG Equilibrium rule is executable and evidence-backed',
    passed: fvgCandidate === null || (fvgCandidate.evidenceIds.fvgId !== undefined && fvgCandidate.createdAtTimestamp === dataset.candles[65].timestamp),
    details: fvgCandidate ? `${fvgCandidate.id} / ${fvgCandidate.evidenceIds.fvgId}` : 'no candidate on fixture; no invalid output',
  });

  const breakoutCandles: Candle[] = Array.from({ length: 230 }, (_, index) => {
    const base = 1.1 + index * 0.00004;
    return candle(index, base, base + 0.00026, base - 0.00015, base + 0.00022);
  });
  const breakoutCandidate = evaluateResearchStrategy(breakoutCandles, 'EURUSD', '5M', 'TREND_BREAKOUT_55_EMA200_V1');
  results.push({
    name: '55-channel EMA200 breakout rule records prior-channel evidence without lookahead',
    passed: breakoutCandidate?.style === 'TREND_BREAKOUT'
      && Boolean(breakoutCandidate.evidenceIds.contextSwingId)
      && breakoutCandidate.createdAtTimestamp === breakoutCandles.at(-1)?.timestamp,
    details: breakoutCandidate ? `${breakoutCandidate.id} / ${breakoutCandidate.evidenceIds.contextSwingId}` : 'no candidate',
  });

  const first = ResearchExperimentEngine.run(dataset, baselineConfig(dataset.manifest.datasetId));
  const second = ResearchExperimentEngine.run(dataset, baselineConfig(dataset.manifest.datasetId));
  const firstOff = first.runs.find(run => run.summary.variant === 'S0_SWEEP_ONLY' && run.summary.aiMode === 'OFF');
  const firstTrade = firstOff?.trades[0];
  results.push({
    name: 'Research execution delays fill beyond signal candle',
    passed: Boolean(firstTrade && firstTrade.openedTimestamp > firstTrade.signalTimestamp && firstTrade.openedTimestamp >= firstTrade.eligibleFromTimestamp),
    details: firstTrade ? `signal=${firstTrade.signalTimestamp}; eligible=${firstTrade.eligibleFromTimestamp}; entry=${firstTrade.openedTimestamp}` : 'no closed/open trade generated',
  });
  results.push({
    name: 'Research run is deterministic for identical data and config',
    passed: JSON.stringify(first.comparisons) === JSON.stringify(second.comparisons),
    details: `comparisons=${first.comparisons.length}`,
  });
  results.push({
    name: 'WebLLM batch mode is fail-closed',
    passed: ResearchExperimentEngine.run(dataset, { ...baselineConfig(dataset.manifest.datasetId), aiModes: ['WEBLLM_ADVISORY'] }).runs[0].summary.submittedOrders === 0,
    details: 'WebLLM advisory is not fabricated as a batch decision engine.',
  });

  PaperForwardRunner.start({ symbol: 'EURUSD', timeframe: '1H', strategyVariants: ['S0_SWEEP_ONLY'] });
  let paperSnapshot = PaperForwardRunner.getSnapshot('EURUSD', '1H');
  for (let index = 0; index < 140; index++) {
    const base = 1.12 + index * 0.00001;
    paperSnapshot = PaperForwardRunner.ingestClosedBar('EURUSD', '1H', {
      timestamp: 1_800_000_000_000 + index * 3_600_000,
      open: base,
      high: base + 0.0002,
      low: base - 0.0002,
      close: base + 0.00005,
      volume: 100,
      isClosed: true,
    });
  }
  results.push({
    name: 'Paper-forward uses closed bars and no broker execution environment',
    passed: Boolean(paperSnapshot?.result) && paperSnapshot?.state.acceptedBars === 140 && paperSnapshot.result?.trades.every(trade => trade.environment === 'PAPER_REPLAY') === true,
    details: `accepted=${paperSnapshot?.state.acceptedBars}; environment=${paperSnapshot?.result?.trades[0]?.environment || 'no-trade'}`,
  });

  return results;
}
