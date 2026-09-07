import { calculateWilderATR } from '../atr';
import { detectSwingPoints } from '../swings';
import { calculateDeterministicRisk } from '../risk-calculator';
import { Candle } from '../../contracts/market';

export function runAllCoreTests(): {
  name: string;
  passed: boolean;
  details: string;
}[] {
  const results: { name: string; passed: boolean; details: string }[] = [];

  // تست ۱: محاسبه Wilder ATR(14)
  try {
    const mockCandles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      mockCandles.push({
        timestamp: 1000 + i * 60000,
        open: 2600 + i,
        high: 2605 + i,
        low: 2595 + i,
        close: 2602 + i,
        volume: 100,
        isClosed: true,
      });
    }
    const atrs = calculateWilderATR(mockCandles, 14);
    const passed = atrs.length > 0 && atrs[0] === 10;
    results.push({
      name: 'Wilder ATR(14) Calculation',
      passed,
      details: passed ? `ATR successfully calculated: ${atrs[0]}` : 'Failed ATR calculation',
    });
  } catch (e) {
    results.push({ name: 'Wilder ATR(14) Calculation', passed: false, details: (e as Error).message });
  }

  // تست ۲: عدم نگاه به آینده در کشف پیوت‌ها (Look-ahead bias prevention)
  try {
    const candles: Candle[] = [
      { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 10, isClosed: true },
      { timestamp: 2, open: 11, high: 14, low: 10, close: 13, volume: 10, isClosed: true },
      { timestamp: 3, open: 13, high: 20, low: 12, close: 18, volume: 10, isClosed: true }, // Pivot High در ایندکس 2
      { timestamp: 4, open: 18, high: 15, low: 13, close: 14, volume: 10, isClosed: true },
      { timestamp: 5, open: 14, high: 13, low: 11, close: 12, volume: 10, isClosed: true }, // تایید در ایندکس 4
    ];
    const swings = detectSwingPoints(candles, '5M');
    const pivot = swings.find(s => s.type === 'HIGH' && s.price === 20);
    const passed = pivot !== undefined && pivot.confirmedAtIndex === 4;
    results.push({
      name: 'Pivot High/Low Look-Ahead Bias Prevention',
      passed,
      details: passed
        ? `Pivot at index 2 confirmed strictly at closed candle index ${pivot?.confirmedAtIndex}`
        : 'Failed look-ahead prevention test',
    });
  } catch (e) {
    results.push({ name: 'Pivot High/Low Look-Ahead Bias Prevention', passed: false, details: (e as Error).message });
  }

  // تست ۳: محاسبه قطعی سقف ریسک ۰٫۲۵٪
  try {
    const risk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      accountEquity: 10000,
      riskPercentage: 0.25,
    });
    const maxAllowedDollarRisk = 25; // 0.25% of 10000
    const passed = risk.isValid && risk.plannedRiskAmount <= maxAllowedDollarRisk;
    results.push({
      name: 'Deterministic Risk 0.25% Cap',
      passed,
      details: passed
        ? `Risk capped at $${risk.plannedRiskAmount} <= $${maxAllowedDollarRisk} (Equity: 10,000, Volume: ${risk.adjustedVolumeLots} lots)`
        : `Violated 0.25% cap: $${risk.plannedRiskAmount}`,
    });
  } catch (e) {
    results.push({ name: 'Deterministic Risk 0.25% Cap', passed: false, details: (e as Error).message });
  }

  // تست ۴: کسر کارمزد بروکر در محاسبه ریسک و ریوارد
  try {
    const risk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      accountEquity: 10000,
    });
    const passed = risk.commissionEstimated > 0 && risk.netRiskRewardRatio < risk.grossRiskRewardRatio;
    results.push({
      name: 'Broker Commission Deduction in Risk/Reward',
      passed,
      details: passed
        ? `Commission $${risk.commissionEstimated} deducted: Gross R:R=${risk.grossRiskRewardRatio}, Net R:R=${risk.netRiskRewardRatio}`
        : 'Failed commission deduction test',
    });
  } catch (e) {
    results.push({ name: 'Broker Commission Deduction in Risk/Reward', passed: false, details: (e as Error).message });
  }

  return results;
}
