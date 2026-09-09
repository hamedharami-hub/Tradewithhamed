import { CandidateDirection } from '@/lib/contracts/strategy';
import { TransactionalExecutionState } from '@/lib/contracts/execution';

export type CTraderExecutionType = 'ORDER_ACCEPTED' | 'ORDER_FILLED' | 'ORDER_PARTIAL_FILL' | 'ORDER_CANCELLED' | 'ORDER_EXPIRED' | 'ORDER_REJECTED' | 'ORDER_CANCEL_REJECTED' | 'UNKNOWN';

export interface NormalizedExecutionEvent {
  accountId: number;
  clientMsgId?: string;
  clientOrderId?: string;
  brokerOrderId?: string;
  brokerPositionId?: string;
  brokerDealId?: string;
  executionType: CTraderExecutionType;
  state: TransactionalExecutionState;
  fillPrice?: number;
  filledVolumeUnits?: number;
  stopLossConfirmed: boolean;
  takeProfitConfirmed: boolean;
  errorCode?: string;
  receivedAt: number;
  isServerEvent: boolean;
}

export interface DemoOrderCommand {
  intentId: string;
  clientOrderId: string;
  accountId: number;
  symbolId: number;
  direction: CandidateDirection;
  volumeLots: number;
  limitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

export function mapExecutionType(value: unknown): CTraderExecutionType {
  const numeric = Number(value);
  if (numeric === 2 || value === 'ORDER_ACCEPTED') return 'ORDER_ACCEPTED';
  if (numeric === 3 || value === 'ORDER_FILLED') return 'ORDER_FILLED';
  if (numeric === 5 || value === 'ORDER_CANCELLED') return 'ORDER_CANCELLED';
  if (numeric === 6 || value === 'ORDER_EXPIRED') return 'ORDER_EXPIRED';
  if (numeric === 7 || value === 'ORDER_REJECTED') return 'ORDER_REJECTED';
  if (numeric === 8 || value === 'ORDER_CANCEL_REJECTED') return 'ORDER_CANCEL_REJECTED';
  if (numeric === 11 || value === 'ORDER_PARTIAL_FILL') return 'ORDER_PARTIAL_FILL';
  return 'UNKNOWN';
}

export function stateForExecution(type: CTraderExecutionType): TransactionalExecutionState {
  if (type === 'ORDER_ACCEPTED') return 'ACKNOWLEDGED';
  if (type === 'ORDER_FILLED') return 'FILLED';
  if (type === 'ORDER_PARTIAL_FILL') return 'PARTIALLY_FILLED';
  if (type === 'ORDER_CANCELLED' || type === 'ORDER_EXPIRED') return 'CANCELLED';
  if (type === 'ORDER_REJECTED' || type === 'ORDER_CANCEL_REJECTED') return 'REJECTED_BY_BROKER';
  return 'UNKNOWN_RECONCILE_REQUIRED';
}
