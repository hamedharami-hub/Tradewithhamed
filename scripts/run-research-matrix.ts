import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import { createBaselineFromManifest } from '../lib/research/default-config';
import type { AIReviewMode, HistoricalDataset, StrategyVariantId } from '../lib/research/contracts';

type MatrixSpec = { datasets: string[]; variants: StrategyVariantId[]; aiModes: AIReviewMode[]; emaDistanceAtr?: number[]; sessions?: Array<'ASIA' | 'LONDON' | 'NEW_YORK' | 'OFF_HOURS'>[]; daysOfWeekUtc?: number[][]; startTime?: number; endTime?: number; initialCash?: number; spreadPips?: number; commissionPerLotRoundTrip?: number };
function arg(name: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function main(): Promise<void> {
  const specPath = arg('--spec'); const outputPath = arg('--output');
  if (!specPath || !outputPath) throw new Error('Usage: tsx scripts/run-research-matrix.ts --spec matrix.json --output result.json');
  const spec = JSON.parse(await readFile(resolve(specPath), 'utf8')) as MatrixSpec;
  const runs: unknown[] = [];
  for (const datasetPath of spec.datasets) {
    const dataset = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
    const base = createBaselineFromManifest(dataset.manifest);
    for (const emaDistanceAtr of spec.emaDistanceAtr || [0]) for (const sessions of spec.sessions || [undefined]) for (const days of spec.daysOfWeekUtc || [undefined]) {
      const result = ResearchExperimentEngine.run(dataset, { ...base, experimentId: `MATRIX-${dataset.manifest.datasetId}-${Date.now()}-${runs.length}`, strategyVariants: spec.variants, aiModes: spec.aiModes, ...(spec.initialCash === undefined ? {} : { initialCash: spec.initialCash }), ...(spec.spreadPips === undefined ? {} : { costModel: { ...base.costModel, spreadPips: spec.spreadPips } }), ...(spec.commissionPerLotRoundTrip === undefined ? {} : { costModel: { ...base.costModel, commissionPerLotRoundTrip: spec.commissionPerLotRoundTrip } }), ...(spec.startTime === undefined ? {} : { startTime: spec.startTime }), ...(spec.endTime === undefined ? {} : { endTime: spec.endTime }), ...(sessions === undefined ? {} : { allowedSessions: sessions }), ...(days === undefined ? {} : { allowedDaysOfWeekUtc: days }), trendMinEmaDistanceAtr: emaDistanceAtr });
      runs.push({ dataset: dataset.manifest.datasetId, timeframe: dataset.manifest.timeframe, symbol: dataset.manifest.canonicalSymbol, emaDistanceAtr, sessions: sessions || 'ALL', daysOfWeekUtc: days || 'ALL', comparisons: result.comparisons, warnings: result.warnings });
    }
  }
  const output = { version: 'research-matrix-v1', generatedAt: new Date().toISOString(), brokerWrites: false, liveTrading: false, spec, runCount: runs.length, runs };
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: outputPath, runCount: runs.length, brokerWrites: false, liveTrading: false }));
}
void main();
