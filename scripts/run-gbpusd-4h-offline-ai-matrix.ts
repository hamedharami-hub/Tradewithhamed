import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset, ResearchExperimentConfig } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { reviewCandidateWithFourAgents } from '../lib/ai/agentic-reviewer';
import { DEFAULT_MULTI_AGENT_CONFIG, type MultiAgentConfiguration } from '../lib/contracts/multi-agent-system';
import type { AgentPromptProfile } from '../lib/ai/agentic-review-contracts';

type Council = { id: string; labelFa: string; config: MultiAgentConfiguration };
const councils: Council[] = [
  { id: 'DETERMINISTIC_4', labelFa: 'شورای چهارعامل قطعی', config: { ...DEFAULT_MULTI_AGENT_CONFIG, analystEngineId: 's0-rule-analyst', criticEngineId: 'deep-critic-strict' } },
  { id: 'PHI_ANALYST_DEEP_CRITIC', labelFa: 'تحلیل‌گر Phi و منتقد DeepSeek', config: { ...DEFAULT_MULTI_AGENT_CONFIG, analystEngineId: 'phi-4-mini-analyst', criticEngineId: 'deep-critic-strict' } },
  { id: 'QWEN_ANALYST_QWEN_CRITIC', labelFa: 'تحلیل‌گر و منتقد Qwen', config: { ...DEFAULT_MULTI_AGENT_CONFIG, analystEngineId: 'qwen3.5-0.8b-analyst', criticEngineId: 'qwen3.5-4b-critic' } },
];
const profiles: AgentPromptProfile[] = ['BASELINE_EVIDENCE_V1', 'STRICT_RISK_V1', 'CONTEXT_FIRST_V1'];

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(resolve('data/runs/gbpusd-4h-agent-ablation-dataset.json'), 'utf8')) as HistoricalDataset;
  const base = createBaselineFromManifest(dataset.manifest);
  const variant = 'TREND_BREAKOUT_55_EMA200_V1' as const;
  const candidateMap = new Map<string, NonNullable<ReturnType<typeof evaluateResearchStrategy>>>();
  for (let i = Math.max(base.warmupBars, 20); i < dataset.candles.length; i++) {
    const candidate = evaluateResearchStrategy(dataset.candles.slice(0, i + 1), base.symbol, base.timeframe, variant, { stopLossAtrBuffer: base.stopLossAtrBuffer, targetRiskReward: base.targetRiskReward, expiryBars: base.entryExpiryBars });
    if (candidate) candidateMap.set(candidate.id, candidate);
  }
  const common: ResearchExperimentConfig = { ...base, experimentId: 'GBPUSD-4H-OFFLINE-AI-MATRIX-20260910', strategyVariants: [variant], aiModes: ['OFF'] };
  const baseline = ResearchExperimentEngine.run(dataset, common).runs[0];
  const results = [];
  for (const council of councils) for (const promptProfile of profiles) {
    const reviews = [];
    for (const candidate of candidateMap.values()) reviews.push(await reviewCandidateWithFourAgents(candidate, council.config, { regime: 'UNKNOWN', sessionUtc: 'UNKNOWN', newsRisk: 'UNKNOWN' }, promptProfile));
    const approvedCandidateIds = reviews.filter(review => review.finalDecision === 'PAPER_TRADE').map(review => review.candidateId);
    const run = ResearchExperimentEngine.run(dataset, { ...common, experimentId: `${common.experimentId}-${council.id}-${promptProfile}`, aiModes: ['AGENTIC_OFFLINE'], approvedCandidateIds }).runs[0];
    results.push({ councilId: council.id, councilLabelFa: council.labelFa, promptProfile, engineIds: { analyst: council.config.analystEngineId, critic: council.config.criticEngineId }, candidateCount: reviews.length, approvedCount: approvedCandidateIds.length, decisionCounts: reviews.reduce<Record<string, number>>((acc, item) => { acc[item.finalDecision] = (acc[item.finalDecision] || 0) + 1; return acc; }, {}), summary: run.summary, deltaVsOff: { trades: run.summary.totalTrades - baseline.summary.totalTrades, netProfit: Number((run.summary.netProfit - baseline.summary.netProfit).toFixed(2)), profitFactor: Number((run.summary.profitFactor - baseline.summary.profitFactor).toFixed(2)) }, execution: { offline: true, webgpuResidentRequired: council.id !== 'DETERMINISTIC_4', liveTrading: false, brokerWrites: false } });
  }
  const output = { version: 'offline-ai-prompt-council-matrix-v1', generatedAt: new Date().toISOString(), datasetId: dataset.manifest.datasetId, baseline: baseline.summary, promptProfiles: profiles, councils: councils.map(item => ({ id: item.id, labelFa: item.labelFa, analyst: item.config.analystEngineId, critic: item.config.criticEngineId })), results, warnings: ['Prompt profileها در حالت deterministic قواعد را تغییر نمی‌دهند؛ اثر واقعی prompt فقط با مدل WebGPU مقیم قابل‌سنجش است.', 'در این محیط مدل‌های WebGPU مقیم نیستند؛ شوراهای neural با REVIEW_REQUIRED و صفر approval fail-closed شدند.', 'این ماتریس advisory است و هیچ broker یا order-writing API فراخوانی نکرد.'] };
  const path = resolve('data/runs/gbpusd-4h-offline-ai-matrix-20260910.json');
  await mkdir(resolve('data/runs'), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ path, candidateCount: candidateMap.size, results: results.map(item => ({ councilId: item.councilId, promptProfile: item.promptProfile, approvedCount: item.approvedCount, trades: item.summary.totalTrades, netProfit: item.summary.netProfit })) }));
}
void main();
