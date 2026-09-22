// lib/core/strategy-definition-serializer.ts
// سریالایزر قطعی، تولید هش SHA-256 / FNV-1a و اعتبارسنجی عمیق اسکیما برای StrategyDefinition (Package 4A.1)

import { createHash } from 'node:crypto';
import type { StrategyDefinition, CompositeRuleGroup, RuleInstance } from '../contracts/strategy-definition';
import { STRATEGY_DEFINITION_SCHEMA_VERSION } from '../contracts/strategy-definition';
import { validateCompositeGroup } from './composite-rule-evaluator';
import { RuleRegistry } from './rule-registry';

export class StrategyDefinitionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'StrategyDefinitionError';
  }
}

/**
 * بررسی عمیق و بازگشتی اینکه داده صرفاً شامل مقادیر مجاز و استاندارد JSON باشد.
 * رد قاطع NaN، Infinity، تابع، سیمبل، BigInt، نمونه کلاس‌ها، Map، Set، Date و مرجع چرخه‌ای (Circular Reference).
 */
export function assertPlainJsonValue(value: unknown, path = 'root', seen = new Set<unknown>()): void {
  if (value === null || value === undefined) {
    return;
  }

  const type = typeof value;

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new StrategyDefinitionError(
        `مقدار نامعتبر در مسیر '${path}': اعداد NaN یا Infinity در ساختار استراتژی مجاز نیستند.`,
        'INVALID_NUMERIC_VALUE'
      );
    }
    return;
  }

  if (type === 'string' || type === 'boolean') {
    return;
  }

  if (type === 'function') {
    throw new StrategyDefinitionError(
      `تابع در مسیر '${path}' کشف شد. ساختار استراتژی باید داده خالص (Pure Data) بدون کد اجرایی باشد.`,
      'FUNCTION_NOT_ALLOWED'
    );
  }

  if (type === 'symbol') {
    throw new StrategyDefinitionError(
      `نوع Symbol در مسیر '${path}' مجاز نیست.`,
      'SYMBOL_NOT_ALLOWED'
    );
  }

  if (type === 'bigint') {
    throw new StrategyDefinitionError(
      `نوع BigInt در مسیر '${path}' مجاز نیست.`,
      'BIGINT_NOT_ALLOWED'
    );
  }

  if (type === 'object') {
    if (seen.has(value)) {
      throw new StrategyDefinitionError(
        `مرجع چرخه‌ای (Circular Reference) در مسیر '${path}' شناسایی شد.`,
        'CIRCULAR_REFERENCE'
      );
    }
    seen.add(value);

    if (value instanceof Date) {
      throw new StrategyDefinitionError(
        `شیء Date در مسیر '${path}' مجاز نیست؛ از عدد یونیکس (timestamp) استفاده کنید.`,
        'DATE_OBJECT_NOT_ALLOWED'
      );
    }

    if (value instanceof Map || value instanceof Set) {
      throw new StrategyDefinitionError(
        `کالکشن‌های Map/Set در مسیر '${path}' مجاز نیستند؛ از آرایه یا شیء عادی استفاده کنید.`,
        'COLLECTION_NOT_ALLOWED'
      );
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) {
      throw new StrategyDefinitionError(
        `نمونه کلاس ناشناخته در مسیر '${path}' مجاز نیست؛ فقط اشیای ساده JSON پشتیبانی می‌شوند.`,
        'CLASS_INSTANCE_NOT_ALLOWED'
      );
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        assertPlainJsonValue(value[i], `${path}[${i}]`, seen);
      }
    } else {
      const obj = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        assertPlainJsonValue(v, `${path}.${k}`, seen);
      }
    }

    seen.delete(value);
  }
}

/**
 * مرتب‌سازی کلیدهای شیء به‌صورت بازگشتی برای ایجاد رشته قطعی بدون وابستگی به چینش
 */
export function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    if (obj[key] !== undefined) {
      result[key] = canonicalizeJson(obj[key]);
    }
  }
  return result;
}

/**
 * محاسبه اثرانگشت قطعی سریع FNV-1a (32-bit hex)
 * توجه: این تابع صرفاً برای fingerprinting سریع در حافظه است و به دلیل اندازه ۳۲ بیتی،
 * مقاومت در برابر تصادم (Collision-Resistance) رمزنگاری‌شده ندارد.
 */
