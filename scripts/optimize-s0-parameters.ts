import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createBaselineResearchConfig } from '../lib/research/default-config';
import { ResearchExperimentEngine } from '../lib/research/experiment-engine';
import type { HistoricalDataset, ResearchExperimentConfig } from '../lib/research/contracts';

type Candidate = { params: Record<string, number>; train: ResearchExperimentConfig['costModel'] & { trades: number; net: number; winRate: number; pf: number; dd: number }; score: number };

async function main(): Promise<void> {
  const datasetPath = process.argv[process.argv.indexOf('--dataset') + 1] || 'data/datasets/histdata/histdata-gbpusd-1h-2024.dataset.json';
  const outputPath = process.argv[process.argv.indexOf('--output') + 1] || 'data/runs/stage7-s0-optimization/gbpusd-s0-optimization-v1.json';
  const raw = JSON.parse(await readFile(resolve(datasetPath), 'utf8')) as HistoricalDataset;
  const candles = raw.candles.filter(candle => candle.isClosed);
  const splitIndex = Math.floor(candles.length * 0.7);
  const splitTimestamp = candles[splitIndex]?.timestamp;
  if (!splitTimestamp) throw new Error('DATASET_TOO_SHORT_FOR_OOS');
  const grid = { stopLossAtrBuffer: [0.15, 0.2, 0.3], targetRiskReward: [1.5, 2, 2.5], entryExpiryBars: [6, 12, 18], minSweepPenetrationAtr: [0.1, 0.2, 0.35], minFvgSizeAtr: [0.2, 0.3] };
  const trainDataset: HistoricalDataset = { ...raw, candles: candles.slice(0, splitIndex), manifest: { ...raw.manifest, endTime: candles[splitIndex - 1]?.timestamp || raw.manifest.endTime, acceptedBars: splitIndex, totalBars: splitIndex } };
  const results: Candidate[] = [];
  for (const stopLossAtrBuffer of grid.stopLossAtrBuffer) for (const targetRiskReward of grid.targetRiskReward) for (const entryExpiryBars of grid.entryExpiryBars) for (const minSweepPenetrationAtr of grid.minSweepPenetrationAtr) for (const minFvgSizeAtr of grid.minFvgSizeAtr) {
    const params = { stopLossAtrBuffer, targetRiskReward, entryExpiryBars, minSweepPenetrationAtr, minFvgSizeAtr };
    const config = createBaselineResearchConfig({ datasetId: trainDataset.manifest.datasetId, symbol: 'GBPUSD', timeframe: '1H', experimentId: `OPT-TRAIN-${stopLossAtrBuffer}-${targetRiskReward}-${entryExpiryBars}-${minSweepPenetrationAtr}-${minFvgSizeAtr}` });
    config.strategyVariants = ['S0_SWEEP_FVG'];
    config.aiModes = ['OFF'];
    Object.assign(config, params);
    const summary = ResearchExperimentEngine.run(trainDataset, config).runs[0].summary;
    const score = summary.totalTrades >= 8 ? summary.netProfit + summary.profitFactor * 100 : -1_000_000;
    results.push({ params, train: { ...config.costModel, trades: summary.totalTrades, net: summary.netProfit, winRate: summary.winRatePercent, pf: summary.profitFactor, dd: summary.maxDrawdownPercent }, score });
  }
  results.sort((a, b) => b.score - a.score);
  const selected = results[0];
  if (!selected) throw new Error('NO_PARAMETER_COMBINATION');
  const oosConfig = createBaselineResearchConfig({ datasetId: raw.manifest.datasetId, symbol: 'GBPUSD', timeframe: '1H', experimentId: 'OPT-OOS-SELECTED-S0' });
  oosConfig.strategyVariants = ['S0_SWEEP_FVG'];
  oosConfig.aiModes = ['OFF'];
  oosConfig.evaluationStartTime = splitTimestamp;
  Object.assign(oosConfig, selected.params);
  const oos = ResearchExperimentEngine.run(raw, oosConfig).runs[0].summary;
  const report = { version: 's0-parameter-optimization-v1', dataset: datasetPath, symbol: 'GBPUSD', timeframe: '1H', split: { trainBars: splitIndex, oosBars: candles.length - splitIndex, oosStart: new Date(splitTimestamp).toISOString() }, gridSize: results.length, selectionRule: 'Train netProfit + 100*profitFactor, minimum 8 trades; OOS is never used for selection.', selectedParameters: selected.params, selectedTrain: selected.train, selectedOOS: { trades: oos.totalTrades, net: oos.netProfit, winRate: oos.winRatePercent, pf: oos.profitFactor, dd: oos.maxDrawdownPercent, commission: oos.totalCommission }, top10: results.slice(0, 10), warnings: ['این optimizer برای افزایش Win Rate به‌تنهایی انتخاب نمی‌کند؛ هزینه، تعداد معامله و PF نیز لحاظ شده‌اند.', 'پارامترهای منتخب فقط بعد از OOS مستقل قابل انتقال به Paper-Forward هستند.', 'نتیجهٔ OOS برای انتخاب پارامتر استفاده نشده و صرفاً گزارش اعتبارسنجی است.'] };
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
void main();
