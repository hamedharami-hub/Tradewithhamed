import { Candle } from '@/lib/contracts/market';
import { StrategyCandidate } from '@/lib/contracts/strategy';
import { Stage8PaperLedger } from '../stage8-paper-ledger';
import { Stage8ProviderRegistry } from '@/lib/ai/stage8-provider-registry';
import { calculateBootstrap, evaluateTradeSample } from '@/scripts/analyze-stage8-paper-run';

export interface Stage8TestResult {
  name: string;
  passed: boolean;
  details: string;
}

function createDummyCandidate(overrides?: Partial<StrategyCandidate>): StrategyCandidate {
  return {
    id: 'test_cand_1',
    strategyName: 'S0_SWEEP_FVG',
    symbol: 'GBPUSD',
    direction: 'BUY',
    timeframe: '5M',
    entryPrice: 1.3000,
    stopLossPrice: 1.2980,
    takeProfitPrice: 1.3040,
    riskRewardRatio: 2.0,
    createdAtTimestamp: Date.now(),
    expiresAtTimestamp: Date.now() + 3600000,
    rationale: 'Test candidate for Stage 8',
    status: 'CONFIRMED',
    evidenceIds: {
      sweepId: 'sw_1',
      fvgId: 'fvg_1',
    },
    ...overrides,
  };
}

