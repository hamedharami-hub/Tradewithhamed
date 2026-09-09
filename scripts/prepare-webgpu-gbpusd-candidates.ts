import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricalDataset } from '../lib/research/contracts';
import { createBaselineFromManifest } from '../lib/research/default-config';
import { evaluateResearchStrategy } from '../lib/research/strategy-rules';

async function main(): Promise<void> {
  const datasetPath = process.argv[2] || 'data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json';
  const outputPath = process.argv[3] || 'public/webgpu-candidates-gbpusd.json';
  const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  const base = createBaselineFromManifest(dataset.manifest);
  const splitIndex = Math.floor(dataset.candles.length * 0.7);
  const evaluationStartTime = dataset.candles[splitIndex]?.timestamp;
  if (!evaluationStartTime) throw new Error('Dataset too short.');
  const candidates = [] as NonNullable<ReturnType<typeof evaluateResearchStrategy>>[];
  const seen = new Set<string>();
  for (let index = Math.max(base.warmupBars, 20); index < dataset.candles.length; index++) {
    if (dataset.candles[index].timestamp < evaluationStartTime) continue;
    const candidate = evaluateResearchStrategy(dataset.candles.slice(0, index + 1), base.symbol, base.timeframe, 'S0_SWEEP_FVG', { stopLossAtrBuffer: base.stopLossAtrBuffer, targetRiskReward: base.targetRiskReward, expiryBars: base.entryExpiryBars });
    if (candidate && !seen.has(candidate.id)) { seen.add(candidate.id); candidates.push(candidate); }
  }
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(resolve(outputPath), JSON.stringify({ version: 'webgpu-gbpusd-oos-candidates-v1', datasetId: dataset.manifest.datasetId, datasetSha256: dataset.manifest.contentSha256, evaluationStartTime, oosStartIso: new Date(evaluationStartTime).toISOString(), candidates }, null, 2));
  console.log(JSON.stringify({ outputPath, candidateCount: candidates.length, oosStartIso: new Date(evaluationStartTime).toISOString() }, null, 2));
}
void main();
