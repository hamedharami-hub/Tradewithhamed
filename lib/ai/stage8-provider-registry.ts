import type { StrategyCandidate } from '@/lib/contracts/strategy';

export type Stage8AdvisorProviderKind = 'DETERMINISTIC' | 'WEBLLM' | 'OPENAI' | 'GEMINI' | 'XAI';

export interface Stage8AdvisoryOutput {
  decision: 'APPROVE' | 'REJECT' | 'HOLD';
  confidence: number;
  rationaleFa: string;
  riskFlags: string[];
  advisoryOnly: true;
  readonly brokerWrites: false;
}

export interface Stage8ProviderReviewRequest {
  candidate: StrategyCandidate;
  marketEvidence?: {
    sweepDetected?: boolean;
    fvgDetected?: boolean;
    trendAligned?: boolean;
    spreadPips?: number;
  };
  provider: Stage8AdvisorProviderKind;
}

export interface Stage8ProviderReviewResponse {
  provider: Stage8AdvisorProviderKind;
  status: 'APPROVED' | 'REJECTED' | 'BLOCKED';
  approved: boolean;
  advisory: Stage8AdvisoryOutput | null;
  latencyMs: number;
  reason?: string;
  modelId?: string;
  readonly brokerWrites: false;
}

function evaluateDeterministicAdvisory(candidate: StrategyCandidate, evidence?: Stage8ProviderReviewRequest['marketEvidence']): Stage8AdvisoryOutput {
  const riskFlags: string[] = [];
  const sweepOk = evidence?.sweepDetected ?? Boolean(candidate.evidenceIds.sweepId);
  const fvgOk = evidence?.fvgDetected ?? Boolean(candidate.evidenceIds.fvgId);
  const rr = candidate.riskRewardRatio;

  if (!sweepOk) riskFlags.push('MISSING_LIQUIDITY_SWEEP');
  if (!fvgOk) riskFlags.push('MISSING_FVG_IMBALANCE');
  if (rr < 1.5) riskFlags.push('LOW_RISK_REWARD_RATIO');
  if ((evidence?.spreadPips || 0) > 3.0) riskFlags.push('HIGH_SPREAD_ENVIRONMENT');

  const approved = riskFlags.length === 0 && rr >= 1.5;
  const decision = approved ? 'APPROVE' : riskFlags.length > 2 ? 'REJECT' : 'HOLD';
  const confidence = approved ? Math.min(0.95, 0.6 + rr * 0.1) : 0.3;

  const rationaleFa = approved
    ? `کاندید معتبر ${candidate.symbol} با نسبت ریوارد به ریسک ${rr.toFixed(2)} و تأیید FVG و جاروب نقدینگی تایید شد.`
    : `کاندید رد یا معلق شد. ریسک‌ها: ${riskFlags.join(', ')}.`;

  return {
    decision,
    confidence: Number(confidence.toFixed(2)),
    rationaleFa,
    riskFlags,
    advisoryOnly: true,
    brokerWrites: false,
  };
}

