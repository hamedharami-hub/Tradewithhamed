import type { DeterministicMarketEvidence, StructuredCandidateAdvisory } from './offline-ai-contracts';
import { createInferenceProvenance } from './offline-ai-contracts';

export function buildDeterministicAdvisory(modelId: string, modelRevision: string, evidence: DeterministicMarketEvidence): StructuredCandidateAdvisory {
  const flags: string[] = [];
  const evidenceIds: string[] = [];
  if (!Number.isFinite(evidence.currentPrice) || evidence.currentPrice <= 0) flags.push('INVALID_MARKET_PRICE');
  if (!evidence.sweepDetected) flags.push('SWEEP_NOT_CONFIRMED'); else evidenceIds.push('SWEEP_CONFIRMED');
  if (!evidence.fvgDetected) flags.push('FVG_NOT_CONFIRMED'); else evidenceIds.push('FVG_CONFIRMED');
  if (!evidence.contextConfirmed) flags.push('CONTEXT_NOT_CONFIRMED'); else evidenceIds.push('CONTEXT_CONFIRMED');
  if (!Number.isFinite(evidence.riskRewardRatio) || (evidence.riskRewardRatio || 0) < 2) flags.push('RISK_REWARD_INSUFFICIENT');
  if (evidence.isHighImpactNewsUpcoming) flags.push('HIGH_IMPACT_NEWS');
  if (Number.isFinite(evidence.spreadPips) && Number.isFinite(evidence.maxAllowedSpreadPips) && (evidence.spreadPips || 0) > (evidence.maxAllowedSpreadPips || 0)) flags.push('SPREAD_LIMIT_EXCEEDED');
  const verdict = flags.length === 0 ? 'TRADE' : 'NO_TRADE';
  return {
    modelId,
    modelRevision,
    source: 'DETERMINISTIC',
    verdict,
    confidence: verdict === 'TRADE' ? 0.7 : 0,
    rationaleFa: verdict === 'TRADE' ? 'شواهد ساختاری، نسبت سود به زیان و قیود ورودی قطعی همگی برقرارند. این نتیجه صرفاً advisory است.' : `عدم تأیید معامله: ${flags.join('، ')}.`,
    riskFlags: flags,
    evidenceIds,
    latencyMs: 0,
    advisoryOnly: true,
    provenance: createInferenceProvenance({ provider: 'deterministic', runtime: 'CORE_DETERMINISTIC', requestedModelId: modelId, executedModelId: modelId }),
  };
}
