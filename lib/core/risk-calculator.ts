import { SYMBOL_SPECS } from '../contracts/market';
import { RiskCalculationInput, RiskPreviewResult } from '../contracts/risk';

/**
 * ماشین محاسبه قطعی ریسک و حجم سفارش
 * قوانین غیرقابل تخطی:
 * ۱. سقف ریسک ۰٫۲۵٪ کل سرمایه حساب
 * ۲. گرد کردن حجم همیشه به سمت پایین (Floor) به پله‌های minLots و lotStep
 * ۳. کسر هزینه کارمزد دوطرفه بروکر
 */
export function calculateDeterministicRisk(input: RiskCalculationInput): RiskPreviewResult {
  const meta = SYMBOL_SPECS[input.symbol];
  const maxRiskPercent = input.riskPercentage ? Math.min(input.riskPercentage, 0.25) : 0.25;
  const maxDollarRisk = (input.accountEquity * maxRiskPercent) / 100;

  const slDistance = Math.abs(input.entryPrice - input.stopLossPrice);
  const tpDistance = Math.abs(input.takeProfitPrice - input.entryPrice);

  if (slDistance <= 0 || tpDistance <= 0) {
    return {
      symbol: input.symbol,
      rawVolumeLots: 0,
      adjustedVolumeLots: 0,
      plannedRiskAmount: 0,
      plannedRiskPercent: 0,
      rewardAmount: 0,
      grossRiskRewardRatio: 0,
      netRiskRewardRatio: 0,
      commissionEstimated: 0,
      isValid: false,
      explanation: 'فاصله حد ضرر یا حد سود نامعتبر است.',
    };
  }

  // ارزش دلاری حرکت هر واحد قیمت برای ۱ لات
  const dollarPerPriceUnitPerLot = meta.contractSize;
  // زیان ناخالص هر لات در صورت اصابت به SL
  const lossPerLot = slDistance * dollarPerPriceUnitPerLot;
  // کارمزد دوطرفه
  const totalCostPerLot = lossPerLot + meta.commissionPerLot;

  const rawVolume = maxDollarRisk / totalCostPerLot;

  // اعمال پله‌های مجاز بروکر با گرد کردن به سمت پایین
  const steps = Math.floor(rawVolume / meta.lotStep);
  let adjustedVolume = Number((steps * meta.lotStep).toFixed(2));

  if (adjustedVolume < meta.minLots) {
    return {
      symbol: input.symbol,
      rawVolumeLots: rawVolume,
      adjustedVolumeLots: 0,
      plannedRiskAmount: 0,
      plannedRiskPercent: 0,
      rewardAmount: 0,
      grossRiskRewardRatio: 0,
      netRiskRewardRatio: 0,
      commissionEstimated: 0,
      isValid: false,
      explanation: `حجم محاسبه‌شده (${rawVolume.toFixed(3)}) کمتر از حداقل حجم مجاز بروکر (${meta.minLots} لات) است. معامله لغو شد.`,
    };
  }

  if (adjustedVolume > meta.maxLots) {
    adjustedVolume = meta.maxLots;
  }

  const commission = Number((adjustedVolume * meta.commissionPerLot).toFixed(2));
  const plannedRiskAmount = Number((adjustedVolume * lossPerLot + commission).toFixed(2));
  const plannedRiskPercent = Number(((plannedRiskAmount / input.accountEquity) * 100).toFixed(4));

  const grossReward = adjustedVolume * tpDistance * dollarPerPriceUnitPerLot;
  const rewardAmount = Number((grossReward - commission).toFixed(2));

  const grossRiskRewardRatio = Number((tpDistance / slDistance).toFixed(2));
  const netRiskRewardRatio = Number((rewardAmount / plannedRiskAmount).toFixed(2));

  return {
    symbol: input.symbol,
    rawVolumeLots: Number(rawVolume.toFixed(3)),
    adjustedVolumeLots: adjustedVolume,
    plannedRiskAmount,
    plannedRiskPercent,
    rewardAmount,
    grossRiskRewardRatio,
    netRiskRewardRatio,
    commissionEstimated: commission,
    isValid: true,
    explanation: `حجم ${adjustedVolume} لات با ریسک حداکثر ${plannedRiskAmount} دلار (${plannedRiskPercent}٪) تأیید شد.`,
  };
}