export function computeDeterministicFingerprint(data: unknown): string {
  const canonical = JSON.stringify(canonicalizeJson(data));
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * محاسبه هش یکپارچگی رمزنگاری‌شده استاندارد SHA-256 (256-bit hex)
 * جهت تضمین اصالت و عدم دستکاری (Tamper Detection) ساختار استراتژی
 */
export function computeSha256Hash(data: unknown): string {
  const canonical = JSON.stringify(canonicalizeJson(data));
  return createHash('sha256').update(canonical).digest('hex');
}

// برای سازگاری با کدهای موجود
export const computeDeterministicHash = computeSha256Hash;

/**
 * اعتبارسنجی عمیق ساختار یک StrategyDefinition (Package 4A.1)
 */
export function validateStrategyDefinition(def: unknown): StrategyDefinition {
  if (!def || typeof def !== 'object') {
    throw new StrategyDefinitionError('تعریف استراتژی باید یک شیء معتبر باشد.', 'INVALID_OBJECT');
  }

  // ۱. بررسی عدم وجود داده‌های غیرمجاز و توابع
  assertPlainJsonValue(def, 'StrategyDefinition');

  const s = def as Partial<StrategyDefinition>;

  if (s.schemaVersion !== STRATEGY_DEFINITION_SCHEMA_VERSION) {
    throw new StrategyDefinitionError(
      `نسخه نامعتبر اسکیما: ${s.schemaVersion || 'ناموجود'}. نسخه پشتیبانی‌شده: ${STRATEGY_DEFINITION_SCHEMA_VERSION}`,
      'UNSUPPORTED_SCHEMA_VERSION'
    );
  }

  if (!s.definitionId || typeof s.definitionId !== 'string' || s.definitionId.trim() === '') {
    throw new StrategyDefinitionError('شناسه definitionId الزامی است.', 'MISSING_ID');
  }

  if (!s.definitionVersion || typeof s.definitionVersion !== 'string') {
    throw new StrategyDefinitionError('نسخه استراتژی (definitionVersion) الزامی است.', 'MISSING_VERSION');
  }

  if (!s.status || !['DRAFT', 'VALID', 'DEPRECATED'].includes(s.status)) {
    throw new StrategyDefinitionError(`وضعیت استراتژی '${s.status}' معتبر نیست.`, 'INVALID_STATUS');
  }

  if (!s.nameFa || typeof s.nameFa !== 'string') {
    throw new StrategyDefinitionError('نام فارسی استراتژی (nameFa) الزامی است.', 'MISSING_NAME_FA');
  }

  if (!s.executionTimeframe) {
    throw new StrategyDefinitionError('تایم‌فریم اجرای استراتژی (executionTimeframe) الزامی است.', 'MISSING_TIMEFRAME');
  }

  if (s.contextTimeframes) {
    const set = new Set(s.contextTimeframes);
    if (set.size !== s.contextTimeframes.length) {
      throw new StrategyDefinitionError('تایم‌فریم‌های کانتکست (contextTimeframes) نباید تکراری باشند.', 'DUPLICATE_CONTEXT_TIMEFRAMES');
    }
  }

  if (!s.trigger || typeof s.trigger !== 'object') {
    throw new StrategyDefinitionError('گروه ماشه ورود (trigger) الزامی است.', 'MISSING_TRIGGER');
  }

  if (!s.entry || typeof s.entry !== 'object') {
    throw new StrategyDefinitionError('قاعده ورود (entry) الزامی است.', 'MISSING_ENTRY');
  }

  if (!s.risk || typeof s.risk !== 'object') {
    throw new StrategyDefinitionError('قاعده مدیریت ریسک (risk) الزامی است.', 'MISSING_RISK');
  }

  if (!s.exit || typeof s.exit !== 'object') {
    throw new StrategyDefinitionError('قاعده خروج (exit) الزامی است.', 'MISSING_EXIT');
  }

  // ۲. بررسی یکتایی شناسه‌های گروه‌ها (groupId) و قواعد (instanceId) در کل ساختار
  const seenGroupIds = new Set<string>();
  const seenInstanceIds = new Set<string>();

  function traverseGroup(g: CompositeRuleGroup, path: string): void {
    if (seenGroupIds.has(g.groupId)) {
      throw new StrategyDefinitionError(
        `شناسه گروه تکراری '${g.groupId}' در مسیر '${path}' کشف شد.`,
        'DUPLICATE_GROUP_ID'
      );
    }
    seenGroupIds.add(g.groupId);

    const val = validateCompositeGroup(g);
    if (!val.valid) {
      throw new StrategyDefinitionError(
        `خطای اعتبارسنجی در گروه '${g.groupId}': ${val.errors.join('; ')}`,
        'INVALID_GROUP'
      );
    }

    if (g.rules) {
      for (let i = 0; i < g.rules.length; i++) {
        traverseRuleInstance(g.rules[i], `${path}.rules[${i}]`);
      }
    }
    if (g.sequenceSteps) {
      for (let i = 0; i < g.sequenceSteps.length; i++) {
        traverseRuleInstance(g.sequenceSteps[i].ruleInstance, `${path}.sequenceSteps[${i}]`);
      }
    }
    if (g.nestedGroups) {
      for (let i = 0; i < g.nestedGroups.length; i++) {
        traverseGroup(g.nestedGroups[i], `${path}.nestedGroups[${i}]`);
      }
    }
  }

  function traverseRuleInstance(r: RuleInstance, path: string): void {
    if (seenInstanceIds.has(r.instanceId)) {
      throw new StrategyDefinitionError(
        `شناسه قاعده تکراری '${r.instanceId}' در مسیر '${path}' کشف شد.`,
        'DUPLICATE_INSTANCE_ID'
      );
    }
    seenInstanceIds.add(r.instanceId);

    // بررسی ثبت بودن Rule در RuleRegistry در صورت VALID بودن استراتژی
    if (s.status === 'VALID') {
      const def = RuleRegistry.getDefinition(r.ruleId, r.ruleVersion);
      if (!def) {
        throw new StrategyDefinitionError(
          `قاعده ناشناخته '${r.ruleId}@${r.ruleVersion}' در مسیر '${path}' در رجیستری ثبت نشده است.`,
          'RULE_NOT_FOUND_IN_REGISTRY'
        );
      }
    }
  }

  if (s.context) traverseGroup(s.context, 'context');
  if (s.setup) traverseGroup(s.setup, 'setup');
  traverseGroup(s.trigger, 'trigger');
  traverseRuleInstance(s.entry, 'entry');
  traverseRuleInstance(s.risk, 'risk');
  if (s.management) traverseGroup(s.management, 'management');
  traverseGroup(s.exit, 'exit');

  return s as StrategyDefinition;
}

/**
 * محاسبه هش استاندارد برای یک StrategyDefinition با محاسبه SHA-256 و اثرانگشت FNV-1a
 */
export function calculateStrategyHash(def: StrategyDefinition): string {
  const clone = {
    ...def,
    metadata: {
      ...def.metadata,
      deterministicHash: '',
      integrityHash: '',
      deterministicFingerprint: '',
      hashAlgorithm: 'SHA-256' as const,
    },
  };
  return computeSha256Hash(clone);
}

/**
 * سریالایز کردن استراتژی با درج هش قطعی محتوا
 */
export function serializeStrategyDefinition(def: StrategyDefinition): string {
  const validated = validateStrategyDefinition(def);
  const hash = calculateStrategyHash(validated);
  const fingerprint = computeDeterministicFingerprint({
    ...validated,
    metadata: {
      ...validated.metadata,
      deterministicHash: '',
      integrityHash: '',
      deterministicFingerprint: '',
      hashAlgorithm: 'SHA-256',
    },
  });

  const copy: StrategyDefinition = {
    ...validated,
    metadata: {
      ...validated.metadata,
      deterministicHash: hash,
      integrityHash: hash,
      deterministicFingerprint: fingerprint,
      hashAlgorithm: 'SHA-256',
    },
  };

  return JSON.stringify(canonicalizeJson(copy), null, 2);
}

/**
 * دی‌سریالایز کردن استراتژی و تایید اعتبار هش
 */
export function deserializeStrategyDefinition(jsonStr: string): StrategyDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new StrategyDefinitionError(`خطای پارس JSON: ${(err as Error).message}`, 'JSON_PARSE_ERROR');
  }

  const def = validateStrategyDefinition(parsed);
  const recordedHash = def.metadata?.integrityHash || def.metadata?.deterministicHash;

  if (recordedHash) {
    const expectedHash = calculateStrategyHash(def);
    if (recordedHash !== expectedHash) {
      throw new StrategyDefinitionError(
        `عدم تطابق هش استراتژی! ثبت‌شده: ${recordedHash}، مورد انتظار: ${expectedHash}`,
        'HASH_MISMATCH'
      );
    }
  }

  return def;
}

export class StrategyDefinitionSerializer {
  public static serialize(def: StrategyDefinition): string {
    return serializeStrategyDefinition(def);
  }

  public static deserialize(jsonStr: string): StrategyDefinition {
    return deserializeStrategyDefinition(jsonStr);
  }

  public static validate(def: unknown): { valid: boolean; errors?: string[] } {
    try {
      validateStrategyDefinition(def);
      return { valid: true };
    } catch (err) {
      return { valid: false, errors: [(err as Error).message] };
    }
  }
}
