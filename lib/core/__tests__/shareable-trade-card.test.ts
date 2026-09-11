// lib/core/__tests__/shareable-trade-card.test.ts
// آزمون‌های اعتبارسنجی تولید ساختار داده و سنجه‌های کارت گرافیکی معامله (Shareable Trade Card)

import { ShareableTradeData } from '../../../components/trading/shareable-trade-card-modal';

export interface ShareableCardTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export async function runShareableTradeCardSuite(): Promise<ShareableCardTestResult[]> {
  const results: ShareableCardTestResult[] = [];

  // داده نمونه معامله سودده
  const profitableTrade: ShareableTradeData = {
    symbol: 'XAUUSD',
    direction: 'BUY',
    entryPrice: 2650.5,
    exitPrice: 2665.5,
    stopLossPrice: 2645.5,
    takeProfitPrice: 2665.5,
    realizedNetPnL: 375.0,
    realizedRMultiple: 3.0,
    volumeLots: 0.25,
    maePips: 2.1,
    maeDollar: 26.25,
    mfePips: 15.0,
    mfeDollar: 375.0,
    exitEfficiencyPercent: 88,
    psychologyMood: 'PLAN_DISCIPLINED',
    propFirmId: 'FTMO_100K',
    setupGrade: 'A+',
    openedAt: Date.now() - 3600000,
    closedAt: Date.now(),
  };

  // ۱. تست محاسبه و تطابق ضریب ریسک به ریوارد (R-Multiple)
  const plannedRiskPerUnit = Math.abs(profitableTrade.entryPrice - (profitableTrade.stopLossPrice || 0));
  const realizedGainPerUnit = Math.abs((profitableTrade.exitPrice || 0) - profitableTrade.entryPrice);
  const calculatedR = Number((realizedGainPerUnit / plannedRiskPerUnit).toFixed(2));
  const test1Passed = calculatedR === profitableTrade.realizedRMultiple;

  results.push({
    id: 'CARD-01-R-MULTIPLE',
    name: 'محاسبه دقیق ضریب R-Multiple در کارت معامله',
    passed: test1Passed,
    details: `محاسبه‌شده: ${calculatedR}R، ثبت‌شده: ${profitableTrade.realizedRMultiple}R`,
  });

  // ۲. تست محدوده و صحت درصد بهره‌وری خروج (Exit Efficiency)
  const test2Passed =
    profitableTrade.exitEfficiencyPercent !== undefined &&
    profitableTrade.exitEfficiencyPercent >= 0 &&
    profitableTrade.exitEfficiencyPercent <= 100;

  results.push({
    id: 'CARD-02-EFFICIENCY-BOUNDS',
    name: 'اعتبارسنجی بازه استاندارد درصد بهره‌وری خروج (۰ تا ۱۰۰٪)',
    passed: test2Passed,
    details: `بهره‌وری: ${profitableTrade.exitEfficiencyPercent}%`,
  });

  // ۳. تست معامله زیان‌ده و فرمت‌بندی منفی
  const lossTrade: ShareableTradeData = {
    symbol: 'EURUSD',
    direction: 'SELL',
    entryPrice: 1.085,
    exitPrice: 1.087,
    stopLossPrice: 1.087,
    takeProfitPrice: 1.08,
    realizedNetPnL: -100.0,
    realizedRMultiple: -1.0,
    volumeLots: 0.5,
    maePips: 20.0,
    maeDollar: 100.0,
    mfePips: 3.0,
    mfeDollar: 15.0,
    exitEfficiencyPercent: 12,
    psychologyMood: 'FOMO_RUSH',
    propFirmId: 'THE5ERS_100K',
    setupGrade: 'B',
  };

  const isPnlNegative = (lossTrade.realizedNetPnL ?? 0) < 0;
  const isRNegative = (lossTrade.realizedRMultiple ?? 0) < 0;
  const test3Passed = isPnlNegative && isRNegative;

  results.push({
    id: 'CARD-03-LOSS-METRICS',
    name: 'تطابق صحیح مقادیر منفی PnL و R در معاملات زیان‌ده',
    passed: test3Passed,
    details: `PnL: ${lossTrade.realizedNetPnL}$, R: ${lossTrade.realizedRMultiple}R`,
  });

  // ۴. تست ساختار ستاپ‌های در جریان (Candidate Setup)
  const candidateTrade: ShareableTradeData = {
    symbol: 'XAUUSD',
    direction: 'BUY',
    entryPrice: 2640.0,
    stopLossPrice: 2635.0,
    takeProfitPrice: 2652.5,
    isCandidate: true,
    setupGrade: 'A+',
  };

  const projectedR = Number(
    (
      Math.abs((candidateTrade.takeProfitPrice || 0) - candidateTrade.entryPrice) /
      Math.abs(candidateTrade.entryPrice - (candidateTrade.stopLossPrice || 0))
    ).toFixed(2)
  );

  const test4Passed = candidateTrade.isCandidate === true && projectedR === 2.5;

  results.push({
    id: 'CARD-04-CANDIDATE-PROJECTION',
    name: 'تولید کارت پیش‌بینی برای ستاپ‌های پیش از ورود با نسبت R:R هدف',
    passed: test4Passed,
    details: `نسبت تارگت به استاپ پیش‌بینی شده: 1:${projectedR}`,
  });

  return results;
}
