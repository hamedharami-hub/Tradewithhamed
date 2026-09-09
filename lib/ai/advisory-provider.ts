import type { MultiAgentConfiguration } from '@/lib/contracts/multi-agent-system';
import type { StrategyCandidate } from '@/lib/contracts/strategy';
import { BrowserOfflineAIManager } from './browser-offline-ai';
import { buildAgentPrompt, evidencePacketFromCandidate, judgeAgentReviews } from './agentic-review-contracts';
import { modelIdForAgentEngine } from './webllm-agent-adapter';
import type { DeterministicMarketEvidence, StructuredCandidateAdvisory } from './offline-ai-contracts';

export type AdvisoryProviderKind = 'DETERMINISTIC' | 'WEBLLM' | 'ONLINE' | 'HYBRID';

export interface AdvisoryProviderRequest {
  candidate: StrategyCandidate;
  config?: MultiAgentConfiguration;
  context?: Parameters<typeof evidencePacketFromCandidate>[2];
}

export interface AdvisoryProviderResult {
  provider: AdvisoryProviderKind;
  status: 'APPROVED' | 'REJECTED' | 'REVIEW_REQUIRED' | 'BLOCKED';
  approved: boolean;
  advisory: StructuredCandidateAdvisory | null;
  latencyMs: number;
  reasonCodes: string[];
  modelId?: string;
}

function deterministicEvidence(candidate: StrategyCandidate): DeterministicMarketEvidence {
  return {
    symbol: candidate.symbol,
    currentPrice: candidate.entryPrice,
    sweepDetected: Boolean(candidate.evidenceIds.sweepId),
    fvgDetected: Boolean(candidate.evidenceIds.fvgId),
    contextConfirmed: Boolean(candidate.evidenceIds.contextSwingId || candidate.evidenceIds.bosId),
    riskRewardRatio: candidate.riskRewardRatio,
    direction: candidate.direction,
    entryPrice: candidate.entryPrice,
    stopLossPrice: candidate.stopLossPrice,
    takeProfitPrice: candidate.takeProfitPrice,
  };
}

function blocked(provider: AdvisoryProviderKind, reason: string, modelId?: string): AdvisoryProviderResult {
  return { provider, status: 'BLOCKED', approved: false, advisory: null, latencyMs: 0, reasonCodes: [reason], ...(modelId ? { modelId } : {}) };
}

export async function reviewWithDeterministicProvider(request: AdvisoryProviderRequest): Promise<AdvisoryProviderResult> {
  const started = performance.now();
  const modelId = request.config?.analystEngineId || 'deterministic-analyst';
  const advisory = BrowserOfflineAIManager.buildDeterministicAdvisory(modelId, deterministicEvidence(request.candidate));
  const approved = advisory.verdict === 'TRADE';
  return { provider: 'DETERMINISTIC', status: approved ? 'APPROVED' : 'REJECTED', approved, advisory, latencyMs: Number((performance.now() - started).toFixed(1)), reasonCodes: advisory.riskFlags, modelId };
}

export async function reviewWithWebLLMProvider(request: AdvisoryProviderRequest): Promise<AdvisoryProviderResult> {
  const engineId = request.config?.analystEngineId || 'qwen3-1.7b-analyst';
  const modelId = modelIdForAgentEngine(engineId) || engineId;
  if (typeof window === 'undefined') return blocked('WEBLLM', 'WEBLLM_BROWSER_RUNTIME_REQUIRED', modelId);
  if (BrowserOfflineAIManager.getResidentModelId() !== modelId) return blocked('WEBLLM', 'MODEL_NOT_RESIDENT', modelId);
  try {
    const packet = evidencePacketFromCandidate(request.candidate, request.config?.activeTradingStyle || 'S0_SWEEP_FVG', request.context);
    const prompt = buildAgentPrompt('ANALYST', packet);
    const started = performance.now();
    const advisory = await BrowserOfflineAIManager.evaluateCandidateAdvisory(modelId, deterministicEvidence(request.candidate), prompt.systemPrompt, prompt.userPrompt);
    const approved = advisory.verdict === 'TRADE';
    return { provider: 'WEBLLM', status: approved ? 'APPROVED' : advisory.verdict === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'REJECTED', approved, advisory, latencyMs: Number((performance.now() - started).toFixed(1)), reasonCodes: advisory.riskFlags, modelId };
  } catch (error) {
    return blocked('WEBLLM', error instanceof Error ? `WEBLLM_RUNTIME_ERROR:${error.message}` : 'WEBLLM_RUNTIME_ERROR', modelId);
  }
}

