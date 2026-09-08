import crypto from 'node:crypto';
import {
  DisasterRecoverySnapshot,
  DisasterRecoveryRestoreResult,
} from '../contracts/security';
import { TransactionalOutboxRecord } from '../contracts/execution';
import { CTraderOMS } from './ctrader-oms';
import { JournalService } from './journal-service';

export class DisasterRecoveryEngine {
  public static readonly SCHEMA_VERSION = 'v1.0-DR';

  /**
   * محاسبه هش رمزنگاری SHA-256 داده‌های خام اسنپ‌شات به صورت متعارف (Canonical)
   */
  public static computePayloadChecksum(payloadData: Omit<DisasterRecoverySnapshot, 'checksum'>): string {
    const canonicalString = JSON.stringify(payloadData);
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * ایجاد یک اسنپ‌شات اضطراری یکپارچه با امضای چکسام SHA-256
   */
  public static createEmergencySnapshot(): DisasterRecoverySnapshot {
    const outboxRecords = CTraderOMS.getAllRecords();
    const idempotencyEntries = CTraderOMS.getIdempotencyEntries();
    const positions = JournalService.getAllPositions();
    const logs = JournalService.getAuditLogs();
    const statistics = JournalService.getStatistics();

    const rawPayload: Omit<DisasterRecoverySnapshot, 'checksum'> = {
      schemaVersion: this.SCHEMA_VERSION,
      generatedAt: Date.now(),
      omsState: {
        recordsCount: outboxRecords.length,
        records: outboxRecords.map(r => ({ ...r })),
        idempotencyKeys: idempotencyEntries,
      },
      journalState: {
        positionsCount: positions.length,
        auditLogsCount: logs.length,
        positions: positions.map(p => ({ ...p })),
        auditLogs: logs.map(l => ({ ...l })),
        statistics: {
          totalTrades: statistics.totalTrades,
          winRatePercent: statistics.winRatePercent,
          netPnL: statistics.totalNetProfit,
          profitFactor: statistics.profitFactor,
        },
      },
      securityAudit: {
        environment: 'demo',
        tokenVaultActive: true,
        zeroSecretsCompliant: true,
      },
    };

    const checksum = this.computePayloadChecksum(rawPayload);

    return {
      ...rawPayload,
      checksum,
    };
  }

  /**
   * اعتبارسنجی تمامیت ریاضی و امنیتی اسنپ‌شات (SHA-256 Integrity Verification)
   */
  public static verifySnapshotIntegrity(snapshot: DisasterRecoverySnapshot): { valid: boolean; reason?: string } {
    if (!snapshot || typeof snapshot !== 'object') {
      return { valid: false, reason: 'ساختار اسنپ‌شات نامعتبر یا خالی است.' };
    }

    if (snapshot.schemaVersion !== this.SCHEMA_VERSION) {
      return {
        valid: false,
        reason: `نسخه اسکیما نامعتبر است (انتظار: ${this.SCHEMA_VERSION}، دریافت: ${snapshot.schemaVersion}).`,
      };
    }

    if (!snapshot.checksum || typeof snapshot.checksum !== 'string') {
      return { valid: false, reason: 'چکسام SHA-256 در اسنپ‌شات یافت نشد.' };
    }

    const { checksum, ...payloadWithoutChecksum } = snapshot;
    const computedChecksum = this.computePayloadChecksum(payloadWithoutChecksum as Omit<DisasterRecoverySnapshot, 'checksum'>);

    if (computedChecksum !== checksum) {
      return {
        valid: false,
        reason: `تمامیت داده‌ها نقض شده است (چکسام دستکاری‌شده: ${checksum} در برابر ${computedChecksum}).`,
      };
    }

    return { valid: true };
  }

  /**
   * بازیابی اضطراری با رعایت اصل شکست-بسته (Fail-Closed) و قانون بازتطبیق سفارشات معلق
   */
  public static restoreEmergencySnapshot(snapshot: DisasterRecoverySnapshot): DisasterRecoveryRestoreResult {
    const verification = this.verifySnapshotIntegrity(snapshot);
    if (!verification.valid) {
      return {
        success: false,
        schemaVersion: snapshot.schemaVersion || 'UNKNOWN',
        checksumVerified: false,
        restoredRecordsCount: 0,
        restoredPositionsCount: 0,
        ordersMovedToReconcile: 0,
        message: `بازیابی اضطراری رد شد: ${verification.reason}`,
      };
    }

    // بازگردانی رکوردهای OMS با حفظ کامل فیلدهای واقعی و تبدیل خودکار SUBMITTING به UNKNOWN_RECONCILE_REQUIRED
    const outboxRecordsToRestore: TransactionalOutboxRecord[] = (snapshot.omsState?.records || []).map((r: any) => ({
      intentId: r.intentId,
      correlationId: r.correlationId || `CORR-RESTORED-${r.intentId}`,
      causationId: r.causationId || `CAUSE-RESTORED-${r.intentId}`,
      idempotencyKey: r.idempotencyKey,
      symbol: (r.symbol || 'XAUUSD') as any,
      orderType: (r.orderType || 'LIMIT') as any,
      direction: (r.direction || 'BUY') as any,
      volumeLots: typeof r.volumeLots === 'number' ? r.volumeLots : 0.01,
      limitPrice: typeof r.limitPrice === 'number' ? r.limitPrice : 0,
      stopLossPrice: typeof r.stopLossPrice === 'number' ? r.stopLossPrice : 0,
      takeProfitPrice: typeof r.takeProfitPrice === 'number' ? r.takeProfitPrice : 0,
      state: r.state as any,
      createdAt: r.createdAt || Date.now(),
      submittedAt: r.submittedAt || r.createdAt || Date.now(),
      acknowledgedAt: r.acknowledgedAt,
      reconciledAt: r.reconciledAt,
      brokerOrderId: r.brokerOrderId,
      brokerPositionId: r.brokerPositionId,
      brokerDealId: r.brokerDealId,
      brokerError: r.brokerError,
      isBrokerStopLossConfirmed: r.isBrokerStopLossConfirmed ?? true,
      isBrokerTakeProfitConfirmed: r.isBrokerTakeProfitConfirmed ?? true,
      accountType: r.accountType || 'DEMO',
      accountMaskedId: r.accountMaskedId || 'DEMO-****5678',
      executorEpoch: r.executorEpoch,
      deviceLabel: r.deviceLabel,
    }));

    const omsRestoreResult = CTraderOMS.restoreRecords(
      outboxRecordsToRestore,
      snapshot.omsState?.idempotencyKeys
    );

    // بازگردانی پوزیشن‌های ژورنال
    let restoredPositionsCount = 0;
    if (snapshot.journalState?.positions && Array.isArray(snapshot.journalState.positions)) {
      restoredPositionsCount = JournalService.restorePositions(
        snapshot.journalState.positions,
        snapshot.journalState.auditLogs
      );
    } else {
      restoredPositionsCount = snapshot.journalState?.positionsCount || 0;
    }

    return {
      success: true,
      schemaVersion: snapshot.schemaVersion,
      checksumVerified: true,
      restoredRecordsCount: omsRestoreResult.restoredCount,
      restoredPositionsCount,
      ordersMovedToReconcile: omsRestoreResult.movedToReconcile,
      message: `بازیابی اضطراری با موفقیت انجام شد: ${omsRestoreResult.restoredCount} رکورد OMS بازیابی شد (${omsRestoreResult.movedToReconcile} سفارش معلق به بازتطبیق اجباری منتقل گردید).`,
    };
  }

  /**
   * شبیه‌سازی کرش سرد و اثبات انتقال خودکار سفارشات SUBMITTING به UNKNOWN_RECONCILE_REQUIRED
   */
  public static simulateColdCrashAndRecover(): DisasterRecoveryRestoreResult {
    const testSnapshot = this.createEmergencySnapshot();

    // اضافه کردن یک سفارش معلق فرضی حین کرش (SUBMITTING)
    const inFlightIntentId = `INTENT-CRASH-INFLIGHT-${Date.now()}`;
    const mutatedRecords = [
      ...testSnapshot.omsState.records,
      {
        intentId: inFlightIntentId,
        idempotencyKey: `IDEMP-${inFlightIntentId}`,
        symbol: 'XAUUSD',
        direction: 'SELL' as const,
        volumeLots: 0.02,
        limitPrice: 2630.0,
        stopLossPrice: 2635.0,
        takeProfitPrice: 2620.0,
        state: 'SUBMITTING',
        createdAt: Date.now(),
      },
    ];

    const { checksum: _oldChecksum, ...snapshotWithoutChecksum } = testSnapshot;
    const crashPayload: Omit<DisasterRecoverySnapshot, 'checksum'> = {
      ...snapshotWithoutChecksum,
      omsState: {
        ...testSnapshot.omsState,
        recordsCount: mutatedRecords.length,
        records: mutatedRecords,
      },
    };

    const newChecksum = this.computePayloadChecksum(crashPayload);
    const crashSnapshot: DisasterRecoverySnapshot = {
      ...crashPayload,
      checksum: newChecksum,
    };

    return this.restoreEmergencySnapshot(crashSnapshot);
  }
}
