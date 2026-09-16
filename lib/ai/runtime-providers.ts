import { BrowserOfflineAIManager, PLAN_V4_MODELS, type BrowserAIModelRecord } from './browser-offline-ai';
import { buildDeterministicAdvisory } from './deterministic-advisory';
import type { AIRuntimeId, AIProviderId, StructuredCandidateAdvisory } from './offline-ai-contracts';
import { createInferenceProvenance } from './offline-ai-contracts';
import type { AICapabilities, AIHealthStatus, AIRequest, AIResponse, AIRuntimeProvider } from './runtime-contracts';
import { AIRuntimeError } from './runtime-contracts';

abstract class ManagedBrowserProvider implements AIRuntimeProvider {
  abstract readonly id: AIProviderId;
  protected abstract readonly runtime: BrowserAIModelRecord['runtime'];

  async capabilities(): Promise<AICapabilities> {
    if (typeof window === 'undefined') return { providerId: this.id, available: false, browserRequired: true, webGPURequired: true, supportsStreaming: true, reason: 'BROWSER_RUNTIME_REQUIRED' };
    const hardware = await BrowserOfflineAIManager.probeHardware();
    return { providerId: this.id, available: hardware.hasWebGPU, browserRequired: true, webGPURequired: true, supportsStreaming: true, ...(!hardware.hasWebGPU ? { reason: 'WEBGPU_UNAVAILABLE' } : {}) };
  }

  async supportsModel(modelId: string): Promise<boolean> {
    const model = PLAN_V4_MODELS.find(item => item.id === modelId);
    return model?.runtime === this.runtime && BrowserOfflineAIManager.isModelSupported(modelId);
  }

  async loadModel(modelId: string): Promise<void> {
    if (!(await this.supportsModel(modelId))) throw new AIRuntimeError('MODEL_NOT_SUPPORTED', `Model ${modelId} is not supported by ${this.id}.`);
    const result = await BrowserOfflineAIManager.loadModelToMemory(modelId);
    if (!result.success) throw new AIRuntimeError('MODEL_LOAD_FAILED', result.messageFa);
  }

  async loadCachedModel(modelId: string): Promise<boolean> {
    if (!(await this.supportsModel(modelId))) return false;
    const result = await BrowserOfflineAIManager.loadCachedModelToMemory(modelId);
    return result.success;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    if (!(await this.supportsModel(request.modelId))) throw new AIRuntimeError('MODEL_NOT_SUPPORTED', `Model ${request.modelId} is not supported by ${this.id}.`);
    if (BrowserOfflineAIManager.getResidentModelId() !== request.modelId) throw new AIRuntimeError('MODEL_NOT_RESIDENT', `Model ${request.modelId} is not resident.`);
    try {
      return { advisory: await BrowserOfflineAIManager.evaluateCandidateAdvisory(request.modelId, request.evidence, request.systemPrompt, request.userPrompt, { signal: request.signal, timeoutMs: request.timeoutMs }) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/GENERATION_TIMEOUT/i.test(message)) throw new AIRuntimeError('GENERATION_TIMEOUT', message);
      if (/GENERATION_CANCELLED|AbortError|aborted/i.test(message)) throw new AIRuntimeError('GENERATION_CANCELLED', message);
      if (/out of memory|OOM|allocation|device lost|GPUDevice/i.test(message)) throw new AIRuntimeError('OUT_OF_MEMORY', message);
      throw new AIRuntimeError('RUNTIME_GENERATION_FAILED', message);
    }
  }

  async unload(): Promise<void> {
    const result = await BrowserOfflineAIManager.unloadModelFromMemory();
    if (!result.success) throw new AIRuntimeError('MODEL_UNLOAD_FAILED', result.messageFa);
  }