function parseOnlineAdvisory(value: unknown, modelId: string, latencyMs: number): StructuredCandidateAdvisory {
  const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const verdict = data.verdict === 'TRADE' || data.verdict === 'NO_TRADE' || data.verdict === 'REVIEW_REQUIRED' ? data.verdict : 'REVIEW_REQUIRED';
  const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence) ? Math.max(0, Math.min(1, data.confidence)) : 0;
  const rationaleFa = typeof data.rationaleFa === 'string' ? data.rationaleFa.slice(0, 1200) : 'خروجی آنلاین توضیح معتبر نداشت.';
  const riskFlags = Array.isArray(data.riskFlags) ? data.riskFlags.filter((item): item is string => typeof item === 'string').slice(0, 12) : ['MISSING_RISK_FLAGS'];
  const evidenceIds = Array.isArray(data.evidenceIds) ? data.evidenceIds.filter((item): item is string => typeof item === 'string').slice(0, 12) : [];
  return { modelId, modelRevision: 'online-api', source: 'ONLINE_API', verdict, confidence, rationaleFa, riskFlags, evidenceIds, latencyMs, advisoryOnly: true };
}

export async function reviewWithOnlineProvider(request: AdvisoryProviderRequest): Promise<AdvisoryProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_API_BASE || '').replace(/\/$/, '');
  const modelId = process.env.TRADING_ONLINE_MODEL || 'gpt-5-mini';
  if (!apiKey || !baseUrl) return blocked('ONLINE', 'ONLINE_PROVIDER_NOT_CONFIGURED', modelId);
  const packet = evidencePacketFromCandidate(request.candidate, request.config?.activeTradingStyle || 'S0_SWEEP_FVG', request.context);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: 'You are an advisory-only trading candidate critic. Use only the JSON packet. Never invent facts, news, or prices. Return JSON only. TRADE is allowed only when evidence is complete and no risk flag exists.' },
          { role: 'user', content: JSON.stringify(packet) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'candidate_advisory',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { verdict: { type: 'string', enum: ['TRADE', 'NO_TRADE', 'REVIEW_REQUIRED'] }, confidence: { type: 'number' }, rationaleFa: { type: 'string' }, riskFlags: { type: 'array', items: { type: 'string' } }, evidenceIds: { type: 'array', items: { type: 'string' } } },
              required: ['verdict', 'confidence', 'rationaleFa', 'riskFlags', 'evidenceIds'],
            },
          },
        },
        max_completion_tokens: 300,
      }),
    });
    if (!response.ok) return blocked('ONLINE', `ONLINE_HTTP_${response.status}`, modelId);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return blocked('ONLINE', 'ONLINE_EMPTY_RESPONSE', modelId);
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return blocked('ONLINE', 'ONLINE_INVALID_JSON', modelId); }
    const advisory = parseOnlineAdvisory(parsed, modelId, Number((performance.now() - started).toFixed(1)));
    const allowedEvidence = new Set(Object.values(request.candidate.evidenceIds).filter((value): value is string => Boolean(value)));
    const unknownEvidence = advisory.evidenceIds.some(id => !allowedEvidence.has(id));
    const approved = advisory.verdict === 'TRADE' && advisory.confidence >= 0.6 && !unknownEvidence && advisory.riskFlags.length === 0;
    const reasonCodes = [...advisory.riskFlags, ...(unknownEvidence ? ['UNKNOWN_EVIDENCE_ID'] : []), ...(approved ? [] : ['ONLINE_ADVISORY_NOT_HARD_AUTHORITY'])];
    return { provider: 'ONLINE', status: approved ? 'APPROVED' : advisory.verdict === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'REJECTED', approved, advisory, latencyMs: advisory.latencyMs, reasonCodes, modelId };
  } catch (error) {
    return blocked('ONLINE', error instanceof Error ? `ONLINE_RUNTIME_ERROR:${error.message}` : 'ONLINE_RUNTIME_ERROR', modelId);
  }
}

export async function reviewWithHybridProvider(request: AdvisoryProviderRequest): Promise<AdvisoryProviderResult> {
  const started = performance.now();
  const [local, online] = await Promise.all([reviewWithDeterministicProvider(request), reviewWithOnlineProvider(request)]);
  if (online.status === 'BLOCKED') return blocked('HYBRID', `ONLINE_BLOCKED:${online.reasonCodes[0]}`);
  const analyst = online.advisory;
  const critic = local.advisory;
  if (!analyst || !critic) return blocked('HYBRID', 'HYBRID_MISSING_ADVISORY');
  const judge = judgeAgentReviews({ analyst, critic, candidate: request.candidate });
  return { provider: 'HYBRID', status: judge.approved ? 'APPROVED' : 'REJECTED', approved: judge.approved, advisory: analyst, latencyMs: Number((performance.now() - started).toFixed(1)), reasonCodes: judge.reasonCodes, modelId: `${critic.modelId}+${analyst.modelId}` };
}

export async function reviewWithProvider(kind: AdvisoryProviderKind, request: AdvisoryProviderRequest): Promise<AdvisoryProviderResult> {
  if (kind === 'DETERMINISTIC') return reviewWithDeterministicProvider(request);
  if (kind === 'WEBLLM') return reviewWithWebLLMProvider(request);
  if (kind === 'HYBRID') return reviewWithHybridProvider(request);
  return reviewWithOnlineProvider(request);
}
