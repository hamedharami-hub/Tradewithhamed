import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { createInferenceProvenance, evidenceFromCandidate, StructuredCandidateAdvisory } from './offline-ai-contracts';
import { aiRuntimeRouter } from './runtime-router';

const AGENT_MODEL_MAP: Record<string, string> = {
  // Scanner engines
  'llama-3.2-3b-scanner': 'llama-3.2-3b-instruct-mlc',
  'smollm2-360m-scanner': 'smollm2-360m-mlc',
  'qwen3.5-0.8b-scanner': 'qwen3.5-0.8b-mlc',
  'qwen3.5-2b-scanner': 'qwen3.5-2b-mlc',

  // Analyst engines
  'phi-4-mini-analyst': 'phi-4-mini-instruct-mlc',
  'deepseek-r1-7b-analyst': 'deepseek-r1-distill-qwen-7b-mlc',
  'qwen3.5-4b-analyst': 'qwen3.5-4b-mlc',
  'qwen2.5-7b-analyst': 'qwen2.5-7b-instruct-mlc',
  'llama-3.2-3b-analyst': 'llama-3.2-3b-instruct-mlc',
  'qwen3.5-2b-analyst': 'qwen3.5-2b-mlc',
  'qwen3.5-0.8b-analyst': 'qwen3.5-0.8b-mlc',
  'qwen3-1.7b-analyst': 'qwen3-1.7b-mlc',
  'gemma-4-e4b-analyst': 'gemma-4-e4b-litert',
  'smollm2-360m-analyst': 'smollm2-360m-mlc',

  // Critic engines
  'deepseek-r1-7b-critic': 'deepseek-r1-distill-qwen-7b-mlc',
  'phi-4-mini-critic': 'phi-4-mini-instruct-mlc',
  'qwen3.5-4b-critic': 'qwen3.5-4b-mlc',
  'llama-3.2-3b-critic': 'llama-3.2-3b-instruct-mlc',
  'qwen2.5-7b-critic': 'qwen2.5-7b-instruct-mlc',
  'qwen3.5-2b-critic': 'qwen3.5-2b-mlc',
  'qwen3.5-0.8b-critic': 'qwen3.5-0.8b-mlc',
  'smollm2-360m-critic': 'smollm2-360m-mlc',
  'gemma-4-e4b-critic': 'gemma-4-e4b-litert',
};

export function modelIdForAgentEngine(engineId: string): string | null {
  return AGENT_MODEL_MAP[engineId] || null;
}

export async function evaluateLoadedLocalAIAgent(engineId: string, candidate: StrategyCandidate): Promise<StructuredCandidateAdvisory> {
  const modelId = modelIdForAgentEngine(engineId);
  if (!modelId) {
    return {
      modelId: 'unmapped', modelRevision: 'none', source: 'WEBLLM_WEBGPU', verdict: 'REVIEW_REQUIRED', confidence: 0,
      rationaleFa: 'برای موتور انتخاب‌شده artifact محلی معتبر و نگاشت‌شده وجود ندارد.', riskFlags: ['UNMAPPED_AGENT_MODEL'], evidenceIds: [], latencyMs: 0, advisoryOnly: true,
      provenance: createInferenceProvenance({ provider: 'webllm', runtime: 'WEBLLM_WEBGPU', requestedModelId: 'unmapped', fallbackReason: 'UNMAPPED_AGENT_MODEL' }),
    };
  }
  return (await aiRuntimeRouter.generate({ modelId, evidence: evidenceFromCandidate(candidate) })).advisory;
}

// نام قبلی برای فراخواننده‌های قدیمی حفظ شده است؛ این adapter اکنون هر runtime محلی مرورگر را پوشش می‌دهد.
export const evaluateLoadedWebLLMAgent = evaluateLoadedLocalAIAgent;
