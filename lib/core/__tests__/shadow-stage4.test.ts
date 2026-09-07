import { StrategyCandidate } from '../../contracts/strategy';
import { AnalystCriticPipeline } from '../analyst-critic';
import { ShadowAnalysisService } from '../shadow-analysis-service';
import { calculateDeterministicRisk } from '../risk-calculator';

export function runStage4ShadowTests(): {
  name: string;
  passed: boolean;
  details: string;
}[] {
  const results: { name: string; passed: boolean; details: string }[] = [];

  const mockCandidate: StrategyCandidate = {
    id: 'CAND-TEST-001',
    strategyName: 'S0-proposed Intraday',
    symbol: 'XAUUSD',
    timeframe: '15M',
    direction: 'BUY',
    createdAtTimestamp: Date.now(),
    expiresAtTimestamp: Date.now() + 6 * 15 * 60 * 1000,
    entryPrice: 2650.0,
    stopLossPrice: 2645.0,
    takeProfitPrice: 2665.0,
    riskRewardRatio: 3.0,
    evidenceIds: {
      sweepId: 'SWEEP-LOW-1001',
      fvgId: 'FVG-BULL-1002',
      contextSwingId: 'SW-CTX-1003',
    },
    rationale: 'تست اعتبارسنجی ستاپ خرید طلا',
    status: 'CONFIRMED',
  };

  try {
    const aiResult = AnalystCriticPipeline.runShadowPipeline(mockCandidate);
    const passed =
      aiResult.passed &&
      aiResult.analystReview.decision === 'TRADE' &&
      aiResult.criticReview.verdict === 'CONFIRMED';

    results.push({
      name: 'Structured Analyst & Critic Shadow Pipeline',
      passed,
      details: passed
        ? 'تحلیل‌گر و منتقد هر دو شواهد را ارزیابی و ستاپ را تایید کردند.'
        : `رد شد: ${aiResult.explanation}`,
    });
  } catch (e) {
    results.push({ name: 'Structured Analyst & Critic Shadow Pipeline', passed: false, details: (e as Error).message });
  }

  try {
    const candidateWithoutSweep: StrategyCandidate = {
      ...mockCandidate,
      evidenceIds: { fvgId: 'FVG-ONLY' },
    };

    const aiResult = AnalystCriticPipeline.runShadowPipeline(candidateWithoutSweep);
    const passed = !aiResult.passed && aiResult.reasonCode === 'AI_ANALYST_NO_TRADE';

    results.push({
      name: 'AI Analyst Fail-Safe on Missing Liquidity Sweep',
      passed,
      details: passed
        ? 'ستاپ فاقد سوییپ نقدینگی به درستی توسط تحلیل‌گر به حالت NO_TRADE مسدود شد.'
        : 'خطا: ستاپ بدون سوییپ نقدینگی تایید شد!',
    });
  } catch (e) {
    results.push({ name: 'AI Analyst Fail-Safe on Missing Liquidity Sweep', passed: false, details: (e as Error).message });
  }

  try {
    const preFlight = ShadowAnalysisService.validatePreFlightConditions({
      symbol: 'XAUUSD',
      currentPrice: 2650.1,
      currentTime: Date.now(),
      candles5M: new Array(20).fill({ isClosed: true }),
      candidate: mockCandidate,
      isMarketDataStale: true,
    });

    const passed = !preFlight.canCreateIntent && preFlight.reasonCode === 'STALE_MARKET_DATA';
    results.push({
      name: 'Stale Market Data Pre-flight Guard',
      passed,
      details: passed
        ? 'داده‌های بیات بازار مانع از ایجاد اینتنت شدند (Fail-Closed).'
        : 'خطا: در داده‌های بیات پیش‌پرواز پاس شد!',
    });
  } catch (e) {
    results.push({ name: 'Stale Market Data Pre-flight Guard', passed: false, details: (e as Error).message });
  }

  try {
    const riskPreview = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      accountEquity: 10000,
      riskPercentage: 0.25,
    });

    const res = ShadowAnalysisService.createLocalOrderIntent({
      candidate: mockCandidate,
      riskPreview,
      userConfirmed: true,
    });

    const passed =
      res.intent !== null &&
      res.intent.status === 'NOT_SUBMITTED' &&
      res.intent.brokerOrderId === null &&
      res.intent.isDemoConfirmed === true;

    results.push({
      name: 'Local OrderIntent NOT_SUBMITTED Outbox Creation',
      passed,
      details: passed
        ? `اینتنت محلی با شناسه ${res.intent?.intentId} و وضعیت ${res.intent?.status} و brokerOrderId=null ایجاد شد.`
        : `خطا در ایجاد اینتنت: ${res.error}`,
    });
  } catch (e) {
    results.push({ name: 'Local OrderIntent NOT_SUBMITTED Outbox Creation', passed: false, details: (e as Error).message });
  }

  return results;
}
