'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserOfflineAIManager } from '@/lib/ai/browser-offline-ai';
import { reviewCandidateWithFourAgents } from '@/lib/ai/agentic-reviewer';
import type { StrategyCandidate } from '@/lib/contracts/strategy';

interface CandidateFile { candidate: StrategyCandidate; }

export default function WebGPUBenchmarkPage() {
  const [status, setStatus] = useState('STARTING');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;
    const run = async () => {
      try {
        setStatus('LOADING_CANDIDATES');
        const candidateFile = await fetch('/webgpu-candidates-gbpusd.json').then(response => response.json()) as { datasetId: string; datasetSha256: string; evaluationStartTime: number; candidates: StrategyCandidate[] };
        setStatus('PROBING_HARDWARE');
        const hardware = await BrowserOfflineAIManager.probeHardware();
        if (!hardware.hasWebGPU) throw new Error('WEBGPU_UNAVAILABLE');
        setStatus('LOADING_SMOLLM2_MODEL');
        const loaded = await BrowserOfflineAIManager.loadModelToMemory('smollm2-360m-mlc');
        if (!loaded.success) throw new Error(loaded.messageFa);
        const runOffline = async () => {
          setStatus('VERIFYING_OFFLINE');
          const verification = await BrowserOfflineAIManager.verifyCachedModelOffline('smollm2-360m-mlc');
          if (!verification.verified) throw new Error(verification.messageFa);
          const reviews: Array<Record<string, unknown>> = [];
          for (let index = 0; index < candidateFile.candidates.length; index++) {
            setStatus(`REVIEWING_${index + 1}_OF_${candidateFile.candidates.length}`);
            const candidate = candidateFile.candidates[index];
            const review = await reviewCandidateWithFourAgents(candidate, {
              activeTradingStyle: 'S0_SWEEP_FVG',
              scannerEngineId: 's0-deterministic-scanner',
              analystEngineId: 'smollm2-360m-analyst',
              criticEngineId: 'smollm2-360m-analyst',
              judgeEngineId: 'strict-consensus-fail-closed',
            });
            reviews.push({ candidateId: candidate.id, finalDecision: review.finalDecision, judge: review.judge, analyst: review.analyst, critic: review.critic });
          }
          const decisionCounts = reviews.reduce<Record<string, number>>((acc, item) => { const key = String(item.finalDecision); acc[key] = (acc[key] || 0) + 1; return acc; }, {});
          const payload = { status: 'PASS', datasetId: candidateFile.datasetId, datasetSha256: candidateFile.datasetSha256, evaluationStartTime: candidateFile.evaluationStartTime, hardware, verification, residentModelId: BrowserOfflineAIManager.getResidentModelId(), candidateCount: reviews.length, decisionCounts, reviews };
          if (active) { setResult(payload); setStatus('PASS'); }
          (window as Window & { __WEBGPU_BENCHMARK_RESULT__?: unknown }).__WEBGPU_BENCHMARK_RESULT__ = payload;
          return payload;
        };
        (window as Window & { __RUN_WEBGPU_BENCHMARK_OFFLINE__?: () => Promise<unknown> }).__RUN_WEBGPU_BENCHMARK_OFFLINE__ = runOffline;
        setStatus('MODEL_READY_WAITING_FOR_OFFLINE');
      } catch (error) {
        const payload = { status: 'BLOCKED', error: error instanceof Error ? error.message : String(error), runtime: BrowserOfflineAIManager.getRuntimeStatus() };
        if (active) { setResult(payload); setStatus('BLOCKED'); }
        (window as Window & { __WEBGPU_BENCHMARK_RESULT__?: unknown }).__WEBGPU_BENCHMARK_RESULT__ = payload;
      }
    };
    void run();
    return () => { active = false; };
  }, []);

  return <main style={{ padding: 24, fontFamily: 'system-ui' }}><h1>GBPUSD OOS WebGPU Benchmark</h1><p data-testid="webgpu-benchmark-status">{status}</p><pre data-testid="webgpu-benchmark-result">{result ? JSON.stringify(result, null, 2) : 'در حال اجرا...'}</pre></main>;
}
