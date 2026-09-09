import { TransactionalExecutionState } from '@/lib/contracts/execution';

export interface BrokerSnapshotOrder {
  brokerOrderId: string;
  clientOrderId?: string;
  brokerPositionId?: string;
  state?: TransactionalExecutionState;
  stopLossConfirmed: boolean;
  takeProfitConfirmed: boolean;
  raw?: Record<string, unknown>;
}

export interface BrokerSnapshotPosition {
  brokerPositionId: string;
  brokerOrderId?: string;
  stopLossConfirmed: boolean;
  takeProfitConfirmed: boolean;
  raw?: Record<string, unknown>;
}

export interface BrokerAccountSnapshot {
  accountId: number;
  receivedAt: number;
  orders: BrokerSnapshotOrder[];
  positions: BrokerSnapshotPosition[];
}

export interface ReconciliationReport {
  reconciled: boolean;
  accountId: number;
  receivedAt: number;
  matchedIntentIds: string[];
  protectionFailures: string[];
  unresolvedIntentIds: string[];
  updatedStates: Array<{ intentId: string; state: TransactionalExecutionState }>;
  message: string;
}