  async health(): Promise<AIHealthStatus> {
    const capabilities = await this.capabilities();
    if (!capabilities.available) return { status: 'UNAVAILABLE', residentModelId: null, reason: capabilities.reason };
    const residentModelId = BrowserOfflineAIManager.getResidentModelId();
    const resident = PLAN_V4_MODELS.find(item => item.id === residentModelId);
    return { status: resident?.runtime === this.runtime ? 'READY' : 'DEGRADED', residentModelId: resident?.runtime === this.runtime ? residentModelId : null, ...(resident?.runtime === this.runtime ? {} : { reason: 'NO_RESIDENT_MODEL' }) };
  }
}

export class WebLLMRuntimeProvider extends ManagedBrowserProvider {
  readonly id = 'webllm' as const;
  protected readonly runtime = 'WebLLM-WebGPU' as const;
}

export class LiteRTWebRuntimeProvider extends ManagedBrowserProvider {
  readonly id = 'litert-web' as const;
  protected readonly runtime = 'LiteRT-LM-Web' as const;
}

export class DeterministicRuntimeProvider implements AIRuntimeProvider {
  readonly id = 'deterministic' as const;

  async capabilities(): Promise<AICapabilities> {
    return { providerId: this.id, available: true, browserRequired: false, webGPURequired: false, supportsStreaming: false };
  }

  async supportsModel(modelId: string): Promise<boolean> {
    return PLAN_V4_MODELS.some(item => item.id === modelId && item.runtime === 'Core-Deterministic');
  }

  async loadModel(modelId: string): Promise<void> {
    if (!(await this.supportsModel(modelId))) throw new AIRuntimeError('MODEL_NOT_SUPPORTED', `Model ${modelId} is not deterministic.`);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const model = PLAN_V4_MODELS.find(item => item.id === request.modelId);
    if (model?.runtime !== 'Core-Deterministic') throw new AIRuntimeError('MODEL_NOT_SUPPORTED', `Model ${request.modelId} is not deterministic.`);
    return { advisory: buildDeterministicAdvisory(model.id, model.artifactRevision, request.evidence) };
  }

  async unload(): Promise<void> {}

  async health(): Promise<AIHealthStatus> {
    return { status: 'READY', residentModelId: null };
  }
}

export class UnsupportedChromeRuntimeProvider implements AIRuntimeProvider {
  readonly id = 'chrome-builtin' as const;
  async capabilities(): Promise<AICapabilities> { return { providerId: this.id, available: false, browserRequired: true, webGPURequired: false, supportsStreaming: false, reason: 'CHROME_PROMPT_API_UNIMPLEMENTED' }; }
  async supportsModel(): Promise<boolean> { return false; }
  async loadModel(): Promise<void> { throw new AIRuntimeError('RUNTIME_UNAVAILABLE', 'Chrome built-in AI is not implemented.'); }
  async generate(): Promise<AIResponse> { throw new AIRuntimeError('RUNTIME_UNAVAILABLE', 'Chrome built-in AI is not implemented.'); }
  async unload(): Promise<void> {}
  async health(): Promise<AIHealthStatus> { return { status: 'UNAVAILABLE', residentModelId: null, reason: 'CHROME_PROMPT_API_UNIMPLEMENTED' }; }
}

export function unavailableAdvisory(request: AIRequest, provider: AIProviderId, runtime: AIRuntimeId, reason: string, modelRevision = 'unavailable'): StructuredCandidateAdvisory {
  return {
    modelId: request.modelId,
    modelRevision,
    source: runtime === 'LITERT_LM_WEB' ? 'LITERT_LM_WEB' : runtime === 'CORE_DETERMINISTIC' ? 'DETERMINISTIC' : 'WEBLLM_WEBGPU',
    verdict: 'REVIEW_REQUIRED',
    confidence: 0,
    rationaleFa: `استنتاج اجرا نشد: ${reason}`,
    riskFlags: [reason],
    evidenceIds: [],
    latencyMs: 0,
    advisoryOnly: true,
    provenance: createInferenceProvenance({ provider, runtime, requestedModelId: request.modelId, fallbackReason: reason }),
  };
}
