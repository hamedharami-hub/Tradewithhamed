import { BrowserOfflineAIManager } from '../browser-offline-ai';
import { AnalystCriticPipeline } from '../../core/analyst-critic';
import type { StrategyCandidate } from '../../contracts/strategy';

export interface OfflineAISafetyTestResult { name: string; passed: boolean; details: string; }

export async function runOfflineAISafetyTests(): Promise<OfflineAISafetyTestResult[]> {
  const candidate: StrategyCandidate = {
    id: 'offline-ai-safety', strategyName: 'S0', symbol: 'XAUUSD', timeframe: '5M', direction: 'BUY',
    createdAtTimestamp: 1, expiresAtTimestamp: 2, entryPrice: 2350, stopLossPrice: 2345, takeProfitPrice: 2365,
    riskRewardRatio: 3, evidenceIds: { sweepId: 'sweep', fvgId: 'fvg', contextSwingId: 'context' }, rationale: 'test', status: 'CONFIRMED',
  };
  const missingEvidence = BrowserOfflineAIManager.buildDeterministicAdvisory('s0-deterministic', { symbol: 'XAUUSD', currentPrice: 2350 });
  const completeEvidence = BrowserOfflineAIManager.buildDeterministicAdvisory('s0-deterministic', {
    symbol: 'XAUUSD', currentPrice: 2350, sweepDetected: true, fvgDetected: true, contextConfirmed: true, riskRewardRatio: 3,
  });
  const unsupported = await BrowserOfflineAIManager.isModelSupported('deepseek-r1-distill-qwen-14b-mlc');
  const runtime = BrowserOfflineAIManager.getRuntimeStatus();
  const synchronousNeural = AnalystCriticPipeline.runShadowPipeline(candidate, 'qwen3.5-0.8b-mlc');
  return [
    {
      name: '[Offline AI] Missing evidence cannot produce a trade advisory',
      passed: missingEvidence.verdict === 'NO_TRADE' && missingEvidence.riskFlags.includes('SWEEP_NOT_CONFIRMED'),
      details: `verdict=${missingEvidence.verdict}; flags=${missingEvidence.riskFlags.join(',')}`,
    },
    {
      name: '[Offline AI] Complete deterministic evidence remains advisory-only',
      passed: completeEvidence.verdict === 'TRADE' && completeEvidence.advisoryOnly === true,
      details: `verdict=${completeEvidence.verdict}; advisoryOnly=${completeEvidence.advisoryOnly}`,
    },
    {
      name: '[Offline AI] Unsupported WebLLM artifact is rejected before load',
      passed: unsupported === false,
      details: `supported=${unsupported}`,
    },
    {
      name: '[Offline AI] Server runtime never claims a browser-resident model',
      passed: runtime.residentModelId === null,
      details: `resident=${runtime.residentModelId}`,
    },
    {
      name: '[Offline AI] Synchronous neural profile fails closed instead of fabricating inference',
      passed: synchronousNeural.passed === false && synchronousNeural.reasonCode === 'NEURAL_ASYNC_REQUIRED',
      details: `passed=${synchronousNeural.passed}; reason=${synchronousNeural.reasonCode}`,
    },
  ];
}
