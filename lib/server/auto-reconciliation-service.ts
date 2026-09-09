import { CTraderDemoGateway } from '@/lib/gateway/ctrader-gateway';
import { ReconciliationReport } from '@/lib/execution/reconciliation';
import { CTraderOMS } from './ctrader-oms';

export type ReconciliationTrigger = 'STARTUP' | 'RECONNECT' | 'ORDER_TIMEOUT' | 'MANUAL';

export interface AutoReconciliationStatus {
  running: boolean;
  queued: boolean;
  lastTrigger: ReconciliationTrigger | null;
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastReport: ReconciliationReport | null;
  lastError?: string;
  consecutiveFailures: number;
}

const globalForAutoReconcile = globalThis as unknown as { autoReconciliationService?: AutoReconciliationService };

export class AutoReconciliationService {
  private running = false;
  private queued = false;
  private lastTrigger: ReconciliationTrigger | null = null;
  private lastStartedAt: number | null = null;
  private lastCompletedAt: number | null = null;
  private lastReport: ReconciliationReport | null = null;
  private lastError: string | undefined;
  private consecutiveFailures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  public static getInstance(): AutoReconciliationService {
    if (!globalForAutoReconcile.autoReconciliationService) globalForAutoReconcile.autoReconciliationService = new AutoReconciliationService();
    return globalForAutoReconcile.autoReconciliationService;
  }

  public attach(gateway: CTraderDemoGateway): void {
    gateway.onAccountReady(() => { void this.request('STARTUP'); });
    gateway.onReconnectReady(() => { void this.request('RECONNECT'); });
  }

  public async request(trigger: ReconciliationTrigger): Promise<ReconciliationReport | null> {
    this.lastTrigger = trigger;
    if (this.running) {
      this.queued = true;
      return null;
    }
    if (!CTraderOMS.isBrokerOnline()) {
      this.lastError = 'BROKER_DISCONNECTED: reconciliation خودکار تا برقراری اتصال به تعویق افتاد.';
      return null;
    }
    this.running = true;
    this.queued = false;
    this.lastStartedAt = Date.now();
    try {
      const snapshot = await CTraderDemoGateway.getInstance().requestReconcile();
      const report = CTraderOMS.reconcileSnapshot(snapshot);
      this.lastReport = report;
      this.lastCompletedAt = Date.now();
      this.lastError = undefined;
      this.consecutiveFailures = 0;
      return report;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'AUTOMATIC_RECONCILIATION_FAILED';
      this.consecutiveFailures += 1;
      this.scheduleRetry(trigger);
      return null;
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        queueMicrotask(() => { void this.request(this.lastTrigger || trigger); });
      }
    }
  }

  public getStatus(): AutoReconciliationStatus {
    return {
      running: this.running,
      queued: this.queued,
      lastTrigger: this.lastTrigger,
      lastStartedAt: this.lastStartedAt,
      lastCompletedAt: this.lastCompletedAt,
      lastReport: this.lastReport,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  public resetForTesting(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.running = false;
    this.queued = false;
    this.lastTrigger = null;
    this.lastStartedAt = null;
    this.lastCompletedAt = null;
    this.lastReport = null;
    this.lastError = undefined;
    this.consecutiveFailures = 0;
  }

  private scheduleRetry(trigger: ReconciliationTrigger): void {
    if (this.retryTimer || this.consecutiveFailures > 5) return;
    const delay = Math.min(30000, 1000 * 2 ** (this.consecutiveFailures - 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.request(trigger);
    }, delay);
  }
}
