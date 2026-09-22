// lib/contracts/strategy-definition.ts
// قرارداد مرجع و نسخه‌دار تعریف استراتژی، قواعد قابل‌ترکیب و ردیابی تصمیم (Package 4A.1 Canonical Source of Truth)

import type { SymbolId, Timeframe, Candle } from './market';
import type { InstrumentType, VolumeType } from './dataset-contract';
import type { StrategyCandidate } from './strategy';

export const STRATEGY_DEFINITION_SCHEMA_VERSION = '1.0.0' as const;

export type RuleCategory =
  | 'CONTEXT'
  | 'SETUP'
  | 'TRIGGER'
  | 'ENTRY'
  | 'RISK'
  | 'MANAGEMENT'
  | 'EXIT';

export type RuleEvaluationStatus =
  | 'PASS'
  | 'FAIL'
  | 'NOT_AVAILABLE'
  | 'PENDING'
  | 'NOT_EVALUATED';

export type LogicalOperator =
  | 'ALL'
  | 'ANY'
  | 'AT_LEAST_N'
  | 'NOT'
  | 'SEQUENCE_WITHIN_BARS';

export type DataCapability =
  | 'OHLC'
  | 'CLOSED_BAR_STATUS'
  | 'TICK_VOLUME'
  | 'REAL_SOURCE_VOLUME'
  | 'BID_ASK'
  | 'TICK_DATA'
  | 'DEPTH_OF_MARKET'
  | 'SESSION_CALENDAR'
  | 'ECONOMIC_CALENDAR';

export type ExecutionOrderType = 'MARKET_NEXT_OPEN' | 'LIMIT_AT_LEVEL' | 'STOP_AT_LEVEL';
export type StopLossMode = 'ATR_BUFFER' | 'FIXED_PIPS' | 'SWING_STRUCTURE';
export type TimeframeBinding = 'EXECUTION' | 'CONTEXT_PRIMARY' | 'CONTEXT_SECONDARY' | Timeframe;

export interface HtfContextData {
  timeframe: Timeframe;
  candle: Candle;
  closeTimestamp: number;
  isNative: boolean;
  availableAt: number;
}

export interface RuleEvaluationContext {
  runId: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  definitionId: string;
  definitionVersion: string;
  definitionHash: string;
  evaluatedAt: number;
  availableCapabilities: DataCapability[];
  volumeType?: VolumeType;
  datasetFingerprint: string;
  candles: Candle[];
  currentIndex: number;
  htfContext?: HtfContextData;
}

export interface RuleDefinition<P = Record<string, unknown>> {
  ruleId: string;
  ruleVersion: string;
  category: RuleCategory;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  parameterSchema: Record<string, { type: 'number' | 'string' | 'boolean' | 'enum'; default: unknown; min?: number; max?: number; options?: string[]; descriptionFa: string }>;
  defaultParameters: P;
  supportedSymbols?: SymbolId[];
  supportedInstrumentTypes?: InstrumentType[];
  supportedTimeframes?: Timeframe[];
  requiredCapabilities: DataCapability[];
  warmupRequirements: number; // پایه کندل‌های حداقلی
  computeWarmupBars?: (params: P) => number; // محاسبه دقیق وارم‌آپ از پارامترها (Package 4A.1)
  availabilityPolicy: 'IMMEDIATE' | 'NEXT_BAR_OPEN' | 'CONFIRMATION_BARS';
  evaluatorId: string;
  outputSchema?: Record<string, string>;
  incompatibilities?: string[]; // سایر rule IDها
  lifecycle: 'EXPERIMENTAL' | 'ACTIVE' | 'DEPRECATED';
  deprecationReasonFa?: string;
}

export interface RuleInstance<P = Record<string, unknown>> {
  instanceId: string;
  ruleId: string;
  ruleVersion: string;
  parameters: P;
  timeframeBinding?: TimeframeBinding;
  enabled?: boolean;
  notesFa?: string;
}

export interface SequenceStepRule {
  stepIndex: number;
  ruleInstance: RuleInstance;
  maxBarsFromPrevious?: number;
  invalidationConditions?: RuleInstance[];
}

export interface CompositeRuleGroup {
  groupId: string;
  operator: LogicalOperator;
  atLeastNCount?: number; // الزامی برای AT_LEAST_N
  maxBarsWindow?: number; // الزامی برای SEQUENCE_WITHIN_BARS
  rules?: RuleInstance[];
  nestedGroups?: CompositeRuleGroup[];
  sequenceSteps?: SequenceStepRule[];
  notesFa?: string;
}

