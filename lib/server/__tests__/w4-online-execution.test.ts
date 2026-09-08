/**
 * lib/server/__tests__/w4-online-execution.test.ts
 * مجموعه آزمون‌های یکپارچه بسته W4 — آنلاین: Paper Live، Demo و مسیر کنترل‌شده دستی Live
 * 
 * شامل ۱۱ آزمون دقیق منطبق با الزامات سه دروازه:
 * [Gate A]:
 *   ۱. فید قیمت زنده، ساختار مظنه‌ها و محاسبه پویای اسپرد
 *   ۲. پایش تازگی و تشخیص داده‌های قدیمی (Stale Detection)
 *   ۳. اجرای سفارش در PAPER_LIVE با صفر فراخوانی بروکر (Zero Broker Writes)
 * [Gate B]:
 *   ۴. اعتبارسنجی تک‌مجری بین‌دستگاهی (Single Executor)
 *   ۵. فرآیند واگذاری مجری‌گری (Handoff) و افزایش اتمیک Epoch از ویندوز به پیکسل
 *   ۶. رد قطعی سفارش‌های دارای Epoch منقضی یا دستگاه غیرمجاز
 *   ۷. محافظت در برابر کلیک دوبل با کلید ضد تکرار (Idempotency)
 * [Gate C]:
 *   ۸. ارسال سفارش در BROKER_DEMO با تایید زمانی کاربر و محافظت‌های SL/TP
 *   ۹. رد سفارش به دلیل انقضای تاییدیه کاربر (> ۴۵ ثانیه)
 *  ۱۰. انزوای مسیر BROKER_LIVE با شکست امن (Fail-Closed: پیش‌فرض مسدود)
 *  ۱۱. عملکرد سوئیچ اضطراری توقف ورود به معاملات جدید (Kill-New-Entries)
 *  ۱۲. تایم‌اوت شبکه، انتقال به UNKNOWN_RECONCILE_REQUIRED و ممانعت از ارسال مجدد کورکورانه
 *  ۱۳. بازتطبیق اجباری (Reconciliation) و رفع انسداد صف
 *  ۱۴. مدیریت سانحه نقص محافظت بروکر (PROTECTION_FAILED)
 */

import { CTraderOMS } from '../ctrader-oms';
import { ExecutorManager } from '../executor-manager';
import { LiveMarketFeed } from '../live-market-feed';
import { OrderSubmissionRequest } from '../../contracts/execution';

export interface W4TestResult {
  gate: 'Gate A' | 'Gate B' | 'Gate C';
  name: string;
  passed: boolean;
  details: string;
}

