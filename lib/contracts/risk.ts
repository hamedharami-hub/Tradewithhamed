import { SymbolId } from './market';
import { CandidateDirection } from './strategy';

export interface RiskCalculationInput {
  symbol: SymbolId;
  direction: CandidateDirection;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  accountEquity: number;
  riskPercentage?: number; // پیش‌فرض ۰.۲۵٪ (سقف مصوب)
}

export interface RiskPreviewResult {
  symbol: SymbolId;
  rawVolumeLots: number;
  adjustedVolumeLots: number; // پس از اعمال گام حجم (lotStep) با گرد کردن به پایین
  plannedRiskAmount: number;  // حداکثر زیان با احتساب کارمزد و اسپرد
  plannedRiskPercent: number; // حداکثر ۰٫۲۵ درصد
  rewardAmount: number;       // سود پیش‌بینی شده در صورت اصابت به TP
  grossRiskRewardRatio: number;
  netRiskRewardRatio: number; // با کسر کارمزد دوطرفه
  commissionEstimated: number;
  isValid: boolean;
  explanation: string;
}
