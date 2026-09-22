// lib/core/strategy-definition-serializer.ts
// سریالایزر قطعی، تولید هش FNV-1a / SHA-256 و اعتبارسنجی اسکیما برای StrategyDefinition

import type { StrategyDefinition, RuleInstance, CompositeRuleGroup } from '../contracts/strategy-definition';
import { STRATEGY_DEFINITION_SCHEMA_VERSION } from '../contracts/strategy-definition';

export class StrategyDefinitionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'StrategyDefinitionError';
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
 * محاسبه هش قطعی FNV-1a (32-bit hex)
 */
export function computeDeterministicHash(data: unknown): string {
  const canonical = JSON.stringify(canonicalizeJson(data));
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * اعتبارسنجی عمیق ساختار یک StrategyDefinition
 */
export function validateStrategyDefinition(def: unknown): StrategyDefinition {
  if (!def || typeof def !== 'object') {
    throw new StrategyDefinitionError('تعریف استراتژی باید یک شیء معتبر باشد.', 'INVALID_OBJECT');
  }

  const s = def as Partial<StrategyDefinition>;

  if (s.schemaVersion !== STRATEGY_DEFINITION_SCHEMA_VERSION) {
    throw new StrategyDefinitionError(
      `نسخه نامعتبر اسکیما: ${s.schemaVersion || 'ناموجود'}. نسخه پشتیبانی‌شده: ${STRATEGY_DEFINITION_SCHEMA_VERSION}`,
      'UNSUPPORTED_SCHEMA_VERSION'
    );
  }

  if (!s.definitionId || typeof s.definitionId !== 'string') {
    throw new StrategyDefinitionError('شناسه definitionId الزامی است.', 'MISSING_ID');
  }

  if (!s.nameFa || typeof s.nameFa !== 'string') {
    throw new StrategyDefinitionError('نام فارسی استراتژی (nameFa) الزامی است.', 'MISSING_NAME_FA');
  }

  if (!s.executionTimeframe) {
    throw new StrategyDefinitionError('تایم‌فریم اجرای استراتژی (executionTimeframe) الزامی است.', 'MISSING_TIMEFRAME');
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

  // بررسی عدم وجود مقادیر تابع یا نمونه کلاس غیرمجاز
  try {
    JSON.stringify(s);
  } catch (err) {
    throw new StrategyDefinitionError(
      `تعریف استراتژی حاوی داده‌های غیرقابل تبدیل به JSON است: ${(err as Error).message}`,
      'NON_SERIALIZABLE'
    );
  }

  return s as StrategyDefinition;
}

/**
 * محاسبه هش استاندارد برای یک StrategyDefinition (بدون در نظر گرفتن خود فیلد هش)
 */
export function calculateStrategyHash(def: StrategyDefinition): string {
  const clone = { ...def, metadata: { ...def.metadata, deterministicHash: '' } };
  return computeDeterministicHash(clone);
}

/**
 * سریالایز کردن استراتژی با درج هش قطعی محتوا
 */
export function serializeStrategyDefinition(def: StrategyDefinition): string {
  const validated = validateStrategyDefinition(def);
  const hash = calculateStrategyHash(validated);
  const copy = { ...validated, metadata: { ...validated.metadata, deterministicHash: hash } };
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
  const recordedHash = def.metadata?.deterministicHash;

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
