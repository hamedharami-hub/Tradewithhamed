// lib/core/strategy-definition-evaluator.ts
// موتور جامع ارزیابی تعریف استراتژی (Package 4A Strategy Definition Evaluator)
// تبدیل قطعی StrategyDefinition + کندل‌ها به StrategyEvaluationResult و StrategyCandidate
// ارزیابی ضد نگاه به آینده بدون eval، با ردیابی کامل تمام شروط

import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import type { VolumeType } from '../contracts/dataset-contract';
import type { StrategyCandidate, RuleProvenance } from '../contracts/strategy';
import type {
  StrategyDefinition,
  StrategyEvaluationResult,
  RuleEvaluationResult,
  GroupEvaluationResult,
  SequenceStateEntry,
  DataCapability,
  RuleEvaluationStatus,
} from '../contracts/strategy-definition';
import { CompositeRuleEvaluator, EvaluationContext } from './composite-rule-evaluator';
import { calculateWilderATR } from './atr';

function pricePrecision(symbol: SymbolId): number {
  return symbol === 'XAUUSD' || symbol === 'BTCUSD' ? 2 : 5;
}

function roundPrice(value: number, symbol: SymbolId): number {
  return Number(value.toFixed(pricePrecision(symbol)));
}

function timeframeToMs(timeframe: Timeframe): number {
  const durations: Record<Timeframe, number> = {
    '1M': 60_000,
    '5M': 5 * 60_000,
    '15M': 15 * 60_000,
    '1H': 60 * 60_000,
    '4H': 4 * 60 * 60_000,
    D1: 24 * 60 * 60_000,
    W1: 7 * 24 * 60 * 60_000,
  };
  return durations[timeframe] || 300_000;
}

