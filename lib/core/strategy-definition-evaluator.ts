// lib/core/strategy-definition-evaluator.ts
// موتور جامع ارزیابی تعریف استراتژی (Package 4A.1 Strategy Definition Evaluator)
// تبدیل قطعی StrategyDefinition + کندل‌ها به StrategyEvaluationResult و StrategyCandidate
// ارزیابی ضد نگاه به آینده بدون eval، با ردیابی کامل شروط، زمان‌بندی دقیق و RuleRegistry حقیقی

import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import { getCandleCloseTimestamp, roundSymbolPrice, timeframeToMs } from '../contracts/market';
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
  RuleEvaluationContext,
  HtfContextData,
} from '../contracts/strategy-definition';
import { CompositeRuleEvaluator } from './composite-rule-evaluator';
import { RuleRegistry } from './rule-registry';
import { ContextDataResolver } from './context-data-resolver';

export interface StrategyEvaluationOptions {
  definition: StrategyDefinition;
  candles: Candle[];
  symbol: SymbolId;
  timeframe: Timeframe;
  currentIndex?: number;
  availableCapabilities?: DataCapability[];
  currentVolumeType?: VolumeType;
  runId?: string;
  datasetFingerprint?: string;
  htfCandles?: readonly Candle[];
  htfTimeframe?: Timeframe;
}

