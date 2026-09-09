import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface BootstrapCI {
  mean: number;
  ciLower95: number;
  ciUpper95: number;
}

export interface Stage8AnalysisResult {
  version: 'stage8-bootstrap-v1';
  analyzedAt: string;
  reportFile: string;
  sampleSize: number;
  status: 'SAMPLE_INSUFFICIENT' | 'STATISTICALLY_VALIDATED' | 'CRITERIA_NOT_MET';
  readyForProductionPromotion: boolean;
  promotionRefusalReason?: string;
  metrics: {
    winRate: number;
    profitFactor: number;
    totalNetPnl: number;
    winCount: number;
    lossCount: number;
    maxDrawdownPercent: number;
  };
  bootstrap?: {
    iterations: number;
    seed: number;
    winRateCI: BootstrapCI;
    profitFactorCI: BootstrapCI;
  };
  readonly brokerWrites: false;
}

export function createSeededRandom(seed = 42): () => number {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function calculateBootstrap(
  pnls: number[],
  iterations = 10000,
  seed = 42
): {
  winRateCI: BootstrapCI;
  profitFactorCI: BootstrapCI;
} {
  const rng = createSeededRandom(seed);
  const n = pnls.length;
  const sampledWinRates: number[] = new Array(iterations);
  const sampledProfitFactors: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let winCount = 0;
    let grossWin = 0;
    let grossLoss = 0;

    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rng() * n);
      const val = pnls[idx];
      if (val > 0) {
        winCount++;
        grossWin += val;
      } else {
        grossLoss += Math.abs(val);
      }
    }

    sampledWinRates[i] = winCount / n;
    sampledProfitFactors[i] = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 10 : 0;
  }

  sampledWinRates.sort((a, b) => a - b);
  sampledProfitFactors.sort((a, b) => a - b);

  const idxLower = Math.floor(iterations * 0.025);
  const idxUpper = Math.floor(iterations * 0.975);

  const avgWinRate = sampledWinRates.reduce((a, b) => a + b, 0) / iterations;
  const avgProfitFactor = sampledProfitFactors.reduce((a, b) => a + b, 0) / iterations;

  return {
    winRateCI: {
      mean: Number(avgWinRate.toFixed(4)),
      ciLower95: Number(sampledWinRates[idxLower].toFixed(4)),
      ciUpper95: Number(sampledWinRates[idxUpper].toFixed(4)),
    },
    profitFactorCI: {
      mean: Number(avgProfitFactor.toFixed(3)),
      ciLower95: Number(sampledProfitFactors[idxLower].toFixed(3)),
      ciUpper95: Number(sampledProfitFactors[idxUpper].toFixed(3)),
    },
  };
}

export function evaluateTradeSample(pnls: number[], reportFile = 'memory'): Stage8AnalysisResult {
  const sampleSize = pnls.length;

  let winCount = 0;
  let lossCount = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let totalNetPnl = 0;
  let peak = 0;
  let running = 0;
  let maxDd = 0;

  for (const p of pnls) {
    totalNetPnl += p;
    running += p;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDd) maxDd = dd;

    if (p > 0) {
      winCount++;
      grossWin += p;
    } else {
      lossCount++;
      grossLoss += Math.abs(p);
    }
  }

  const winRate = sampleSize > 0 ? winCount / sampleSize : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : 0;

  // RULE: Sample size MUST be >= 30 trades for valid promotion consideration
  if (sampleSize < 30) {
    return {
      version: 'stage8-bootstrap-v1',
      analyzedAt: new Date().toISOString(),
      reportFile,
      sampleSize,
      status: 'SAMPLE_INSUFFICIENT',
      readyForProductionPromotion: false,
      promotionRefusalReason: `Sample size (${sampleSize}) is less than required 30 trades. Promotion to production is strictly refused.`,
      metrics: {
        winRate: Number(winRate.toFixed(4)),
        profitFactor: Number(profitFactor.toFixed(3)),
        totalNetPnl: Number(totalNetPnl.toFixed(2)),
        winCount,
        lossCount,
        maxDrawdownPercent: Number(maxDd.toFixed(2)),
      },
      brokerWrites: false,
    };
  }

  // 10,000 bootstrap resamples
  const bootstrap = calculateBootstrap(pnls, 10000, 42);

  const passesCriteria =
    bootstrap.winRateCI.ciLower95 >= 0.45 &&
    bootstrap.profitFactorCI.ciLower95 >= 1.10 &&
    totalNetPnl > 0;

  return {
    version: 'stage8-bootstrap-v1',
    analyzedAt: new Date().toISOString(),
    reportFile,
    sampleSize,
    status: passesCriteria ? 'STATISTICALLY_VALIDATED' : 'CRITERIA_NOT_MET',
    readyForProductionPromotion: passesCriteria,
    promotionRefusalReason: passesCriteria ? undefined : 'Performance criteria (winRate CI or profitFactor CI) not met.',
    metrics: {
      winRate: Number(winRate.toFixed(4)),
      profitFactor: Number(profitFactor.toFixed(3)),
      totalNetPnl: Number(totalNetPnl.toFixed(2)),
      winCount,
      lossCount,
      maxDrawdownPercent: Number(maxDd.toFixed(2)),
    },
    bootstrap: {
      iterations: 10000,
      seed: 42,
      winRateCI: bootstrap.winRateCI,
      profitFactorCI: bootstrap.profitFactorCI,
    },
    brokerWrites: false,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetPath = args[0] || process.env.STAGE8_REPORT_FILE || 'data/runs/stage8-30d/gbpusd-monitor-report.jsonl';
  const resolved = resolve(targetPath);

  let rawLines: string[] = [];
  try {
    const text = await readFile(resolved, 'utf8');
    rawLines = text.split('\n').filter(Boolean);
  } catch {
    console.warn(`[WARN] Could not read report file at ${resolved}. Analyzing synthetic/empty sample.`);
  }

  const pnls: number[] = [];
  for (const line of rawLines) {
    try {
      const obj = JSON.parse(line) as { type?: string; payload?: { pnl?: number } };
      if (obj.type === 'PAPER_POSITION_CLOSED' && typeof obj.payload?.pnl === 'number') {
        pnls.push(obj.payload.pnl);
      }
    } catch {
      // Ignored non-json lines
    }
  }

  const analysis = evaluateTradeSample(pnls, resolved);
  const outputJson = JSON.stringify(analysis, null, 2);
  console.log(outputJson);

  const outPath = resolve(resolved, '..', 'stage8-bootstrap-analysis.json');
  try {
    await writeFile(outPath, outputJson, 'utf8');
  } catch {
    // Ignore if output dir does not exist
  }
}

const isDirectRun = Boolean(process.argv[1] && process.argv[1].includes('analyze-stage8-paper-run'));
if (isDirectRun) {
  void main();
}