export interface StrategyDefinition {
  schemaVersion: typeof STRATEGY_DEFINITION_SCHEMA_VERSION;
  definitionId: string;
  definitionVersion: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  family: string;
  tags: string[];
  status: 'DRAFT' | 'VALID' | 'DEPRECATED';
  executionTimeframe: Timeframe;
  contextTimeframes?: Timeframe[];
  requiredCapabilities: DataCapability[];

  // ساختار ماژولار شروط
  context?: CompositeRuleGroup;
  setup?: CompositeRuleGroup;
  trigger: CompositeRuleGroup;
  entry: RuleInstance;
  risk: RuleInstance;
  management?: CompositeRuleGroup;
  exit: CompositeRuleGroup;

  metadata: {
    author: string;
    createdAt: number;
    updatedAt: number;
    deterministicHash: string; // سازگاری معکوس
    integrityHash?: string;     // SHA-256 یکپارچه و ضد دستکاری (Package 4A.1)
    deterministicFingerprint?: string; // FNV-1a برای کشف سریع تفاوت‌ها
    hashAlgorithm?: 'SHA-256' | 'FNV-1A';
    notesFa?: string;
  };

  createdFromTemplateId?: string;
  migratedFromLegacyId?: string;
}

// اسنپ‌شات ارزیابی یک قاعده در زمان مشخص
export interface RuleEvaluationResult {
  ruleId: string;
  ruleVersion: string;
  instanceId: string;
  category: RuleCategory;
  status: RuleEvaluationStatus;

  // فیلدهای زمان ضد نگاه به آینده
  eventTime: number;      // زمان رخداد پدیده
  observedAt: number;     // زمان مشاهده پدیده در داده‌ها
  availableAt: number;    // زمانی که کندل تأییدکننده کامل بسته شده و در دسترس الگوریتم است
  evaluatedAt: number;    // زمان اجرای محاسبات (باید: availableAt <= evaluatedAt)

  inputFingerprint: string;
  parameterHash: string;
  evidenceRefs: Record<string, string | number>;
  actualValues: Record<string, unknown>;
  thresholdValues: Record<string, unknown>;
  reasonCodes: string[];
  diagnosticMessageFa: string;
}

export interface SequenceStateEntry {
  runId: string;
  sequenceGroupId: string;
  symbol: SymbolId;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL';
  definitionId: string;
  definitionVersion: string;
  definitionHash: string;
  datasetFingerprint: string;
  currentStepIndex: number;
  totalSteps: number;
  startedAtTimestamp?: number;
  lastStepMatchedTimestamp?: number;
  isExpired: boolean;
  isInvalidated: boolean;
  isComplete: boolean;
  history: { stepIndex: number; matchedAtTimestamp: number; ruleId: string }[];
}

export interface GroupEvaluationResult {
  groupId: string;
  operator: LogicalOperator;
  status: RuleEvaluationStatus;
  childEvaluations: RuleEvaluationResult[];
  nestedGroupEvaluations?: GroupEvaluationResult[];
  sequenceState?: SequenceStateEntry;
  passedCount: number;
  totalCount: number;
  reasonCodes: string[];
}

export interface StrategyEvaluationResult {
  runId: string;
  definitionId: string;
  definitionVersion: string;
  definitionHash: string;
  datasetFingerprint: string;
  direction: 'BUY' | 'SELL';
  signalTimestamp: number;
  evaluatedAt: number;
  eligibleFromTimestamp: number;
  overallStatus: RuleEvaluationStatus;

  contextStatus?: RuleEvaluationStatus;
  setupStatus?: RuleEvaluationStatus;
  triggerStatus: RuleEvaluationStatus;
  entryStatus?: RuleEvaluationStatus;
  riskStatus: RuleEvaluationStatus;
  managementStatus?: RuleEvaluationStatus;
  exitStatus?: RuleEvaluationStatus;

  ruleEvaluations: RuleEvaluationResult[];
  groupEvaluations: Record<string, GroupEvaluationResult>;
  sequenceStates: SequenceStateEntry[];
  evidenceRefs: Record<string, string | number>;
  rejectionReasons: string[];
  dataCapabilityWarnings: string[];

  candidate: StrategyCandidate | null;
}
