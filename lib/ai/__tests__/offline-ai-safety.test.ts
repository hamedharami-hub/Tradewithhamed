import { BrowserOfflineAIManager, PLAN_V4_MODELS } from '../browser-offline-ai';
import { AnalystCriticPipeline } from '../../core/analyst-critic';
import type { StrategyCandidate } from '../../contracts/strategy';
import { getOnlineProviderSettings } from '../advisory-provider';
import { modelIdForAgentEngine } from '../webllm-agent-adapter';

export interface OfflineAISafetyTestResult { name: string; passed: boolean; details: string; }

export async function runOfflineAISafetyTests(): Promise<OfflineAISafetyTestResult[]> {
  const candidate: StrategyCandidate = {
    id: 'offline-ai-safety', strategyName: 'S0', symbol: 'XAUUSD', timeframe: '5M', direction: 'BUY',
    createdAtTimestamp: 1, expiresAtTimestamp: 2, entryPrice: 2350, stopLossPrice: 2345, takeProfitPrice: 2365,
    riskRewardRatio: 3, evidenceIds: { sweepId: 'sweep', fvgId: 'fvg', contextSwingId: 'context' }, rationale: 'test', status: 'CONFIRMED',
  };
  const missingEvidence = BrowserOfflineAIManager.buildDeterministicAdvisory('s0-deterministic', { symbol: 'XAUUSD', currentPrice: 2350 });
  const completeEvidence = BrowserOfflineAIManager.buildDeterministicAdvisory('s0-deterministic', {
    symbol: 'XAUUSD', currentPrice: 2350, sweepDetected: true, fvgDetected: true, contextConfirmed: true, riskRewardRatio: 3,
  });
  const unsupported = await BrowserOfflineAIManager.isModelSupported('deepseek-r1-distill-qwen-14b-mlc');
  const smallestSupported = await BrowserOfflineAIManager.isModelSupported('smollm2-360m-mlc');
  const serverRecommendation = await BrowserOfflineAIManager.recommendModel();
  const runtime = BrowserOfflineAIManager.getRuntimeStatus();
  const synchronousNeural = AnalystCriticPipeline.runShadowPipeline(candidate, 'qwen3.5-0.8b-mlc');
  const synchronousLiteRT = AnalystCriticPipeline.runShadowPipeline(candidate, 'gemma-4-e4b-litert');
  const gemma = PLAN_V4_MODELS.find(model => model.id === 'gemma-4-e4b-litert');
  const gemmaAgentModelId = modelIdForAgentEngine('gemma-4-e4b-analyst');
  const openai = getOnlineProviderSettings('ONLINE', {});
  const gemini = getOnlineProviderSettings('GEMINI', {});
  const xai = getOnlineProviderSettings('XAI', {});
  return [
    {
      name: '[Offline AI] Missing evidence cannot produce a trade advisory',
      passed: missingEvidence.verdict === 'NO_TRADE' && missingEvidence.riskFlags.includes('SWEEP_NOT_CONFIRMED'),
      details: `verdict=${missingEvidence.verdict}; flags=${missingEvidence.riskFlags.join(',')}`,
    },
    {
      name: '[Offline AI] Complete deterministic evidence remains advisory-only',
      passed: completeEvidence.verdict === 'TRADE' && completeEvidence.advisoryOnly === true,
      details: `verdict=${completeEvidence.verdict}; advisoryOnly=${completeEvidence.advisoryOnly}`,
    },
    {
      name: '[Offline AI] Unsupported WebLLM artifact is rejected before load',
      passed: unsupported === false && !PLAN_V4_MODELS.some(model => model.id === 'deepseek-r1-distill-qwen-14b-mlc'),
      details: `supported=${unsupported}; catalogued=${PLAN_V4_MODELS.some(model => model.id === 'deepseek-r1-distill-qwen-14b-mlc')}`,
    },
    {
      name: '[Offline AI] Capability recommendation falls back to deterministic without WebGPU',
      passed: serverRecommendation.modelId === 's0-deterministic' && serverRecommendation.runtime === 'Core-Deterministic',
      details: `${serverRecommendation.modelId}; ${serverRecommendation.reasonFa}`,
    },
    {
      name: '[Offline AI] Smallest WebLLM model remains available for device download smoke tests',
      passed: smallestSupported === true,
      details: `supported=${smallestSupported}; model=SmolLM2-360M-Instruct-q4f16_1-MLC`,
    },
    {
      name: '[Offline AI] Server runtime never claims a browser-resident model',
      passed: runtime.residentModelId === null,
      details: `resident=${runtime.residentModelId}`,
    },
    {
      name: '[Offline AI] Synchronous neural profile fails closed instead of fabricating inference',
      passed: synchronousNeural.passed === false && synchronousNeural.reasonCode === 'NEURAL_ASYNC_REQUIRED',
      details: `passed=${synchronousNeural.passed}; reason=${synchronousNeural.reasonCode}`,
    },
    {
      name: '[Offline AI] Gemma E4B pins the real LiteRT artifact bytes and never replaces it with a fake E2B entry',
      passed: gemma?.runtime === 'LiteRT-LM-Web'
        && gemma.downloadSizeMB === 2969
        && gemma.artifactBytes === 2969059328
        && gemma.modelUrl === 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/2eee7ac325f20eb8c9ac1d0e972f7c84663062da/gemma-4-E4B-it-web.litertlm'
        && !PLAN_V4_MODELS.some(model => /gemma.*e2b/i.test(`${model.id} ${model.name}`)),
      details: `runtime=${gemma?.runtime}; downloadMB=${gemma?.downloadSizeMB}; artifactBytes=${gemma?.artifactBytes}; url=${gemma?.modelUrl}; hasE2B=${PLAN_V4_MODELS.some(model => /gemma.*e2b/i.test(`${model.id} ${model.name}`))}`,
    },
    {
      name: '[Offline AI] Gemma LiteRT remains async and fail-closed until it is resident',
      passed: synchronousLiteRT.passed === false && synchronousLiteRT.reasonCode === 'NEURAL_ASYNC_REQUIRED' && gemmaAgentModelId === 'gemma-4-e4b-litert',
      details: `passed=${synchronousLiteRT.passed}; reason=${synchronousLiteRT.reasonCode}; mapped=${gemmaAgentModelId}`,
    },
    {
      name: '[Offline AI] Online providers are opt-in and remain unconfigured without keys',
      passed: !openai.configured && !gemini.configured && !xai.configured && gemini.missing.includes('GEMINI_API_KEY') && xai.missing.includes('XAI_API_KEY'),
      details: `openai=${openai.missing.join(',')}; gemini=${gemini.missing.join(',')}; xai=${xai.missing.join(',')}`,
    },
  ];
}
