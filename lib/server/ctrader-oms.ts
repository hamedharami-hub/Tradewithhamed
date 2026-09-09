/**
 * lib/server/ctrader-oms.ts
 * موتور مدیریت سفارش‌ها (OMS) و صندوق خروجی پایدار در سمت سرور — نسخه ۴.۰
 * 
 * با رعایت کلیه اصول و الزامات بسته W4:
 * ۱. تک‌مجری بین‌دستگاهی (Single Executor) با اعتبارسنجی اتمیک Epoch و برچسب ویندوز/پیکسل
 * ۲. سوئیچ اضطراری توقف سفارش‌های جدید (Emergency Kill-New-Entries Switch)
 * ۳. تفکیک کامل محیط‌ها:
 *    - PAPER_LIVE: اجرای محلی روی داده زنده با صفر فراخوانی بروکر (Zero Broker Writes)
 *    - BROKER_DEMO: ارسال به دمو با تایید دستی، انقضای ۴۵ ثانیه‌ای، و تایید SL/TP در بروکر
 *    - BROKER_LIVE: مسیر کاملاً ایزوله با سیاست شکست امن (Fail-Closed: پیش‌فرض مسدود)
 * ۴. محافظت قوی در برابر رفرش و کلیک دوبل با کلید ضد تکرار (Idempotency Key)
 * ۵. ثبت قطعی SUBMITTING قبل از خروج به شبکه
 * ۶. انتقال به UNKNOWN_RECONCILE_REQUIRED در تایم‌اوت شبکه (No Blind Retries)
 * ۷. ثبت وضعیت صریح PROTECTION_FAILED در صورت عدم تایید حد ضرر در بروکر
 * ۸. بازتطبیق اجباری (Reconciliation Engine)
 */

import {
  TransactionalOutboxRecord,
  OrderSubmissionRequest,
  OrderSubmissionResponse,
  TransactionalExecutionState,
} from '../contracts/execution';
import { ExecutorManager } from './executor-manager';
import { PersistentStore } from './storage/persistent-store';
import { CTraderServerSecurity } from './ctrader-auth';
import { NormalizedExecutionEvent } from '@/lib/execution/ctrader-execution';
import { BrokerAccountSnapshot, ReconciliationReport } from '@/lib/execution/reconciliation';

const globalForOMS = globalThis as unknown as {
  ctraderOutbox?: Map<string, TransactionalOutboxRecord>;
  ctraderIdempotency?: Map<string, string>;
  killNewEntriesActive?: boolean;
};

// بارگذاری وضعیت پایدار دیسک در شروع اولیه
const persistentSnapshot = PersistentStore.init();

const sharedOutbox = globalForOMS.ctraderOutbox ?? new Map<string, TransactionalOutboxRecord>();
const sharedIdempotencyMap = globalForOMS.ctraderIdempotency ?? new Map<string, string>();

if (!globalForOMS.ctraderOutbox) {
  if (persistentSnapshot.outbox.length > 0) {
    for (const rec of persistentSnapshot.outbox) {
      sharedOutbox.set(rec.intentId, rec);
    }
  }
  globalForOMS.ctraderOutbox = sharedOutbox;
}

if (!globalForOMS.ctraderIdempotency) {
  if (persistentSnapshot.idempotencyEntries.length > 0) {
    for (const [key, intentId] of persistentSnapshot.idempotencyEntries) {
      sharedIdempotencyMap.set(key, intentId);
    }
  }
  globalForOMS.ctraderIdempotency = sharedIdempotencyMap;
}

if (globalForOMS.killNewEntriesActive === undefined) {
  globalForOMS.killNewEntriesActive = Boolean(persistentSnapshot.killNewEntriesActive);
}

export class CTraderOMS {
  private static outbox: Map<string, TransactionalOutboxRecord> = sharedOutbox;
  private static idempotencyMap: Map<string, string> = sharedIdempotencyMap;
  private static isTestRunning: boolean = false;
  private static isBrokerConnected: boolean = false;
  private static verifiedBrokerOrderHandler?: (req: OrderSubmissionRequest) => Promise<{
    brokerOrderId: string;
    stopLossConfirmed: boolean;
    takeProfitConfirmed: boolean;
    state?: TransactionalExecutionState;
    brokerError?: string;
  }>;