export class StrategyDefinitionEvaluator {
  /**
   * ارزیابی یک تعریف استراتژی بر روی یک کندل مشخص
   */
  public static evaluate(
    definition: StrategyDefinition,
    candles: Candle[],
    symbol: SymbolId,
    timeframe: Timeframe,
    currentIndex: number = candles.length - 1,
    availableCapabilities: DataCapability[] = ['OHLC', 'CLOSED_BAR_STATUS', 'REAL_SOURCE_VOLUME'],
    currentVolumeType: VolumeType = 'REAL_SOURCE_VOLUME'
  ): StrategyEvaluationResult {
    const currentCandle = candles[currentIndex];
    const timestamp = currentCandle?.timestamp || 0;

    const dataCapabilityWarnings: string[] = [];
    const rejectionReasons: string[] = [];
    const allRuleEvaluations: RuleEvaluationResult[] = [];
    const groupEvaluations: Record<string, GroupEvaluationResult> = {};
    const sequenceStates: SequenceStateEntry[] = [];
    const evidenceRefs: Record<string, string | number> = {};

    // ۱. بررسی تطابق قابلیت‌های داده کلی استراتژی
    const missingCaps = definition.requiredCapabilities.filter(c => !availableCapabilities.includes(c));
    if (missingCaps.length > 0) {
      dataCapabilityWarnings.push(
        `دیتاست فاقد قابلیت‌های الزامی استراتژی است: ${missingCaps.join(', ')}`
      );
      return {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        definitionHash: definition.metadata.deterministicHash,
        evaluatedAt: timestamp,
        overallStatus: 'NOT_AVAILABLE',
        triggerStatus: 'NOT_AVAILABLE',
        riskStatus: 'NOT_AVAILABLE',
        ruleEvaluations: [],
        groupEvaluations: {},
        sequenceStates: [],
        evidenceRefs: {},
        rejectionReasons: ['DATA_CAPABILITY_MISSING'],
        dataCapabilityWarnings,
        candidate: null,
      };
    }

    if (!currentCandle || !currentCandle.isClosed) {
      return {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        definitionHash: definition.metadata.deterministicHash,
        evaluatedAt: timestamp,
        overallStatus: 'FAIL',
        triggerStatus: 'FAIL',
        riskStatus: 'FAIL',
        ruleEvaluations: [],
        groupEvaluations: {},
        sequenceStates: [],
        evidenceRefs: {},
        rejectionReasons: ['CANDLE_NOT_CLOSED'],
        dataCapabilityWarnings,
        candidate: null,
      };
    }

    // بررسی هر دو جهت BUY و SELL (یا جهتی که در پارامترهای تریگر مشخص شده)
    const directionsToTest: Array<'BUY' | 'SELL'> = ['BUY', 'SELL'];
    let bestCandidate: StrategyCandidate | null = null;
    let winningDirection: 'BUY' | 'SELL' = 'BUY';
    let overallStatus: RuleEvaluationStatus = 'FAIL';

    let contextStatus: RuleEvaluationStatus | undefined = undefined;
    let setupStatus: RuleEvaluationStatus | undefined = undefined;
    let triggerStatus: RuleEvaluationStatus = 'FAIL';
    let riskStatus: RuleEvaluationStatus = 'FAIL';
    let exitStatus: RuleEvaluationStatus | undefined = undefined;

    for (const dir of directionsToTest) {
      const ctx: EvaluationContext = {
        candles,
        currentIndex,
        symbol,
        timeframe,
        direction: dir,
        definitionId: definition.definitionId,
        availableCapabilities,
        currentVolumeType,
      };

      // ۲. ارزیابی فاز کانتکست (Context)
      let curContextStatus: RuleEvaluationStatus = 'PASS';
      if (definition.context) {
        const res = CompositeRuleEvaluator.evaluateGroup(definition.context, ctx);
        groupEvaluations[`context_${dir}`] = res;
        this.collectGroupTrace(res, allRuleEvaluations, sequenceStates, evidenceRefs);
        curContextStatus = res.status;
        if (res.status !== 'PASS') {
          rejectionReasons.push(`CONTEXT_FAILED_${dir}`);
          continue;
        }
      }

      // ۳. ارزیابی فاز ستاپ (Setup)
      let curSetupStatus: RuleEvaluationStatus = 'PASS';
      if (definition.setup) {
        const res = CompositeRuleEvaluator.evaluateGroup(definition.setup, ctx);
        groupEvaluations[`setup_${dir}`] = res;
        this.collectGroupTrace(res, allRuleEvaluations, sequenceStates, evidenceRefs);
        curSetupStatus = res.status;
        if (res.status !== 'PASS') {
          rejectionReasons.push(`SETUP_FAILED_${dir}`);
          continue;
        }
      }

      // ۴. ارزیابی فاز تریگر (Trigger - الزامی)
      const trigRes = CompositeRuleEvaluator.evaluateGroup(definition.trigger, ctx);
      groupEvaluations[`trigger_${dir}`] = trigRes;
      this.collectGroupTrace(trigRes, allRuleEvaluations, sequenceStates, evidenceRefs);
      const curTriggerStatus = trigRes.status;

      if (curTriggerStatus !== 'PASS') {
        rejectionReasons.push(`TRIGGER_FAILED_${dir}`);
        continue;
      }

      // اگر کانتکست، ستاپ و تریگر همه پاس شدند
      contextStatus = curContextStatus;
      setupStatus = curSetupStatus;
      triggerStatus = curTriggerStatus;
      winningDirection = dir;
      overallStatus = 'PASS';

      // ۵. استخراج پارامترهای ورود و ریسک برای ساخت StrategyCandidate
      const entryParams = (definition.entry.parameters || {}) as Record<string, number | string>;
      const riskParams = (definition.risk.parameters || {}) as Record<string, number>;

      const atrs = calculateWilderATR(candles, riskParams.atrPeriod || 14);
      const currentAtr = atrs.length > 0 ? atrs[atrs.length - 1] : symbol === 'XAUUSD' ? 1.5 : 0.0008;

      const entryPrice = currentCandle.close;
      const stopLossAtrBuffer = riskParams.stopLossAtrBuffer ?? 0.2;
      const targetRiskReward = riskParams.targetRiskReward ?? 2.0;
      const expiryBars = (riskParams.expiryBars ?? 12) as number;

      let stopLossPrice = 0;
      if (dir === 'BUY') {
        stopLossPrice = (riskParams.stopLossMode === 1 && riskParams.fixedStopDistance)
          ? entryPrice - riskParams.fixedStopDistance
          : currentCandle.low - currentAtr * stopLossAtrBuffer;
      } else {
        stopLossPrice = (riskParams.stopLossMode === 1 && riskParams.fixedStopDistance)
          ? entryPrice + riskParams.fixedStopDistance
          : currentCandle.high + currentAtr * stopLossAtrBuffer;
      }

      const risk = dir === 'BUY' ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;
      if (risk <= 0) {
        rejectionReasons.push(`INVALID_RISK_${dir}`);
        continue;
      }

      const takeProfitPrice = dir === 'BUY'
        ? entryPrice + risk * targetRiskReward
        : entryPrice - risk * targetRiskReward;

      const expiryMs = timestamp + expiryBars * timeframeToMs(timeframe);

      const provenance: RuleProvenance = {
        ruleVersion: definition.definitionVersion,
        parameterHash: definition.metadata.deterministicHash,
        resolvedParameters: {
          stopLossAtrBuffer,
          targetRiskReward,
          expiryBars,
          currentAtr,
        },
        signalCandleTimestamp: timestamp,
        evidenceAvailableAtTimestamp: timestamp,
        lifecycle: 'CONFIRMED',
      };

      const rationaleText = `سیگنال ${dir} بر مبنای استراتژی ${definition.nameFa} (${definition.definitionId} v${definition.definitionVersion}) در کندل بسته ${timestamp} صادر شد.`;

      bestCandidate = {
        id: `CAND-${definition.definitionId}-${dir}-${timestamp}`,
        strategyName: definition.nameEn,
        symbol,
        timeframe,
        direction: dir,
        createdAtTimestamp: timestamp,
        expiresAtTimestamp: expiryMs,
        entryPrice: roundPrice(entryPrice, symbol),
        stopLossPrice: roundPrice(stopLossPrice, symbol),
        takeProfitPrice: roundPrice(takeProfitPrice, symbol),
        riskRewardRatio: targetRiskReward,
        evidenceIds: {
          sweepId: evidenceRefs.sweepId ? String(evidenceRefs.sweepId) : undefined,
          fvgId: evidenceRefs.fvgId ? String(evidenceRefs.fvgId) : undefined,
          bosId: evidenceRefs.bosId ? String(evidenceRefs.bosId) : undefined,
          contextSwingId: evidenceRefs.contextSwingId ? String(evidenceRefs.contextSwingId) : undefined,
        },
        rationale: rationaleText,
        ruleProvenance: provenance,
        status: 'PENDING_CONFIRMATION',
      };

      riskStatus = 'PASS';
      break; // اولین کاندیدای معتبر استخراج شد
    }

    return {
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      definitionHash: definition.metadata.deterministicHash,
      evaluatedAt: timestamp,
      overallStatus,
      contextStatus,
      setupStatus,
      triggerStatus,
      riskStatus,
      exitStatus,
      ruleEvaluations: allRuleEvaluations,
      groupEvaluations,
      sequenceStates,
      evidenceRefs,
      rejectionReasons: overallStatus === 'PASS' ? [] : rejectionReasons,
      dataCapabilityWarnings,
      candidate: bestCandidate,
    };
  }

  private static collectGroupTrace(
    groupRes: GroupEvaluationResult,
    rulesAcc: RuleEvaluationResult[],
    sequencesAcc: SequenceStateEntry[],
    evidenceAcc: Record<string, string | number>
  ): void {
    for (const child of groupRes.childEvaluations) {
      rulesAcc.push(child);
      if (child.evidenceRefs) {
        Object.assign(evidenceAcc, child.evidenceRefs);
      }
    }
    if (groupRes.sequenceState) {
      sequencesAcc.push(groupRes.sequenceState);
    }
    if (groupRes.nestedGroupEvaluations) {
      for (const nested of groupRes.nestedGroupEvaluations) {
        this.collectGroupTrace(nested, rulesAcc, sequencesAcc, evidenceAcc);
      }
    }
  }
}
