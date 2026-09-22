// lib/contracts/decision-trace.ts
// قرارداد جامع، سبک و ارجاع‌محور پرونده شماتیک تصمیمات معامله و کاندیداهای ردشده (Package 4A DecisionTrace)

import type { SymbolId, Timeframe } from './market';
import type { StrategyEvaluationResult, RuleEvaluationResult } from './strategy-definition';

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

  // زمینه زمان و سشن
  timestampUtc: number;
  timezone: string;
  sessionName: string;

  // زمینه تایم‌فریم بالاتر
  htfContext: {
    timeframe?: Timeframe;
    referenceCandleTimestamp?: number;
    availableAtTimestamp?: number;
    trendBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    metrics?: Record<string, number>;
  };

  // چک‌لیست شروط (Context -> Setup -> Trigger -> Risk -> Exit)
  ruleEvaluations: RuleEvaluationResult[];
  overallEvaluationStatus: StrategyEvaluationResult['overallStatus'];
  rejectionReasons: string[];

  // متادیتا و جزئیات اردر
  orderExecution?: {
    orderType: 'MARKET' | 'LIMIT' | 'STOP';
    entryPrice: number;
    fillPrice?: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    riskRewardRatio: number;
    initialRiskDistance: number;
    volumeLots: number;
    slippagePips?: number;
    spreadPips?: number;
    commissionPaid?: number;
  };

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
 * آداپتور برای ایجاد DecisionTrace پایه از ارزیابی استراتژی
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
  sessionName = 'ALL'
): DecisionTrace {
  const candidate = evalResult.candidate;
  return {
    schemaVersion: '1.0.0',
    traceId: `TRACE-${symbol}-${timestampUtc}-${evalResult.definitionId}`,
    runId,
    candidateId: candidate?.id || `REJECTED-${timestampUtc}`,
    symbol,
    timeframe,
    direction,
    strategyId: evalResult.definitionId,
    strategyVersion: evalResult.definitionVersion,
    strategyHash: evalResult.definitionHash,
    datasetFingerprint,
    timestampUtc,
    timezone,
    sessionName,
    htfContext: {},
    ruleEvaluations: evalResult.ruleEvaluations,
    overallEvaluationStatus: evalResult.overallStatus,
    rejectionReasons: evalResult.rejectionReasons,
    orderExecution: candidate ? {
      orderType: 'MARKET',
      entryPrice: candidate.entryPrice,
      stopLossPrice: candidate.stopLossPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      riskRewardRatio: candidate.riskRewardRatio,
      initialRiskDistance: Math.abs(candidate.entryPrice - candidate.stopLossPrice),
      volumeLots: 1.0,
    } : undefined,
  };
}
