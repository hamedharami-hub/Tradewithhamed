import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HistoricalDataset, ResearchExperimentConfig } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { reviewCandidateWithFourAgents } from '../lib/ai/agentic-reviewer';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../lib/contracts/multi-agent-system';

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }

async function main(): Promise<void> {
  const datasetPath = arg('--dataset');
  const outputPath = arg('--output');
  if (!datasetPath || !outputPath) throw new Error('Usage: tsx scripts/run-agent-comparison.ts --dataset <dataset.json> --output <result.json>');
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  const base = createBaselineFromManifest(dataset.manifest);
  const variant = 'TREND_BREAKOUT_55_EMA200_V1' as const;
  const candidateIds = new Set<string>();
  const reviewResults: Awaited<ReturnType<typeof reviewCandidateWithFourAgents>>[] = [];
  for (let i = Math.max(base.warmupBars, 20); i < dataset.candles.length; i++) {
    const candidate = evaluateResearchStrategy(dataset.candles.slice(0, i + 1), base.symbol, base.timeframe, variant, { stopLossAtrBuffer: base.stopLossAtrBuffer, targetRiskReward: base.targetRiskReward, expiryBars: base.entryExpiryBars });
    if (!candidate || candidateIds.has(candidate.id)) continue;
    candidateIds.add(candidate.id);
    reviewResults.push(await reviewCandidateWithFourAgents(candidate, DEFAULT_MULTI_AGENT_CONFIG));
  }
  const approvedCandidateIds = reviewResults.filter(review => review.finalDecision === 'PAPER_TRADE').map(review => review.candidateId);
  const common: ResearchExperimentConfig = { ...base, experimentId: `${base.experimentId}-AI-ABLATION`, strategyVariants: [variant], aiModes: ['OFF'] };
  const noAi = ResearchExperimentEngine.run(dataset, common).runs[0];
  const withAgents = ResearchExperimentEngine.run(dataset, { ...common, experimentId: `${base.experimentId}-FOUR-AGENTS`, aiModes: ['AGENTIC_OFFLINE'], approvedCandidateIds }).runs[0];
  const result = {
    version: 'agent-ablation-v1',
    datasetId: dataset.manifest.datasetId,
    symbol: dataset.manifest.canonicalSymbol,
    timeframe: dataset.manifest.timeframe,
    candidateCount: candidateIds.size,
    reviewedCount: reviewResults.length,
    approvedCount: approvedCandidateIds.length,
    decisionCounts: reviewResults.reduce<Record<string, number>>((counts, review) => { counts[review.finalDecision] = (counts[review.finalDecision] || 0) + 1; return counts; }, {}),
    roleExecution: { scanner: 's0-deterministic-scanner', analyst: DEFAULT_MULTI_AGENT_CONFIG.analystEngineId, critic: DEFAULT_MULTI_AGENT_CONFIG.criticEngineId, judge: DEFAULT_MULTI_AGENT_CONFIG.judgeEngineId, promptVersion: 'agent-prompts-v1', source: 'deterministic-offline-four-role-gate' },
    noAi: noAi.summary,
    fourAgentOffline: withAgents.summary,
    delta: { netProfit: Number((withAgents.summary.netProfit - noAi.summary.netProfit).toFixed(2)), trades: withAgents.summary.totalTrades - noAi.summary.totalTrades, profitFactor: Number((withAgents.summary.profitFactor - noAi.summary.profitFactor).toFixed(2)) },
    warnings: ['این ablation چهار نقش آفلاین قطعی را فعال می‌کند؛ Analyst/Critic عصبی WebGPU در Node اجرا نشده‌اند، چون مدل مقیم مرورگر در این محیط وجود ندارد.', 'نتیجهٔ چهار Agent فیلتر تأییدی است و خود آن تولیدکنندهٔ سیگنال مستقل نیست.'],
  };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ symbol: result.symbol, candidates: result.candidateCount, approved: result.approvedCount, noAi: result.noAi, fourAgentOffline: result.fourAgentOffline, delta: result.delta }, null, 2));
}
void main();
