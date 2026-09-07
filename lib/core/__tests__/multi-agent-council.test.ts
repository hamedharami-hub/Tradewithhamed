// lib/core/__tests__/multi-agent-council.test.ts
// آزمون‌های جامع شورای ۴ ایجنت هوشمند، ماتریس اجماع آلفا و کاتالوگ مدل‌های ۲۰۲۵/۲۰۲۶

import { MultiAgentOrchestrator } from '../multi-agent-orchestrator';
import {
  PLAN_V4_MODELS,
  BrowserAIModelRecord,
} from '../../ai/browser-offline-ai';
import {
  DEFAULT_MULTI_AGENT_CONFIG,
  MultiAgentConfiguration,
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
    const deepseek14b = PLAN_V4_MODELS.find(m => m.id === 'deepseek-r1-distill-qwen-14b-mlc');
    const deepseek7b = PLAN_V4_MODELS.find(m => m.id === 'deepseek-r1-distill-qwen-7b-mlc');
    const qwen14b = PLAN_V4_MODELS.find(m => m.id === 'qwen2.5-14b-instruct-mlc');
    const llama3b = PLAN_V4_MODELS.find(m => m.id === 'llama-3.2-3b-instruct-mlc');
    const nano = PLAN_V4_MODELS.find(m => m.id === 'chrome-gemini-nano');

    const allPresent = !!(phi4 && deepseek14b && deepseek7b && qwen14b && llama3b && nano);
    const supportsMobile16GB = deepseek14b?.recommendedDevices.includes('MOBILE_16GB') &&
                               phi4?.recommendedDevices.includes('MOBILE_16GB');

    results.push({
      name: '[Edge AI Catalog] Presence of High-Density & 14B Models',
      passed: allPresent && !!supportsMobile16GB,
      details: allPresent
        ? `مدل‌های Phi-4-mini (چگالی استدلال)، DeepSeek-R1 (7B/14B) و Llama-3.2 (3B) با تگ دستگاه‌های ۱۶ گیگابایت (Pixel Fold) احراز شدند.`
        : 'برخی از مدل‌های مدنظر در کاتالوگ یافت نشدند.',
    });
  } catch (err) {
    results.push({
      name: '[Edge AI Catalog] Presence of High-Density & 14B Models',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. بررسی چگالی استدلال و دسته‌بندی تایرها
  try {
    const ultraDense = PLAN_V4_MODELS.filter(m => m.densityTier === 'ULTRA_DENSE');
    const heavyPower = PLAN_V4_MODELS.filter(m => m.densityTier === 'HEAVY_POWER');
    const zeroWeight = PLAN_V4_MODELS.filter(m => m.densityTier === 'ZERO_WEIGHT');

    const pass = ultraDense.length >= 2 && heavyPower.length >= 2 && zeroWeight.length >= 2;
    results.push({
      name: '[Edge AI Density] Reasoning Density & Zero-Weight Classification',
      passed: pass,
      details: `تعداد ${ultraDense.length} مدل با چگالی استدلال فوق‌العاده، ${heavyPower.length} مدل سنگین ۱۴B و ${zeroWeight.length} مدل بدون حجم احراز شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Edge AI Density] Reasoning Density & Zero-Weight Classification',
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
      criticEngineId: 'deepseek-r1-14b-critic',
      judgeEngineId: 'alpha-consensus-quorum-judge',
    };

    const res = MultiAgentOrchestrator.evaluateCandidate(validCandidate, customConfig);
    const pass = res.scannerReview.engineId === 'llama-3.2-3b-scanner' &&
                 res.analystReview.engineId === 'phi-4-mini-analyst' &&
                 res.criticReview.engineId === 'deepseek-r1-14b-critic';

    results.push({
      name: '[Council Engines] 14B & Dense Engine Pipeline Execution',
      passed: pass,
      details: `خط‌لوله با موفقیت ترکیب اسکنر Llama-3.2، تحلیل‌گر Phi-4 و منتقد DeepSeek-R1 14B را پردازش نمود.`,
    });
  } catch (err) {
    results.push({
      name: '[Council Engines] 14B & Dense Engine Pipeline Execution',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