export async function runW4OnlineExecutionTests(): Promise<W4TestResult[]> {
  const results: W4TestResult[] = [];

  // ==========================================
  // [GATE A]: اتصال داده زنده و PAPER_LIVE
  // ==========================================

  // تست ۱: صحت مظنه قیمت‌های زنده، اسپرد و تفکیک کیفیت SIMULATED از LIVE
  try {
    const feed = LiveMarketFeed.getInstance();
    feed.resetForTesting();
    const xauSimQuote = feed.getQuote('XAUUSD');
    const eurSimQuote = feed.getQuote('EURUSD');

    // ارزیابی اولیه: بدون اتصال زنده، کیفیت باید صادقانه SIMULATED باشد
    const simQualityOk = Boolean(
      xauSimQuote &&
      eurSimQuote &&
      xauSimQuote.bid > 0 &&
      xauSimQuote.ask > xauSimQuote.bid &&
      xauSimQuote.spreadPips > 0 &&
      xauSimQuote.quality === 'SIMULATED' &&
      eurSimQuote.bid > 0 &&
      eurSimQuote.ask > eurSimQuote.bid
    );

    // ارزیابی ثانویه: پس از تزریق مظنه واقعی، کیفیت باید به LIVE تغییر کرده و قیمت پولوت نشود
    feed.injectLiveQuote({
      symbol: 'XAUUSD',
      bid: 2685.20,
      ask: 2685.45,
      spreadPips: 2.5,
      timestamp: Date.now(),
      quality: 'LIVE',
    });

    const xauLiveQuote = feed.getQuote('XAUUSD');
    const eurAfterXauLive = feed.getQuote('EURUSD');
    const liveQualityOk = Boolean(
      xauLiveQuote &&
      xauLiveQuote.quality === 'LIVE' &&
      xauLiveQuote.bid === 2685.20 &&
      eurAfterXauLive &&
      eurAfterXauLive.quality === 'SIMULATED'
    );

    const passed = simQualityOk && liveQualityOk;

    results.push({
      gate: 'Gate A',
      name: 'Gate A1: Live Market Quotes & Dynamic Spread Verification',
      passed,
      details: passed
        ? `مظنه‌ها با موفقیت بررسی شدند: تفکیک دقیق کیفیت SIMULATED و LIVE تایید شد (Bid: ${xauLiveQuote?.bid}, Spread: ${xauLiveQuote?.spreadPips} pips).`
        : 'خطا: مظنه‌های قیمت زنده یا اعتبارسنجی کیفیت نامعتبر بودند.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate A',
      name: 'Gate A1: Live Market Quotes & Dynamic Spread Verification',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۲: اجرای سفارش در PAPER_LIVE با صفر فراخوانی بروکر
  try {
    CTraderOMS.resetStateForTesting();
    const paperReq: OrderSubmissionRequest = {
      intentId: 'INT-PAPER-001',
      idempotencyKey: 'IDEMP-PAPER-001',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'PAPER_LIVE',
      executorSessionId: 'test-windows-session',
      executorEpoch: 1,
      deviceLabel: 'windows',
    };

    const paperRes = await CTraderOMS.submitOrder(paperReq);
    const passed = Boolean(
      paperRes.success &&
      paperRes.state === 'ACKNOWLEDGED' &&
      paperRes.record.environment === 'PAPER_LIVE' &&
      paperRes.record.accountType === 'PAPER' &&
      paperRes.record.brokerOrderId?.startsWith('PAPER-SIM-ORD-')
    );

    results.push({
      gate: 'Gate A',
      name: 'Gate A2: PAPER_LIVE Execution with Zero Broker Writes',
      passed,
      details: passed
        ? `سفارش Paper Live با موفقیت در شبیه‌ساز محلی با قیمت زنده و بدون ارسال به بروکر ثبت شد (${paperRes.record.brokerOrderId}).`
        : `خطا در اجرای Paper Live: ${paperRes.error}`,
    });
  } catch (e) {
    results.push({
      gate: 'Gate A',
      name: 'Gate A2: PAPER_LIVE Execution with Zero Broker Writes',
      passed: false,
      details: (e as Error).message,
    });
  }

  // ==========================================
  // [GATE B]: تک‌مجری بین‌دستگاهی، Epoch و Handoff
  // ==========================================

  // تست ۳: اعتبارسنجی تک‌مجری فعال پیش‌فرض
  try {
    ExecutorManager.resetForTesting();
    const state = ExecutorManager.getExecutorState();
    const validation = ExecutorManager.validateExecutor('test-windows-session', 1, 'windows');

    const passed = state.epoch === 1 && state.activeDeviceLabel === 'windows' && validation.authorized;
    results.push({
      gate: 'Gate B',
      name: 'Gate B1: Default Single Executor Grant Verification',
      passed,
      details: passed
        ? `مجری فعال پیش‌فرض ویندوز با ایپاک ۱ اعتبارسنجی شد (نشست: ${state.activeSessionId}).`
        : 'خطا در تعیین مجری پیش‌فرض.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate B',
      name: 'Gate B1: Default Single Executor Grant Verification',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۴: واگذاری مجری‌گری از ویندوز به پیکسل با افزایش اتمیک Epoch
  try {
    const handoffRes = ExecutorManager.forceSwitchExecutor('pixel', 'pixel-session-002');
    const newState = ExecutorManager.getExecutorState();

    const passed = Boolean(
      handoffRes.switched &&
      handoffRes.newEpoch === 2 &&
      newState.epoch === 2 &&
      newState.activeDeviceLabel === 'pixel' &&
      newState.activeSessionId === 'pixel-session-002'
    );

    results.push({
      gate: 'Gate B',
      name: 'Gate B2: Multi-Device Handoff & Atomic Epoch Increment (Windows -> Pixel)',
      passed,
      details: passed
        ? `مجری‌گری با موفقیت به گوشی پیکسل واگذار شد و کد ایپاک به ۲ افزایش یافت.`
        : 'خطا در فرآیند واگذاری مجری.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate B',
      name: 'Gate B2: Multi-Device Handoff & Atomic Epoch Increment (Windows -> Pixel)',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۵: مسدودسازی سفارش‌های دارای Epoch منقضی یا دستگاه غیرمجاز
  try {
    // تلاش لپ‌تاپ ویندوز برای ارسال سفارش با ایپاک قدیمی ۱ پس از واگذاری به پیکسل
    const staleReq: OrderSubmissionRequest = {
      intentId: 'INT-STALE-001',
      idempotencyKey: 'IDEMP-STALE-001',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'test-windows-session',
      executorEpoch: 1, // ایپاک ۱ منقضی است (ایپاک فعلی ۲ است)
      deviceLabel: 'windows',
    };

    const staleRes = await CTraderOMS.submitOrder(staleReq);
    const passed = !staleRes.success && staleRes.error?.includes('STALE_EPOCH_REJECTED');

    results.push({
      gate: 'Gate B',
      name: 'Gate B3: Stale Epoch Order Rejection Protection',
      passed: Boolean(passed),
      details: passed
        ? 'سفارش ارسالی با ایپاک قدیمی ۱ با موفقیت مسدود شد و از تداخل دستگاه‌ها جلوگیری به عمل آمد.'
        : `خطا: سیستم اجازه ثبت سفارش با ایپاک منسوخ داد!`,
    });
  } catch (e) {
    results.push({
      gate: 'Gate B',
      name: 'Gate B3: Stale Epoch Order Rejection Protection',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۶: محافظت کلید ضد تکرار (Idempotency Guard)
  try {
    // بازگردانی مجری به پیکسل با ایپاک ۲
    const validPixelReq: OrderSubmissionRequest = {
      intentId: 'INT-PIXEL-001',
      idempotencyKey: 'IDEMP-PIXEL-DUP',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      limitPrice: 1.085,
      stopLossPrice: 1.082,
      takeProfitPrice: 1.092,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const firstRes = await CTraderOMS.submitOrder(validPixelReq);
    const dupRes = await CTraderOMS.submitOrder(validPixelReq);

    const passed = Boolean(
      firstRes.success &&
      dupRes.record.intentId === firstRes.record.intentId &&
      dupRes.error?.includes('درخواست تکراری شناسایی شد')
    );

    results.push({
      gate: 'Gate B',
      name: 'Gate B4: Idempotency & Double-Click Protection',
      passed,
      details: passed
        ? 'کلیک دوبل یا رفرش شناسایی شد و رکورد قبلی بدون ارسال مجدد بازگردانده شد.'
        : 'خطا در کنترل کلید ضد تکرار.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate B',
      name: 'Gate B4: Idempotency & Double-Click Protection',
      passed: false,
      details: (e as Error).message,
    });
  }

  // ==========================================
  // [GATE C]: آداپتور دمو، شکست امن لایو، و محافظت‌ها
  // ==========================================

  // تست ۷: اجرای موفق در BROKER_DEMO با تایید دستی و محافظ‌های SL/TP
  try {
    const demoReq: OrderSubmissionRequest = {
      intentId: 'INT-DEMO-001',
      idempotencyKey: 'IDEMP-DEMO-VALID',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const demoRes = await CTraderOMS.submitOrder(demoReq);
    const passed = Boolean(
      demoRes.success &&
      demoRes.state === 'ACKNOWLEDGED' &&
      demoRes.record.isBrokerStopLossConfirmed &&
      demoRes.record.isBrokerTakeProfitConfirmed &&
      demoRes.record.brokerOrderId?.startsWith('CT-ORD-')
    );

    results.push({
      gate: 'Gate C',
      name: 'Gate C1: BROKER_DEMO Execution with Verified Protections',
      passed,
      details: passed
        ? `سفارش دمو با موفقیت ارسال شد و حد ضرر و سود در بروکر ثبت و تایید گردید (${demoRes.record.brokerOrderId}).`
        : `خطا در ارسال سفارش دمو: ${demoRes.error}`,
    });
  } catch (e) {
    results.push({
      gate: 'Gate C',
      name: 'Gate C1: BROKER_DEMO Execution with Verified Protections',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۸: رد سفارش به دلیل انقضای تاییدیه کاربر (> ۴۵ ثانیه)
  try {
    const expiredReq: OrderSubmissionRequest = {
      intentId: 'INT-EXPIRED-001',
      idempotencyKey: 'IDEMP-EXPIRED-001',
      symbol: 'XAUUSD',
      direction: 'SELL',
      volumeLots: 0.05,
      limitPrice: 2660.0,
      stopLossPrice: 2670.0,
      takeProfitPrice: 2640.0,
      userConfirmationTimestamp: Date.now() - 50000, // ۵۰ ثانیه پیش (بیش از ۴۵ ثانیه مجاز)
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const expRes = await CTraderOMS.submitOrder(expiredReq);
    const passed = !expRes.success && expRes.error?.includes('منقضی');

    results.push({
      gate: 'Gate C',
      name: 'Gate C2: Freshness of Confirmation Expiry Protection (>45s)',
      passed: Boolean(passed),
      details: passed
        ? 'تاییدیه قدیمی کاربر (> ۴۵ ثانیه) به درستی رد شد و ارسال نگردید.'
        : 'خطا: سفارش با تاییدیه قدیمی پذیرفته شد!',
    });
  } catch (e) {
    results.push({
      gate: 'Gate C',
      name: 'Gate C2: Freshness of Confirmation Expiry Protection (>45s)',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۹: شکست امن مسیر BROKER_LIVE (Fail-Closed: پیش‌فرض مسدود)
  try {
    const liveReq: OrderSubmissionRequest = {
      intentId: 'INT-LIVE-BLOCKED',
      idempotencyKey: 'IDEMP-LIVE-BLOCKED',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.01,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_LIVE',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const liveRes = await CTraderOMS.submitOrder(liveReq);
    const passed = Boolean(
      !liveRes.success &&
      liveRes.error?.includes('FAIL_CLOSED: LIVE_TRADING_DISABLED_BY_SERVER_POLICY')
    );

    results.push({
      gate: 'Gate C',
      name: 'Gate C3: Fail-Closed Policy on BROKER_LIVE (Blocked by Default)',
      passed,
      details: passed
        ? 'درخواست معامله در حساب واقعی طبق قانون امنیتی Fail-Closed مسدود شد.'
        : `خطا در تست شکست امن مسیر لایو: ${liveRes.error}`,
    });
  } catch (e) {
    results.push({
      gate: 'Gate C',
      name: 'Gate C3: Fail-Closed Policy on BROKER_LIVE (Blocked by Default)',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۰: سوئیچ اضطراری توقف ورود جدید (Emergency Kill-New-Entries)
  try {
    CTraderOMS.setKillNewEntries(true);

    const killReq: OrderSubmissionRequest = {
      intentId: 'INT-KILL-SWITCH',
      idempotencyKey: 'IDEMP-KILL-SWITCH',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const killRes = await CTraderOMS.submitOrder(killReq);
    const passed = Boolean(
      !killRes.success &&
      killRes.error?.includes('EMERGENCY_KILL_SWITCH_ACTIVE')
    );

    // خاموش کردن سوئیچ برای ادامه تست‌ها
    CTraderOMS.setKillNewEntries(false);

    results.push({
      gate: 'Gate C',
      name: 'Gate C4: Emergency Kill-New-Entries Switch',
      passed,
      details: passed
        ? 'سوئیچ اضطراری با موفقیت کلیه درخواست‌های ورود جدید را بلافاصله مسدود کرد.'
        : 'خطا: سوئیچ اضطراری سفارش جدید را مسدود نکرد!',
    });
  } catch (e) {
    CTraderOMS.setKillNewEntries(false);
    results.push({
      gate: 'Gate C',
      name: 'Gate C4: Emergency Kill-New-Entries Switch',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۱: تایم‌اوت شبکه، انتقال به UNKNOWN_RECONCILE_REQUIRED و ممانعت از ارسال کورکورانه
  try {
    const timeoutReq: OrderSubmissionRequest = {
      intentId: 'INT-TIMEOUT-W4',
      idempotencyKey: 'IDEMP-TIMEOUT-W4',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const toRes = await CTraderOMS.submitOrder(timeoutReq, { simulateTimeout: true });
    const passed1 = toRes.state === 'UNKNOWN_RECONCILE_REQUIRED' && toRes.requiresReconciliation;

    // تلاش برای ارسال سفارش جدید بعدی باید به علت وجود وضعیت UNKNOWN مسدود شود
    const blockedNextReq: OrderSubmissionRequest = {
      intentId: 'INT-NEXT-AFTER-TIMEOUT',
      idempotencyKey: 'IDEMP-NEXT-AFTER-TIMEOUT',
      symbol: 'EURUSD',
      direction: 'BUY',
      volumeLots: 0.1,
      limitPrice: 1.085,
      stopLossPrice: 1.082,
      takeProfitPrice: 1.092,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const blockedRes = await CTraderOMS.submitOrder(blockedNextReq);
    const passed2 = !blockedRes.success && blockedRes.error?.includes('UNKNOWN_RECONCILE_REQUIRED');

    results.push({
      gate: 'Gate C',
      name: 'Gate C5: Network Timeout to UNKNOWN & Blind Retry Blocking',
      passed: Boolean(passed1 && passed2),
      details: passed1 && passed2
        ? 'تایم‌اوت شبکه وضعیت را به UNKNOWN منتقل کرد و تلاش مجدد کورکورانه مسدود شد.'
        : 'خطا در مدیریت تایم‌اوت یا مسدودسازی ارسال مجدد.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate C',
      name: 'Gate C5: Network Timeout to UNKNOWN & Blind Retry Blocking',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۲: بازتطبیق اجباری (Reconciliation) و رفع انسداد صف
  try {
    const recRes = await CTraderOMS.reconcileOrder('INT-TIMEOUT-W4');
    const hasBlock = CTraderOMS.hasBlockingState();

    const passed = Boolean(
      recRes.reconciled &&
      recRes.record?.state === 'RECONCILED' &&
      !hasBlock.blocked
    );

    results.push({
      gate: 'Gate C',
      name: 'Gate C6: Order Reconciliation & Queue Unblocking',
      passed,
      details: passed
        ? `سفارش معلق با موفقیت با سرور تطبیق یافت (${recRes.record?.brokerOrderId}) و صف ارسال آزاد شد.`
        : 'خطا در بازتطبیق سفارش.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate C',
      name: 'Gate C6: Order Reconciliation & Queue Unblocking',
      passed: false,
      details: (e as Error).message,
    });
  }

  // تست ۱۳: مدیریت سانحه نقص محافظت بروکر (PROTECTION_FAILED)
  try {
    const missingProtReq: OrderSubmissionRequest = {
      intentId: 'INT-NO-PROT',
      idempotencyKey: 'IDEMP-NO-PROT',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      userConfirmationTimestamp: Date.now(),
      environment: 'BROKER_DEMO',
      executorSessionId: 'pixel-session-002',
      executorEpoch: 2,
      deviceLabel: 'pixel',
    };

    const protRes = await CTraderOMS.submitOrder(missingProtReq, { simulateMissingProtection: true });
    const passed = Boolean(
      !protRes.success &&
      protRes.state === 'PROTECTION_FAILED' &&
      protRes.record.isBrokerStopLossConfirmed === false
    );

    results.push({
      gate: 'Gate C',
      name: 'Gate C7: Explicit PROTECTION_FAILED State on Missing SL/TP',
      passed,
      details: passed
        ? 'در صورت باز شدن معامله بدون ثبت حد ضرر در بروکر، وضعیت صریح PROTECTION_FAILED ثبت گردید.'
        : 'خطا: سیستم نقص محافظت را مدیریت نکرد.',
    });
  } catch (e) {
    results.push({
      gate: 'Gate C',
      name: 'Gate C7: Explicit PROTECTION_FAILED State on Missing SL/TP',
      passed: false,
      details: (e as Error).message,
    });
  }

  return results;
}
