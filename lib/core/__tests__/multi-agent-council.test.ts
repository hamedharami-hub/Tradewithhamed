// lib/core/__tests__/multi-agent-council.test.ts
// آزمون‌های جامع شورای ۴ ایجنت هوشمند، ماتریس اجماع آلفا و کاتالوگ مدل‌های ۲۰۲۵/۲۰۲۶

import { MultiAgentOrchestrator } from '../multi-agent-orchestrator';
import {
  PLAN_V4_MODELS,
} from '../../ai/browser-offline-ai';
import {
  DEFAULT_MULTI_AGENT_CONFIG,
  MultiAgentConfiguration,
  TRADING_STYLES,
} from '../../contracts/multi-agent-system';
import { StrategyCandidate } from '../../contracts/strategy';

export interface TestResultItem {
  name: string;
  passed: boolean;
  details: string;
}

export function runMultiAgentCouncilTestSuite(): TestResultItem[] {
  const results: TestResultItem[] = [];

  // ۱. بررسی کاتالوگ مدل‌های هوش مصنوعی و مدل‌های درخواستی کاربر
  try {
    const phi4 = PLAN_V4_MODELS.find(m => m.id === 'phi-4-mini-instruct-mlc');
    const deepseek7b = PLAN_V4_MODELS.find(m => m.id === 'deepseek-r1-distill-qwen-7b-mlc');
    const llama3b = PLAN_V4_MODELS.find(m => m.id === 'llama-3.2-3b-instruct-mlc');
    const nano = PLAN_V4_MODELS.find(m => m.id === 'chrome-gemini-nano');

    const validModelsPresent = !!(phi4 && deepseek7b && llama3b && nano);
    const invalid14BRemoved = !PLAN_V4_MODELS.some(model => model.id === 'deepseek-r1-distill-qwen-14b-mlc' || model.id === 'qwen2.5-14b-instruct-mlc');

    results.push({
      name: '[Edge AI Catalog] Registry-backed models only',
      passed: validModelsPresent && invalid14BRemoved,
      details: `valid=${validModelsPresent}; invalid14BRemoved=${invalid14BRemoved}`,
    });
  } catch (err) {
    results.push({
      name: '[Edge AI Catalog] Registry-backed models only',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. بررسی چگالی استدلال و دسته‌بندی تایرها
  try {
    const fast = PLAN_V4_MODELS.filter(m => m.performanceTier === 'FAST');
    const balanced = PLAN_V4_MODELS.filter(m => m.performanceTier === 'BALANCED');
    const deep = PLAN_V4_MODELS.filter(m => m.performanceTier === 'DEEP');

    const pass = fast.length >= 2 && balanced.length >= 3 && deep.length >= 3 && PLAN_V4_MODELS.every(model => model.compatibleRuntimes.length === 1);
    results.push({
      name: '[Edge AI Tier] FAST, BALANCED, and DEEP classification',
      passed: pass,
      details: `FAST=${fast.length}; BALANCED=${balanced.length}; DEEP=${deep.length}`,
    });
  } catch (err) {
    results.push({
      name: '[Edge AI Tier] FAST, BALANCED, and DEEP classification',
      passed: false,
      details: (err as Error).message,
    });
  }

  // کاندیدای معتبر فرضی برای ارزیابی شورا
  const validCandidate: StrategyCandidate = {
    id: 'test-cand-001',
    strategyName: 'SMC_BUY_SETUP',
    symbol: 'XAUUSD',
    direction: 'BUY',
    entryPrice: 2050.0,
    stopLossPrice: 2045.0, // ریسک = ۵ واحد
    takeProfitPrice: 2065.0, // ریوارد = ۱۵ واحد -> R:R = 3.0
    riskRewardRatio: 3.0,
    timeframe: '5M',
    createdAtTimestamp: Date.now(),
    expiresAtTimestamp: Date.now() + 3600_000,
    rationale: 'تست شورای آلفا: FVG M5 + Sweep Asia',
    status: 'PENDING_CONFIRMATION',
    evidenceIds: {
      sweepId: 'SWEEP-ASIA-01',
      fvgId: 'FVG-M5-01',
    },
  };

  // ۳. آزمون اجماع کامل شورا و حدنصاب کواروم (Quorum Reached)
  try {
    const pipelineRes = MultiAgentOrchestrator.evaluateCandidate(validCandidate, {
      ...DEFAULT_MULTI_AGENT_CONFIG,
      judgeEngineId: 'alpha-consensus-quorum-judge',
    });

    const consensus = pipelineRes.councilConsensus;
    const isApproved = pipelineRes.isApprovedForTrading;
    const quorumOk = consensus?.quorumReached === true;
    const scoreOk = (consensus?.alphaConsensusScore || 0) >= 75;

    results.push({
      name: '[Council Quorum] Alpha Consensus Score >= 75% for Valid Setup',
      passed: isApproved && quorumOk && scoreOk,
      details: `امتیاز اجماع آلفا: ${consensus?.alphaConsensusScore}٪ | وضعیت کواروم: ${quorumOk ? 'احراز شده' : 'رد شده'} | آرای مثبت: ${consensus?.votes.approved}`,
    });
  } catch (err) {
    results.push({
      name: '[Council Quorum] Alpha Consensus Score >= 75% for Valid Setup',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. آزمون قاعده شکست امن (Fail-Closed Veto) هنگام رد منتقد
  try {
    // کاندیدایی با نسبت R:R نامعتبر (۱.۵ که کمتر از حداقل ۲.۵ است)
    const badRRCandidate: StrategyCandidate = {
      ...validCandidate,
      stopLossPrice: 2040.0, // ریسک = ۱۰ واحد
      takeProfitPrice: 2055.0, // ریوارد = ۵ واحد -> R:R = 0.5
      riskRewardRatio: 0.5,
    };

    const pipelineRes = MultiAgentOrchestrator.evaluateCandidate(badRRCandidate, {
      ...DEFAULT_MULTI_AGENT_CONFIG,
      judgeEngineId: 'alpha-consensus-quorum-judge',
    });

    const isRejected = !pipelineRes.isApprovedForTrading;
    const vetoFired = pipelineRes.councilConsensus?.vetoTriggered === true;
    const criticRejected = pipelineRes.criticReview.verdict === 'REJECTED';

    results.push({
      name: '[Council Veto] Fail-Closed Triggered on Low R:R Reject',
      passed: isRejected && vetoFired && criticRejected,
      details: `منتقد به دلیل ${pipelineRes.criticReview.summaryFa} ورود را وتو کرد و داور از ارسال سفارش ممانعت به عمل آورد.`,
    });
  } catch (err) {
    results.push({
      name: '[Council Veto] Fail-Closed Triggered on Low R:R Reject',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. آزمون پیکربندی ایجنت‌ها با موتورهای عصبی پیشرفته
  try {
    const customConfig: MultiAgentConfiguration = {
      activeTradingStyle: 'S0_SWEEP_FVG',
      scannerEngineId: 'llama-3.2-3b-scanner',
      analystEngineId: 'phi-4-mini-analyst',
      criticEngineId: 'deepseek-r1-7b-critic',
      judgeEngineId: 'alpha-consensus-quorum-judge',
    };

    const res = MultiAgentOrchestrator.evaluateCandidate(validCandidate, customConfig);
    const pass = res.scannerReview.engineId === 'llama-3.2-3b-scanner' &&
                 res.scannerReview.verdict === 'NEUTRAL' &&
                 res.scannerReview.confidence === 0 &&
                 res.scannerReview.reasoningBulletsFa.includes('NEURAL_ASYNC_REQUIRED') &&
                 !res.isApprovedForTrading;

    results.push({
      name: '[Council Engines] Neural selection is not reported as synchronous inference',
      passed: pass,
      details: `scanner=${res.scannerReview.engineId}; verdict=${res.scannerReview.verdict}; approved=${res.isApprovedForTrading}`,
    });
  } catch (err) {
    results.push({
      name: '[Council Engines] Neural selection is not reported as synchronous inference',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۶. آزمون سبک‌های تکمیلی معاملاتی (اسکلپ ۱ دقیقه و سوئینگ کلان)
  try {
    const hasScalp = TRADING_STYLES.some(s => s.id === 'SCALP_M1_M5');
    const hasSwing = TRADING_STYLES.some(s => s.id === 'SWING_MACRO');
    const hasBreakout = TRADING_STYLES.some(s => s.id === 'TREND_BREAKOUT');

    const scalpRes = MultiAgentOrchestrator.evaluateCandidate(validCandidate, {
      ...DEFAULT_MULTI_AGENT_CONFIG,
      activeTradingStyle: 'SCALP_M1_M5',
    });

    const swingRes = MultiAgentOrchestrator.evaluateCandidate(validCandidate, {
      ...DEFAULT_MULTI_AGENT_CONFIG,
      activeTradingStyle: 'SWING_MACRO',
    });

    const pass = hasScalp && hasSwing && hasBreakout &&
      scalpRes.tradingStyle === 'SCALP_M1_M5' &&
      swingRes.tradingStyle === 'SWING_MACRO';

    results.push({
      name: '[Trading Styles] Official Complementary Styles (Scalp M1/M5 & Swing Macro)',
      passed: pass,
      details: pass
        ? `سبک‌های اسکلپ سریع M1/M5 (حداقل R:R 1.5) و سوئینگ کلان H4/D1 (حداقل R:R 3.0) به عنوان گزینه‌های رسمی شورا تایید و فعال شدند.`
        : 'سبک‌های تکمیلی به درستی در شورا احراز نشدند.',
    });
  } catch (err) {
    results.push({
      name: '[Trading Styles] Official Complementary Styles (Scalp M1/M5 & Swing Macro)',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
