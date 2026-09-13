import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { BrowserOfflineAIManager, PLAN_V4_MODELS } from './browser-offline-ai';
import { evidenceFromCandidate, StructuredCandidateAdvisory } from './offline-ai-contracts';

const AGENT_MODEL_MAP: Record<string, string> = {
  // Scanner engines
  'chrome-gemini-nano-scanner': 'chrome-gemini-nano',
  'llama-3.2-3b-scanner': 'llama-3.2-3b-instruct-mlc',
  'smollm2-360m-scanner': 'smollm2-360m-mlc',
  'qwen3.5-0.8b-scanner': 'qwen3.5-0.8b-mlc',
  'qwen3.5-2b-scanner': 'qwen3.5-2b-mlc',

  // Analyst engines
  'chrome-gemini-nano-analyst': 'chrome-gemini-nano',
  'phi-4-mini-analyst': 'phi-4-mini-instruct-mlc',
  'deepseek-r1-7b-analyst': 'deepseek-r1-distill-qwen-7b-mlc',
  'qwen3.5-4b-analyst': 'qwen3.5-4b-mlc',
  'qwen2.5-7b-analyst': 'qwen2.5-7b-instruct-mlc',
  'llama-3.2-3b-analyst': 'llama-3.2-3b-instruct-mlc',
  'qwen3.5-2b-analyst': 'qwen3.5-2b-mlc',
  'qwen3.5-0.8b-analyst': 'qwen3.5-0.8b-mlc',
  'qwen3-1.7b-analyst': 'qwen3-1.7b-mlc',
  'smollm2-360m-analyst': 'smollm2-360m-mlc',
  'deepseek-r1-14b-analyst': 'deepseek-r1-distill-qwen-14b-mlc',
  'qwen2.5-14b-analyst': 'qwen2.5-14b-instruct-mlc',

  // Critic engines
  'deepseek-r1-7b-critic': 'deepseek-r1-distill-qwen-7b-mlc',
  'phi-4-mini-critic': 'phi-4-mini-instruct-mlc',
  'qwen3.5-4b-critic': 'qwen3.5-4b-mlc',
  'chrome-gemini-nano-critic': 'chrome-gemini-nano',
  'llama-3.2-3b-critic': 'llama-3.2-3b-instruct-mlc',
  'qwen2.5-7b-critic': 'qwen2.5-7b-instruct-mlc',
  'qwen3.5-2b-critic': 'qwen3.5-2b-mlc',
  'qwen3.5-0.8b-critic': 'qwen3.5-0.8b-mlc',
  'smollm2-360m-critic': 'smollm2-360m-mlc',
  'deepseek-r1-14b-critic': 'deepseek-r1-distill-qwen-14b-mlc',
  'qwen2.5-14b-critic': 'qwen2.5-14b-instruct-mlc',
};

export function modelIdForAgentEngine(engineId: string): string | null {
  return AGENT_MODEL_MAP[engineId] || null;
}

export async function evaluateLoadedWebLLMAgent(engineId: string, candidate: StrategyCandidate): Promise<StructuredCandidateAdvisory> {
  const modelId = modelIdForAgentEngine(engineId);
  if (!modelId) {
    return {
      modelId: 'unmapped', modelRevision: 'none', source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0,
      rationaleFa: 'برای موتور انتخاب‌شده artifact محلی معتبر و نگاشت‌شده وجود ندارد.', riskFlags: ['UNMAPPED_AGENT_MODEL'], evidenceIds: [], latencyMs: 0, advisoryOnly: true,
    };
  }
  const model = PLAN_V4_MODELS.find(item => item.id === modelId);
  if (!model || !(await BrowserOfflineAIManager.isModelSupported(modelId))) {
    return {
      modelId, modelRevision: model?.artifactRevision || 'unknown', source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0,
      rationaleFa: 'مدل انتخاب‌شده در WebLLM registry این build پشتیبانی نمی‌شود.', riskFlags: ['MODEL_NOT_SUPPORTED'], evidenceIds: [], latencyMs: 0, advisoryOnly: true,
    };
  }
  if (BrowserOfflineAIManager.getResidentModelId() !== modelId) {
    return {
      modelId, modelRevision: model.artifactRevision, source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0,
      rationaleFa: 'مدل انتخاب‌شده در حافظه GPU بارگذاری نشده است؛ دانلود یا بارگذاری خودکار انجام نشد.', riskFlags: ['MODEL_NOT_RESIDENT'], evidenceIds: [], latencyMs: 0, advisoryOnly: true,
    };
  }
  return BrowserOfflineAIManager.evaluateCandidateAdvisory(modelId, evidenceFromCandidate(candidate));
}
