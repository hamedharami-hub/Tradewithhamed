import { SymbolId } from './market';
import { CandidateDirection } from './strategy';

export type OrderType = 'LIMIT' | 'MARKET';

export type OrderStatus =
  | 'PENDING'
  | 'SUBMITTING'
  | 'ACKNOWLEDGED'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'UNKNOWN_RECONCILE_REQUIRED';

export interface SimulatedOrder {
  id: string;
  candidateId: string;
  symbol: SymbolId;
  type: OrderType;
  direction: CandidateDirection;
  volumeLots: number;
  requestedPrice: number;
  stopLoss: number;
  takeProfit: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  brokerOrderId?: string;
}

export interface SimulatedPosition {
  id: string;
  orderId: string;
  symbol: SymbolId;
  direction: CandidateDirection;
  volumeLots: number;
  initialVolumeLots?: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  unrealizedPnl: number;
  realizedPnl: number;
  commissionPaid: number;
  isOpen: boolean;
  openedAt: number;
  closedAt?: number;
  closeReason?: 'SL' | 'TP' | 'MANUAL' | 'PARTIAL_TP' | 'PANIC_KILL_SWITCH';
  isBreakevenActive?: boolean;
  partialCloseCount?: number;
}
