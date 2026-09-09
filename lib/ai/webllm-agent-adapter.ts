import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { BrowserOfflineAIManager, PLAN_V4_MODELS } from './browser-offline-ai';
import { evidenceFromCandidate, StructuredCandidateAdvisory } from './offline-ai-contracts';

const AGENT_MODEL_MAP: Record<string, string> = {
  'llama-3.2-3b-scanner': 'llama-3.2-3b-instruct-mlc',
  'phi-4-mini-analyst': 'phi-4-mini-instruct-mlc',
  'qwen3.5-0.8b-analyst': 'qwen3.5-0.8b-mlc',
  'smollm2-360m-analyst': 'smollm2-360m-mlc',
  'qwen3.5-2b-analyst': 'qwen3.5-2b-mlc',
  'qwen2.5-7b-analyst': 'qwen2.5-7b-instruct-mlc',
  'qwen3.5-4b-analyst': 'qwen3.5-4b-mlc',
  'qwen3-1.7b-analyst': 'qwen3-1.7b-mlc',
  'deepseek-r1-7b-critic': 'deepseek-r1-distill-qwen-7b-mlc',
  'phi-4-mini-critic': 'phi-4-mini-instruct-mlc',
  'qwen3.5-4b-critic': 'qwen3.5-4b-mlc',
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
