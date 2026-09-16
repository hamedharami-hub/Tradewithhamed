import { clearAIRuntimeMetrics, createAIRuntimeDiagnosticSnapshot, recordAIRuntimeMetric } from '../runtime-diagnostics';

export async function runRuntimeDiagnosticsTests() {
  clearAIRuntimeMetrics();
  for (let index = 0; index < 22; index += 1) {
    recordAIRuntimeMetric({ kind: 'GENERATION', modelId: `model-${index}`, runtime: 'WEBLLM_WEBGPU', success: true, durationMs: index, ttftMs: index, outputRate: 1, outputRateUnit: 'chunks/s', fallbackUsed: false, fallbackReason: null });
  }
  const snapshot = createAIRuntimeDiagnosticSnapshot({
    selectedModelId: 'model-21', residentModelId: 'model-21', runtimeState: 'READY', webGPUAvailable: true, shellCached: true,
    navigatorLike: { userAgent: 'Mozilla/5.0 Edg/140.0', platform: 'Windows ARM', onLine: false },
  });
  const serialized = JSON.stringify(snapshot);
  return [
    { name: '[AI Diagnostics] identifies browser/device without retaining full user agent', passed: snapshot.browser === 'Edge' && snapshot.platform === 'Windows ARM' && !serialized.includes('Mozilla/5.0'), details: `${snapshot.browser}/${snapshot.platform}` },
    { name: '[AI Diagnostics] exposes runtime/offline shell state', passed: snapshot.webGPUAvailable && snapshot.shellCached === true && snapshot.online === false && snapshot.runtimeState === 'READY', details: snapshot.runtimeState },
    { name: '[AI Diagnostics] keeps only the newest bounded metrics', passed: snapshot.recentMetrics.length === 20 && snapshot.recentMetrics[0]?.modelId === 'model-21' && snapshot.recentMetrics[19]?.modelId === 'model-2', details: String(snapshot.recentMetrics.length) },
    { name: '[AI Diagnostics] contains no prompt, symbol, price, account, or trading payload fields', passed: !/prompt|symbol|price|account|evidence/i.test(serialized), details: 'metadata-only snapshot' },
  ];
}
