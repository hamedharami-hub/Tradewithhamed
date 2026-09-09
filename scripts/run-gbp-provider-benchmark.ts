import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HistoricalDataset, ResearchExperimentConfig, StrategyRunResult } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { reviewWithProvider, type AdvisoryProviderKind, type AdvisoryProviderResult } from '../lib/ai/advisory-provider';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../lib/contracts/multi-agent-system';

type Mode = 'OFF' | 'DETERMINISTIC' | 'WEBLLM' | 'ONLINE' | 'HYBRID';
function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function modeToAI(mode: Mode): ResearchExperimentConfig['aiModes'][number] { return mode === 'OFF' ? 'OFF' : mode === 'DETERMINISTIC' ? 'DETERMINISTIC_COUNCIL' : mode === 'WEBLLM' ? 'WEBLLM_ADVISORY' : mode === 'ONLINE' ? 'ONLINE_ADVISORY' : 'HYBRID_COMPARE'; }
function providerFor(mode: Mode): AdvisoryProviderKind | null { return mode === 'DETERMINISTIC' ? 'DETERMINISTIC' : mode === 'WEBLLM' ? 'WEBLLM' : mode === 'ONLINE' ? 'ONLINE' : mode === 'HYBRID' ? 'HYBRID' : null; }
function summary(run: StrategyRunResult) { return run.summary; }

