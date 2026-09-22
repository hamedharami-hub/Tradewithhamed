// lib/core/composite-rule-evaluator.ts
// موتور قطعی ارزیابی قواعد ترکیبی (Package 4A.1 Composite Rule Evaluator)
// پشتیبانی کامل و دقیق از جدول درستی عملگرهای منطقی: ALL, ANY, AT_LEAST_N, NOT, SEQUENCE_WITHIN_BARS
// مدیریت ایزوله وضعیت توالی بر مبنای SequenceStateStore و چرخه حیات صریح

import type {
  CompositeRuleGroup,
  GroupEvaluationResult,
  RuleEvaluationResult,
  RuleEvaluationStatus,
  SequenceStateEntry,
  RuleEvaluationContext,
} from '../contracts/strategy-definition';
import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import { getCandleCloseTimestamp } from '../contracts/market';
import { RuleRegistry } from './rule-registry';

export interface GroupValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * اعتبارسنجی پیش از اجرای ساختار گروه قواعد
 */
export function validateCompositeGroup(group: CompositeRuleGroup): GroupValidationResult {
  const errors: string[] = [];
  if (!group || typeof group !== 'object') {
    return { valid: false, errors: ['گروه شروط باید یک شیء معتبر باشد.'] };
  }
  if (!group.groupId || typeof group.groupId !== 'string') {
    errors.push('شناسه groupId در گروه شروط الزامی است.');
  }

  const activeRules = (group.rules || []).filter(r => r.enabled !== false);
  const activeNested = group.nestedGroups || [];
  const activeSteps = group.sequenceSteps || [];

  switch (group.operator) {
    case 'ALL': {
      if (activeRules.length === 0 && activeNested.length === 0) {
        errors.push(`گروه ALL با شناسه '${group.groupId}' نمی‌تواند خالی باشد.`);
      }
      break;
    }
    case 'ANY': {
      if (activeRules.length === 0 && activeNested.length === 0) {
        errors.push(`گروه ANY با شناسه '${group.groupId}' نمی‌تواند خالی باشد.`);
      }
      break;
    }
    case 'AT_LEAST_N': {
      const totalOperands = activeRules.length + activeNested.length;
      if (totalOperands === 0) {
        errors.push(`گروه AT_LEAST_N با شناسه '${group.groupId}' نمی‌تواند خالی باشد.`);
      }
      if (
        group.atLeastNCount === undefined ||
        !Number.isInteger(group.atLeastNCount) ||
        group.atLeastNCount < 1 ||
        group.atLeastNCount > totalOperands
      ) {
        errors.push(
          `مقدار atLeastNCount در گروه '${group.groupId}' باید یک عدد صحیح بین 1 و تعداد عملوندها (${totalOperands}) باشد.`
        );
      }
      break;
    }
    case 'NOT': {
      const totalOperands = activeRules.length + activeNested.length;
      if (totalOperands !== 1) {
        errors.push(
          `عملگر NOT در گروه '${group.groupId}' باید دقیقاً یک عملوند فعال داشته باشد. تعداد کنونی: ${totalOperands}.`
        );
      }
      break;
    }
    case 'SEQUENCE_WITHIN_BARS': {
      if (activeSteps.length === 0) {
        errors.push(`توالی کندلی در گروه '${group.groupId}' نمی‌تواند خالی باشد.`);
      }
      if (!group.maxBarsWindow || group.maxBarsWindow <= 0) {
        errors.push(`پارامتر maxBarsWindow در توالی '${group.groupId}' باید یک عدد مثبت باشد.`);
      }
      const seenStepIndices = new Set<number>();
      for (let i = 0; i < activeSteps.length; i++) {
        const step = activeSteps[i];
        if (step.stepIndex !== i) {
          errors.push(
            `گام‌های توالی در '${group.groupId}' باید مرتب و پیوسته باشند (گام ${i} دارای stepIndex=${step.stepIndex} است).`
          );
        }
        if (seenStepIndices.has(step.stepIndex)) {
          errors.push(`گام تکراری ${step.stepIndex} در توالی '${group.groupId}'.`);
        }
        seenStepIndices.add(step.stepIndex);
        if (step.maxBarsFromPrevious !== undefined && step.maxBarsFromPrevious <= 0) {
          errors.push(`مقدار maxBarsFromPrevious در گام ${step.stepIndex} باید مثبت باشد.`);
        }
      }
      break;
    }
    default:
      errors.push(`عملگر ناشناخته '${(group as unknown as { operator: string }).operator}' در گروه '${group.groupId}'.`);
  }

  // اعتبارسنجی بازگشتی زیرگروه‌ها
  for (const nested of activeNested) {
    const subRes = validateCompositeGroup(nested);
    if (!subRes.valid) {
      errors.push(...subRes.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * مخزن ایزوله وضعیت توالی‌ها با چرخه حیات صریح (SequenceStateStore)
 */
export class SequenceStateStore {
  private static runs = new Map<string, Map<string, SequenceStateEntry>>();

  public static getCompositeKey(
    runId: string,
    definitionId: string,
    definitionVersion: string,
    definitionHash: string,
    datasetFingerprint: string,
    symbol: SymbolId,
    timeframe: Timeframe,
    direction: 'BUY' | 'SELL',
    groupId: string
  ): string {
    return `${runId}:${definitionId}:${definitionVersion}:${definitionHash}:${datasetFingerprint}:${symbol}:${timeframe}:${direction}:${groupId}`;
  }

  public static createRun(runId: string): void {
    if (!this.runs.has(runId)) {
      this.runs.set(runId, new Map());
    }
  }

  public static getState(runId: string, key: string): SequenceStateEntry | undefined {
    return this.runs.get(runId)?.get(key);
  }

  public static setState(runId: string, key: string, state: SequenceStateEntry): void {
    let runMap = this.runs.get(runId);
    if (!runMap) {
      runMap = new Map();
      this.runs.set(runId, runMap);
    }
    runMap.set(key, state);
  }

  public static resetRun(runId: string): void {
    this.runs.get(runId)?.clear();
  }

  public static disposeRun(runId: string): void {
    this.runs.delete(runId);
  }

  public static clearAll(): void {
    this.runs.clear();
  }

  public static getRunCount(): number {
    return this.runs.size;
  }

  public static getAllRuns(): Map<string, Map<string, SequenceStateEntry>> {
    return this.runs;
  }
}

export class CompositeRuleEvaluator {
  public static clearAllSequenceStates(): void {
    SequenceStateStore.clearAll();
  }

  public static getSequenceState(
    symbol: SymbolId,
    definitionId: string,
    direction: 'BUY' | 'SELL',
    groupId: string,
    runId?: string
  ): SequenceStateEntry | undefined {
    if (runId) {
      const runMap = SequenceStateStore.getAllRuns().get(runId);
      if (runMap) {
        for (const state of runMap.values()) {
          if (
            state.symbol === symbol &&
            state.definitionId === definitionId &&
            state.direction === direction &&
            state.sequenceGroupId === groupId
          ) {
            return state;
          }
        }
      }
    }
    for (const runMap of SequenceStateStore.getAllRuns().values()) {
      for (const state of runMap.values()) {
        if (
          state.symbol === symbol &&
          state.definitionId === definitionId &&
          state.direction === direction &&
          state.sequenceGroupId === groupId
        ) {
          return state;
        }
      }
    }
    return undefined;
  }
  /**
   * ارزیابی بازگشتی یک گروه از قواعد با پشتیبانی از جدول درستی کامل
   */
  public static evaluateGroup(
    group: CompositeRuleGroup,
    ctx: RuleEvaluationContext
  ): GroupEvaluationResult {
    // اعتبارسنجی ساختار گروه پیش از اجرا
    const validation = validateCompositeGroup(group);
    const currentCandle = ctx.candles[ctx.currentIndex];
    const timestamp = currentCandle?.timestamp || 0;
    const closeTime = currentCandle ? getCandleCloseTimestamp(currentCandle, ctx.timeframe) : timestamp;

    if (!validation.valid) {
      return {
        groupId: group.groupId,
        operator: group.operator,
        status: 'FAIL',
        childEvaluations: [],
        passedCount: 0,
        totalCount: 0,
        reasonCodes: ['INVALID_GROUP_STRUCTURE', ...validation.errors],
      };
    }

    // ۱. ارزیابی عملگر توالی کندلی (SEQUENCE_WITHIN_BARS)
    if (group.operator === 'SEQUENCE_WITHIN_BARS') {
      return this.evaluateSequenceGroup(group, ctx);
    }

    // ۲. ارزیابی عملگر NOT (نقیض)
    if (group.operator === 'NOT') {
      return this.evaluateNotGroup(group, ctx);
    }

    // ۳. ارزیابی قواعد ساده داخل گروه (با مدیریت اتصال کوتاه و ثبت NOT_EVALUATED)
    const childEvaluations: RuleEvaluationResult[] = [];
    const nestedGroupEvaluations: GroupEvaluationResult[] = [];
    const rules = (group.rules || []).filter(r => r.enabled !== false);

    let shortCircuit = false;
    let shortCircuitReason = '';

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (shortCircuit) {
        childEvaluations.push({
          ruleId: rule.ruleId,
          ruleVersion: rule.ruleVersion,
          instanceId: rule.instanceId,
          category: 'TRIGGER',
          status: 'NOT_EVALUATED',
          eventTime: timestamp,
          observedAt: closeTime,
          availableAt: closeTime,
          evaluatedAt: ctx.evaluatedAt,
          inputFingerprint: '',
          parameterHash: '',
          evidenceRefs: {},
          actualValues: {},
          thresholdValues: {},
          reasonCodes: ['SHORT_CIRCUITED'],
          diagnosticMessageFa: shortCircuitReason,
        });
        continue;
      }

      const evalRes = RuleRegistry.evaluateInstance(rule, ctx);
      childEvaluations.push(evalRes);

      // بررسی شرایط قطع منطقی در ALL و ANY
      if (group.operator === 'ALL' && evalRes.status === 'FAIL') {
        shortCircuit = true;
        shortCircuitReason = `قاعده ${rule.ruleId} برقرار نشد (FAIL)؛ ادامه شروط در ALL ارزیابی نشدند.`;
      } else if (group.operator === 'ANY' && evalRes.status === 'PASS') {
        shortCircuit = true;
        shortCircuitReason = `قاعده ${rule.ruleId} برقرار شد (PASS)؛ ادامه شروط در ANY نادیده گرفته شدند.`;
      }
    }

    // ۴. ارزیابی زیرگروه‌های تو در تو (Nested Groups)
    const nested = group.nestedGroups || [];
    for (let i = 0; i < nested.length; i++) {
      const subGroup = nested[i];
      if (shortCircuit) {
        nestedGroupEvaluations.push({
          groupId: subGroup.groupId,
          operator: subGroup.operator,
          status: 'NOT_EVALUATED',
          childEvaluations: [],
          passedCount: 0,
          totalCount: 0,
          reasonCodes: ['SHORT_CIRCUITED'],
        });
        continue;
      }

      const subResult = this.evaluateGroup(subGroup, ctx);
      nestedGroupEvaluations.push(subResult);

      if (group.operator === 'ALL' && subResult.status === 'FAIL') {
        shortCircuit = true;
        shortCircuitReason = `زیرگروه ${subGroup.groupId} برقرار نشد (FAIL)؛ ادامه ارزیابی متوقف شد.`;
      } else if (group.operator === 'ANY' && subResult.status === 'PASS') {
        shortCircuit = true;
        shortCircuitReason = `زیرگروه ${subGroup.groupId} برقرار شد (PASS)؛ ادامه ارزیابی متوقف شد.`;
      }
    }

    // ۵. جدول درستی دقیق عملگرها
    const allChildStatuses: RuleEvaluationStatus[] = [
      ...childEvaluations.map(r => r.status),
      ...nestedGroupEvaluations.map(g => g.status),
    ];

    const passedCount = allChildStatuses.filter(s => s === 'PASS').length;
    const failedCount = allChildStatuses.filter(s => s === 'FAIL').length;
    const pendingCount = allChildStatuses.filter(s => s === 'PENDING').length;
    const notAvailableCount = allChildStatuses.filter(s => s === 'NOT_AVAILABLE').length;
    const totalCount = allChildStatuses.filter(s => s !== 'NOT_EVALUATED').length;

    let status: RuleEvaluationStatus = 'FAIL';
    const reasonCodes: string[] = [];

    if (group.operator === 'ALL') {
      if (failedCount > 0) {
        status = 'FAIL';
        reasonCodes.push('AT_LEAST_ONE_RULE_FAILED');
      } else if (pendingCount > 0) {
        status = 'PENDING';
        reasonCodes.push('RULES_PENDING');
      } else if (notAvailableCount > 0) {
        status = 'NOT_AVAILABLE';
        reasonCodes.push('DATA_OR_WARMUP_NOT_AVAILABLE');
      } else if (passedCount === totalCount && totalCount > 0) {
        status = 'PASS';
        reasonCodes.push('ALL_RULES_PASSED');
      } else {
        status = 'FAIL';
        reasonCodes.push('EMPTY_OR_UNRESOLVED_GROUP');
      }
    } else if (group.operator === 'ANY') {
      if (passedCount > 0) {
        status = 'PASS';
        reasonCodes.push('AT_LEAST_ONE_RULE_PASSED');
      } else if (pendingCount > 0) {
        status = 'PENDING';
        reasonCodes.push('NO_PASS_YET_PENDING');
      } else if (notAvailableCount > 0) {
        status = 'NOT_AVAILABLE';
        reasonCodes.push('NO_PASS_DATA_NOT_AVAILABLE');
      } else {
        status = 'FAIL';
        reasonCodes.push('ALL_RULES_FAILED');
      }
    } else if (group.operator === 'AT_LEAST_N') {
      const requiredN = group.atLeastNCount ?? 1;
      if (passedCount >= requiredN) {
        status = 'PASS';
        reasonCodes.push(`AT_LEAST_${requiredN}_RULES_PASSED`);
      } else if (passedCount + pendingCount + notAvailableCount < requiredN) {
        // امکان ریاضی رسیدن به N وجود ندارد
        status = 'FAIL';
        reasonCodes.push(`MATHEMATICALLY_UNREACHABLE_N_${requiredN}`);
      } else if (pendingCount > 0) {
        status = 'PENDING';
        reasonCodes.push('PENDING_REACHABLE');
      } else if (notAvailableCount > 0) {
        status = 'NOT_AVAILABLE';
        reasonCodes.push('NOT_AVAILABLE_REACHABLE');
      } else {
        status = 'FAIL';
        reasonCodes.push(`REQUIRED_${requiredN}_BUT_GOT_${passedCount}`);
      }
    }

    return {
      groupId: group.groupId,
      operator: group.operator,
      status,
      childEvaluations,
      nestedGroupEvaluations,
      passedCount,
      totalCount,
      reasonCodes,
    };
  }

  /**
   * ارزیابی گروه با عملگر NOT
   */
  private static evaluateNotGroup(
    group: CompositeRuleGroup,
    ctx: RuleEvaluationContext
  ): GroupEvaluationResult {
    const rules = (group.rules || []).filter(r => r.enabled !== false);
    const nested = group.nestedGroups || [];
    const childEvaluations: RuleEvaluationResult[] = [];
    const nestedGroupEvaluations: GroupEvaluationResult[] = [];

    let innerStatus: RuleEvaluationStatus = 'FAIL';

    if (rules.length === 1) {
      const res = RuleRegistry.evaluateInstance(rules[0], ctx);
      childEvaluations.push(res);
      innerStatus = res.status;
    } else if (nested.length === 1) {
      const subRes = this.evaluateGroup(nested[0], ctx);
      nestedGroupEvaluations.push(subRes);
      innerStatus = subRes.status;
    } else {
      return {
        groupId: group.groupId,
        operator: 'NOT',
        status: 'FAIL',
        childEvaluations: [],
        passedCount: 0,
        totalCount: 0,
        reasonCodes: ['INVALID_NOT_OPERANDS_COUNT'],
      };
    }

    let status: RuleEvaluationStatus = 'FAIL';
    const reasonCodes: string[] = [];

    if (innerStatus === 'NOT_AVAILABLE') {
      status = 'NOT_AVAILABLE';
      reasonCodes.push('NOT_OPERAND_NOT_AVAILABLE');
    } else if (innerStatus === 'PENDING') {
      status = 'PENDING';
      reasonCodes.push('NOT_OPERAND_PENDING');
    } else if (innerStatus === 'NOT_EVALUATED') {
      status = 'NOT_EVALUATED';
      reasonCodes.push('NOT_OPERAND_NOT_EVALUATED');
    } else if (innerStatus === 'PASS') {
      status = 'FAIL';
      reasonCodes.push('NOT_INVERTED_PASS_TO_FAIL');
    } else if (innerStatus === 'FAIL') {
      status = 'PASS';
      reasonCodes.push('NOT_INVERTED_FAIL_TO_PASS');
    }

    return {
      groupId: group.groupId,
      operator: 'NOT',
      status,
      childEvaluations,
      nestedGroupEvaluations,
      passedCount: status === 'PASS' ? 1 : 0,
      totalCount: 1,
      reasonCodes,
    };
  }

  /**
   * ارزیابی توالی کندلی (SEQUENCE_WITHIN_BARS) با ایزولاسیون کامل و بدون نشت وضعیت
   */
  private static evaluateSequenceGroup(
    group: CompositeRuleGroup,
    ctx: RuleEvaluationContext
  ): GroupEvaluationResult {
    const sequenceSteps = group.sequenceSteps || [];
    const currentCandle = ctx.candles[ctx.currentIndex];
    const timestamp = currentCandle?.timestamp || 0;
    const closeTime = currentCandle ? getCandleCloseTimestamp(currentCandle, ctx.timeframe) : timestamp;

    const effectiveRunId = ctx.runId || 'default';
    const defVersion = ctx.definitionVersion || '1.0.0';
    const defHash = ctx.definitionHash || '';
    const datasetFp = ctx.datasetFingerprint || `${ctx.symbol}_${ctx.timeframe}`;

    const stateKey = SequenceStateStore.getCompositeKey(
      effectiveRunId,
      ctx.definitionId,
      defVersion,
      defHash,
      datasetFp,
      ctx.symbol,
      ctx.timeframe,
      ctx.direction,
      group.groupId
    );

    let state = SequenceStateStore.getState(effectiveRunId, stateKey);

    if (!state) {
      state = {
        runId: effectiveRunId,
        sequenceGroupId: group.groupId,
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        direction: ctx.direction,
        definitionId: ctx.definitionId,
        definitionVersion: defVersion,
        definitionHash: defHash,
        datasetFingerprint: datasetFp,
        currentStepIndex: 0,
        totalSteps: sequenceSteps.length,
        isExpired: false,
        isInvalidated: false,
        isComplete: false,
        history: [],
      };
      SequenceStateStore.setState(effectiveRunId, stateKey, state);
    }

    if (sequenceSteps.length === 0) {
      return {
        groupId: group.groupId,
        operator: 'SEQUENCE_WITHIN_BARS',
        status: 'FAIL',
        childEvaluations: [],
        sequenceState: { ...state },
        passedCount: 0,
        totalCount: 0,
        reasonCodes: ['EMPTY_SEQUENCE_INVALID'],
      };
    }

    const currentStepRule = sequenceSteps[state.currentStepIndex];

    // ۱. بررسی شروط ابطال (Invalidation Conditions)
    if (state.currentStepIndex > 0 && currentStepRule?.invalidationConditions) {
      for (const invRule of currentStepRule.invalidationConditions) {
        const invRes = RuleRegistry.evaluateInstance(invRule, ctx);
        if (invRes.status === 'PASS') {
          state.isInvalidated = true;
          state.currentStepIndex = 0;
          state.history = [];
          SequenceStateStore.setState(ctx.runId, stateKey, state);

          return {
            groupId: group.groupId,
            operator: 'SEQUENCE_WITHIN_BARS',
            status: 'FAIL',
            childEvaluations: [invRes],
            sequenceState: { ...state },
            passedCount: 0,
            totalCount: sequenceSteps.length,
            reasonCodes: ['SEQUENCE_INVALIDATED'],
          };
        }
      }
    }

    // ۲. بررسی انقضای زمانی بر مبنای تعداد کندل‌های گذشته
    const maxWindow = group.maxBarsWindow ?? 20;
    const maxStepBars = currentStepRule?.maxBarsFromPrevious ?? maxWindow;

    if (state.currentStepIndex > 0 && state.lastStepMatchedTimestamp) {
      const lastCandleIdx = ctx.candles.findIndex(c => c.timestamp === state?.lastStepMatchedTimestamp);
      if (lastCandleIdx !== -1) {
        const barsElapsed = ctx.currentIndex - lastCandleIdx;
        if (barsElapsed > maxStepBars) {
          state.isExpired = true;
          state.currentStepIndex = 0;
          state.history = [];
          SequenceStateStore.setState(ctx.runId, stateKey, state);
        }
      }
    }

    // ۳. ارزیابی گام جاری
    const targetStep = sequenceSteps[state.currentStepIndex];
    if (!targetStep) {
      state.currentStepIndex = 0;
      SequenceStateStore.setState(ctx.runId, stateKey, state);
      return {
        groupId: group.groupId,
        operator: 'SEQUENCE_WITHIN_BARS',
        status: 'FAIL',
        childEvaluations: [],
        sequenceState: { ...state },
        passedCount: 0,
        totalCount: sequenceSteps.length,
        reasonCodes: ['INVALID_SEQUENCE_STEP'],
      };
    }

    const evalRes = RuleRegistry.evaluateInstance(targetStep.ruleInstance, ctx);

    if (evalRes.status === 'PASS') {
      state.history.push({
        stepIndex: state.currentStepIndex,
        matchedAtTimestamp: closeTime,
        ruleId: targetStep.ruleInstance.ruleId,
      });
      state.lastStepMatchedTimestamp = timestamp;
      if (state.currentStepIndex === 0) {
        state.startedAtTimestamp = timestamp;
      }

      state.currentStepIndex++;

      // بررسی تکمیل کل توالی
      if (state.currentStepIndex >= sequenceSteps.length) {
        state.isComplete = true;
        // گرفتن کپی قطعی و تغییرناپذیر از وضعیت تکمیل‌شده
        const completedSnapshot: SequenceStateEntry = JSON.parse(JSON.stringify(state));

        // ریست وضعیت برای چرخه بعدی در Store بدون تخریب snapshot فعلی
        state.currentStepIndex = 0;
        state.isComplete = false;
        state.history = [];
        SequenceStateStore.setState(ctx.runId, stateKey, state);

        return {
          groupId: group.groupId,
          operator: 'SEQUENCE_WITHIN_BARS',
          status: 'PASS',
          childEvaluations: [evalRes],
          sequenceState: completedSnapshot,
          passedCount: sequenceSteps.length,
          totalCount: sequenceSteps.length,
          reasonCodes: ['SEQUENCE_COMPLETED'],
        };
      }

      SequenceStateStore.setState(ctx.runId, stateKey, state);

      return {
        groupId: group.groupId,
        operator: 'SEQUENCE_WITHIN_BARS',
        status: 'PENDING',
        childEvaluations: [evalRes],
        sequenceState: { ...state },
        passedCount: state.currentStepIndex,
        totalCount: sequenceSteps.length,
        reasonCodes: [`SEQUENCE_STEP_${state.currentStepIndex - 1}_MATCHED`],
      };
    }

    SequenceStateStore.setState(ctx.runId, stateKey, state);

    return {
      groupId: group.groupId,
      operator: 'SEQUENCE_WITHIN_BARS',
      status: state.currentStepIndex > 0 ? 'PENDING' : 'FAIL',
      childEvaluations: [evalRes],
      sequenceState: { ...state },
      passedCount: state.currentStepIndex,
      totalCount: sequenceSteps.length,
      reasonCodes: [
        state.currentStepIndex > 0
          ? 'SEQUENCE_WAITING_FOR_NEXT_STEP'
          : 'SEQUENCE_INITIAL_STEP_NOT_MATCHED',
      ],
    };
  }
}
