import type { StrategyCandidate } from '@/lib/contracts/strategy';
import type { AgentRole, MultiAgentConfiguration, TradingStyleId } from '@/lib/contracts/multi-agent-system';
import type { StructuredCandidateAdvisory } from './offline-ai-contracts';

export interface AgentEvidencePacket {
  packetVersion: 'evidence-packet-v1';
  candidate: StrategyCandidate;
  tradingStyle: TradingStyleId;
  requiredRules: string[];
  marketContext: {
    regime?: string;
    sessionUtc?: string;
    spreadPips?: number;
    higherTimeframeBias?: string;
    newsRisk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  };
  dataQuality: {
    isClosedCandle: boolean;
    noLookahead: boolean;
    evidenceIds: string[];
    missingFields: string[];
  };
}

export interface AgentPromptBundle {
  role: AgentRole;
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
}

export interface AgenticReviewResult {
  candidateId: string;
  config: Pick<MultiAgentConfiguration, 'scannerEngineId' | 'analystEngineId' | 'criticEngineId' | 'judgeEngineId'>;
  scanner: { approved: boolean; reasons: string[] };
  analyst: StructuredCandidateAdvisory;
  critic: StructuredCandidateAdvisory;
  judge: {
    approved: boolean;
    reasonCodes: string[];
    summaryFa: string;
  };
  finalDecision: 'PAPER_TRADE' | 'NO_TRADE' | 'REVIEW_REQUIRED';
  advisoryOnly: true;
  promptVersion: string;
  reviewedAt: number;
}

export function evidencePacketFromCandidate(candidate: StrategyCandidate, style: TradingStyleId, context: AgentEvidencePacket['marketContext'] = {}): AgentEvidencePacket {
  const evidenceIds = Object.values(candidate.evidenceIds).filter((value): value is string => Boolean(value));
  return {
    packetVersion: 'evidence-packet-v1',
    candidate,
    tradingStyle: style,
    requiredRules: [
      'Only use fields present in this packet; do not invent market facts.',
      'The signal candle is closed and the order is eligible no earlier than the next candle.',
      'If evidence is missing, contradictory, or ambiguous, return REVIEW_REQUIRED or NO_TRADE.',
      'This review is advisory only and cannot authorize live or broker execution.',
    ],
    marketContext: context,
    dataQuality: {
      isClosedCandle: true,
      noLookahead: true,
      evidenceIds,
      missingFields: [],
    },
  };
}

export type AgentPromptProfile = 'BASELINE_EVIDENCE_V1' | 'STRICT_RISK_V1' | 'CONTEXT_FIRST_V1';

export function buildAgentPrompt(role: AgentRole, packet: AgentEvidencePacket, profile: AgentPromptProfile = 'BASELINE_EVIDENCE_V1'): AgentPromptBundle {
  const mission: Record<AgentRole, string> = {
    SCANNER: 'Verify that the deterministic scanner found the required structural evidence for the selected trading style. Do not discover facts outside the packet.',
    ANALYST: 'Assess context, direction, confluence, and uncertainty. Confirm only when the evidence supports the defined rules; do not create missing higher-timeframe or news evidence.',
    CRITIC: 'Act as an adversarial risk critic. Search for contradictions, late entry, weak evidence, unrealistic risk/reward, regime conflict, and hidden assumptions. Prefer NO_TRADE or REVIEW_REQUIRED when uncertain.',
    JUDGE: 'Apply fail-closed policy to the other reviews. Any disagreement, missing evidence, invalid JSON, or risk violation must produce NO_TRADE. Never use confidence as a substitute for evidence.',
  };
  const output: Record<AgentRole, string> = {
    SCANNER: '{"verdict":"APPROVE|NO_TRADE|REVIEW_REQUIRED","confidence":0,"rationaleFa":"","riskFlags":[],"evidenceIds":[]}',
    ANALYST: '{"verdict":"TRADE|NO_TRADE|REVIEW_REQUIRED","confidence":0,"rationaleFa":"","riskFlags":[],"evidenceIds":[]}',
    CRITIC: '{"verdict":"TRADE|NO_TRADE|REVIEW_REQUIRED","confidence":0,"rationaleFa":"","riskFlags":[],"evidenceIds":[]}',
    JUDGE: '{"verdict":"TRADE|NO_TRADE|REVIEW_REQUIRED","confidence":0,"rationaleFa":"","riskFlags":[],"evidenceIds":[]}',
  };
  return {
    role,
    promptVersion: profile === 'BASELINE_EVIDENCE_V1' ? 'agent-prompts-v1' : profile,
    systemPrompt: `You are the ${role} agent in a four-agent trading research council. ${mission[role]} Prompt profile: ${profile}. ${profile === 'STRICT_RISK_V1' ? 'Reject on any missing, stale, or weak evidence; prefer NO_TRADE.' : profile === 'CONTEXT_FIRST_V1' ? 'Evaluate regime, session, higher-timeframe context, and uncertainty before the setup.' : 'Evaluate only the supplied evidence and preserve the baseline rules.'} Return only valid JSON matching this schema: ${output[role]} Never issue a live-order authorization.`,
    userPrompt: JSON.stringify(packet),
  };
}

export function judgeAgentReviews(input: { analyst: StructuredCandidateAdvisory; critic: StructuredCandidateAdvisory; candidate: StrategyCandidate }): AgenticReviewResult['judge'] {
  const reasonCodes: string[] = [];
  if (input.analyst.verdict !== 'TRADE') reasonCodes.push('ANALYST_NOT_APPROVED');
  if (input.critic.verdict === 'NO_TRADE') reasonCodes.push('CRITIC_REJECTED');
  if (input.critic.verdict === 'REVIEW_REQUIRED') reasonCodes.push('CRITIC_UNCERTAIN');
  if (input.analyst.confidence < 0.6) reasonCodes.push('ANALYST_CONFIDENCE_BELOW_THRESHOLD');
  if (input.critic.confidence < 0.6) reasonCodes.push('CRITIC_CONFIDENCE_BELOW_THRESHOLD');
  if (input.candidate.riskRewardRatio < 2) reasonCodes.push('RISK_REWARD_BELOW_HARD_FLOOR');
  const allFlags = [...input.analyst.riskFlags, ...input.critic.riskFlags];
  if (allFlags.some(flag => ['HIGH_IMPACT_NEWS', 'SPREAD_LIMIT_EXCEEDED', 'INVALID_MARKET_PRICE', 'INVALID_MODEL_OUTPUT', 'INVALID_MODEL_JSON', 'MODEL_NOT_RESIDENT', 'UNMAPPED_AGENT_MODEL'].includes(flag))) {
    reasonCodes.push('HARD_RISK_FLAG_PRESENT');
  }
  if (input.analyst.evidenceIds.length === 0 && input.critic.evidenceIds.length === 0) reasonCodes.push('NO_AGENT_EVIDENCE_IDS');
  return {
    approved: reasonCodes.length === 0,
    reasonCodes,
    summaryFa: reasonCodes.length === 0 ? 'تحلیل‌گر و منتقد با شواهد کافی هم‌نظرند و قیدهای سخت ریسک برقرار است.' : `توقف شکست‌امن: ${reasonCodes.join('، ')}.`,
  };
}
