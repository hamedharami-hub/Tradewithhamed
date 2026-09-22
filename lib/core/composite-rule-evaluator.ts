// lib/core/composite-rule-evaluator.ts
// موتور قطعی ارزیابی قواعد ترکیبی (Package 4A Composite Rule Evaluator)
// پشتیبانی از عملگرهای منطقی: ALL, ANY, AT_LEAST_N, NOT, SEQUENCE_WITHIN_BARS
// مدیریت ایزوله وضعیت توالی برای هر جفت‌ارز + استراتژی + جهت + گروه

import type {
  CompositeRuleGroup,
  GroupEvaluationResult,
  RuleEvaluationResult,
  RuleEvaluationStatus,
  SequenceStateEntry,
  DataCapability,
} from '../contracts/strategy-definition';
import type { Candle, SymbolId, Timeframe } from '../contracts/market';
import type { VolumeType } from '../contracts/dataset-contract';
import { RuleRegistry } from './rule-registry';

export interface EvaluationContext {
  candles: Candle[];
  currentIndex: number;
  symbol: SymbolId;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  definitionId: string;
  availableCapabilities: DataCapability[];
  currentVolumeType?: VolumeType;
}

export class CompositeRuleEvaluator {
  // مخزن ایزوله وضعیت توالی‌ها بر اساس کلید: symbol:definitionId:direction:groupId
  private static sequenceStates = new Map<string, SequenceStateEntry>();

  public static getSequenceKey(
    symbol: SymbolId,
    definitionId: string,
    direction: 'BUY' | 'SELL',
    groupId: string
  ): string {
    return `${symbol}:${definitionId}:${direction}:${groupId}`;
  }

  public static getSequenceState(
    symbol: SymbolId,
    definitionId: string,
    direction: 'BUY' | 'SELL',
    groupId: string
  ): SequenceStateEntry | undefined {
    return this.sequenceStates.get(this.getSequenceKey(symbol, definitionId, direction, groupId));
  }

  public static resetSequenceState(
    symbol: SymbolId,
    definitionId: string,
    direction: 'BUY' | 'SELL',
    groupId: string
  ): void {
    this.sequenceStates.delete(this.getSequenceKey(symbol, definitionId, direction, groupId));
  }

  public static clearAllSequenceStates(): void {
    this.sequenceStates.clear();
  }

  /**
   * ارزیابی بازگشتی یک گروه از قواعد
   */
  public static evaluateGroup(
    group: CompositeRuleGroup,
    ctx: EvaluationContext
  ): GroupEvaluationResult {
    const childEvaluations: RuleEvaluationResult[] = [];
    const nestedGroupEvaluations: GroupEvaluationResult[] = [];
    const currentCandle = ctx.candles[ctx.currentIndex];
    const timestamp = currentCandle?.timestamp || 0;

    // ۱. ارزیابی عملگر توالی کندلی (SEQUENCE_WITHIN_BARS)
    if (group.operator === 'SEQUENCE_WITHIN_BARS') {
      return this.evaluateSequenceGroup(group, ctx);
    }

    // ۲. ارزیابی عملگر NOT (نقیض)
    if (group.operator === 'NOT') {
      return this.evaluateNotGroup(group, ctx);
    }

    // ۳. ارزیابی قواعد ساده داخل گروه (با مدیریت اتصال کوتاه و ثبت NOT_EVALUATED)
    const rules = group.rules || [];
    let shortCircuit = false;
    let shortCircuitReason = '';

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.enabled === false) continue;

