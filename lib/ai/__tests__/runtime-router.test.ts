import { PLAN_V4_MODELS } from '../browser-offline-ai';
import { createInferenceProvenance } from '../offline-ai-contracts';
import type { AICapabilities, AIHealthStatus, AIRequest, AIResponse, AIRuntimeProvider } from '../runtime-contracts';
import { AIRuntimeError } from '../runtime-contracts';
import { AIRuntimeRouter } from '../runtime-router';

export interface RuntimeRouterTestResult { name: string; passed: boolean; details: string }

class FakeProvider implements AIRuntimeProvider {
  loadCalls: string[] = [];
  generateCalls: AIRequest[] = [];

  constructor(readonly id: string, private readonly supported: string[], private readonly failureCode?: string, private readonly cached: string[] = []) {}

  async capabilities(): Promise<AICapabilities> { return { providerId: this.id, available: true, browserRequired: false, webGPURequired: false, supportsStreaming: false }; }
  async supportsModel(modelId: string): Promise<boolean> { return this.supported.includes(modelId); }
  async loadModel(modelId: string): Promise<void> { this.loadCalls.push(modelId); }
  async loadCachedModel(modelId: string): Promise<boolean> { if (!this.cached.includes(modelId)) return false; this.loadCalls.push(modelId); return true; }
  async generate(request: AIRequest): Promise<AIResponse> {
    this.generateCalls.push(request);
    if (this.failureCode && request.modelId === this.supported[0]) throw new AIRuntimeError(this.failureCode, this.failureCode);
    return { advisory: { modelId: request.modelId, modelRevision: 'test', source: this.id === 'deterministic' ? 'DETERMINISTIC' : 'WEBLLM_WEBGPU', verdict: 'NO_TRADE', confidence: 0, rationaleFa: 'test', riskFlags: [], evidenceIds: [], latencyMs: 1, advisoryOnly: true, provenance: createInferenceProvenance({ provider: this.id === 'deterministic' ? 'deterministic' : 'webllm', runtime: this.id === 'deterministic' ? 'CORE_DETERMINISTIC' : 'WEBLLM_WEBGPU', requestedModelId: request.modelId, executedModelId: request.modelId, inferenceExecuted: this.id !== 'deterministic' }) } };
  }
  async unload(): Promise<void> {}
  async health(): Promise<AIHealthStatus> { return { status: 'READY', residentModelId: null }; }
}

const evidence = { symbol: 'EURUSD', currentPrice: 1.1 };

export async function runRuntimeRouterTests(): Promise<RuntimeRouterTestResult[]> {
  const webllm = new FakeProvider('webllm', ['phi-4-mini-instruct-mlc']);
  const deterministic = new FakeProvider('deterministic', ['s0-deterministic']);
  const router = new AIRuntimeRouter([webllm, deterministic], PLAN_V4_MODELS);
  const webllmResult = await router.generate({ modelId: 'phi-4-mini-instruct-mlc', evidence });
  const deterministicResult = await router.generate({ modelId: 's0-deterministic', evidence });
  const invalidResult = await router.generate({ modelId: 'invented-model', evidence });

  const failingProvider = new FakeProvider('webllm', ['phi-4-mini-instruct-mlc'], 'MODEL_NOT_RESIDENT');
  const failingRouter = new AIRuntimeRouter([failingProvider], PLAN_V4_MODELS);
  const failedResult = await failingRouter.generate({ modelId: 'phi-4-mini-instruct-mlc', evidence });
  const fallbackProvider = new FakeProvider('webllm', ['phi-4-mini-instruct-mlc', 'qwen3-1.7b-mlc'], 'OUT_OF_MEMORY', ['qwen3-1.7b-mlc']);
  const fallbackRouter = new AIRuntimeRouter([fallbackProvider], PLAN_V4_MODELS);
  const fallbackResult = await fallbackRouter.generate({ modelId: 'phi-4-mini-instruct-mlc', evidence });
  const cancelledRouter = new AIRuntimeRouter([new FakeProvider('webllm', ['phi-4-mini-instruct-mlc'], 'GENERATION_CANCELLED')], PLAN_V4_MODELS);
  const cancelledResult = await cancelledRouter.generate({ modelId: 'phi-4-mini-instruct-mlc', evidence });
  const timeoutRouter = new AIRuntimeRouter([new FakeProvider('webllm', ['phi-4-mini-instruct-mlc'], 'GENERATION_TIMEOUT')], PLAN_V4_MODELS);
  const timeoutResult = await timeoutRouter.generate({ modelId: 'phi-4-mini-instruct-mlc', evidence });

  return [
    {
      name: '[AI Runtime Router] Routes WebLLM by declared runtime, not model family',
      passed: webllm.generateCalls.length === 1 && deterministic.generateCalls.length === 1 && webllmResult.advisory.provenance.provider === 'webllm' && deterministicResult.advisory.provenance.provider === 'deterministic',
      details: `webllmCalls=${webllm.generateCalls.length}; deterministicCalls=${deterministic.generateCalls.length}`,
    },
    {
      name: '[AI Runtime Router] Invalid model fails closed without claiming inference',
      passed: invalidResult.advisory.verdict === 'REVIEW_REQUIRED' && !invalidResult.advisory.provenance.inferenceExecuted && invalidResult.advisory.provenance.fallbackReason === 'MODEL_NOT_CONFIGURED',
      details: JSON.stringify(invalidResult.advisory.provenance),
    },
    {
      name: '[AI Runtime Router] Runtime failure preserves explicit non-execution provenance',
      passed: failedResult.advisory.verdict === 'REVIEW_REQUIRED' && !failedResult.advisory.provenance.inferenceExecuted && failedResult.advisory.provenance.fallbackReason === 'MODEL_NOT_RESIDENT',
      details: JSON.stringify(failedResult.advisory.provenance),
    },
    {
      name: '[AI Runtime Router] OOM fallback uses only a smaller cached model and records provenance',
      passed: fallbackResult.advisory.provenance.inferenceExecuted
        && fallbackResult.advisory.provenance.fallbackUsed
        && fallbackResult.advisory.provenance.requestedModelId === 'phi-4-mini-instruct-mlc'
        && fallbackResult.advisory.provenance.executedModelId === 'qwen3-1.7b-mlc'
        && fallbackResult.advisory.provenance.fallbackReason === 'OUT_OF_MEMORY',
      details: JSON.stringify(fallbackResult.advisory.provenance),
    },
    {
      name: '[AI Runtime Router] Cancellation fails closed without model fallback',
      passed: !cancelledResult.advisory.provenance.inferenceExecuted
        && !cancelledResult.advisory.provenance.fallbackUsed
        && cancelledResult.advisory.provenance.fallbackReason === 'GENERATION_CANCELLED',
      details: JSON.stringify(cancelledResult.advisory.provenance),
    },
    {
      name: '[AI Runtime Router] Timeout fails closed without model fallback',
      passed: !timeoutResult.advisory.provenance.inferenceExecuted
        && !timeoutResult.advisory.provenance.fallbackUsed
        && timeoutResult.advisory.provenance.fallbackReason === 'GENERATION_TIMEOUT',
      details: JSON.stringify(timeoutResult.advisory.provenance),
    },
  ];
}
