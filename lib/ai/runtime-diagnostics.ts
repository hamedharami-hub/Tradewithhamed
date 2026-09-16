import type { AIInferenceProvenance, AIRuntimeId } from './offline-ai-contracts';

export interface AIRuntimeMetric {
  kind: 'MODEL_LOAD' | 'GENERATION';
  modelId: string;
  runtime: AIRuntimeId;
  success: boolean;
  durationMs: number;
  ttftMs: number | null;
  outputRate: number | null;
  outputRateUnit: 'chunks/s' | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  recordedAt: string;
}

export interface AIRuntimeDiagnosticSnapshot {
  browser: string;
  platform: string;
  online: boolean | null;
  webGPUAvailable: boolean;
  selectedModelId: string;
  residentModelId: string | null;
  runtimeState: string;
  shellCached: boolean | null;
  recentMetrics: readonly AIRuntimeMetric[];
}

const MAX_METRICS = 20;
const metrics: AIRuntimeMetric[] = [];

export function startRuntimeTimer(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function elapsedRuntimeMs(startedAt: number): number {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  return Number((now - startedAt).toFixed(1));
}

function browserName(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari';
  return 'Unknown';
}

export function recordAIRuntimeMetric(metric: Omit<AIRuntimeMetric, 'recordedAt'>): void {
  metrics.unshift({ ...metric, recordedAt: new Date().toISOString() });
  metrics.splice(MAX_METRICS);
}

export function recordGenerationMetric(input: {
  modelId: string;
  runtime: AIRuntimeId;
  success: boolean;
  latencyMs: number;
  ttftMs?: number;
  chunksPerSec?: number;
  provenance?: AIInferenceProvenance;
}): void {
  recordAIRuntimeMetric({
    kind: 'GENERATION', modelId: input.modelId, runtime: input.runtime, success: input.success,
    durationMs: input.latencyMs, ttftMs: input.ttftMs ?? null,
    outputRate: input.chunksPerSec ?? null, outputRateUnit: input.chunksPerSec === undefined ? null : 'chunks/s',
    fallbackUsed: input.provenance?.fallbackUsed ?? false, fallbackReason: input.provenance?.fallbackReason ?? null,
  });
}

export function clearAIRuntimeMetrics(): void { metrics.length = 0; }

export function createAIRuntimeDiagnosticSnapshot(input: {
  selectedModelId: string;
  residentModelId: string | null;
  runtimeState: string;
  webGPUAvailable: boolean;
  shellCached?: boolean | null;
  navigatorLike?: Pick<Navigator, 'userAgent' | 'platform' | 'onLine'>;
}): AIRuntimeDiagnosticSnapshot {
  const navigatorLike = input.navigatorLike ?? (typeof navigator === 'undefined' ? undefined : navigator);
  return {
    browser: navigatorLike ? browserName(navigatorLike.userAgent) : 'Server/Unknown',
    platform: navigatorLike?.platform || 'Unknown', online: navigatorLike ? navigatorLike.onLine : null,
    webGPUAvailable: input.webGPUAvailable, selectedModelId: input.selectedModelId,
    residentModelId: input.residentModelId, runtimeState: input.runtimeState,
    shellCached: input.shellCached ?? null, recentMetrics: metrics.map(metric => ({ ...metric })),
  };
}
