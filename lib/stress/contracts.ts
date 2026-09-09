import { SymbolId } from '@/lib/contracts/market';

export type StressScenarioType =
  | 'FLASH_CRASH'
  | 'STALE_FEED'
  | 'DUPLICATE_SUBMIT'
  | 'BROKER_TIMEOUT';

export type StressRunStatus = 'PASSED' | 'FAILED' | 'BLOCKED' | 'INCONCLUSIVE';

export interface StressScenario {
  id: string;
  nameFa: string;
  type: StressScenarioType;
  symbol: SymbolId;
  seed: number;
  parameters: Record<string, number | string | boolean>;
}

export interface StressEvent {
  timestamp: number;
  type: string;
  details: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
}

export interface StressTestResult {
  runId: string;
  scenarioId: string;
  scenarioNameFa: string;
  status: StressRunStatus;
  passed: boolean;
  startedAt: number;
  completedAt: number;
  seed: number;
  maxDrawdownPercent: number;
  maxSpreadPips: number;
  ordersSubmitted: number;
  duplicateOrdersPrevented: number;
  reconciliationRequired: number;
  invariantViolations: string[];
  events: StressEvent[];
}