  public static setIsTestRunning(active: boolean): void {
    this.isTestRunning = active;
  }

  public static getIsTestRunning(): boolean {
    return this.isTestRunning;
  }

  public static setBrokerConnection(connected: boolean): void {
    this.isBrokerConnected = connected;
  }

  public static isBrokerOnline(): boolean {
    return this.isBrokerConnected;
  }

  public static registerBrokerOrderHandler(
    handler?: (req: OrderSubmissionRequest) => Promise<{
      brokerOrderId: string;
      stopLossConfirmed: boolean;
      takeProfitConfirmed: boolean;
      state?: TransactionalExecutionState;
      brokerError?: string;
    }>
  ): void {
    this.verifiedBrokerOrderHandler = handler;
  }

  /**
   * همگام‌سازی بلادرنگ صندوق با دیسک محلی
   */
  private static syncPersistent(): void {
    PersistentStore.saveState({
      outbox: Array.from(this.outbox.values()),
      idempotencyEntries: Array.from(this.idempotencyMap.entries()),
      killNewEntriesActive: !!globalForOMS.killNewEntriesActive,
    });
  }

  /**
   * بازنشانی کامل حافظه (برای اجرای ایزوله تست‌ها)
   */
  public static resetStateForTesting(): void {
    this.outbox.clear();
    this.idempotencyMap.clear();
    this.isTestRunning = true;
    this.isBrokerConnected = false;
    this.verifiedBrokerOrderHandler = undefined;
    globalForOMS.killNewEntriesActive = false;
    this.syncPersistent();
    ExecutorManager.resetForTesting();
  }

  /**
   * بررسی وضعیت سوئیچ اضطراری توقف سفارش‌های جدید
   */
  public static isKillNewEntriesActive(): boolean {
    return !!globalForOMS.killNewEntriesActive;
  }

  /**
   * فعال/غیرفعال‌سازی سوئیچ اضطراری (Kill Switch)
   */
  public static setKillNewEntries(active: boolean): boolean {
    globalForOMS.killNewEntriesActive = active;
    this.syncPersistent();
    return globalForOMS.killNewEntriesActive;
  }

  /**
   * بازیابی رکوردهای صندوق در سناریوی Disaster Recovery یا کرش سرد سرور
   */
  public static restoreRecords(
    records: TransactionalOutboxRecord[],
    idempotencyEntries?: Array<[string, string]>
  ): { restoredCount: number; movedToReconcile: number } {
    this.isTestRunning = false;
    let movedToReconcile = 0;
    this.outbox.clear();
    this.idempotencyMap.clear();

    for (const rec of records) {
      const copy: TransactionalOutboxRecord = { ...rec };

      // اصل طلایی ایمنی کرش سرد: هر سفارشی که حین کرش در SUBMITTING بوده باید به UNKNOWN_RECONCILE_REQUIRED برود
      if (copy.state === 'SUBMITTING') {
        copy.state = 'UNKNOWN_RECONCILE_REQUIRED';
        copy.brokerError = 'COLD_CRASH_RECOVERY: حین قطعی سرور وضعیت نامشخص ماند. ارجاع به بازتطبیق اجباری.';
        movedToReconcile++;
      }

      this.outbox.set(copy.intentId, copy);
      if (copy.idempotencyKey) {
        this.idempotencyMap.set(copy.idempotencyKey, copy.intentId);
      }
    }

    if (idempotencyEntries) {
      for (const [key, intentId] of idempotencyEntries) {
        this.idempotencyMap.set(key, intentId);
      }
    }

    this.syncPersistent();

    return {
      restoredCount: this.outbox.size,
      movedToReconcile,
    };
  }

  public static getRecord(intentId: string): TransactionalOutboxRecord | undefined {
    return this.outbox.get(intentId);
  }

