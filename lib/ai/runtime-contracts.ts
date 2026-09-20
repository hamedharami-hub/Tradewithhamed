import type { DeterministicMarketEvidence, StructuredCandidateAdvisory } from './offline-ai-contracts';

export interface AICapabilities {
  providerId: string;
  available: boolean;
  browserRequired: boolean;
  webGPURequired: boolean;
  supportsStreaming: boolean;
  reason?: string;
}

export interface AIHealthStatus {
  status: 'READY' | 'DEGRADED' | 'UNAVAILABLE';
  residentModelId: string | null;
  reason?: string;
}

export interface AIRequest {
  modelId: string;
  evidence: DeterministicMarketEvidence;
  systemPrompt?: string;
  userPrompt?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  allowFallback?: boolean;
}

export interface AIResponse {
  advisory: StructuredCandidateAdvisory;
}

export interface AIRuntimeProvider {
  readonly id: string;
  capabilities(): Promise<AICapabilities>;
  supportsModel(modelId: string): Promise<boolean>;
  loadModel(modelId: string): Promise<void>;
  loadCachedModel?(modelId: string): Promise<boolean>;
  generate(request: AIRequest): Promise<AIResponse>;
  unload(): Promise<void>;
  health(): Promise<AIHealthStatus>;
}

export class AIRuntimeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AIRuntimeError';
  }
}
