import { JournalAuditEvent, TradePosition } from '@/lib/contracts/journal';
import { TransactionalOutboxRecord } from '@/lib/contracts/execution';

export interface OutboxRepository {
  list(): TransactionalOutboxRecord[];
  findByIntentId(intentId: string): TransactionalOutboxRecord | undefined;
  save(record: TransactionalOutboxRecord): void;
}

export interface JournalRepository {
  listPositions(): TradePosition[];
  listAuditEvents(): JournalAuditEvent[];
  savePosition(position: TradePosition): void;
  saveAuditEvent(event: JournalAuditEvent): void;
}

export interface SnapshotRepository<TSnapshot> {
  load(): TSnapshot;
  save(snapshot: TSnapshot): void;
}

/**
 * این tokenها مرز معماری را مشخص می‌کنند؛ adapter فعلی می‌تواند در فاز بعد
 * به SQLite یا PostgreSQL متصل شود، بدون آن‌که موتورهای دامنه تغییر کنند.
 */
export const REPOSITORY_CONTRACT_VERSION = '1.0';
