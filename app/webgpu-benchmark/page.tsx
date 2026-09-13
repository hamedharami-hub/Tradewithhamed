'use client';

import { useEffect, useState } from 'react';
import { BrowserOfflineAIManager, PLAN_V4_MODELS, type ProgressReportPayload, type WebGPUCapabilityReport } from '@/lib/ai/browser-offline-ai';
import { reviewCandidateWithFourAgents } from '@/lib/ai/agentic-reviewer';
import type { StrategyCandidate } from '@/lib/contracts/strategy';

const MODEL_ID = 'smollm2-360m-mlc';

export default function WebGPUBenchmarkPage() {
  const [status, setStatus] = useState('PROBING_HARDWARE');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [hardware, setHardware] = useState<WebGPUCapabilityReport | null>(null);
  const [readiness, setReadiness] = useState('در حال بررسی شرایط دانلود…');
  const [progress, setProgress] = useState<ProgressReportPayload | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [report, downloadReadiness] = await Promise.all([BrowserOfflineAIManager.probeHardware(), BrowserOfflineAIManager.getDownloadReadiness(MODEL_ID)]);
      if (!active) return;
      setHardware(report); setReadiness(downloadReadiness.reasonFa);
      setStatus(downloadReadiness.canStart ? 'READY_FOR_EXPLICIT_DOWNLOAD' : 'BLOCKED');
    })();
    return () => { active = false; };
  }, []);

  const prepareModel = async () => {
    const model = PLAN_V4_MODELS.find(item => item.id === MODEL_ID);
    if (!model) return;
    if (!window.confirm(`مدل آزمون ${model.name} حدود ${model.downloadSizeMB} مگابایت دانلود و در CacheStorage مرورگر ذخیره می‌شود. دانلود شروع شود؟`)) return;
    setStatus('LOADING_SMOLLM2_MODEL');
    setProgress({ percent: 0, downloadedMB: 0, totalMB: model.downloadSizeMB, speedMBs: 0, text: 'در حال آماده‌سازی دانلود…' });
    const loaded = await BrowserOfflineAIManager.loadModelToMemory(MODEL_ID, setProgress);
    if (!loaded.success) { setResult({ status: 'BLOCKED', error: loaded.messageFa, runtime: BrowserOfflineAIManager.getRuntimeStatus() }); setStatus('BLOCKED'); return; }
    setReadiness(loaded.messageFa); setStatus('MODEL_READY_WAITING_FOR_OFFLINE');
  };

  const runOffline = async () => {
    try {
      setStatus('VERIFYING_OFFLINE');
      const verification = await BrowserOfflineAIManager.verifyCachedModelOffline(MODEL_ID);
      if (!verification.verified) throw new Error(verification.messageFa);
      setStatus('LOADING_CANDIDATES');
      const candidateFile = await fetch('/webgpu-candidates-gbpusd.json').then(response => response.json()) as { datasetId: string; datasetSha256: string; evaluationStartTime: number; candidates: StrategyCandidate[] };
      const reviews: Array<Record<string, unknown>> = [];
      for (let index = 0; index < candidateFile.candidates.length; index++) {
        setStatus(`REVIEWING_${index + 1}_OF_${candidateFile.candidates.length}`);
        const candidate = candidateFile.candidates[index];
        const review = await reviewCandidateWithFourAgents(candidate, { activeTradingStyle: 'S0_SWEEP_FVG', scannerEngineId: 's0-deterministic-scanner', analystEngineId: 'smollm2-360m-analyst', criticEngineId: 'smollm2-360m-analyst', judgeEngineId: 'strict-consensus-fail-closed' });
        reviews.push({ candidateId: candidate.id, finalDecision: review.finalDecision, judge: review.judge, analyst: review.analyst, critic: review.critic });
      }
      const decisionCounts = reviews.reduce<Record<string, number>>((acc, item) => { const key = String(item.finalDecision); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
      const payload = { status: 'PASS', datasetId: candidateFile.datasetId, datasetSha256: candidateFile.datasetSha256, evaluationStartTime: candidateFile.evaluationStartTime, hardware, verification, residentModelId: BrowserOfflineAIManager.getResidentModelId(), candidateCount: reviews.length, decisionCounts, reviews };
      setResult(payload); setStatus('PASS');
      (window as Window & { __WEBGPU_BENCHMARK_RESULT__?: unknown }).__WEBGPU_BENCHMARK_RESULT__ = payload;
      return payload;
    } catch (error) {
      const payload = { status: 'BLOCKED', error: error instanceof Error ? error.message : String(error), runtime: BrowserOfflineAIManager.getRuntimeStatus() };
      setResult(payload); setStatus('BLOCKED');
      (window as Window & { __WEBGPU_BENCHMARK_RESULT__?: unknown }).__WEBGPU_BENCHMARK_RESULT__ = payload;
      return payload;
    }
  };

  useEffect(() => { (window as Window & { __RUN_WEBGPU_BENCHMARK_OFFLINE__?: () => Promise<unknown> }).__RUN_WEBGPU_BENCHMARK_OFFLINE__ = runOffline; });

  return <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 800 }} dir="rtl">
    <h1>آزمون WebGPU و بازپخش GBPUSD</h1>
    <p>این صفحه هیچ دانلودی را خودکار شروع نمی‌کند. ابتدا WebGPU و فضای کش بررسی می‌شود، سپس دانلود فقط با تأیید شما آغاز خواهد شد.</p>
    <p data-testid="webgpu-benchmark-status"><strong>وضعیت:</strong> {status}</p>
    <p><strong>شرایط دانلود:</strong> {readiness}</p>
    {hardware && <p><strong>دستگاه:</strong> {hardware.hasWebGPU ? `WebGPU فعال؛ فضای آزاد تقریبی ${Math.max(0, hardware.estimatedStorageQuotaMB - hardware.estimatedStorageUsageMB)}MB` : 'WebGPU در دسترس نیست'}</p>}
    {progress && <p aria-live="polite">{progress.percent}% — {progress.downloadedMB}/{progress.totalMB}MB — {progress.text}</p>}
    {status === 'READY_FOR_EXPLICIT_DOWNLOAD' && <button type="button" onClick={() => void prepareModel()}>دانلود و بارگذاری مدل سبک آزمون</button>}
    {status === 'MODEL_READY_WAITING_FOR_OFFLINE' && <button type="button" onClick={() => void runOffline()}>شبکه را قطع کرده‌ام؛ آزمون آفلاین و بازپخش را اجرا کن</button>}
    <pre data-testid="webgpu-benchmark-result" style={{ whiteSpace: 'pre-wrap', marginTop: 20 }}>{result ? JSON.stringify(result, null, 2) : 'هنوز آزمون نهایی اجرا نشده است.'}</pre>
  </main>;
}
