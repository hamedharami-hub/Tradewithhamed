import { Candle, SymbolId } from '../contracts/market';
import { StrategyCandidate } from '../contracts/strategy';
import { RiskPreviewResult } from '../contracts/risk';
import { LocalOrderIntent, ShadowAnalysisCheckResult } from '../contracts/outbox';
import { AnalystCriticPipeline } from './analyst-critic';

export class ShadowAnalysisService {
  public static validatePreFlightConditions(params: {
    symbol: SymbolId;
    currentPrice: number;
    currentTime: number;
    candles5M: Candle[];
    candidate: StrategyCandidate;
    isMarketDataStale: boolean;
  }): ShadowAnalysisCheckResult {
    const { currentPrice, currentTime, candles5M, candidate, isMarketDataStale } = params;

    if (isMarketDataStale) {
      return {
        canCreateIntent: false,
        reasonCode: 'STALE_MARKET_DATA',
        explanation: 'داده‌های قیمت اخیر بیات (Stale) هستند؛ طبق قاعده ایمنی ورود معامله متوقف است.',
      };
    }

    if (candles5M.length < 15) {
      return {
        canCreateIntent: false,
        reasonCode: 'INSUFFICIENT_WARMUP',
        explanation: `تعداد کندل‌های بسته (${candles5M.length}) کمتر از حداقل وارم‌آپ مجاز (۱۵ کندل) است.`,
      };
    }

    if (currentTime > candidate.expiresAtTimestamp) {
      return {
        canCreateIntent: false,
        reasonCode: 'CANDIDATE_EXPIRED',
        explanation: 'زمان اعتبار این ستاپ منقضی شده است.',
      };
    }

    const priceDiffPercent = (Math.abs(currentPrice - candidate.entryPrice) / candidate.entryPrice) * 100;
    if (priceDiffPercent > 0.5) {
      return {
        canCreateIntent: false,
        reasonCode: 'PRICE_CHASE_VIOLATION',
        explanation: `قیمت بازار بیش از ۰٫۵٪ از نقطه ورود فاصله گرفته و معامله ابطال شد (قاعده عدم تعقیب قیمت).`,
      };
    }

    return {
      canCreateIntent: true,
      explanation: 'کلیه شروط پیش‌پرواز بازار و تازگی داده‌ها تأیید شد.',
    };
  }

  public static createLocalOrderIntent(params: {
    candidate: StrategyCandidate;
    riskPreview: RiskPreviewResult;
    userConfirmed: boolean;
  }): { intent: LocalOrderIntent | null; error?: string } {
    const { candidate, riskPreview, userConfirmed } = params;

    if (!userConfirmed) {
      return { intent: null, error: 'تأیید صریح کاربر برای ساخت اینتنت سفارش الزامی است.' };
    }

    if (!riskPreview.isValid || riskPreview.adjustedVolumeLots <= 0) {
      return { intent: null, error: `کنترل ریسک معامله نامعتبر است: ${riskPreview.explanation}` };
    }

    const aiReview = AnalystCriticPipeline.runShadowPipeline(candidate);
    if (!aiReview.passed) {
      return { intent: null, error: `ستاپ توسط ناظر هوش مصنوعی رد شد: ${aiReview.explanation}` };
    }

    const intentId = `INTENT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const orderIntent: LocalOrderIntent = {
      intentId,
      candidateId: candidate.id,
      symbol: candidate.symbol,
      direction: candidate.direction,
      volumeLots: riskPreview.adjustedVolumeLots,
      entryPrice: candidate.entryPrice,
      stopLossPrice: candidate.stopLossPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      plannedRiskAmount: riskPreview.plannedRiskAmount,
      plannedRiskPercent: riskPreview.plannedRiskPercent,
      netRiskRewardRatio: riskPreview.netRiskRewardRatio,
      status: 'NOT_SUBMITTED',
      createdAt: Date.now(),
      userConfirmedAt: Date.now(),
      accountType: 'DEMO',
      isDemoConfirmed: true,
      evidenceChain: {
        sweepId: candidate.evidenceIds.sweepId,
        fvgId: candidate.evidenceIds.fvgId,
        bosId: candidate.evidenceIds.bosId,
        analystDecision: aiReview.analystReview.decision,
        criticValidation: aiReview.criticReview.verdict === 'CONFIRMED' ? 'VALID' : 'INVALID',
      },
      invalidationConditions: [
        `حرکت معکوس قیمت به سمت ${candidate.stopLossPrice}`,
        'انقضای زمان اعتبار تا ۶ کندل آینده',
      ],
      brokerOrderId: null,
      auditHash: `HASH-${intentId.slice(-6)}-${Date.now()}`,
    };

    return { intent: orderIntent };
  }
}
