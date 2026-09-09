import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';
import { spawn } from 'node:child_process';

function arg(name: string, fallback: string): string { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] || fallback : fallback; }
function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> { return new Promise(resolveCode => { const child = spawn(command, args, { stdio: 'inherit', env }); child.on('close', code => resolveCode(code ?? 1)); }); }

async function main(): Promise<void> {
  const datasetPath = arg('--dataset', 'data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json');
  const output = arg('--candidate-output', 'data/runs/stage7-common-gbpusd-candidates.json');
  const benchmark = arg('--benchmark-output', 'data/runs/stage7-common-gbpusd-benchmark.json');
  const modes = arg('--modes', 'OFF,DETERMINISTIC,WEBLLM,ONLINE,HYBRID');
  const maxCandidates = Number(arg('--max-candidates', '0'));
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  const base = createBaselineFromManifest(dataset.manifest);
  const splitIndex = Math.floor(dataset.candles.length * 0.7);
  const evaluationStartTime = dataset.candles[splitIndex]?.timestamp;
  if (!evaluationStartTime) throw new Error('Dataset is too short for OOS evaluation.');
  const candidates = []; const seen = new Set<string>();
  for (let i = Math.max(base.warmupBars, 20); i < dataset.candles.length; i++) {
    if (dataset.candles[i].timestamp < evaluationStartTime) continue;
    const candidate = evaluateResearchStrategy(dataset.candles.slice(0, i + 1), base.symbol, base.timeframe, 'S0_SWEEP_FVG', { stopLossAtrBuffer: base.stopLossAtrBuffer, targetRiskReward: base.targetRiskReward, expiryBars: base.entryExpiryBars });
    if (candidate && !seen.has(candidate.id)) { seen.add(candidate.id); candidates.push(candidate); if (maxCandidates > 0 && candidates.length >= maxCandidates) break; }
  }
  const packet = { version: 'stage7-common-candidate-set-v1', datasetId: dataset.manifest.datasetId, datasetSha256: dataset.manifest.contentSha256, evaluationStartTime, candidateCount: candidates.length, candidates };
  await mkdir(dirname(resolve(output)), { recursive: true }); await writeFile(resolve(output), JSON.stringify(packet, null, 2));
  const code = await run('npx', ['tsx', 'scripts/run-gbp-provider-benchmark.ts', '--dataset', datasetPath, '--candidate-file', output, '--modes', modes, '--max-candidates', String(candidates.length), '--output', benchmark], process.env);
  if (code !== 0) process.exitCode = code;
  const result = JSON.parse(await readFile(resolve(benchmark), 'utf8')) as { runs: Record<string, { totalTrades: number }>; candidateReview: { commonCandidateSet: boolean; candidateCount: number } };
  const min = Number(process.env.STAGE7_MIN_TRADES || 30); const failures = Object.entries(result.runs).filter(([, run]) => run.totalTrades < min).map(([mode, run]) => `${mode}:${run.totalTrades}<${min}`);
  console.log(JSON.stringify({ benchmark, commonCandidateSet: result.candidateReview.commonCandidateSet, candidateCount: result.candidateReview.candidateCount, minTrades: min, tradeGate: failures.length ? 'FAILED' : 'PASSED', failures }, null, 2));
  if (failures.length) process.exitCode = 3;
}
void main();