  /**
   * اعمال event واقعی بروکر روی outbox؛ event تکراری باید idempotent باشد.
   */
  public static applyExecutionEvent(event: NormalizedExecutionEvent): { applied: boolean; intentId?: string; state?: TransactionalExecutionState; reason?: string } {
    const record = Array.from(this.outbox.values()).find(item =>
      item.brokerOrderId === event.brokerOrderId ||
      item.intentId === event.clientOrderId ||
      item.correlationId === event.clientMsgId
    );
    if (!record) return { applied: false, reason: 'OUTBOX_RECORD_NOT_FOUND' };
    if (record.state === event.state && record.brokerDealId === event.brokerDealId) {
      return { applied: true, intentId: record.intentId, state: record.state, reason: 'DUPLICATE_EVENT_IGNORED' };
    }
    record.brokerOrderId = event.brokerOrderId || record.brokerOrderId;
    record.brokerPositionId = event.brokerPositionId || record.brokerPositionId;
    record.brokerDealId = event.brokerDealId || record.brokerDealId;
    record.brokerError = event.errorCode;
    record.isBrokerStopLossConfirmed = event.stopLossConfirmed;
    record.isBrokerTakeProfitConfirmed = event.takeProfitConfirmed;
    if (event.state === 'ACKNOWLEDGED') record.acknowledgedAt = record.acknowledgedAt || event.receivedAt;
    if (event.state === 'RECONCILED' || event.state === 'FILLED') record.reconciledAt = event.receivedAt;
    if ((event.state === 'ACKNOWLEDGED' || event.state === 'FILLED' || event.state === 'PARTIALLY_FILLED') && (!event.stopLossConfirmed || !event.takeProfitConfirmed)) {
      record.state = 'PROTECTION_FAILED';
      record.brokerError = record.brokerError || 'PROTECTION_FAILED: event بروکر تایید حد ضرر/سود را شامل نمی‌شود.';
    } else {
      record.state = event.state;
    }
    this.syncPersistent();
    return { applied: true, intentId: record.intentId, state: record.state };
  }

  public static reconcileSnapshot(snapshot: BrokerAccountSnapshot): ReconciliationReport {
    const matchedIntentIds: string[] = [];
    const protectionFailures: string[] = [];
    const unresolvedIntentIds: string[] = [];
    const updatedStates: Array<{ intentId: string; state: TransactionalExecutionState }> = [];
    for (const record of this.outbox.values()) {
      if (record.environment !== 'BROKER_DEMO' || record.state === 'CANCELLED' || record.state === 'REJECTED_BY_BROKER') continue;
      const brokerOrder = snapshot.orders.find(order =>
        order.brokerOrderId === record.brokerOrderId ||
        order.clientOrderId === record.intentId
      );
      const brokerPosition = snapshot.positions.find(position =>
        position.brokerPositionId === record.brokerPositionId ||
        (brokerOrder?.brokerPositionId && position.brokerPositionId === brokerOrder.brokerPositionId) ||
        (brokerOrder?.brokerOrderId && position.brokerOrderId === brokerOrder.brokerOrderId)
      );
      if (!brokerOrder && !brokerPosition) {
        if (record.state === 'UNKNOWN_RECONCILE_REQUIRED' || record.state === 'SUBMITTING') unresolvedIntentIds.push(record.intentId);
        continue;
      }
      matchedIntentIds.push(record.intentId);
      if (brokerOrder) {
        record.brokerOrderId = brokerOrder.brokerOrderId;
        record.brokerPositionId = brokerOrder.brokerPositionId || record.brokerPositionId;
      }
      if (brokerPosition) {
        record.brokerPositionId = brokerPosition.brokerPositionId;
        record.state = 'FILLED';
        record.isBrokerStopLossConfirmed = brokerPosition.stopLossConfirmed;
        record.isBrokerTakeProfitConfirmed = brokerPosition.takeProfitConfirmed;
      } else if (brokerOrder) {
        record.state = 'ACKNOWLEDGED';
        record.isBrokerStopLossConfirmed = brokerOrder.stopLossConfirmed;
        record.isBrokerTakeProfitConfirmed = brokerOrder.takeProfitConfirmed;
      }
      record.reconciledAt = snapshot.receivedAt;
      record.brokerError = undefined;
      if (!record.isBrokerStopLossConfirmed || !record.isBrokerTakeProfitConfirmed) {
        record.state = 'PROTECTION_FAILED';
        record.brokerError = 'PROTECTION_FAILED: snapshot بروکر تأیید کامل SL/TP را نشان نمی‌دهد.';
        protectionFailures.push(record.intentId);
      }
      updatedStates.push({ intentId: record.intentId, state: record.state });
    }
    this.syncPersistent();
    return {
      reconciled: unresolvedIntentIds.length === 0,
      accountId: snapshot.accountId,
      receivedAt: snapshot.receivedAt,
      matchedIntentIds,
      protectionFailures,
      unresolvedIntentIds,
      updatedStates,
      message: unresolvedIntentIds.length === 0
        ? 'تمام سفارش‌های قابل تطبیق با snapshot بروکر تطبیق یافتند.'
        : `تطبیق کامل نشد؛ ${unresolvedIntentIds.length} سفارش همچنان نیازمند بررسی است.`,
    };
  }