async function main(): Promise<void> {
  const datasetPath = arg('--dataset') || 'data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json';
  const outputPath = arg('--output') || 'data/runs/stage2-gbp-provider-benchmark.json';
  const maxCandidates = Number(arg('--max-candidates') || 24);
  const candidateFile = arg('--candidate-file');
  const requestedModes = (arg('--modes') || 'OFF,DETERMINISTIC,WEBLLM,ONLINE,HYBRID').split(',') as Mode[];
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  const base = createBaselineFromManifest(dataset.manifest);
  const splitIndex = Math.floor(dataset.candles.length * 0.7);
  const evaluationStartTime = dataset.candles[splitIndex]?.timestamp;
  if (!evaluationStartTime) throw new Error('Dataset is too short for OOS split.');
  const variant = 'S0_SWEEP_FVG' as const;
  const candidateIds = new Set<string>();
  const candidates = [] as Array<NonNullable<ReturnType<typeof evaluateResearchStrategy>>>;
  if (candidateFile) {
    const packet = JSON.parse(await readFile(resolve(candidateFile), 'utf8')) as { datasetId: string; datasetSha256: string; evaluationStartTime: number; candidates: Array<NonNullable<ReturnType<typeof evaluateResearchStrategy>>> };
    if (packet.datasetId !== dataset.manifest.datasetId || packet.datasetSha256 !== dataset.manifest.contentSha256) throw new Error('Candidate Set dataset hash does not match benchmark dataset.');
    for (const candidate of packet.candidates) { if (candidate.createdAtTimestamp >= evaluationStartTime && !candidateIds.has(candidate.id)) { candidateIds.add(candidate.id); candidates.push(candidate); } }
  } else {
    for (let index = Math.max(base.warmupBars, 20); index < dataset.candles.length && candidates.length < maxCandidates; index++) {
      if (dataset.candles[index].timestamp < evaluationStartTime) continue;
      const candidate = evaluateResearchStrategy(dataset.candles.slice(0, index + 1), base.symbol, base.timeframe, variant, { stopLossAtrBuffer: base.stopLossAtrBuffer, targetRiskReward: base.targetRiskReward, expiryBars: base.entryExpiryBars });
      if (candidate && !candidateIds.has(candidate.id)) { candidateIds.add(candidate.id); candidates.push(candidate); }
    }
  }
  const reviewByMode = new Map<Mode, AdvisoryProviderResult[]>();
  const modes: Mode[] = requestedModes;
  for (const mode of modes) {
    const provider = providerFor(mode);
    if (!provider) { reviewByMode.set(mode, []); continue; }
    const reviews: AdvisoryProviderResult[] = [];
    for (let offset = 0; offset < candidates.length; offset += 4) {
      const batch = candidates.slice(offset, offset + 4);
      reviews.push(...await Promise.all(batch.map(candidate => reviewWithProvider(provider, { candidate, config: DEFAULT_MULTI_AGENT_CONFIG }))));
      console.log(`[provider-benchmark] ${mode}: ${Math.min(offset + batch.length, candidates.length)}/${candidates.length}`);
    }
    reviewByMode.set(mode, reviews);
  }
  const runs: Record<string, StrategyRunResult['summary']> = {};
  const reports: Record<string, { status: string; approved: number; reviewed: number; blocked: number; rejected: number; reasons: Record<string, number>; result: StrategyRunResult['summary']; tradePnls: number[] }> = {};
  for (const mode of modes) {
    const providerResults = reviewByMode.get(mode) || [];
    const approvedCandidateIds = providerResults.filter(result => result.approved).map(result => candidates[providerResults.indexOf(result)]?.id).filter((id): id is string => Boolean(id));
    const config: ResearchExperimentConfig = {
      ...base,
      experimentId: `GBPUSD-OOS-${mode}-PROVIDER-V1`,
      strategyVariants: [variant],
      aiModes: [modeToAI(mode)],
      evaluationStartTime,
      approvedCandidateIds: mode === 'OFF' ? undefined : approvedCandidateIds,
      advisoryProvider: mode === 'OFF' ? 'NONE' : mode === 'DETERMINISTIC' ? 'NONE' : mode === 'WEBLLM' ? 'LOCAL_WEBGPU' : mode === 'ONLINE' ? 'ONLINE_API' : 'HYBRID_COMPARE',
      onlineAdvisoryEnabled: mode === 'ONLINE' || mode === 'HYBRID',
    };
    const run = ResearchExperimentEngine.run(dataset, config).runs[0];
    runs[mode] = summary(run);
    const reasons = providerResults.reduce<Record<string, number>>((acc, result) => { for (const reason of result.reasonCodes) acc[reason] = (acc[reason] || 0) + 1; return acc; }, {});
    const blocked = providerResults.filter(result => result.status === 'BLOCKED').length;
    reports[mode] = { status: blocked === providerResults.length && mode !== 'OFF' ? 'BLOCKED' : 'MEASURED', approved: approvedCandidateIds.length, reviewed: providerResults.length, blocked, rejected: providerResults.filter(result => !result.approved && result.status !== 'BLOCKED').length, reasons, result: summary(run), tradePnls: run.trades.filter(trade => !trade.isOpen).map(trade => Number(trade.realizedPnl.toFixed(6))) };
  }
  const result = {
    version: 'gbpusd-provider-benchmark-v1',
    datasetId: dataset.manifest.datasetId,
    datasetSha256: dataset.manifest.contentSha256,
    symbol: dataset.manifest.canonicalSymbol,
    timeframe: dataset.manifest.timeframe,
    split: { trainBars: splitIndex, oosBars: dataset.candles.length - splitIndex, evaluationStartTime, oosStartIso: new Date(evaluationStartTime).toISOString() },
    candidateReview: { candidateCount: candidates.length, maxCandidates, candidateFile, commonCandidateSet: Boolean(candidateFile), candidateIds: candidates.map(candidate => candidate.id), modes: reports },
    runs,
    interpretation: ['OFF معیار پایه است.', 'WEBLLM فقط وقتی measured است که در Browser/WebGPU مدل resident باشد؛ Node batch آن را ساختگی نمی‌کند.', 'ONLINE و HYBRID فقط advisory هستند و هیچ broker authority ندارند.', 'نتیجهٔ این run فقط OOS همین dataset و همین cost model است و ادعای تعمیم عمومی نیست.'],
    createdAt: new Date().toISOString(),
  };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ outputPath, oos: result.split, candidateCount: candidates.length, modes: Object.fromEntries(Object.entries(reports).map(([key, value]) => [key, { status: value.status, approved: value.approved, trades: value.result.totalTrades, winRate: value.result.winRatePercent, netProfit: value.result.netProfit, maxDrawdown: value.result.maxDrawdownPercent }])) }, null, 2));
}
void main();
