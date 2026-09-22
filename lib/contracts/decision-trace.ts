// lib/contracts/decision-trace.ts
// قرارداد جامع، سبک و ارجاع‌محور پرونده شماتیک تصمیمات معامله و کاندیداهای ردشده (Package 4A.1 DecisionTrace)

import type { SymbolId, Timeframe } from './market';
import type { StrategyEvaluationResult, RuleEvaluationResult, GroupEvaluationResult, SequenceStateEntry, HtfContextData } from './strategy-definition';

export interface DecisionTrace {
  schemaVersion: '1.0.0';
  traceId: string;
  runId: string;
  candidateId: string;
  positionId?: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  strategyId: string;
  strategyVersion: string;
  strategyHash: string;
  datasetFingerprint: string;

  // فیلدهای دقیق زمانی
  timestampUtc: number;              // زمان بازشدن کندل مبنا (signal candle)
  decisionAt: number;                // زمان قطعی اجرای محاسبات (evaluatedAt)
  eligibleFromTimestamp: number;     // اولین لحظه مجاز برای اجرا در موتور
  timezone: string;
  sessionName: string;

  // زمینه تایم‌فریم بالاتر (HTF) واقعی
  htfContext?: {
    timeframe?: Timeframe;
    referenceCandleTimestamp?: number;
    availableAtTimestamp?: number;
    isNative?: boolean;
    trendBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    metrics?: Record<string, number>;
  };

  // چک‌لیست شروط (Context -> Setup -> Trigger -> Entry -> Risk -> Exit)
  ruleEvaluations: RuleEvaluationResult[];
  groupEvaluations?: Record<string, GroupEvaluationResult>;
  sequenceStates?: SequenceStateEntry[];
  overallEvaluationStatus: StrategyEvaluationResult['overallStatus'];
  rejectionReasons: string[];
  dataCapabilityWarnings: string[];

  // متادیتا و جزئیات اردر (فقط در صورت وجود کاندیدای معتبر و محاسبه واقعی)
  orderExecution?: {
    orderType: 'MARKET' | 'LIMIT' | 'STOP';
    entryPrice: number;
    fillPrice?: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    riskRewardRatio: number;
    initialRiskDistance: number;
    volumeLots?: number; // فقط پس از محاسبه مدیریت سرمایه
    slippagePips?: number;
    spreadPips?: number;
    commissionPaid?: number;
  };

  // مراجع اردر و رویدادهای اجرا
  entryIntentRef?: string;
  executionEventRefs?: string[];
  ambiguityPolicy?: string;
  sourceTimeframeRefs?: Timeframe[];

  // متادیتا خروج و عملکرد
  exitSummary?: {
    exitTimestamp: number;
    exitPrice: number;
    exitReason: 'TP' | 'SL' | 'BREAKEVEN' | 'END_OF_DATA' | 'MANUAL';
    realizedPnlDollar: number;
    maePips: number;
    mfePips: number;
  };

  // رفرنس به ارزیابی‌های آینده هوش مصنوعی (Package 6 & 7)
  aiTraceRef?: {
    advisoryId: string;
    verdict: 'ALLOW' | 'VETO' | 'ABSTAIN';
    latencyMs: number;
  };
}

/**
 * آداپتور برای ایجاد DecisionTrace پایه و واقعی از ارزیابی استراتژی
 */
export function buildDecisionTraceFromEvaluation(
  runId: string,
  evalResult: StrategyEvaluationResult,
  symbol: SymbolId,
  timeframe: Timeframe,
  direction: 'BUY' | 'SELL',
  timestampUtc: number,
  datasetFingerprint: string,
  timezone = 'UTC',
  sessionName = 'ALL',
  htfContextData?: HtfContextData,
  orderParams?: {
    orderType: 'MARKET' | 'LIMIT' | 'STOP';
    volumeLots?: number;
  }
): DecisionTrace {
  const candidate = evalResult.candidate;
  const effectiveDirection = candidate?.direction || evalResult.direction || direction;

  // شناسه کاندیدای یکتا و پایدار بدون خطر برخورد در موارد ردشده
  const candidateId = candidate?.id ||
    `REJECTED-${symbol}-${timeframe}-${effectiveDirection}-${timestampUtc}-${evalResult.definitionId}`;

  const traceId = `TRACE-${symbol}-${timeframe}-${effectiveDirection}-${timestampUtc}-${evalResult.definitionId}`;

  let orderExecution: DecisionTrace['orderExecution'] = undefined;
  if (candidate) {
    const riskDist = Math.abs(candidate.entryPrice - candidate.stopLossPrice);
    orderExecution = {
      orderType: orderParams?.orderType || 'MARKET',
      entryPrice: candidate.entryPrice,
      stopLossPrice: candidate.stopLossPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      riskRewardRatio: candidate.riskRewardRatio,
      initialRiskDistance: riskDist,
      ...(orderParams?.volumeLots !== undefined ? { volumeLots: orderParams.volumeLots } : {}),
    };
  }

  const htfContext: DecisionTrace['htfContext'] = htfContextData ? {
    timeframe: htfContextData.timeframe,
    referenceCandleTimestamp: htfContextData.candle.timestamp,
    availableAtTimestamp: htfContextData.availableAt,
    isNative: htfContextData.isNative,
  } : undefined;

  return {
    schemaVersion: '1.0.0',
    traceId,
    runId,
    candidateId,
    symbol,
    timeframe,
    direction: effectiveDirection,
    strategyId: evalResult.definitionId,
    strategyVersion: evalResult.definitionVersion,
    strategyHash: evalResult.definitionHash,
    datasetFingerprint,
    timestampUtc,
    decisionAt: evalResult.evaluatedAt,
    eligibleFromTimestamp: evalResult.eligibleFromTimestamp,
    timezone,
    sessionName,
    htfContext,
    ruleEvaluations: evalResult.ruleEvaluations,
    groupEvaluations: evalResult.groupEvaluations,
    sequenceStates: evalResult.sequenceStates,
    overallEvaluationStatus: evalResult.overallStatus,
    rejectionReasons: evalResult.rejectionReasons,
    dataCapabilityWarnings: evalResult.dataCapabilityWarnings,
    orderExecution,
    sourceTimeframeRefs: [timeframe, ...(htfContextData ? [htfContextData.timeframe] : [])],
  };
}
