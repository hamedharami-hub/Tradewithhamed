import { writeFile } from 'node:fs/promises';
import { reviewCandidateWithFourAgents } from '../lib/ai/agentic-reviewer';
import type { StrategyCandidate } from '../lib/contracts/strategy';

const base: StrategyCandidate = {
  id: 'GBPUSD-4H-TREND-AGENTIC-SMOKE-1', strategyName: 'TREND_BREAKOUT_55_EMA200_V1', symbol: 'GBPUSD', timeframe: '4H', direction: 'BUY',
  createdAtTimestamp: Date.parse('2024-09-01T00:00:00Z'), expiresAtTimestamp: Date.parse('2024-09-02T00:00:00Z'),
  entryPrice: 1.32, stopLossPrice: 1.31, takeProfitPrice: 1.34, riskRewardRatio: 2,
  style: 'TREND_BREAKOUT', evidenceIds: { contextSwingId: 'DONCHIAN55-HIGH-GBPUSD-4H-1' },
  ruleProvenance: { ruleVersion: 'research-rules-v1', parameterHash: 'trend55-ema200', resolvedParameters: { channelBars: 55, emaBars: 200 }, signalCandleTimestamp: Date.parse('2024-09-01T00:00:00Z'), evidenceAvailableAtTimestamp: Date.parse('2024-09-01T00:00:00Z'), lifecycle: 'CONFIRMED' },
  rationale: 'Fixed candidate smoke test; advisory-only.', status: 'PENDING_CONFIRMATION',
};

async function main(): Promise<void> {
  const approved = await reviewCandidateWithFourAgents(base, undefined, { regime: 'TRENDING', higherTimeframeBias: 'BULLISH', spreadPips: 1.2, newsRisk: 'LOW' });
  const rejected = await reviewCandidateWithFourAgents({ ...base, id: `${base.id}-MISSING-EVIDENCE`, evidenceIds: {}, ruleProvenance: undefined });
  const output = { version: 'agentic-offline-smoke-v1', generatedAt: new Date().toISOString(), purpose: 'Advisory-only offline council smoke test; no order authorization.', candidate: base, approvedCase: approved, missingEvidenceCase: rejected, assertions: { validCandidateDecision: approved.finalDecision, validCandidateIsPaperOnly: approved.advisoryOnly === true && approved.finalDecision === 'PAPER_TRADE', missingEvidenceFailsClosed: rejected.finalDecision === 'NO_TRADE' } };
  const path = 'data/runs/agentic-offline-gbpusd-4h-smoke-20260910.json';
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ path, assertions: output.assertions }));
}
void main();
