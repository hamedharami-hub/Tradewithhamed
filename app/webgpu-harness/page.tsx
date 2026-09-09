'use client';

import { useEffect, useState } from 'react';
import { BrowserOfflineAIManager } from '@/lib/ai/browser-offline-ai';
import { reviewCandidateWithFourAgents } from '@/lib/ai/agentic-reviewer';
import type { StrategyCandidate } from '@/lib/contracts/strategy';

const candidate: StrategyCandidate = {
  id: 'HYBRID-GBPUSD-FIXTURE-001',
  strategyName: 'S0_SWEEP_FVG',
  symbol: 'GBPUSD',
  timeframe: '1H',
  direction: 'BUY',
  createdAtTimestamp: Date.UTC(2024, 7, 7, 9),
  expiresAtTimestamp: Date.UTC(2024, 7, 7, 14),
  entryPrice: 1.27,
  stopLossPrice: 1.268,
  takeProfitPrice: 1.275,
  riskRewardRatio: 2.5,
  evidenceIds: { sweepId: 'SWEEP-001', fvgId: 'FVG-001', contextSwingId: 'SWING-001' },
  rationale: 'Fixed deterministic GBPUSD evidence packet for browser WebGPU validation.',
  status: 'CONFIRMED',
};

export default function HybridWebGPUHarnessPage() {
  const [status, setStatus] = useState('STARTING');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setStatus('PROBING_HARDWARE');
        const hardware = await BrowserOfflineAIManager.probeHardware();
        if (!hardware.hasWebGPU) throw new Error('WEBGPU_UNAVAILABLE');
        setStatus('LOADING_PHI_MODEL');
        const loaded = await BrowserOfflineAIManager.loadModelToMemory('phi-4-mini-instruct-mlc');
        if (!loaded.success) throw new Error(loaded.messageFa);
        setStatus('MODEL_READY_WAITING_FOR_OFFLINE');
        const runOfflineHybrid = async () => {
          setStatus('VERIFYING_OFFLINE');
          const verification = await BrowserOfflineAIManager.verifyCachedModelOffline('phi-4-mini-instruct-mlc');
          if (!verification.verified) throw new Error(verification.messageFa);
          setStatus('RUNNING_HYBRID_REVIEW');
          const review = await reviewCandidateWithFourAgents(candidate, {
            activeTradingStyle: 'S0_SWEEP_FVG',
            scannerEngineId: 's0-deterministic-scanner',
            analystEngineId: 'phi-4-mini-analyst',
            criticEngineId: 'deep-critic-strict',
            judgeEngineId: 'strict-consensus-fail-closed',
          });
          const payload = { status: 'PASS', hardware, verification, residentModelId: BrowserOfflineAIManager.getResidentModelId(), review };
          if (active) { setResult(payload); setStatus('PASS'); }
          (window as Window & { __HYBRID_WEBGPU_RESULT__?: unknown }).__HYBRID_WEBGPU_RESULT__ = payload;
          return payload;
        };
        (window as Window & { __RUN_HYBRID_OFFLINE__?: () => Promise<unknown> }).__RUN_HYBRID_OFFLINE__ = runOfflineHybrid;
      } catch (error) {
        const payload = { status: 'BLOCKED', error: error instanceof Error ? error.message : String(error), runtime: BrowserOfflineAIManager.getRuntimeStatus() };
        if (active) { setResult(payload); setStatus('BLOCKED'); }
        (window as Window & { __HYBRID_WEBGPU_RESULT__?: unknown }).__HYBRID_WEBGPU_RESULT__ = payload;
      }
    };
    void run();
    return () => { active = false; };
  }, []);

  return <main style={{ padding: 24, fontFamily: 'system-ui' }}><h1>Hybrid WebGPU Harness</h1><p data-testid="hybrid-status">{status}</p><pre data-testid="hybrid-result">{result ? JSON.stringify(result, null, 2) : 'در حال اجرا...'}</pre></main>;
}