export class StrategyDefinitionEvaluator {
  /**
   * ارزیابی یک تعریف استراتژی بر روی یک کندل مشخص با پشتیبانی از هر دو امضای فراخوانی
   */
  public static evaluate(
    definitionOrOptions: StrategyDefinition | StrategyEvaluationOptions,
    candlesArg?: Candle[],
    symbolArg?: SymbolId,
    timeframeArg?: Timeframe,
    currentIndexArg?: number,
    availableCapabilitiesArg?: DataCapability[],
    currentVolumeTypeArg?: VolumeType,
    extraOptions?: {
      runId?: string;
      datasetFingerprint?: string;
      htfCandles?: readonly Candle[];
      htfTimeframe?: Timeframe;
    }
  ): StrategyEvaluationResult {
    let definition: StrategyDefinition;
    let candles: Candle[];
    let symbol: SymbolId;
    let timeframe: Timeframe;
    let currentIndex: number;
    let availableCapabilities: DataCapability[];
    let currentVolumeType: VolumeType;
    let runId: string;
    let datasetFingerprint: string;
    let htfCandles: readonly Candle[] | undefined;
    let htfTimeframe: Timeframe | undefined;

    if ('definition' in definitionOrOptions) {
      const opts = definitionOrOptions as StrategyEvaluationOptions;
      definition = opts.definition;
      candles = opts.candles;
      symbol = opts.symbol;
      timeframe = opts.timeframe;
      currentIndex = opts.currentIndex ?? candles.length - 1;
      availableCapabilities = opts.availableCapabilities ?? ['OHLC', 'CLOSED_BAR_STATUS', 'REAL_SOURCE_VOLUME'];
      currentVolumeType = opts.currentVolumeType ?? 'REAL_SOURCE_VOLUME';
      runId = opts.runId ?? `run_${Date.now()}`;
      datasetFingerprint = opts.datasetFingerprint ?? `${symbol}_${timeframe}`;
      htfCandles = opts.htfCandles;
      htfTimeframe = opts.htfTimeframe;
    } else {
      definition = definitionOrOptions;
      candles = candlesArg!;
      symbol = symbolArg!;
      timeframe = timeframeArg!;
      currentIndex = currentIndexArg ?? candles.length - 1;
      availableCapabilities = availableCapabilitiesArg ?? ['OHLC', 'CLOSED_BAR_STATUS', 'REAL_SOURCE_VOLUME'];
      currentVolumeType = currentVolumeTypeArg ?? 'REAL_SOURCE_VOLUME';
      runId = extraOptions?.runId ?? `run_${Date.now()}`;
      datasetFingerprint = extraOptions?.datasetFingerprint ?? `${symbol}_${timeframe}`;
      htfCandles = extraOptions?.htfCandles;
      htfTimeframe = extraOptions?.htfTimeframe;
    }

    const currentCandle = candles[currentIndex];
    const timestamp = currentCandle?.timestamp || 0;
    const evaluatedAt = currentCandle ? getCandleCloseTimestamp(currentCandle, timeframe) : timestamp;

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
        runId,
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        definitionHash: definition.metadata.integrityHash || definition.metadata.deterministicHash,
        datasetFingerprint,
        direction: 'BUY',
        signalTimestamp: timestamp,
        evaluatedAt,
        eligibleFromTimestamp: evaluatedAt,
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
        runId,
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        definitionHash: definition.metadata.integrityHash || definition.metadata.deterministicHash,
        datasetFingerprint,
        direction: 'BUY',
        signalTimestamp: timestamp,
        evaluatedAt,
        eligibleFromTimestamp: evaluatedAt,
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

    // استخراج کانتکست چند تایم‌فریمی در صورت وجود
    let resolvedHtfContext: HtfContextData | undefined = undefined;
    if (htfCandles && htfTimeframe) {
      const htf = ContextDataResolver.resolveHtfContext({
        execCandle: currentCandle,
        execTimeframe: timeframe,
        htfCandles,
        htfTimeframe,
      });
      if (htf) {
        resolvedHtfContext = htf;
      }
    }

    // بررسی هر دو جهت BUY و SELL
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
      const ctx: RuleEvaluationContext = {
        runId,
        symbol,
        timeframe,
        direction: dir,
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        definitionHash: definition.metadata.integrityHash || definition.metadata.deterministicHash,
        evaluatedAt,
        availableCapabilities,
        volumeType: currentVolumeType,
        datasetFingerprint,
        candles,
        currentIndex,
        htfContext: resolvedHtfContext,
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

      // ۵. ارزیابی فاز ورود حقیقی از طریق RuleRegistry
      const entryRes = RuleRegistry.evaluateInstance(definition.entry, ctx);
      allRuleEvaluations.push(entryRes);
      if (entryRes.status !== 'PASS') {
        rejectionReasons.push(`ENTRY_FAILED_${dir}`);
        continue;
      }

      // ۶. ارزیابی فاز مدیریت ریسک حقیقی از طریق RuleRegistry (بدون فالبک ساختگی)
      const riskRes = RuleRegistry.evaluateInstance(definition.risk, ctx);
      allRuleEvaluations.push(riskRes);
      if (riskRes.status !== 'PASS') {
        rejectionReasons.push(`RISK_FAILED_${dir}`);
        continue;
      }

      // ۷. ارزیابی فاز خروج در صورت وجود
      if (definition.exit) {
        const exitRes = CompositeRuleEvaluator.evaluateGroup(definition.exit, ctx);
        groupEvaluations[`exit_${dir}`] = exitRes;
        this.collectGroupTrace(exitRes, allRuleEvaluations, sequenceStates, evidenceRefs);
        exitStatus = exitRes.status;
      }

      // اگر تمام شروط پاس شدند
      contextStatus = curContextStatus;
      setupStatus = curSetupStatus;
      triggerStatus = curTriggerStatus;
      riskStatus = riskRes.status;
      winningDirection = dir;
      overallStatus = 'PASS';

      // استخراج سطوح قیمت و مقادیر واقعی از نتایج ارزیابی ریسک و ورود
      const riskActuals = (riskRes.actualValues || {}) as {
        entryPrice?: number;
        stopLossPrice?: number;
        takeProfitPrice?: number;
        riskDistance?: number;
        riskRewardRatio?: number;
        atr?: number;
      };
      const entryActuals = (entryRes.actualValues || {}) as {
        limitPrice?: number;
        stopPrice?: number;
        estimatedEntryPrice?: number;
        eligibleFromTimestamp?: number;
      };

      const entryPrice = entryActuals.limitPrice ?? entryActuals.stopPrice ?? riskActuals.entryPrice ?? currentCandle.close;
      const stopLossPrice = riskActuals.stopLossPrice!;
      const takeProfitPrice = riskActuals.takeProfitPrice!;
      const riskRewardRatio = riskActuals.riskRewardRatio ?? 2.0;

      const riskDistance = dir === 'BUY' ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;
      if (riskDistance <= 0) {
        rejectionReasons.push(`INVALID_RISK_${dir}`);
        overallStatus = 'FAIL';
        continue;
      }

      const expiryBars = Number((definition.risk.parameters as { expiryBars?: number })?.expiryBars || 12);
      const expiryMs = evaluatedAt + expiryBars * timeframeToMs(timeframe);

      const provenance: RuleProvenance = {
        ruleVersion: definition.definitionVersion,
        parameterHash: definition.metadata.integrityHash || definition.metadata.deterministicHash,
        resolvedParameters: {
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
          riskRewardRatio,
          expiryBars,
          currentAtr: riskActuals.atr ?? 0,
        },
        signalCandleTimestamp: currentCandle.timestamp,
        evidenceAvailableAtTimestamp: evaluatedAt,
        lifecycle: 'CONFIRMED',
      };

      const rationaleText = `سیگنال ${dir} بر مبنای استراتژی ${definition.nameFa} (${definition.definitionId} v${definition.definitionVersion}) در زمان بسته شدن کندل (${evaluatedAt}) صادر شد.`;

      bestCandidate = {
        id: `CAND-${definition.definitionId}-${dir}-${currentCandle.timestamp}`,
        strategyName: definition.nameEn,
        symbol,
        timeframe,
        direction: dir,
        createdAtTimestamp: evaluatedAt,
        expiresAtTimestamp: expiryMs,
        entryPrice: roundSymbolPrice(entryPrice, symbol),
        stopLossPrice: roundSymbolPrice(stopLossPrice, symbol),
        takeProfitPrice: roundSymbolPrice(takeProfitPrice, symbol),
        riskRewardRatio,
        evidenceIds: {
          sweepId: evidenceRefs.sweepId ? String(evidenceRefs.sweepId) : undefined,
          fvgId: evidenceRefs.fvgId ? String(evidenceRefs.fvgId) : undefined,
          bosId: evidenceRefs.bosId ? String(evidenceRefs.bosId) : undefined,
          contextSwingId: evidenceRefs.contextSwingId ? String(evidenceRefs.contextSwingId) : undefined,
        },
        rationale: rationaleText,
        ruleProvenance: provenance,
        status: 'PENDING_CONFIRMATION',

        // فیلدهای ضد نگاه به آینده الزامی Package 4A.1
        signalTimestamp: currentCandle.timestamp,
        evidenceAvailableAt: evaluatedAt,
        decisionAt: evaluatedAt,
        eligibleFromTimestamp: evaluatedAt,
      };

      break; // اولین کاندیدای معتبر استخراج شد
    }

    return {
      runId,
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      definitionHash: definition.metadata.integrityHash || definition.metadata.deterministicHash,
      datasetFingerprint,
      direction: bestCandidate ? bestCandidate.direction : winningDirection,
      signalTimestamp: currentCandle.timestamp,
      evaluatedAt,
      eligibleFromTimestamp: evaluatedAt,
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