export class Stage8ProviderRegistry {
  public static async reviewCandidate(request: Stage8ProviderReviewRequest): Promise<Stage8ProviderReviewResponse> {
    const started = performance.now();

    // 1. DETERMINISTIC (Offline heuristic, zero API keys required)
    if (request.provider === 'DETERMINISTIC') {
      const advisory = evaluateDeterministicAdvisory(request.candidate, request.marketEvidence);
      const latencyMs = Number((performance.now() - started).toFixed(1));
      const approved = advisory.decision === 'APPROVE';
      return {
        provider: 'DETERMINISTIC',
        status: approved ? 'APPROVED' : 'REJECTED',
        approved,
        advisory,
        latencyMs,
        modelId: 'stage8-rule-critic-v1',
        brokerWrites: false,
      };
    }

    // 2. WEBLLM (Requires browser runtime with WebGPU)
    if (request.provider === 'WEBLLM') {
      if (typeof window === 'undefined') {
        return {
          provider: 'WEBLLM',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: 0,
          reason: 'WEBLLM_NODE_UNSUPPORTED: WebGPU is not available in Node.js runtime. Use DETERMINISTIC in background monitors.',
          brokerWrites: false,
        };
      }
      // If in browser, check if worker or resident model is ready
      return {
        provider: 'WEBLLM',
        status: 'BLOCKED',
        approved: false,
        advisory: null,
        latencyMs: 0,
        reason: 'WEBLLM_CLIENT_NOT_INITIALIZED',
        brokerWrites: false,
      };
    }

    // 3. OPENAI
    if (request.provider === 'OPENAI') {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        return {
          provider: 'OPENAI',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: 0,
          reason: 'OPENAI_KEY_MISSING: OPENAI_API_KEY is not configured in local environment.',
          brokerWrites: false,
        };
      }
      try {
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an advisory trading critic. Respond in JSON: {"decision":"APPROVE"|"REJECT"|"HOLD","confidence":number,"rationaleFa":string,"riskFlags":string[]}. Never approve without clear sweep and FVG.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  symbol: request.candidate.symbol,
                  direction: request.candidate.direction,
                  rr: request.candidate.riskRewardRatio,
                  evidence: request.candidate.evidenceIds,
                }),
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
        });
        const latencyMs = Number((performance.now() - started).toFixed(1));
        if (!response.ok) {
          return {
            provider: 'OPENAI',
            status: 'BLOCKED',
            approved: false,
            advisory: null,
            latencyMs,
            reason: `OPENAI_HTTP_ERROR_${response.status}`,
            brokerWrites: false,
          };
        }
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('EMPTY_OPENAI_RESPONSE');
        const parsed = JSON.parse(content) as Stage8AdvisoryOutput;
        const approved = parsed.decision === 'APPROVE' && parsed.confidence >= 0.65;
        return {
          provider: 'OPENAI',
          status: approved ? 'APPROVED' : 'REJECTED',
          approved,
          advisory: { ...parsed, advisoryOnly: true, brokerWrites: false },
          latencyMs,
          modelId: model,
          brokerWrites: false,
        };
      } catch (err) {
        return {
          provider: 'OPENAI',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: Number((performance.now() - started).toFixed(1)),
          reason: err instanceof Error ? err.message : 'OPENAI_QUERY_FAILED',
          brokerWrites: false,
        };
      }
    }

    // 4. GEMINI
    if (request.provider === 'GEMINI') {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        return {
          provider: 'GEMINI',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: 0,
          reason: 'GEMINI_KEY_MISSING: GEMINI_API_KEY is not configured in local environment.',
          brokerWrites: false,
        };
      }
      try {
        const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const prompt = `You are an advisory trading critic. Evaluate this candidate: ${JSON.stringify(request.candidate)}. Return JSON: {"decision":"APPROVE"|"REJECT"|"HOLD","confidence":number,"rationaleFa":string,"riskFlags":string[]}.`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        });
        const latencyMs = Number((performance.now() - started).toFixed(1));
        if (!response.ok) {
          return {
            provider: 'GEMINI',
            status: 'BLOCKED',
            approved: false,
            advisory: null,
            latencyMs,
            reason: `GEMINI_HTTP_ERROR_${response.status}`,
            brokerWrites: false,
          };
        }
        const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('EMPTY_GEMINI_RESPONSE');
        const parsed = JSON.parse(text) as Stage8AdvisoryOutput;
        const approved = parsed.decision === 'APPROVE' && parsed.confidence >= 0.65;
        return {
          provider: 'GEMINI',
          status: approved ? 'APPROVED' : 'REJECTED',
          approved,
          advisory: { ...parsed, advisoryOnly: true, brokerWrites: false },
          latencyMs,
          modelId: model,
          brokerWrites: false,
        };
      } catch (err) {
        return {
          provider: 'GEMINI',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: Number((performance.now() - started).toFixed(1)),
          reason: err instanceof Error ? err.message : 'GEMINI_QUERY_FAILED',
          brokerWrites: false,
        };
      }
    }

    // 5. XAI
    if (request.provider === 'XAI') {
      const apiKey = process.env.XAI_API_KEY?.trim();
      if (!apiKey) {
        return {
          provider: 'XAI',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: 0,
          reason: 'XAI_KEY_MISSING: XAI_API_KEY is not configured in local environment.',
          brokerWrites: false,
        };
      }
      try {
        const model = process.env.XAI_MODEL || 'grok-beta';
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an advisory trading critic. Respond in JSON: {"decision":"APPROVE"|"REJECT"|"HOLD","confidence":number,"rationaleFa":string,"riskFlags":string[]}.',
              },
              { role: 'user', content: JSON.stringify(request.candidate) },
            ],
            temperature: 0.1,
          }),
        });
        const latencyMs = Number((performance.now() - started).toFixed(1));
        if (!response.ok) {
          return {
            provider: 'XAI',
            status: 'BLOCKED',
            approved: false,
            advisory: null,
            latencyMs,
            reason: `XAI_HTTP_ERROR_${response.status}`,
            brokerWrites: false,
          };
        }
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('EMPTY_XAI_RESPONSE');
        const parsed = JSON.parse(content) as Stage8AdvisoryOutput;
        const approved = parsed.decision === 'APPROVE' && parsed.confidence >= 0.65;
        return {
          provider: 'XAI',
          status: approved ? 'APPROVED' : 'REJECTED',
          approved,
          advisory: { ...parsed, advisoryOnly: true, brokerWrites: false },
          latencyMs,
          modelId: model,
          brokerWrites: false,
        };
      } catch (err) {
        return {
          provider: 'XAI',
          status: 'BLOCKED',
          approved: false,
          advisory: null,
          latencyMs: Number((performance.now() - started).toFixed(1)),
          reason: err instanceof Error ? err.message : 'XAI_QUERY_FAILED',
          brokerWrites: false,
        };
      }
    }

    return {
      provider: request.provider,
      status: 'BLOCKED',
      approved: false,
      advisory: null,
      latencyMs: 0,
      reason: `UNKNOWN_PROVIDER: ${request.provider}`,
      brokerWrites: false,
    };
  }
}
