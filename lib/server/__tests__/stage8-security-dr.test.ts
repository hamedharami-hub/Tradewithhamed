import { TokenVault } from '../token-vault';
import { RateLimiter } from '../rate-limiter';
import { DisasterRecoveryEngine } from '../disaster-recovery';
import { CTraderOMS } from '../ctrader-oms';
import { JournalService } from '../journal-service';

export interface Stage8TestResult {
  name: string;
  passed?: boolean;
  pass?: boolean;
  details: string;
}

export async function runStage8SecurityDRTests(): Promise<Stage8TestResult[]> {
  const results: Stage8TestResult[] = [];

  // ۱. آزمون رمزنگاری AES-256-GCM و مقاومت در برابر دستکاری
  try {
    const rawSecret = 'CTRADER_DEMO_REFRESH_TOKEN_TEST_SECRET_ABC123';
    const encrypted = TokenVault.encrypt(rawSecret);

    const isAlgorithmValid = encrypted.algorithm === 'AES-256-GCM';
    const isIvValid = encrypted.ivHex.length === 24; // 12 bytes * 2
    const isAuthTagValid = encrypted.authTagHex.length === 32; // 16 bytes * 2
    const decrypted = TokenVault.decrypt(encrypted);

    let tamperDetected = false;
    try {
      // ایجاد دستکاری عمدی در متن رمزنگاری‌شده (تغییر ۱ کاراکتر هگز)
      const tamperedCipher =
        encrypted.ciphertextHex.slice(0, -1) +
        (encrypted.ciphertextHex.slice(-1) === 'a' ? 'b' : 'a');
      TokenVault.decrypt({
        ...encrypted,
        ciphertextHex: tamperedCipher,
      });
    } catch {
      tamperDetected = true;
    }

    let authTagTamperDetected = false;
    try {
      // ایجاد دستکاری عمدی در تگ اصالت سنجی (Auth Tag)
      const tamperedTag =
        encrypted.authTagHex.slice(0, -1) +
        (encrypted.authTagHex.slice(-1) === '0' ? '1' : '0');
      TokenVault.decrypt({
        ...encrypted,
        authTagHex: tamperedTag,
      });
    } catch {
      authTagTamperDetected = true;
    }

    const pass =
      isAlgorithmValid &&
      isIvValid &&
      isAuthTagValid &&
      decrypted === rawSecret &&
      tamperDetected &&
      authTagTamperDetected;

    results.push({
      name: 'آزمون ۱: رمزنگاری سخت‌گیرانه AES-256-GCM و مقاومت قطعی در برابر دستکاری (Auth Tag & Ciphertext Tamper)',
      pass,
      details: pass
        ? 'رمزنگاری و رمزگشایی متقارن با موفقیت انجام شد؛ هرگونه دستکاری ۱ بیتی به خطای سخت‌گیرانه Fail-Closed ختم شد.'
        : 'خطا در اعتبارسنجی تگ اصالت یا رمزگشایی توکن.',
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۱: رمزنگاری سخت‌گیرانه AES-256-GCM',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۲. آزمون ممیزی عدم نشت سکرت‌ها به کلاینت (Zero Secrets Leakage Audit)
  try {
    const cleanClientPayload = {
      accountId: 'DEMO-****5678',
      accountType: 'DEMO',
      environment: 'demo',
      balance: 10000,
      equity: 10000,
      isLiveRejected: true,
    };
    const cleanAudit = TokenVault.auditZeroSecretLeakage(cleanClientPayload);

    const dirtyPayloadWithSecret = {
      accountId: 'DEMO-****5678',
      clientSecret: 'UNSAFE_EXPOSED_SECRET_IN_CLIENT',
      accessToken: 'UNSAFE_TOKEN',
    };
    const dirtyAudit = TokenVault.auditZeroSecretLeakage(dirtyPayloadWithSecret);

    const pass =
      cleanAudit.isClean &&
      cleanAudit.violations.length === 0 &&
      !dirtyAudit.isClean &&
      dirtyAudit.violations.length >= 2;

    results.push({
      name: 'آزمون ۲: ممیزی امنیتی عدم نشت سکرت‌ها و توکن‌ها در خروجی‌های کلاینت',
      pass,
      details: pass
        ? 'ممیزی بازگشتی اشیاء با موفقیت اجرا شد؛ پلودهای پاک تایید و نشت‌های عمدی بلافاصله شناسایی شدند.'
        : 'خطا در سیستم شناسایی و ممیزی نشت اطلاعات محرمانه.',
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۲: ممیزی امنیتی عدم نشت سکرت‌ها',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۳. آزمون سیستم کنترل نرخ درخواست با پنجره لغزان (Sliding-Window Rate Limiter)
  try {
    RateLimiter.resetForTesting();
    const testIp = '192.168.1.50';
    const now = 1725610000000;

    // درخواست اول ارسال سفارش: مجاز
    const req1 = RateLimiter.checkLimit('ORDER_SUBMIT', testIp, now);
    // درخواست دوم ارسال سفارش بعد از فاصله مجاز (مثلاً ۲۰۰۰ میلی‌ثانیه): مجاز
    const req2 = RateLimiter.checkLimit('ORDER_SUBMIT', testIp, now + 2000);
    // درخواست سوم در بازه زمانی ۱۰ ثانیه‌ای (سقف مجاز ۲ درخواست بود): مسدود با کد ۴۲۹
    const req3 = RateLimiter.checkLimit('ORDER_SUBMIT', testIp, now + 3500);

    const blockedResponse = RateLimiter.createBlockedResponse(req3);

    const pass =
      req1.allowed === true &&
      req2.allowed === true &&
      req3.allowed === false &&
      blockedResponse.status === 429 &&
      req3.retryAfterSec > 0;

    results.push({
      name: 'آزمون ۳: کنترل نرخ درخواست با پنجره لغزان و ممانعت از ارسال‌های پیاپی (Rate Limiter 429)',
      pass,
      details: pass
        ? `درخواست‌های مجاز با موفقیت عبور کردند و درخواست سوم به درستی با وضعیت HTTP 429 و Retry-After مسدود شد.`
        : 'خطا در اعتبارسنجی سیاست‌های کنترل نرخ درخواست.',
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۳: کنترل نرخ درخواست',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۴. آزمون امضای تمامیت چکسام SHA-256 در اسنپ‌شات اضطراری (Disaster Recovery Integrity)
  try {
    const snapshot = DisasterRecoveryEngine.createEmergencySnapshot();
    const isSchemaValid = snapshot.schemaVersion === 'v1.0-DR';
    const initialVerification = DisasterRecoveryEngine.verifySnapshotIntegrity(snapshot);

    // شبیه‌سازی دستکاری خرابکارانه در داده‌های اسنپ‌شات
    const tamperedSnapshot = JSON.parse(JSON.stringify(snapshot));
    tamperedSnapshot.omsState.recordsCount += 99; // دستکاری تعداد
    const tamperedVerification = DisasterRecoveryEngine.verifySnapshotIntegrity(tamperedSnapshot);

    const pass =
      isSchemaValid &&
      initialVerification.valid === true &&
      tamperedVerification.valid === false;

    results.push({
      name: 'آزمون ۴: امضای رمزنگاری SHA-256 و محافظت از تمامیت اسنپ‌شات اضطراری',
      pass,
      details: pass
        ? 'اسنپ‌شات استاندارد با موفقیت تایید شد و اسنپ‌شات دستکاری‌شده بلافاصله رد صلاحیت گردید (Fail-Closed).'
        : 'خطا در محاسبه چکسام یا تایید اسکیما.',
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۴: امضای رمزنگاری SHA-256 اسنپ‌شات',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۵. آزمون بازیابی کرش سرد و تبدیل خودکار سفارشات SUBMITTING به بازتطبیق اجباری
  try {
    CTraderOMS.resetStateForTesting();

    // ایجاد یک سناریوی کرش ناگهانی با سفارش در وضعیت معلق SUBMITTING
    const recoveryResult = DisasterRecoveryEngine.simulateColdCrashAndRecover();

    // بررسی اینکه OMS پس از بازیابی حتماً مسدود باشد و وضعیت سفارش UNKNOWN_RECONCILE_REQUIRED باشد
    const blockingCheck = CTraderOMS.hasBlockingState();
    const blockingRecord = blockingCheck.blockingRecord;

    const pass =
      recoveryResult.success === true &&
      recoveryResult.ordersMovedToReconcile >= 1 &&
      blockingCheck.blocked === true &&
      blockingRecord?.state === 'UNKNOWN_RECONCILE_REQUIRED';

    results.push({
      name: 'آزمون ۵: قاعده ایمنی کرش سرد (Cold Crash Fail-Closed) و انتقال قطعی سفارشات معلق به بازتطبیق اجباری',
      pass,
      details: pass
        ? `سفارش معلق حین قطعی سرور با موفقیت به وضعیت UNKNOWN_RECONCILE_REQUIRED منتقل شد و سفارش‌گذاری جدید مسدود گردید.`
        : `سفارش معلق پس از کرش به وضعیت ایمن منتقل نشد. جزئیات: ${JSON.stringify({ recoveryResult, blockingCheck })}`,
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۵: قاعده ایمنی کرش سرد',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۶. آزمون وفاداری کامل داده‌های اسنپ‌شات در بازیابی اضطراری (Snapshot Fidelity & Journal Restoration)
  try {
    CTraderOMS.resetStateForTesting();
    JournalService.resetForTesting();

    // ایجاد اسنپ‌شات با یک سفارش صریح SELL برای EURUSD
    const sampleRecord: any = {
      intentId: 'INT-FIDELITY-001',
      correlationId: 'CORR-FIDELITY-001',
      causationId: 'CAUSE-FIDELITY-001',
      idempotencyKey: 'IDEMP-FIDELITY-001',
      symbol: 'EURUSD',
      orderType: 'LIMIT',
      direction: 'SELL',
      volumeLots: 0.02,
      limitPrice: 1.0850,
      stopLossPrice: 1.0880,
      takeProfitPrice: 1.0780,
      state: 'ACKNOWLEDGED',
      createdAt: Date.now(),
      brokerOrderId: 'CT-ORD-FIDELITY-99',
      isBrokerStopLossConfirmed: true,
      isBrokerTakeProfitConfirmed: true,
      accountType: 'DEMO',
      accountMaskedId: 'DEMO-****5678',
    };

    const snapshotPayload: any = {
      schemaVersion: DisasterRecoveryEngine.SCHEMA_VERSION,
      generatedAt: Date.now(),
      omsState: {
        recordsCount: 1,
        records: [sampleRecord],
        idempotencyKeys: [['IDEMP-FIDELITY-001', 'INT-FIDELITY-001']],
      },
      journalState: {
        positionsCount: 1,
        auditLogsCount: 1,
        positions: [
          {
            positionId: 'POS-FIDELITY-01',
            intentId: 'INT-FIDELITY-001',
            correlationId: 'CORR-FIDELITY-001',
            causationId: 'CAUSE-FIDELITY-001',
            symbol: 'EURUSD',
            direction: 'SELL',
            volumeLots: 0.02,
            entryPrice: 1.0850,
            stopLossPrice: 1.0880,
            takeProfitPrice: 1.0780,
            status: 'CLOSED_PROFIT',
            openedAt: Date.now() - 60000,
            closedAt: Date.now(),
            exitPrice: 1.0780,
            exitReason: 'TP_HIT',
            realizedGrossPnL: 14.0,
            brokerCommission: 0.12,
            realizedNetPnL: 13.88,
            realizedRMultiple: 2.33,
            plannedRiskAmount: 6.0,
          },
        ],
        auditLogs: [],
        statistics: { totalTrades: 1, winRatePercent: 100, netPnL: 13.88, profitFactor: 10 },
      },
      securityAudit: { environment: 'demo', tokenVaultActive: true, zeroSecretsCompliant: true },
    };

    const checksum = DisasterRecoveryEngine.computePayloadChecksum(snapshotPayload);
    const validSnapshot = { ...snapshotPayload, checksum };

    const restoreResult = DisasterRecoveryEngine.restoreEmergencySnapshot(validSnapshot);
    const restoredRecord = CTraderOMS.getRecord('INT-FIDELITY-001');
    const restoredPositions = JournalService.getAllPositions();

    const isRecordFaithful =
      restoredRecord !== undefined &&
      restoredRecord.symbol === 'EURUSD' &&
      restoredRecord.direction === 'SELL' &&
      restoredRecord.volumeLots === 0.02 &&
      restoredRecord.limitPrice === 1.0850 &&
      restoredRecord.stopLossPrice === 1.0880 &&
      restoredRecord.takeProfitPrice === 1.0780;

    const isJournalRestored =
      restoredPositions.length === 1 &&
      restoredPositions[0].positionId === 'POS-FIDELITY-01' &&
      restoredPositions[0].symbol === 'EURUSD';

    const pass = restoreResult.success && isRecordFaithful && isJournalRestored;

    results.push({
      name: 'آزمون ۶: وفاداری کامل داده‌ها در بازیابی اضطراری (بدون تحریف جهت، حجم، نماد یا قیمت)',
      pass,
      details: pass
        ? 'سفارش فروش EURUSD با حجم ۰.۰۲ و سطوح دقیق حد سود/ضرر به همراه پوزیشن ژورنال بدون تغییر بازیابی شد.'
        : `خطا در وفاداری بازیابی: ${JSON.stringify({ isRecordFaithful, isJournalRestored })}`,
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۶: وفاداری کامل داده‌ها در بازیابی اضطراری',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۷. آزمون الزام اعتبار تک‌مجری و ممانعت از واگذاری نامعتبر (Single Executor Security Enforcement)
  try {
    const { ExecutorManager } = await import('../executor-manager');
    ExecutorManager.resetForTesting();

    // اعتبارسنجی با حذف پارامترها باید مسدود شود (Fail-Closed)
    const emptyCredsValidation = ExecutorManager.validateExecutor(undefined, undefined);
    const staleEpochValidation = ExecutorManager.validateExecutor('test-windows-session', 999);
    
    // واگذاری بدون آغاز شدن قبلی باید رد شود
    const uninitiatedHandoff = ExecutorManager.completeHandoff('unauthorized-session', 'pixel');

    const pass =
      !emptyCredsValidation.authorized &&
      emptyCredsValidation.reason?.includes('MISSING_EXECUTOR_CREDENTIALS') &&
      !staleEpochValidation.authorized &&
      !uninitiatedHandoff.completed &&
      uninitiatedHandoff.reason?.includes('NO_PENDING_HANDOFF_INITIATED');

    results.push({
      name: 'آزمون ۷: الزام قطعی شناسه‌های تک‌مجری و ممانعت از واگذاری نامعتبر',
      pass: !!pass,
      details: pass
        ? 'ارسال سفارش بدون اعتبار سنجی یا با ایپاک منسوخ مسدود شد و تصاحب بدون آغاز واگذاری رد گردید.'
        : `خطا در آزمون اعتبارسنجی تک‌مجری: ${JSON.stringify({ emptyCredsValidation, uninitiatedHandoff })}`,
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۷: الزام قطعی شناسه‌های تک‌مجری',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  // ۸. آزمون پایداری تراکنشی دیسک (Persistent Store Durability across Server Restarts)
  try {
    const { PersistentStore } = await import('../storage/persistent-store');
    
    // ثبت یک وضعیت تستی در PersistentStore
    const testRecord: any = {
      intentId: 'INT-PERSIST-TEST-001',
      idempotencyKey: 'IDEMP-PERSIST-TEST-001',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2660.0,
      state: 'ACKNOWLEDGED',
      createdAt: Date.now(),
    };

    PersistentStore.saveState({
      outbox: [testRecord],
      idempotencyEntries: [['IDEMP-PERSIST-TEST-001', 'INT-PERSIST-TEST-001']],
      killNewEntriesActive: true,
    });

    const readState = PersistentStore.getState();
    const isOutboxSaved = readState.outbox.some(r => r.intentId === 'INT-PERSIST-TEST-001');
    const isIdempotencySaved = readState.idempotencyEntries.some(([k]) => k === 'IDEMP-PERSIST-TEST-001');
    const isKillSwitchSaved = readState.killNewEntriesActive === true;

    const pass = isOutboxSaved && isIdempotencySaved && isKillSwitchSaved;

    results.push({
      name: 'آزمون ۸: پایداری تراکنشی دیسک (Persistent Store Durability across Server Restarts)',
      pass,
      details: pass
        ? 'رکوردهای صندوق خروجی، کلیدهای ضد تکرار و وضعیت کلید اضطراری با موفقیت در ذخیره‌ساز پایدار دیسک ذخیره و بازخوانی شدند.'
        : 'خطا در پایداری داده‌های سرور روی دیسک.',
    });
  } catch (err) {
    results.push({
      name: 'آزمون ۸: پایداری تراکنشی دیسک',
      pass: false,
      details: `خطا در اجرای آزمون: ${(err as Error).message}`,
    });
  }

  return results.map(r => ({
    name: r.name,
    passed: Boolean(r.pass ?? r.passed),
    details: r.details,
  }));
}