export async function runStage8PaperForwardTests(): Promise<Stage8TestResult[]> {
  const results: Stage8TestResult[] = [];

  // Test 1: Paper ledger enforces brokerWrites: false
  const ledger = new Stage8PaperLedger(10000);
  results.push({
    name: 'paper ledger enforces brokerWrites: false',
    passed: ledger.brokerWrites === false,
    details: `brokerWrites=${ledger.brokerWrites}`,
  });

  // Test 2: Paper position opening and TP execution
  const tradeBuy = ledger.openPosition({
    symbol: 'GBPUSD',
    direction: 'BUY',
    volumeLots: 0.1,
    entryPrice: 1.3000,
    stopLoss: 1.2980,
    takeProfit: 1.3040,
    entryTime: 1000,
  });

  const candleTp: Candle = {
    timestamp: 2000,
    open: 1.3010,
    high: 1.3045, // Triggers TP
    low: 1.3005,
    close: 1.3035,
    volume: 100,
    isClosed: true,
  };

  const closedAfterTp = ledger.onBarUpdate('GBPUSD', candleTp);
  const metricsAfterTp = ledger.getMetrics();

  results.push({
    name: 'paper trade closes on take-profit and updates metrics',
    passed:
      closedAfterTp.length === 1 &&
      closedAfterTp[0].closeReason === 'TP' &&
      metricsAfterTp.winCount === 1 &&
      metricsAfterTp.netPnl > 0 &&
      metricsAfterTp.currentBalance > 10000,
    details: `closed=${closedAfterTp.length}, pnl=${closedAfterTp[0]?.pnl}, bal=${metricsAfterTp.currentBalance}`,
  });

  // Test 3: Paper position SL execution
  ledger.openPosition({
    symbol: 'GBPUSD',
    direction: 'BUY',
    volumeLots: 0.1,
    entryPrice: 1.3000,
    stopLoss: 1.2980,
    takeProfit: 1.3040,
    entryTime: 3000,
  });

  const candleSl: Candle = {
    timestamp: 4000,
    open: 1.2990,
    high: 1.2995,
    low: 1.2975, // Triggers SL
    close: 1.2980,
    volume: 100,
    isClosed: true,
  };

  const closedAfterSl = ledger.onBarUpdate('GBPUSD', candleSl);
  const metricsAfterSl = ledger.getMetrics();

  results.push({
    name: 'paper trade closes on stop-loss and records loss',
    passed:
      closedAfterSl.length === 1 &&
      closedAfterSl[0].closeReason === 'SL' &&
      metricsAfterSl.lossCount === 1 &&
      (closedAfterSl[0]?.pnl || 0) < 0,
    details: `closed=${closedAfterSl.length}, pnl=${closedAfterSl[0]?.pnl}`,
  });

  // Test 4: Provider DETERMINISTIC reviews candidate offline
  const candidateValid = createDummyCandidate();
  const detReview = await Stage8ProviderRegistry.reviewCandidate({
    candidate: candidateValid,
    provider: 'DETERMINISTIC',
  });

  results.push({
    name: 'provider registry DETERMINISTIC approves valid candidate offline',
    passed: detReview.status === 'APPROVED' && detReview.approved === true && detReview.brokerWrites === false,
    details: `status=${detReview.status}, latency=${detReview.latencyMs}ms`,
  });

  // Test 5: Provider DETERMINISTIC rejects candidate without FVG
  const candidateNoFvg = createDummyCandidate({ evidenceIds: { sweepId: 'sw_1' } });
  const detReject = await Stage8ProviderRegistry.reviewCandidate({
    candidate: candidateNoFvg,
    provider: 'DETERMINISTIC',
  });

  results.push({
    name: 'provider registry DETERMINISTIC rejects candidate missing FVG',
    passed: detReject.status !== 'APPROVED' && !detReject.approved && detReject.advisory?.riskFlags.includes('MISSING_FVG_IMBALANCE') === true,
    details: `status=${detReject.status}, flags=${detReject.advisory?.riskFlags.join(',')}`,
  });

  // Test 6: Provider WEBLLM in Node runtime returns BLOCKED
  const webllmReview = await Stage8ProviderRegistry.reviewCandidate({
    candidate: candidateValid,
    provider: 'WEBLLM',
  });

  results.push({
    name: 'provider registry WEBLLM blocks in Node runtime with explicit reason',
    passed: webllmReview.status === 'BLOCKED' && webllmReview.reason?.includes('WEBLLM_NODE_UNSUPPORTED') === true,
    details: `status=${webllmReview.status}, reason=${webllmReview.reason}`,
  });

  // Test 7: Provider OPENAI blocks when key is missing without silent fallback
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const openaiBlocked = await Stage8ProviderRegistry.reviewCandidate({
    candidate: candidateValid,
    provider: 'OPENAI',
  });
  if (savedKey) process.env.OPENAI_API_KEY = savedKey;

  results.push({
    name: 'provider registry OPENAI blocks when API key is missing (no silent fallback)',
    passed: openaiBlocked.status === 'BLOCKED' && openaiBlocked.reason?.includes('OPENAI_KEY_MISSING') === true,
    details: `status=${openaiBlocked.status}, reason=${openaiBlocked.reason}`,
  });

  // Test 8: Analyzer marks sample < 30 as SAMPLE_INSUFFICIENT and refuses promotion
  const smallSamplePnls = [15, -10, 20, 18, -12, 25, -8, 14, 22, -15]; // 10 trades
  const evalSmall = evaluateTradeSample(smallSamplePnls);

  results.push({
    name: 'bootstrap analyzer marks sample < 30 as SAMPLE_INSUFFICIENT and refuses promotion',
    passed:
      evalSmall.status === 'SAMPLE_INSUFFICIENT' &&
      evalSmall.readyForProductionPromotion === false &&
      evalSmall.sampleSize === 10,
    details: `status=${evalSmall.status}, sampleSize=${evalSmall.sampleSize}`,
  });

  // Test 9: Bootstrap with 30+ trades produces reproducible 10,000 resamples with fixed seed
  const sample35Pnls = [
    25, 30, -15, 20, 18, -12, 35, -10, 22, 19,
    -14, 28, 15, -8, 30, 22, -18, 26, 17, -11,
    29, 31, -16, 24, 19, -13, 27, 21, -9, 33,
    20, -15, 28, 16, -10,
  ]; // 35 trades
  const eval35 = evaluateTradeSample(sample35Pnls);
  const eval35Again = evaluateTradeSample(sample35Pnls);

  results.push({
    name: 'bootstrap calculates 10,000 resamples and yields reproducible results with seed 42',
    passed:
      eval35.sampleSize === 35 &&
      eval35.bootstrap !== undefined &&
      eval35.bootstrap.iterations === 10000 &&
      eval35.bootstrap.winRateCI.ciLower95 === eval35Again.bootstrap?.winRateCI.ciLower95,
    details: `winRateCI=[${eval35.bootstrap?.winRateCI.ciLower95}, ${eval35.bootstrap?.winRateCI.ciUpper95}]`,
  });

  return results;
}
