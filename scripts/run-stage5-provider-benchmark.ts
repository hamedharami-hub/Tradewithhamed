import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { StrategyCandidate } from '../lib/contracts/strategy';
import { reviewWithProvider, type AdvisoryProviderKind } from '../lib/ai/advisory-provider';

const input = process.argv[2] || 'public/webgpu-candidates-gbpusd.json';
const output = process.argv[3] || 'data/runs/stage5-provider-benchmark.json';
const onlineEnabled = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_BASE);
const modes: Array<{ id: string; provider: AdvisoryProviderKind; status: string }> = [
  { id: 'OFF', provider: 'DETERMINISTIC', status: 'MEASURED' },
  { id: 'DETERMINISTIC_COUNCIL', provider: 'DETERMINISTIC', status: 'MEASURED' },
  { id: 'WEBLLM_LOCAL', provider: 'WEBLLM', status: 'SIMULATED_UNTIL_GPU_RUN' },
  { id: 'ONLINE_FAST', provider: 'ONLINE', status: onlineEnabled ? 'MEASURED' : 'BLOCKED_NO_PROVIDER' },
  { id: 'HYBRID', provider: 'HYBRID', status: onlineEnabled ? 'MEASURED_WITH_LOCAL_DETERMINISTIC' : 'BLOCKED_NO_PROVIDER' },
];

type Packet = { datasetId: string; datasetSha256: string; evaluationStartTime: number; candidates: StrategyCandidate[] };

async function main(): Promise<void> {
  const packet = JSON.parse(await readFile(resolve(input), 'utf8')) as Packet;
  const results: Record<string, unknown> = {};
  for (const mode of modes) {
    if (mode.status !== 'MEASURED') {
      results[mode.id] = { mode: mode.id, provider: mode.provider, status: mode.status, candidateCount: 0, approvedCount: 0, blockedCount: mode.status.startsWith('BLOCKED') ? packet.candidates.length : 0, note: mode.id === 'WEBLLM_LOCAL' ? 'Run scripts/browser-webgpu-gbpusd-oos.mjs on a GPU host to replace this simulation with measured output.' : 'Provider is unavailable in this environment.' };
      continue;
    }
    const reviews: unknown[] = [];
    for (const candidate of packet.candidates.slice(0, Number(process.env.BENCHMARK_MAX_CANDIDATES || 33))) {
      const review = await reviewWithProvider(mode.provider, { candidate, config: { activeTradingStyle: 'S0_SWEEP_FVG', scannerEngineId: 's0-deterministic-scanner', analystEngineId: 's0-rule-analyst', criticEngineId: 's0-rule-analyst', judgeEngineId: 'strict-consensus-fail-closed' } });
      reviews.push({ candidateId: candidate.id, status: review.status, approved: review.approved, latencyMs: review.latencyMs, reasonCodes: review.reasonCodes });
    }
    results[mode.id] = { mode: mode.id, provider: mode.provider, status: 'MEASURED', candidateCount: reviews.length, approvedCount: reviews.filter(item => (item as { approved: boolean }).approved).length, reviews };
  }
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(resolve(output), JSON.stringify({ version: 'stage5-provider-benchmark-v1', generatedAt: new Date().toISOString(), input, datasetId: packet.datasetId, datasetSha256: packet.datasetSha256, evaluationStartTime: packet.evaluationStartTime, simulationPolicy: 'WebLLM_LOCAL is never presented as measured; it remains explicitly simulated until a GPU browser run supplies reviews.', results }, null, 2));
  console.log(JSON.stringify({ output, modes: Object.keys(results) }, null, 2));
}
void main();