      if (shortCircuit) {
        childEvaluations.push({
          ruleId: rule.ruleId,
          ruleVersion: rule.ruleVersion,
          instanceId: rule.instanceId,
          category: 'TRIGGER',
          status: 'NOT_EVALUATED',
          eventTime: timestamp,
          observedAt: timestamp,
          availableAt: timestamp,
          evaluatedAt: timestamp,
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

      const evalRes = RuleRegistry.evaluateInstance(
        rule,
        ctx.candles,
        ctx.currentIndex,
        ctx.symbol,
        ctx.timeframe,
        ctx.availableCapabilities,
        ctx.currentVolumeType
      );
      childEvaluations.push(evalRes);

      // بررسی شرایط قطع منطقی
      if (group.operator === 'ALL' && evalRes.status !== 'PASS') {
        shortCircuit = true;
        shortCircuitReason = `قاعده ${rule.ruleId} برقرار نشد؛ ادامه شروط در ALL ارزیابی نشدند.`;
      } else if (group.operator === 'ANY' && evalRes.status === 'PASS') {
        shortCircuit = true;
        shortCircuitReason = `قاعده ${rule.ruleId} برقرار شد؛ ادامه شروط در ANY نادیده گرفته شدند.`;
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

      if (group.operator === 'ALL' && subResult.status !== 'PASS') {
        shortCircuit = true;
        shortCircuitReason = `زیرگروه ${subGroup.groupId} برقرار نشد؛ ادامه ارزیابی متوقف شد.`;
      } else if (group.operator === 'ANY' && subResult.status === 'PASS') {
        shortCircuit = true;
        shortCircuitReason = `زیرگروه ${subGroup.groupId} برقرار شد؛ ادامه ارزیابی متوقف شد.`;
      }
    }

    // ۵. محاسبه وضعیت نهایی گروه
    const allChildStatuses: RuleEvaluationStatus[] = [
      ...childEvaluations.map(r => r.status),
      ...nestedGroupEvaluations.map(g => g.status),
    ];

    const passedCount = allChildStatuses.filter(s => s === 'PASS').length;
    const totalCount = allChildStatuses.filter(s => s !== 'NOT_EVALUATED').length;
    const hasNotAvailable = allChildStatuses.some(s => s === 'NOT_AVAILABLE');

    let status: RuleEvaluationStatus = 'FAIL';
    const reasonCodes: string[] = [];

    if (totalCount === 0) {
      status = 'PASS';
      reasonCodes.push('EMPTY_GROUP_PASSED');
    } else if (hasNotAvailable) {
      status = 'NOT_AVAILABLE';
      reasonCodes.push('SUB_EVALUATION_NOT_AVAILABLE');
    } else if (group.operator === 'ALL') {
      if (passedCount === totalCount && totalCount > 0) {
        status = 'PASS';
        reasonCodes.push('ALL_RULES_PASSED');
      } else {
        status = 'FAIL';
        reasonCodes.push('SOME_RULES_FAILED');
      }
    } else if (group.operator === 'ANY') {
      if (passedCount > 0) {
        status = 'PASS';
        reasonCodes.push('ANY_RULE_PASSED');
      } else {
        status = 'FAIL';
        reasonCodes.push('NO_RULES_PASSED');
      }
    } else if (group.operator === 'AT_LEAST_N') {
      const requiredN = group.atLeastNCount ?? 1;
      if (passedCount >= requiredN) {
        status = 'PASS';
        reasonCodes.push(`AT_LEAST_${requiredN}_RULES_PASSED`);
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
    ctx: EvaluationContext
  ): GroupEvaluationResult {
    const rules = group.rules || [];
    const nested = group.nestedGroups || [];
    const childEvaluations: RuleEvaluationResult[] = [];
    const nestedGroupEvaluations: GroupEvaluationResult[] = [];

    let innerPassed = false;
    let innerNotAvailable = false;

    if (rules.length > 0) {
      const r = rules[0];
      const res = RuleRegistry.evaluateInstance(
        r,
        ctx.candles,
        ctx.currentIndex,
        ctx.symbol,
        ctx.timeframe,
        ctx.availableCapabilities,
        ctx.currentVolumeType
      );
      childEvaluations.push(res);
      if (res.status === 'PASS') innerPassed = true;
      if (res.status === 'NOT_AVAILABLE') innerNotAvailable = true;
    } else if (nested.length > 0) {
      const subRes = this.evaluateGroup(nested[0], ctx);
      nestedGroupEvaluations.push(subRes);
      if (subRes.status === 'PASS') innerPassed = true;
      if (subRes.status === 'NOT_AVAILABLE') innerNotAvailable = true;
    }

    let status: RuleEvaluationStatus = 'FAIL';
    const reasonCodes: string[] = [];

    if (innerNotAvailable) {
      status = 'NOT_AVAILABLE';
      reasonCodes.push('NOT_OPERAND_NOT_AVAILABLE');
    } else if (!innerPassed) {
      status = 'PASS';
      reasonCodes.push('NOT_CONDITION_MET');
    } else {
      status = 'FAIL';
      reasonCodes.push('NOT_CONDITION_VIOLATED');
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
   * ارزیابی توالی کندلی (SEQUENCE_WITHIN_BARS)
   */
  private static evaluateSequenceGroup(
    group: CompositeRuleGroup,
    ctx: EvaluationContext
  ): GroupEvaluationResult {
    const sequenceSteps = group.sequenceSteps || [];
    const key = this.getSequenceKey(ctx.symbol, ctx.definitionId, ctx.direction, group.groupId);
    let state = this.sequenceStates.get(key);
    const currentCandle = ctx.candles[ctx.currentIndex];
    const timestamp = currentCandle?.timestamp || 0;

    if (!state) {
      state = {
        sequenceGroupId: group.groupId,
        symbol: ctx.symbol,
        direction: ctx.direction,
        definitionId: ctx.definitionId,
        currentStepIndex: 0,
        totalSteps: sequenceSteps.length,
        isExpired: false,
        isInvalidated: false,
        isComplete: false,
        history: [],
      };
      this.sequenceStates.set(key, state);
    }

    if (sequenceSteps.length === 0) {
      return {
        groupId: group.groupId,
        operator: 'SEQUENCE_WITHIN_BARS',
        status: 'PASS',
        childEvaluations: [],
        sequenceState: state,
        passedCount: 0,
        totalCount: 0,
        reasonCodes: ['EMPTY_SEQUENCE_PASSED'],
      };
    }

    const currentStepRule = sequenceSteps[state.currentStepIndex];

    // ۱. بررسی ابطال (Invalidation)
    if (state.currentStepIndex > 0 && currentStepRule?.invalidationConditions) {
      for (const invRule of currentStepRule.invalidationConditions) {
        const invRes = RuleRegistry.evaluateInstance(
          invRule,
          ctx.candles,
          ctx.currentIndex,
          ctx.symbol,
          ctx.timeframe,
          ctx.availableCapabilities,
          ctx.currentVolumeType
        );
        if (invRes.status === 'PASS') {
          state.isInvalidated = true;
          state.currentStepIndex = 0;
          state.history = [];
          return {
            groupId: group.groupId,
            operator: 'SEQUENCE_WITHIN_BARS',
            status: 'FAIL',
            childEvaluations: [invRes],
            sequenceState: state,
            passedCount: 0,
            totalCount: sequenceSteps.length,
            reasonCodes: ['SEQUENCE_INVALIDATED'],
          };
        }
      }
    }

    // ۲. بررسی انقضای زمانی یا فاصله‌ای (Expiration)
    const maxWindow = group.maxBarsWindow ?? 20;
    const maxStepBars = currentStepRule?.maxBarsFromPrevious ?? maxWindow;

    if (state.currentStepIndex > 0 && state.lastStepMatchedTimestamp) {
      // تخمین تعداد کندل‌های سپری شده از آخرین تطابق بر مبنای ایندکس کندل
      const lastCandleIdx = ctx.candles.findIndex(c => c.timestamp === state?.lastStepMatchedTimestamp);
      if (lastCandleIdx !== -1) {
        const barsElapsed = ctx.currentIndex - lastCandleIdx;
        if (barsElapsed > maxStepBars) {
          state.isExpired = true;
          state.currentStepIndex = 0;
          state.history = [];
        }
      }
    }

    // ۳. ارزیابی گام جاری
    const targetStep = sequenceSteps[state.currentStepIndex];
    if (!targetStep) {
      state.currentStepIndex = 0;
      return {
        groupId: group.groupId,
        operator: 'SEQUENCE_WITHIN_BARS',
        status: 'FAIL',
        childEvaluations: [],
        sequenceState: state,
        passedCount: 0,
        totalCount: sequenceSteps.length,
        reasonCodes: ['INVALID_SEQUENCE_STEP'],
      };
    }

    const evalRes = RuleRegistry.evaluateInstance(
      targetStep.ruleInstance,
      ctx.candles,
      ctx.currentIndex,
      ctx.symbol,
      ctx.timeframe,
      ctx.availableCapabilities,
      ctx.currentVolumeType
    );

    if (evalRes.status === 'PASS') {
      state.history.push({
        stepIndex: state.currentStepIndex,
        matchedAtTimestamp: timestamp,
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
        // پس از تکمیل موفق، وضعیت برای چرخه بعدی ریست می‌شود اما نتیجه جاری PASS بازمی‌گردد
        const completedState: SequenceStateEntry = { ...state };
        state.currentStepIndex = 0;
        state.isComplete = false;
        state.history = [];

        return {
          groupId: group.groupId,
          operator: 'SEQUENCE_WITHIN_BARS',
          status: 'PASS',
          childEvaluations: [evalRes],
          sequenceState: completedState,
          passedCount: sequenceSteps.length,
          totalCount: sequenceSteps.length,
          reasonCodes: ['SEQUENCE_COMPLETED'],
        };
      }

      // در حال پیشرفت در توالی
      return {
        groupId: group.groupId,
        operator: 'SEQUENCE_WITHIN_BARS',
        status: 'PENDING',
        childEvaluations: [evalRes],
        sequenceState: state,
        passedCount: state.currentStepIndex,
        totalCount: sequenceSteps.length,
        reasonCodes: [`SEQUENCE_STEP_${state.currentStepIndex - 1}_MATCHED`],
      };
    }

    // گام جاری برقرار نشد
    return {
      groupId: group.groupId,
      operator: 'SEQUENCE_WITHIN_BARS',
      status: state.currentStepIndex > 0 ? 'PENDING' : 'FAIL',
      childEvaluations: [evalRes],
      sequenceState: state,
      passedCount: state.currentStepIndex,
      totalCount: sequenceSteps.length,
      reasonCodes: [state.currentStepIndex > 0 ? 'SEQUENCE_WAITING_FOR_NEXT_STEP' : 'SEQUENCE_INITIAL_STEP_NOT_MATCHED'],
    };
  }
}
