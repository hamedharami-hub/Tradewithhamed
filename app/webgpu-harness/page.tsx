'use client';

import { useEffect, useState } from 'react';
import { BrowserOfflineAIManager, PLAN_V4_MODELS, type ProgressReportPayload, type WebGPUCapabilityReport } from '@/lib/ai/browser-offline-ai';
import { reviewCandidateWithFourAgents } from '@/lib/ai/agentic-reviewer';
import type { StrategyCandidate } from '@/lib/contracts/strategy';

const MODEL_ID = 'phi-4-mini-instruct-mlc';
const candidate: StrategyCandidate = { id: 'HYBRID-GBPUSD-FIXTURE-001', strategyName: 'S0_SWEEP_FVG', symbol: 'GBPUSD', timeframe: '1H', direction: 'BUY', createdAtTimestamp: Date.UTC(2024, 7, 7, 9), expiresAtTimestamp: Date.UTC(2024, 7, 7, 14), entryPrice: 1.27, stopLossPrice: 1.268, takeProfitPrice: 1.275, riskRewardRatio: 2.5, evidenceIds: { sweepId: 'SWEEP-001', fvgId: 'FVG-001', contextSwingId: 'SWING-001' }, rationale: 'Fixed deterministic GBPUSD evidence packet for browser WebGPU validation.', status: 'CONFIRMED' };

export default function HybridWebGPUHarnessPage() {
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
      setHardware(report); setReadiness(downloadReadiness.reasonFa); setStatus(downloadReadiness.canStart ? 'READY_FOR_EXPLICIT_DOWNLOAD' : 'BLOCKED');
    })();
    return () => { active = false; };
  }, []);

  const prepareModel = async () => {
    const model = PLAN_V4_MODELS.find(item => item.id === MODEL_ID);
    if (!model) return;
    if (!window.confirm(`مدل ${model.name} حدود ${model.downloadSizeMB} مگابایت دانلود و در CacheStorage مرورگر ذخیره می‌شود. دانلود شروع شود؟`)) return;
    setStatus('LOADING_PHI_MODEL');
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
      setStatus('RUNNING_HYBRID_REVIEW');
      const review = await reviewCandidateWithFourAgents(candidate, { activeTradingStyle: 'S0_SWEEP_FVG', scannerEngineId: 's0-deterministic-scanner', analystEngineId: 'phi-4-mini-analyst', criticEngineId: 'deep-critic-strict', judgeEngineId: 'strict-consensus-fail-closed' });
      const payload = { status: 'PASS', hardware, verification, residentModelId: BrowserOfflineAIManager.getResidentModelId(), review };
      setResult(payload); setStatus('PASS');
      (window as Window & { __HYBRID_WEBGPU_RESULT__?: unknown }).__HYBRID_WEBGPU_RESULT__ = payload;
      return payload;
    } catch (error) {
      const payload = { status: 'BLOCKED', error: error instanceof Error ? error.message : String(error), runtime: BrowserOfflineAIManager.getRuntimeStatus() };
      setResult(payload); setStatus('BLOCKED');
      (window as Window & { __HYBRID_WEBGPU_RESULT__?: unknown }).__HYBRID_WEBGPU_RESULT__ = payload;
      return payload;
    }
  };

  useEffect(() => { (window as Window & { __RUN_HYBRID_OFFLINE__?: () => Promise<unknown> }).__RUN_HYBRID_OFFLINE__ = runOffline; });

  return <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 800 }} dir="rtl">
    <h1>آزمون دستی مدل Phi-4-mini</h1>
    <p>این آزمون حدود ۲.۱۵ گیگابایت حجم دارد و هیچ دانلودی را بدون تأیید شما شروع نمی‌کند.</p>
    <p data-testid="hybrid-status"><strong>وضعیت:</strong> {status}</p>
    <p><strong>شرایط دانلود:</strong> {readiness}</p>
    {hardware && <p><strong>دستگاه:</strong> {hardware.hasWebGPU ? `WebGPU فعال؛ فضای آزاد تقریبی ${Math.max(0, hardware.estimatedStorageQuotaMB - hardware.estimatedStorageUsageMB)}MB` : 'WebGPU در دسترس نیست'}</p>}
    {progress && <p aria-live="polite">{progress.percent}% — {progress.downloadedMB}/{progress.totalMB}MB — {progress.text}</p>}
    {status === 'READY_FOR_EXPLICIT_DOWNLOAD' && <button type="button" onClick={() => void prepareModel()}>دانلود و بارگذاری Phi-4-mini</button>}
    {status === 'MODEL_READY_WAITING_FOR_OFFLINE' && <button type="button" onClick={() => void runOffline()}>شبکه را قطع کرده‌ام؛ آزمون آفلاین را اجرا کن</button>}
    <pre data-testid="hybrid-result" style={{ whiteSpace: 'pre-wrap', marginTop: 20 }}>{result ? JSON.stringify(result, null, 2) : 'هنوز آزمون نهایی اجرا نشده است.'}</pre>
  </main>;
}
