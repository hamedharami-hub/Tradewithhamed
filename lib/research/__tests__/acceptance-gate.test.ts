import { evaluateAcceptanceGate } from '../acceptance-gate';

const fold = (oosNetProfit: number, trainNetProfit = 100) => ({ trainNetProfit, oosNetProfit, oosTrades: 12, stressNetProfits: [oosNetProfit, oosNetProfit * 0.8, oosNetProfit * 0.5] });

const passBase = {
  candidateId: 'BTCUSD-D1-OPT', symbol: 'BTCUSD', timeframe: 'D1',
  optimized: { oosNetProfit: 292.86, oosTrades: 42, oosProfitFactor: 1.3, oosMaxDrawdownPercent: 4, stressNetProfits: [292.86, 249.49, 206.39] },
  folds: [fold(80), fold(100), fold(112)],
};

export function runAcceptanceGateSuite() {
  const pass = evaluateAcceptanceGate(passBase);
  const reject = evaluateAcceptanceGate({ ...passBase, candidateId: 'EURUSD-4H-OPT', symbol: 'EURUSD', optimized: { ...passBase.optimized, oosNetProfit: -231.05, oosTrades: 35, stressNetProfits: [-231.05, -269.21, -284.05] }, folds: [fold(-40), fold(-80), fold(-111)] });
  const candidate = evaluateAcceptanceGate({ ...passBase, candidateId: 'SMALL-CANDIDATE', optimized: { ...passBase.optimized, oosNetProfit: 40, oosTrades: 31, stressNetProfits: [40, -2, -8] }, folds: [fold(20), fold(-4), fold(24)] });
  return [
    { name: 'Eligible candidate passes gate', passed: pass.status === 'PAPER_FORWARD_ELIGIBLE', details: pass.status },
    { name: 'Negative OOS candidate is rejected', passed: reject.status === 'REJECTED', details: reject.status },
    { name: 'Mixed candidate remains research-only', passed: candidate.status === 'RESEARCH_CANDIDATE', details: candidate.status },
  ];
}
