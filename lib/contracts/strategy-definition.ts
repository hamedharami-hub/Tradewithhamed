// lib/contracts/strategy-definition.ts
// قرارداد مرجع و نسخه‌دار تعریف استراتژی، قواعد قابل‌ترکیب و ردیابی تصمیم (Package 4A Canonical Source of Truth)

import type { SymbolId, Timeframe } from './market';
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
  warmupRequirements: number; // minimum bars needed
  availabilityPolicy: 'IMMEDIATE' | 'NEXT_BAR_OPEN' | 'CONFIRMATION_BARS';
  evaluatorId: string;
  outputSchema?: Record<string, string>;
  incompatibilities?: string[]; // other rule IDs
  lifecycle: 'EXPERIMENTAL' | 'ACTIVE' | 'DEPRECATED';
  deprecationReasonFa?: string;
}

export interface RuleInstance<P = Record<string, unknown>> {
  instanceId: string;
  ruleId: string;
  ruleVersion: string;
  parameters: P;
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
  atLeastNCount?: number; // required if operator === 'AT_LEAST_N'
  maxBarsWindow?: number; // required if operator === 'SEQUENCE_WITHIN_BARS'
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
    deterministicHash: string;
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
  sequenceGroupId: string;
  symbol: SymbolId;
  direction: 'BUY' | 'SELL';
  definitionId: string;
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
  definitionId: string;
  definitionVersion: string;
  definitionHash: string;
  evaluatedAt: number;
  overallStatus: RuleEvaluationStatus;

  contextStatus?: RuleEvaluationStatus;
  setupStatus?: RuleEvaluationStatus;
  triggerStatus: RuleEvaluationStatus;
  riskStatus: RuleEvaluationStatus;
  exitStatus?: RuleEvaluationStatus;

  ruleEvaluations: RuleEvaluationResult[];
  groupEvaluations: Record<string, GroupEvaluationResult>;
  sequenceStates: SequenceStateEntry[];
  evidenceRefs: Record<string, string | number>;
  rejectionReasons: string[];
  dataCapabilityWarnings: string[];

  candidate: StrategyCandidate | null;
}
