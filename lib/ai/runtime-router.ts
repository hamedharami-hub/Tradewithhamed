import { PLAN_V4_MODELS, type BrowserAIModelRecord } from './browser-offline-ai';
import type { AIRuntimeId, AIProviderId } from './offline-ai-contracts';
import { DeterministicRuntimeProvider, LiteRTWebRuntimeProvider, UnsupportedChromeRuntimeProvider, unavailableAdvisory, WebLLMRuntimeProvider } from './runtime-providers';
import type { AICapabilities, AIHealthStatus, AIRequest, AIResponse, AIRuntimeProvider } from './runtime-contracts';
import { AIRuntimeError } from './runtime-contracts';
import { recordGenerationMetric } from './runtime-diagnostics';

type ProviderRuntime = Exclude<BrowserAIModelRecord['runtime'], never>;

const PROVIDER_BY_RUNTIME: Record<ProviderRuntime, AIProviderId> = {
  'WebLLM-WebGPU': 'webllm',
  'LiteRT-LM-Web': 'litert-web',
  'Core-Deterministic': 'deterministic',
  'Chrome-Builtin': 'chrome-builtin',
};

const RUNTIME_ID_BY_RUNTIME: Record<ProviderRuntime, AIRuntimeId> = {
  'WebLLM-WebGPU': 'WEBLLM_WEBGPU',
  'LiteRT-LM-Web': 'LITERT_LM_WEB',
  'Core-Deterministic': 'CORE_DETERMINISTIC',
  'Chrome-Builtin': 'CHROME_BUILTIN',
};

export class AIRuntimeRouter {
  private readonly providers: Map<string, AIRuntimeProvider>;

  constructor(
    providers: AIRuntimeProvider[] = [new WebLLMRuntimeProvider(), new LiteRTWebRuntimeProvider(), new DeterministicRuntimeProvider(), new UnsupportedChromeRuntimeProvider()],
    private readonly models: readonly BrowserAIModelRecord[] = PLAN_V4_MODELS,
  ) {
    this.providers = new Map(providers.map(provider => [provider.id, provider]));
  }

  providerForModel(modelId: string): AIRuntimeProvider | null {
    const model = this.models.find(item => item.id === modelId);
    return model ? this.providers.get(PROVIDER_BY_RUNTIME[model.runtime]) || null : null;
  }

  async capabilities(modelId: string): Promise<AICapabilities> {
    const provider = this.providerForModel(modelId);
    if (!provider) return { providerId: 'none', available: false, browserRequired: false, webGPURequired: false, supportsStreaming: false, reason: 'MODEL_NOT_CONFIGURED' };
    const capabilities = await provider.capabilities();
    if (!capabilities.available) return capabilities;
    return await provider.supportsModel(modelId) ? capabilities : { ...capabilities, available: false, reason: 'MODEL_NOT_SUPPORTED' };
  }

  async loadModel(modelId: string): Promise<void> {
    const provider = this.providerForModel(modelId);
    if (!provider) throw new AIRuntimeError('MODEL_NOT_CONFIGURED', `Model ${modelId} is not configured.`);
    await provider.loadModel(modelId);
  }

  async loadCachedModel(modelId: string): Promise<boolean> {
    const provider = this.providerForModel(modelId);
    if (!provider?.loadCachedModel) return false;
    return provider.loadCachedModel(modelId);
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const startedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
    const model = this.models.find(item => item.id === request.modelId);
    if (!model) return this.withDiagnostics({ advisory: unavailableAdvisory(request, 'deterministic', 'CORE_DETERMINISTIC', 'MODEL_NOT_CONFIGURED') }, startedAt);
    const providerId = PROVIDER_BY_RUNTIME[model.runtime];
    const runtimeId = RUNTIME_ID_BY_RUNTIME[model.runtime];
    const provider = this.providers.get(providerId);
    if (!provider) return this.withDiagnostics({ advisory: unavailableAdvisory(request, providerId, runtimeId, 'PROVIDER_NOT_REGISTERED', model.artifactRevision) }, startedAt);
    try {
      return this.withDiagnostics(await provider.generate(request), startedAt);
    } catch (error) {
      const reason = error instanceof AIRuntimeError ? error.code : 'RUNTIME_GENERATION_FAILED';
      if (request.allowFallback !== false && model.runtime === 'WebLLM-WebGPU' && reason === 'OUT_OF_MEMORY' && provider.loadCachedModel) {
        const fallback = await this.tryCachedFallback(provider, model, request, reason);
        if (fallback) return this.withDiagnostics(fallback, startedAt);
      }
      return this.withDiagnostics({ advisory: unavailableAdvisory(request, providerId, runtimeId, reason, model.artifactRevision) }, startedAt);
    }
  }

  private withDiagnostics(response: AIResponse, startedAt: number): AIResponse {
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    const provenance = response.advisory.provenance;
    recordGenerationMetric({ modelId: provenance.executedModelId || provenance.requestedModelId, runtime: provenance.runtime, success: provenance.inferenceExecuted || provenance.runtime === 'CORE_DETERMINISTIC', latencyMs: response.advisory.latencyMs || Number((now - startedAt).toFixed(1)), provenance });
    return response;
  }

  private async tryCachedFallback(provider: AIRuntimeProvider, requestedModel: BrowserAIModelRecord, request: AIRequest, fallbackReason: string): Promise<AIResponse | null> {
    const candidates = this.models
      .filter(model => model.runtime === requestedModel.runtime && model.id !== requestedModel.id && model.downloadSizeMB < requestedModel.downloadSizeMB && !model.isExperimental)
      .sort((a, b) => b.downloadSizeMB - a.downloadSizeMB);
    for (const candidate of candidates) {
      try {
        if (!(await provider.loadCachedModel?.(candidate.id))) continue;
        const response = await provider.generate({ ...request, modelId: candidate.id, allowFallback: false });
        response.advisory.provenance = {
          ...response.advisory.provenance,
          requestedModelId: requestedModel.id,
          executedModelId: candidate.id,
          fallbackUsed: true,
          fallbackReason,
        };
        return response;
      } catch {
        // Try the next smaller cached model. No network download is permitted here.
      }
    }
    return null;
  }

  async unload(modelId: string): Promise<void> {
    const provider = this.providerForModel(modelId);
    if (!provider) throw new AIRuntimeError('MODEL_NOT_CONFIGURED', `Model ${modelId} is not configured.`);
    await provider.unload();
  }

  async health(modelId: string): Promise<AIHealthStatus> {
    const provider = this.providerForModel(modelId);
    return provider ? provider.health() : { status: 'UNAVAILABLE', residentModelId: null, reason: 'MODEL_NOT_CONFIGURED' };
  }
}

export const aiRuntimeRouter = new AIRuntimeRouter();