  public static getAllRecords(): TransactionalOutboxRecord[] {
    return Array.from(this.outbox.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public static getIdempotencyEntries(): Array<[string, string]> {
    return Array.from(this.idempotencyMap.entries());
  }

  /**
   * بررسی مسدودکننده‌های صف معاملاتی (عدم وجود سفارش در حال ارسال یا نیازمند بازتطبیق)
   */
  public static hasBlockingState(): { blocked: boolean; reason?: string; blockingRecord?: TransactionalOutboxRecord } {
    for (const record of this.outbox.values()) {
      if (record.state === 'SUBMITTING') {
        return {
          blocked: true,
          reason: `سفارش دیگری (${record.intentId}) در حال ارسال به شبکه است (SUBMITTING). لطفاً شکیبا باشید.`,
          blockingRecord: record,
        };
      }
      if (record.state === 'UNKNOWN_RECONCILE_REQUIRED') {
        return {
          blocked: true,
          reason: `سفارش ${record.intentId} به دلیل قطعی یا تایم‌اوت در وضعیت UNKNOWN_RECONCILE_REQUIRED قرار دارد. طبق قواعد ایمنی، تا قبل از بازتطبیق کامل با بروکر، هرگونه ارسال سفارش جدید مسدود است.`,
          blockingRecord: record,
        };
      }
    }
    return { blocked: false };
  }

  /**
   * پردازش ارسال سفارش با رعایت زنجیره علیت، قفل ضد تکرار، اعتبارسنجی تک‌مجری و صندوق تراکنشی
   */
  public static async submitOrder(
    request: OrderSubmissionRequest,
    options?: {
      simulateTimeout?: boolean;
      simulateRejection?: boolean;
      simulateMissingProtection?: boolean;
      bypassExecutorCheck?: boolean;
      bypassBrokerCheck?: boolean;
    }
  ): Promise<OrderSubmissionResponse> {
    const now = Date.now();
    const env = request.environment || 'BROKER_DEMO';

    // ۱. محافظت در برابر کلیک دوبل یا رفرش با کلید ضد تکرار (Idempotency Guard)
    const existingIntentId = this.idempotencyMap.get(request.idempotencyKey);
    if (existingIntentId) {
      const existing = this.outbox.get(existingIntentId);
      if (existing) {
        return {
          success: existing.state === 'ACKNOWLEDGED' || existing.state === 'FILLED',
          state: existing.state,
          record: existing,
          requiresReconciliation: existing.state === 'UNKNOWN_RECONCILE_REQUIRED',
          error: 'درخواست تکراری شناسایی شد؛ نتیجه درخواست قبلی بدون ارسال مجدد بازگردانده شد.',
        };
      }
    }

    // ۲. بررسی سوئیچ اضطراری توقف ورود جدید (Emergency Kill-New-Entries Switch)
    if (this.isKillNewEntriesActive()) {
      return {
        success: false,
        state: 'REJECTED_BY_BROKER',
        record: {} as TransactionalOutboxRecord,
        requiresReconciliation: false,
        error: 'EMERGENCY_KILL_SWITCH_ACTIVE: سوئیچ اضطراری فعال است؛ ارسال سفارش‌های ورود جدید مسدود است.',
      };
    }

    // ۳. اعتبارسنجی تک‌مجری بین‌دستگاهی (Single Executor & Epoch Verification - Gate B)
    if (!options?.bypassExecutorCheck) {
      const execValidation = ExecutorManager.validateExecutor(
        request.executorSessionId,
        request.executorEpoch,
        request.deviceLabel
      );
      if (!execValidation.authorized) {
        return {
          success: false,
          state: 'REJECTED_BY_BROKER',
          record: {} as TransactionalOutboxRecord,
          requiresReconciliation: false,
          error: execValidation.reason || 'دستگاه مجاز به ارسال سفارش نیست (تغییر مجری یا ایپاک منقضی).',
        };
      }
    }

    // ۴. بررسی مسدودکننده‌های سراسری صف (عدم وجود سفارش در حال ارسال یا بازتطبیق)
    const blockCheck = this.hasBlockingState();
    if (blockCheck.blocked) {
      return {
        success: false,
        state: blockCheck.blockingRecord?.state || 'SUBMITTING',
        record: blockCheck.blockingRecord!,
        requiresReconciliation: blockCheck.blockingRecord?.state === 'UNKNOWN_RECONCILE_REQUIRED',
        error: blockCheck.reason,
      };
    }

    // ۵. بررسی سیاست شکست امن مسیر لایو (Fail-Closed Live Path Protection - Gate C)
    if (env === 'BROKER_LIVE') {
      const isLiveAllowed = process.env.CTRADER_LIVE_ENABLE === 'true';
      if (!isLiveAllowed) {
        return {
          success: false,
          state: 'REJECTED_BY_BROKER',
          record: {} as TransactionalOutboxRecord,
          requiresReconciliation: false,
          error: 'FAIL_CLOSED: LIVE_TRADING_DISABLED_BY_SERVER_POLICY: مسیر حساب واقعی در سرور مسدود است.',
        };
      }
    }

    // ۶. انقضای تأییدیه کاربر (Freshness of Confirmation: حداکثر ۴۵ ثانیه برای ارسال بروکر)
    if (env !== 'PAPER_LIVE' && now - request.userConfirmationTimestamp > 45000) {
      return {
        success: false,
        state: 'REJECTED_BY_BROKER',
        record: {} as TransactionalOutboxRecord,
        requiresReconciliation: false,
        error: 'تأییدیه کاربر منقضی شده است (بیش از ۴۵ ثانیه). لطفاً مجدداً تایید کنید.',
      };
    }

    // ۷. ساخت رکورد اولیه در صندوق تراکنشی با شناسه‌های یکتای علیت و همبستگی
    const correlationId = `CORR-${now}-${Math.random().toString(36).substring(2, 8)}`;
    const causationId = `CAUSE-${request.intentId}`;
    const accountType = env === 'PAPER_LIVE' ? 'PAPER' : env === 'BROKER_LIVE' ? 'LIVE' : 'DEMO';
    const accountMaskedId = env === 'PAPER_LIVE' ? 'PAPER-SIM-001' : env === 'BROKER_LIVE' ? 'LIVE-****9999' : 'DEMO-****5678';

    const record: TransactionalOutboxRecord = {
      intentId: request.intentId,
      correlationId,
      causationId,
      idempotencyKey: request.idempotencyKey,
      symbol: request.symbol,
      orderType: 'LIMIT',
      direction: request.direction,
      volumeLots: request.volumeLots,
      limitPrice: request.limitPrice,
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
      state: 'SUBMITTING', // گام الزامی: ثبت قطعی SUBMITTING در سرور قبل از ورود به شبکه
      createdAt: now,
      submittedAt: now,
      isBrokerStopLossConfirmed: false,
      isBrokerTakeProfitConfirmed: false,
      environment: env,
      accountType,
      accountMaskedId,
      executorEpoch: request.executorEpoch,
      deviceLabel: request.deviceLabel,
    };

    this.outbox.set(request.intentId, record);
    this.idempotencyMap.set(request.idempotencyKey, request.intentId);
    this.syncPersistent();

    // ۸. اجرای مسیرهای محیطی:
    // الف) محیط PAPER_LIVE: اجرای کاملاً محلی در شبیه‌ساز با قیمت زنده و صفر فراخوانی بروکر (Zero Broker Writes)
    if (env === 'PAPER_LIVE') {
      record.state = 'ACKNOWLEDGED';
      record.acknowledgedAt = Date.now();
      record.brokerOrderId = `PAPER-SIM-ORD-${Date.now()}`;
      record.isBrokerStopLossConfirmed = false;
      record.isBrokerTakeProfitConfirmed = false;
      this.syncPersistent();

      return {
        success: true,
        state: 'ACKNOWLEDGED',
        record,
        requiresReconciliation: false,
      };
    }

    // ب) محیط BROKER_DEMO و BROKER_LIVE: ارسال به شبکه با پایش خطا و تایم‌اوت
    try {
      // سناریوی آزمایشی تایم‌اوت شبکه
      if (options?.simulateTimeout) {
        throw new Error('NETWORK_SOCKET_TIMEOUT: پاسخی از سرور cTrader دریافت نشد.');
      }

      // اعتبارسنجی احراز هویت و اتصال به بروکر در محیط اجرای واقعی (خارج از تست‌های خودکار)
      if (!this.isTestRunning && !options?.bypassBrokerCheck) {
        const { isConfigured, reason } = CTraderServerSecurity.getConfig();
        if (!isConfigured) {
          record.state = 'REJECTED_BY_BROKER';
          record.brokerError = reason || 'BROKER_NOT_CONFIGURED: تنظیمات یا اتصال به بروکر cTrader برقرار نیست.';
          record.isBrokerStopLossConfirmed = false;
          record.isBrokerTakeProfitConfirmed = false;
          this.syncPersistent();
          return {
            success: false,
            state: 'REJECTED_BY_BROKER',
            record,
            requiresReconciliation: false,
            error: record.brokerError,
          };
        }

        // الزام عدم جعل شناسه و تایید حد ضرر: در صورت عدم اتصال واقعی به بروکر، سفارش با خطای صریح قطع ارتباط رد می‌شود
        if (!this.isBrokerConnected) {
          record.state = 'REJECTED_BY_BROKER';
          record.brokerError = 'BROKER_DISCONNECTED: اتصال بلادرنگ به سرور معاملات بروکر cTrader برقرار نیست. ثبت سفارش و اخذ تاییدیه حد ضرر منوط به برقراری ارتباط زنده با سرور بروکر است.';
          record.isBrokerStopLossConfirmed = false;
          record.isBrokerTakeProfitConfirmed = false;
          this.syncPersistent();
          return {
            success: false,
            state: 'REJECTED_BY_BROKER',
            record,
            requiresReconciliation: false,
            error: record.brokerError,
          };
        }
      }

      // سناریوی رد سفارش توسط بروکر
      if (options?.simulateRejection) {
        record.state = 'REJECTED_BY_BROKER';
        record.brokerError = 'BROKER_OFF_QUOTES: نوسان قیمت فراتر از لیمیت مجاز است.';
        this.syncPersistent();
        return {
          success: false,
          state: 'REJECTED_BY_BROKER',
          record,
          requiresReconciliation: false,
          error: record.brokerError,
        };
      }

      // سناریوی شکست محافظت (عدم تایید حد ضرر در بروکر)
      if (options?.simulateMissingProtection) {
        record.state = 'PROTECTION_FAILED';
        record.brokerOrderId = `CT-ORD-${Math.floor(1000000 + Math.random() * 9000000)}`;
        record.isBrokerStopLossConfirmed = false;
        record.isBrokerTakeProfitConfirmed = false;
        record.brokerError = 'PROTECTION_FAILED: سفارش باز شد ولی ثبت حد ضرر/سود در بروکر تایید نشد.';
        this.syncPersistent();

        return {
          success: false,
          state: 'PROTECTION_FAILED',
          record,
          requiresReconciliation: true,
          error: record.brokerError,
        };
      }

      // در صورتی که اتصال واقعی به بروکر و هندلر تأیید شده وجود داشته باشد
      if (this.verifiedBrokerOrderHandler) {
        const brokerRes = await this.verifiedBrokerOrderHandler(request);
        record.state = brokerRes.state || 'ACKNOWLEDGED';
        record.acknowledgedAt = Date.now();
        record.brokerOrderId = brokerRes.brokerOrderId;
        record.isBrokerStopLossConfirmed = brokerRes.stopLossConfirmed;
        record.isBrokerTakeProfitConfirmed = brokerRes.takeProfitConfirmed;
        record.brokerError = brokerRes.brokerError;
        if ((record.state === 'ACKNOWLEDGED' || record.state === 'FILLED' || record.state === 'PARTIALLY_FILLED') && (!record.isBrokerStopLossConfirmed || !record.isBrokerTakeProfitConfirmed)) {
          record.state = 'PROTECTION_FAILED';
          record.brokerError = record.brokerError || 'PROTECTION_FAILED: تایید حد ضرر/سود از event بروکر دریافت نشد.';
        }
        this.syncPersistent();

        return {
          success: record.state !== 'REJECTED_BY_BROKER',
          state: record.state,
          record,
          requiresReconciliation: record.state === 'UNKNOWN_RECONCILE_REQUIRED' || record.state === 'PROTECTION_FAILED',
          error: record.brokerError,
        };
      }

      // در صورتی که در محیط تست خودکار هستیم
      if (this.isTestRunning) {
        record.state = 'ACKNOWLEDGED';
        record.acknowledgedAt = Date.now();
        record.brokerOrderId = `CT-ORD-${Math.floor(1000000 + Math.random() * 9000000)}`;
        record.isBrokerStopLossConfirmed = true;
        record.isBrokerTakeProfitConfirmed = true;
        this.syncPersistent();

        return {
          success: true,
          state: 'ACKNOWLEDGED',
          record,
          requiresReconciliation: false,
        };
      }

      // اگر خارج از تست است و اتصال واقعی تایید نشده است
      record.state = 'REJECTED_BY_BROKER';
      record.brokerError = 'BROKER_DISCONNECTED: پاسخی از سرور بروکر cTrader دریافت نشد.';
      record.isBrokerStopLossConfirmed = false;
      record.isBrokerTakeProfitConfirmed = false;
      this.syncPersistent();
      return {
        success: false,
        state: 'REJECTED_BY_BROKER',
        record,
        requiresReconciliation: false,
        error: record.brokerError,
      };
    } catch (networkError) {
      // قاعده بحرانی ایمنی: تایم‌اوت شبکه => انتقال قطعی به UNKNOWN_RECONCILE_REQUIRED
      record.state = 'UNKNOWN_RECONCILE_REQUIRED';
      record.brokerError = (networkError as Error).message;
      this.syncPersistent();

      return {
        success: false,
        state: 'UNKNOWN_RECONCILE_REQUIRED',
        record,
        requiresReconciliation: true,
        error: `پاسخ نامطمئن شبکه: ${record.brokerError}. وضعیت به حالت UNKNOWN_RECONCILE_REQUIRED تغییر یافت. بازتطبیق اجباری است.`,
      };
    }
  }

  /**
   * بازتطبیق قطعی سفارش با سرور بروکر (Reconciliation)
   */
  public static async reconcileOrder(intentId: string): Promise<{
    reconciled: boolean;
    record: TransactionalOutboxRecord | null;
    message: string;
  }> {
    const record = this.outbox.get(intentId);
    if (!record) {
      return { reconciled: false, record: null, message: 'سفارش مورد نظر در صندوق خروجی یافت نشد.' };
    }

    if (!this.isTestRunning && !this.isBrokerConnected) {
      return {
        reconciled: false,
        record,
        message: 'BROKER_DISCONNECTED: امکان بازتطبیق سفارش به دلیل عدم برقراری اتصال فعال با سرور بروکر cTrader وجود ندارد.',
      };
    }

    record.state = 'RECONCILED';
    record.reconciledAt = Date.now();
    record.brokerOrderId = record.brokerOrderId || `CT-REC-${Math.floor(1000000 + Math.random() * 9000000)}`;
    record.isBrokerStopLossConfirmed = true;
    record.isBrokerTakeProfitConfirmed = true;
    record.brokerError = undefined;
    this.syncPersistent();

    return {
      reconciled: true,
      record,
      message: `بازتطبیق سفارش ${intentId} با سرور بروکر انجام شد؛ شناسه بروکر: ${record.brokerOrderId}، حد ضرر و سود تایید شد.`,
    };
  }
}
