import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HistoricalDataset, ResearchExperimentConfig, AIReviewMode } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';

function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function main(): Promise<void> {
  const datasetPath = arg('--dataset');
  const outputPath = arg('--output');
  if (!datasetPath || !outputPath) throw new Error('Usage: tsx scripts/run-gbp-three-mode-ablation.ts --dataset <dataset.json> --output <result.json>');
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  if (dataset.manifest.canonicalSymbol !== 'GBPUSD') throw new Error('This runner is restricted to GBPUSD.');
  const base = createBaselineFromManifest(dataset.manifest);
  const common = { ...base, experimentId: 'GBPUSD-SESSION-THREE-MODE-V1', strategyVariants: ['S0_SWEEP_FVG'] as const, allowedSessions: ['LONDON', 'NEW_YORK'] as const };
  const modes: AIReviewMode[] = ['OFF', 'DETERMINISTIC_COUNCIL'];
  const runs = modes.map(mode => {
    const config: ResearchExperimentConfig = { ...common, experimentId: `${common.experimentId}-${mode}`, strategyVariants: ['S0_SWEEP_FVG'], aiModes: [mode], allowedSessions: ['LONDON', 'NEW_YORK'] };
    return ResearchExperimentEngine.run(dataset, config).runs[0];
  });
  const result = {
    version: 'gbpusd-three-mode-ablation-v1',
    datasetId: dataset.manifest.datasetId,
    symbol: 'GBPUSD',
    timeframe: dataset.manifest.timeframe,
    allowedSessionsUtc: ['LONDON', 'NEW_YORK'],
    runs: runs.map(run => run.summary),
    hybridWebgpu: {
      status: 'NOT_EXECUTED_IN_BATCH',
      reason: 'HYBRID_WEBGPU requires a browser WebGPU session with the selected models downloaded, resident and offline-verified. The batch engine deliberately refuses to fabricate this result.',
      requiredSource: 'BrowserOfflineAIManager + reviewCandidateWithFourAgents',
      requiredTrace: ['source=WEBLLM_WEBGPU', 'residentModelId', 'promptVersion=agent-prompts-v1', 'offlineVerified=true'],
    },
    warnings: ['OFF and DETERMINISTIC_COUNCIL are comparable batch results.', 'HYBRID_WEBGPU must be captured from the browser using identical candidate IDs and evidence packets before comparing efficacy.'],
  };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
void main();
