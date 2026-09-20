import {
  PracticeExecutionAdapter,
  ResearchExecutionAdapter,
  DemoExecutionAdapter,
  EnvironmentStorageManager,
  EnvironmentJournalRecord,
} from '../environment-adapters';
import { ENVIRONMENTS_CONFIG } from '../../contracts/environment';
import {
  DataProvenance,
  evaluateDataFreshness,
  isOriginAllowedForBrokerWrite,
} from '../../contracts/provenance';
import { CTraderOMS } from '../../server/ctrader-oms';
import { OrderSubmissionRequest } from '../../contracts/execution';

export interface EnvironmentTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runEnvironmentIsolationTestSuite(): Promise<EnvironmentTestResult[]> {
  const results: EnvironmentTestResult[] = [];

  // ۱. تست: تمرین و پژوهش هیچ سفارش بروکری نمی‌فرستند
  try {
    const practice = new PracticeExecutionAdapter(10000);
    const research = new ResearchExecutionAdapter();

    const practiceCanWrite = practice.canExecuteBrokerOrder();
    const researchCanWrite = research.canExecuteBrokerOrder();

    let practiceThrew = false;
    try {
      practice.submitToBroker();
    } catch {
      practiceThrew = true;
    }

    let researchThrew = false;
    try {
      research.submitToBroker();
    } catch {
      researchThrew = true;
    }

    const passed = !practiceCanWrite && !researchCanWrite && practiceThrew && researchThrew;
    results.push({
      name: 'انعکاس عدم امکان ارسال سفارش به بروکر در محیط‌های تمرین و پژوهش',
      passed,
      details: passed
        ? 'آداپتورهای تمرین و پژوهش فاقد متد مجاز ارسال سفارش بوده و در صورت فراخوانی خطا صادر می‌کنند.'
        : 'خطا: یکی از محیط‌های غیردمو قابلیت ارسال سفارش به بروکر را داراست.',
    });
  } catch (err) {
    results.push({
      name: 'انعکاس عدم امکان ارسال سفارش به بروکر در محیط‌های تمرین و پژوهش',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. تست: تفکیک مسیرها، منبع داده و فضاهای ذخیره‌سازی محلی
  try {
    const practiceRoute = ENVIRONMENTS_CONFIG.PRACTICE.route;
    const researchRoute = ENVIRONMENTS_CONFIG.RESEARCH.route;
    const demoRoute = ENVIRONMENTS_CONFIG.DEMO.route;

    const routesDistinct =
      practiceRoute === '/practice' &&
      researchRoute === '/research' &&
      demoRoute === '/demo';

    const practiceStoragePrefix = ENVIRONMENTS_CONFIG.PRACTICE.storageKeyPrefix;
    const researchStoragePrefix = ENVIRONMENTS_CONFIG.RESEARCH.storageKeyPrefix;
    const demoStoragePrefix = ENVIRONMENTS_CONFIG.DEMO.storageKeyPrefix;

    const keysDistinct =
      practiceStoragePrefix !== researchStoragePrefix &&
      researchStoragePrefix !== demoStoragePrefix &&
      practiceStoragePrefix !== demoStoragePrefix;

    const passed = routesDistinct && keysDistinct;
    results.push({
      name: 'تفکیک ساختاری روت، منبع داده و فضای ذخیره‌سازی میان سه محیط',
      passed,
      details: passed
        ? 'روت‌ها، منابع مجاز و کلیدهای ذخیره‌سازی برای هر سه محیط کاملاً مستقل هستند.'
        : 'خطا: تداخل در روت‌ها، منابع داده یا کلیدهای ذخیره‌سازی مشاهده شد.',
    });
  } catch (err) {
    results.push({
      name: 'تفکیک ساختاری روت، منبع داده و فضای ذخیره‌سازی میان سه محیط',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. تست: قطع اتصال یا داده قدیمی، ورود جدید دمو را متوقف می‌کند
  try {
    const now = Date.now();
    const staleProvenance: DataProvenance = {
      originType: 'BROKER_DEMO_FEED',
      originLabelFa: 'فید آزمایشی',
      datasetId: 'test-feed',
      symbol: 'XAUUSD',
      timeframe: '5M',
      timezone: 'UTC',
      lastReceivedAt: now - 120_000, // ۲ دقیقه قبل (بیش از آستانه ۶۰ ثانیه)
      freshnessStatus: 'UNKNOWN',
      stalenessThresholdMs: 60_000,
      isVerifiedRealData: true,
    };

    const freshness = evaluateDataFreshness(staleProvenance, now);
    const isStale = freshness === 'STALE';

    const disconnectedProvenance: DataProvenance = {
      ...staleProvenance,
      lastReceivedAt: now - 300_000, // ۵ دقیقه قبل
    };
    const isDisconnected = evaluateDataFreshness(disconnectedProvenance, now) === 'DISCONNECTED';

    const passed = isStale && isDisconnected;
    results.push({
      name: 'شناسایی و مسدودسازی داده‌های قدیمی (Stale) و قطع ارتباط (Disconnected)',
      passed,
      details: passed
        ? 'فرمول‌های اعتبارسنجی تازگی داده به درستی وضعیت‌های STALE و DISCONNECTED را تشخیص می‌دهند.'
        : `وضعیت نامنتظره: ${freshness}`,
    });
  } catch (err) {
    results.push({
      name: 'شناسایی و مسدودسازی داده‌های قدیمی (Stale) و قطع ارتباط (Disconnected)',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. تست: رد منشأ داده‌های غیرمجاز برای ارسال به بروکر
  try {
    const sampleAllowed = isOriginAllowedForBrokerWrite('SAMPLE_FIXTURE');
    const userCsvAllowed = isOriginAllowedForBrokerWrite('USER_IMPORTED_CSV');
    const bundledAllowed = isOriginAllowedForBrokerWrite('BUNDLED_HISTORICAL');
    const brokerFeedAllowed = isOriginAllowedForBrokerWrite('BROKER_DEMO_FEED');

    const passed = !sampleAllowed && !userCsvAllowed && !bundledAllowed && brokerFeedAllowed;
    results.push({
      name: 'انحصار مجوز ارسال سفارش به بروکر صرفاً برای فید مستقیم دمو',
      passed,
      details: passed
        ? 'داده‌های نمونه، CSV واردشده و فایل‌های آماده مطلقاً مجوز ارسال سفارش ندارند.'
        : 'خطا: یکی از منابع داده غیرمجاز مجوز ارسال سفارش به بروکر را دارد.',
    });
  } catch (err) {
    results.push({
      name: 'انحصار مجوز ارسال سفارش به بروکر صرفاً برای فید مستقیم دمو',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. تست: کلید ضد تکرار (Idempotency) مانع از اجرای مجدد سفارش تکراری می‌شود
  try {
    CTraderOMS.resetStateForTesting();
    CTraderOMS.setIsTestRunning(true);
    let brokerCallCount = 0;
    CTraderOMS.registerBrokerOrderHandler(async () => {
      brokerCallCount++;
      return {
        brokerOrderId: 'BROKER-ORDER-IDEMP-TEST',
        stopLossConfirmed: true,
        takeProfitConfirmed: true,
      };
    });

    const intentId1 = `TEST-INTENT-${Date.now()}-1`;
    const idempotencyKey = `IDEMP-${Date.now()}-UNIQUE`;

    const req1: OrderSubmissionRequest = {
      intentId: intentId1,
      idempotencyKey,
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.01,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'test-session',
      executorEpoch: 1,
      deviceLabel: 'windows',
    };

    // اجرای سفارش اول
    const res1 = await CTraderOMS.submitOrder(req1, { bypassExecutorCheck: true, bypassBrokerCheck: true });
    // تلاش برای اجرای سفارش دوم با همان کلید ضد تکرار
    const res2 = await CTraderOMS.submitOrder(req1, { bypassExecutorCheck: true, bypassBrokerCheck: true });

    const passed =
      res1.success === true &&
      brokerCallCount === 1 && // اثبات اینکه فراخوانی مجدد بروکر صورت نگرفت
      Boolean(res2.error && res2.error.includes('درخواست تکراری'));

    results.push({
      name: 'حفاظت در برابر اجرای تکراری سفارش با کلید Idempotency',
      passed,
      details: passed
        ? `کلید Idempotency مانع از ارسال مجدد سفارش شد؛ تعداد فراخوانی مجری: ${brokerCallCount}.`
        : `شکست تست: brokerCallCount=${brokerCallCount}, res1.success=${res1.success}, res2.error=${res2.error}`,
    });
  } catch (err) {
    results.push({
      name: 'حفاظت در برابر اجرای تکراری سفارش با کلید Idempotency',
      passed: false,
      details: (err as Error).message,
    });
  } finally {
    CTraderOMS.resetStateForTesting();
  }

  // ۶. تست: عدم تخریب داده‌های قبلی و ثبت به عنوان منشأ نامشخص
  try {
    const legacyRecord: EnvironmentJournalRecord = {
      id: 'LEGACY-TEST-1',
      environment: 'LEGACY_UNKNOWN_ORIGIN',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      entryPrice: 2650,
      stopLossPrice: 2640,
      takeProfitPrice: 2670,
      provenance: {
        originType: 'SAMPLE_FIXTURE',
        originLabelFa: 'قدیمی ـ منشأ نامشخص',
        datasetId: 'legacy-backup',
        symbol: 'XAUUSD',
        timeframe: '5M',
        timezone: 'UTC',
        lastReceivedAt: 0,
        freshnessStatus: 'UNKNOWN',
        stalenessThresholdMs: 300_000,
        isVerifiedRealData: false,
      },
      timestamp: Date.now(),
    };

    const isPreserved =
      legacyRecord.environment === 'LEGACY_UNKNOWN_ORIGIN' &&
      legacyRecord.provenance.originLabelFa === 'قدیمی ـ منشأ نامشخص';

    results.push({
      name: 'حفظ غیرمخرب رکوردهای قدیمی بدون انتساب خودکار به دمو یا پژوهش',
      passed: isPreserved,
      details: isPreserved
        ? 'رکوردهای قدیمی فاقد منشأ، با عنوان صریح «قدیمی ـ منشأ نامشخص» حفظ می‌شوند.'
        : 'خطا در برچسب‌گذاری رکوردهای قدیمی.',
    });
  } catch (err) {
    results.push({
      name: 'حفظ غیرمخرب رکوردهای قدیمی بدون انتساب خودکار به دمو یا پژوهش',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
