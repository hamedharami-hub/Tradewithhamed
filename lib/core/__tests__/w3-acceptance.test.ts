// lib/core/__tests__/w3-acceptance.test.ts
// آزمون‌های جامع پذیرش بسته W3 (Gate W3 Acceptance Tests)
// شامل ۷ آزمون اعتبارسنجی دقیق چرخه حیات سفارش‌ها، پایش کیفیت، لغزش، آیدمپوتنسی و بازتطبیق

import { LiveShadowExecutionEngine } from '../live-shadow-engine';
import { OrderIntentPayload } from '../ports';
import { IBrokerAdapter, BrokerExecutionResponse } from '../broker-adapter';
import { LiveShadowOrder } from '../../contracts/w3-ems';

export interface W3AcceptanceTestResult {
  id: string;
  nameFa: string;
  nameEn: string;
  passed: boolean;
  details: string;
  category: 'STATE_MACHINE' | 'IDEMPOTENCY' | 'CONCURRENCY' | 'FAIL_CLOSED' | 'RECONCILIATION' | 'DRIFT' | 'RISK_GUARD';
}

export async function runW3AcceptanceSuite(): Promise<W3AcceptanceTestResult[]> {
  const results: W3AcceptanceTestResult[] = [];

  // تست ۱: ترنزیشن‌های دقیق چرخه حیات سفارش و مهرهای زمانی صعودی
  try {
    const engine = new LiveShadowExecutionEngine();
    const intent: OrderIntentPayload = {
      intentId: 'W3-INT-01',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-01',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      reasonCode: 'S0_PULLBACK',
      createdTimestamp: 1000,
      idempotencyKey: 'W3-KEY-01',
    };

    const res = await engine.submitOrder(intent, 1000);
    const order = res.order;

    const passed =
      res.success === true &&
      order !== undefined &&
      order.state === 'FILLED' &&
      (order.submittedAt ?? 0) >= order.createdAt &&
      (order.acknowledgedAt ?? 0) >= (order.submittedAt ?? 0) &&
      (order.filledAt ?? 0) >= (order.acknowledgedAt ?? 0) &&
      order.brokerOrderId !== undefined &&
      order.qualityMetric !== undefined &&
      order.qualityMetric.executionQualityScore > 0;

    results.push({
      id: 'W3-01',
      nameFa: 'صحت ترنزیشن‌های چرخه حیات سفارش و توالی زمانی',
      nameEn: 'Order Lifecycle State Machine & Ascending Timestamps',
      passed,
      details: passed
        ? `سفارش با موفقیت از VALIDATED به SUBMITTING سپس ACKNOWLEDGED و نهایتاً FILLED انتقال یافت (EQS: ${order?.qualityMetric?.executionQualityScore})`
        : `خطا در توالی زمانی یا وضعیت نهایی سفارش: ${JSON.stringify(order?.state)}`,
      category: 'STATE_MACHINE',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-01',
      nameFa: 'صحت ترنزیشن‌های چرخه حیات سفارش و توالی زمانی',
      nameEn: 'Order Lifecycle State Machine & Ascending Timestamps',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'STATE_MACHINE',
    });
  }

  // تست ۲: حفاظت آیدمپوتنسی و مسدودسازی کلیک دوبل / رفرش صفحه
  try {
    const engine = new LiveShadowExecutionEngine();
    const intent: OrderIntentPayload = {
      intentId: 'W3-INT-02',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-02',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'SELL',
      volumeLots: 0.2,
      entryPrice: 2660.0,
      stopLossPrice: 2670.0,
      takeProfitPrice: 2640.0,
      reasonCode: 'S0_SWEEP',
      createdTimestamp: 2000,
      idempotencyKey: 'W3-DUP-KEY-77',
    };

    const firstSubmit = await engine.submitOrder(intent, 2000);
    const secondSubmit = await engine.submitOrder(intent, 2010); // ارسال مجدد با همان کلید

    const allOrders = engine.getOrders();

    const passed =
      firstSubmit.success === true &&
      secondSubmit.isDuplicate === true &&
      secondSubmit.order?.id === firstSubmit.order?.id &&
      allOrders.length === 1; // مطمئن شویم فقط ۱ رکورد در کل سیستم ایجاد شده است

    results.push({
      id: 'W3-02',
      nameFa: 'حفاظت آیدمپوتنسی و جلوگیری از ارسال تکراری سفارش',
      nameEn: 'Idempotency Guard & Double-Click / Refresh Protection',
      passed,
      details: passed
        ? `کلید تکراری با موفقیت رهگیری شد؛ ارسال دوم متوقف و سفارش قبلی با شناسه ${firstSubmit.order?.id} بدون تکثیر بازگردانده شد.`
        : `شکست در فیلتر کلید تکراری: تعداد سفارشات ثبت‌شده = ${allOrders.length}`,
      category: 'IDEMPOTENCY',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-02',
      nameFa: 'حفاظت آیدمپوتنسی و جلوگیری از ارسال تکراری سفارش',
      nameEn: 'Idempotency Guard & Double-Click / Refresh Protection',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'IDEMPOTENCY',
    });
  }

  // تست ۳: قانون تک‌سفارش در حال پرواز (Single In-Flight Order Guard)
  try {
    // آداپتور آزمایشی معلق‌کننده سفارش در شبکه
    class HangingBrokerAdapter implements IBrokerAdapter {
      public readonly adapterName = 'HangingBrokerAdapter';
      public async submitLimitOrder(order: LiveShadowOrder): Promise<BrokerExecutionResponse> {
        return {
          success: true,
          brokerOrderId: `HANGING-ORD-${order.intentId}`,
          latencyMs: 50,
          // fillPrice ندارد تا سفارش معلق در وضعیت ACKNOWLEDGED بماند
        };
      }
      public async cancelOrder(): Promise<boolean> { return true; }
      public async queryBrokerSnapshot() { return []; }
    }

    const engine = new LiveShadowExecutionEngine({}, new HangingBrokerAdapter());

    const intent1: OrderIntentPayload = {
      intentId: 'W3-INFLIGHT-01',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-03',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2655.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2675.0,
      reasonCode: 'TEST',
      createdTimestamp: 3000,
      idempotencyKey: 'INFLIGHT-KEY-01',
    };

    const intent2: OrderIntentPayload = {
      intentId: 'W3-INFLIGHT-02',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-04',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2656.0,
      stopLossPrice: 2646.0,
      takeProfitPrice: 2676.0,
      reasonCode: 'TEST',
      createdTimestamp: 3050,
      idempotencyKey: 'INFLIGHT-KEY-02',
    };

    await engine.submitOrder(intent1, 3000); // سفارش ۱ در وضعیت ACKNOWLEDGED باقی می‌ماند
    const res2 = await engine.submitOrder(intent2, 3050); // تلاش برای سفارش ۲

    const passed =
      res2.success === false &&
      res2.error?.includes('قانون تک‌سفارش همزمان نقض شد') === true;

    results.push({
      id: 'W3-03',
      nameFa: 'قانون تک‌سفارش فعال در حال ارسال (Single In-Flight Order)',
      nameEn: 'Single Active In-Flight Order Concurrency Constraint',
      passed,
      details: passed
        ? 'سفارش دوم در زمان حضور سفارش فعال در شبکه به صورت خودکار مسدود و رد شد.'
        : `سفارش دوم به اشتباه پذیرفته شد یا پیام رد مورد انتظار نبود: ${res2.error}`,
      category: 'CONCURRENCY',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-03',
      nameFa: 'قانون تک‌سفارش فعال در حال ارسال (Single In-Flight Order)',
      nameEn: 'Single Active In-Flight Order Concurrency Constraint',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'CONCURRENCY',
    });
  }

  // تست ۴: قفل ایمنی Fail-Closed در صورت بروز خطای تایم‌اوت یا ابهام شبکه
  try {
    class FailingBrokerAdapter implements IBrokerAdapter {
      public readonly adapterName = 'FailingBrokerAdapter';
      public async submitLimitOrder(): Promise<BrokerExecutionResponse> {
        throw new Error('ETIMEDOUT: Connection reset by peer after SUBMITTING');
      }
      public async cancelOrder(): Promise<boolean> { return true; }
      public async queryBrokerSnapshot() { return []; }
    }

    const engine = new LiveShadowExecutionEngine({}, new FailingBrokerAdapter());

    const intent: OrderIntentPayload = {
      intentId: 'W3-FAIL-01',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-FAIL',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      reasonCode: 'TEST',
      createdTimestamp: 4000,
      idempotencyKey: 'FAIL-KEY-01',
    };

    const res = await engine.submitOrder(intent, 4000);
    const order = engine.getOrders().find(o => o.intentId === 'W3-FAIL-01');
    const gateCheck = engine.getReconciliationEngine().canSubmitNewOrder();

    // تلاش برای ثبت سفارش بعدی در حالی که سیستم قفل است
    const intentNext: OrderIntentPayload = {
      intentId: 'W3-FAIL-NEXT',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-FAIL-2',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      reasonCode: 'TEST',
      createdTimestamp: 4100,
      idempotencyKey: 'FAIL-KEY-NEXT',
    };
    const resNext = await engine.submitOrder(intentNext, 4100);

    const passed =
      res.success === false &&
      order?.state === 'UNKNOWN_RECONCILE_REQUIRED' &&
      gateCheck.allowed === false &&
      resNext.success === false &&
      resNext.error?.includes('Fail-Closed') === true;

    results.push({
      id: 'W3-04',
      nameFa: 'قفل ایمنی Fail-Closed در زمان خطای مبهم شبکه یا تایم‌اوت',
      nameEn: 'Fail-Closed Network Timeout & Safety Lock',
      passed,
      details: passed
        ? 'سفارش با موفقیت به وضعیت UNKNOWN_RECONCILE_REQUIRED منتقل شده و کلیه ارسال‌های جدید تا رفع ابهام مسدود شدند.'
        : `وضعیت سفارش یا گیت ایمنی نامعتبر است: State=${order?.state}, Allowed=${gateCheck.allowed}`,
      category: 'FAIL_CLOSED',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-04',
      nameFa: 'قفل ایمنی Fail-Closed در زمان خطای مبهم شبکه یا تایم‌اوت',
      nameEn: 'Fail-Closed Network Timeout & Safety Lock',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'FAIL_CLOSED',
    });
  }

  // تست ۵: بازتطبیق موفق وضعیت مبهم و بازگشایی امن معاملات
  try {
    const engine = new LiveShadowExecutionEngine();
    const reconEngine = engine.getReconciliationEngine();

    // ایجاد یک سفارش در وضعیت UNKNOWN
    const dummyOrder: LiveShadowOrder = {
      id: 'ORD-RECON-01',
      intentId: 'INT-RECON-01',
      correlationId: 'CORR-01',
      idempotencyKey: 'KEY-RECON-01',
      environment: 'PAPER_LIVE',
      symbol: 'XAUUSD',
      direction: 'BUY',
      orderType: 'LIMIT',
      volumeLots: 0.1,
      requestedPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      maxSlippagePips: 2.0,
      state: 'UNKNOWN_RECONCILE_REQUIRED',
      createdAt: 5000,
      submittedAt: 5000,
      reasonCode: 'TEST',
    };

    const incident = reconEngine.registerIncident(
      dummyOrder,
      'TIMEOUT',
      'تست ابهام بازتطبیق',
      5000
    );

    const lockedBefore = reconEngine.canSubmitNewOrder().allowed;

    // حل دستی سانحه با تایید لغو سفارش در بروکر
    reconEngine.manualOverride(
      incident.incidentId,
      [dummyOrder],
      'CANCELLED',
      5500,
      'تایید لغو عدم حضور در فهرست بروکر'
    );

    const unlockedAfter = reconEngine.canSubmitNewOrder().allowed;

    const passed =
      lockedBefore === false &&
      unlockedAfter === true &&
      dummyOrder.state === 'CANCELLED' &&
      dummyOrder.reconciledAt === 5500;

    results.push({
      id: 'W3-05',
      nameFa: 'حل سانحه بازتطبیق و بازگشایی امن سامانه معاملاتی',
      nameEn: 'Reconciliation Resolution & Engine Safety Unlock',
      passed,
      details: passed
        ? 'سانحه بازتطبیق رفع و وضعیت سفارش لغو گردید؛ قفل Fail-Closed برداشته شده و سامانه مجدداً مجاز به ثبت سفارش شد.'
        : `وضعیت نهایی: Before=${lockedBefore}, After=${unlockedAfter}, OrderState=${dummyOrder.state}`,
      category: 'RECONCILIATION',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-05',
      nameFa: 'حل سانحه بازتطبیق و بازگشایی امن سامانه معاملاتی',
      nameEn: 'Reconciliation Resolution & Engine Safety Unlock',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'RECONCILIATION',
    });
  }

  // تست ۶: پایشگر کیفیت اجرا، امتیازدهی EQS و هشدار لغزش نامطلوب
  try {
    const engine = new LiveShadowExecutionEngine({
      maxAcceptableSlippagePips: 2.0,
      maxAcceptableLatencyMs: 300,
    });
    const driftMonitor = engine.getDriftMonitor();

    // اجرای ارزیابی یک معامله خرید با لغزش نامطلوب ۳.۵ پیپ و تاخیر ۶۰۰ میلی ثانیه
    const metric = driftMonitor.evaluateExecution({
      symbol: 'XAUUSD',
      direction: 'BUY',
      requestedPrice: 2650.0,
      executedPrice: 2650.35, // 0.35 دلار = ۳.۵ پیپ لغزش در انس طلا
      submittedAt: 6000,
      acknowledgedAt: 6400, // 400ms
      filledAt: 6600,       // 600ms کل
      spreadPipsAtExecution: 1.5,
    });

    const stats = driftMonitor.getAggregateStats();

    const passed =
      metric.slippagePips === 3.5 &&
      metric.slippageDirection === 'UNFAVORABLE' &&
      metric.flaggedForDrift === true &&
      metric.executionQualityScore < 70 &&
      stats.driftViolations === 1;

    results.push({
      id: 'W3-06',
      nameFa: 'پایشگر لغزش قیمت، تأخیر شبکه و امتیاز کیفیت اجرا (EQS)',
      nameEn: 'Drift Monitor, EQS Scoring & Slippage Tolerance Guard',
      passed,
      details: passed
        ? `لغزش ۳.۵ پیپ و تأخیر ۶۰۰ میلی‌ثانیه به درستی با پرچم انحراف رهگیری و امتیاز ${metric.executionQualityScore}/100 ثبت شد.`
        : `امتیاز یا تشخیص لغزش نامعتبر: Slip=${metric.slippagePips}, EQS=${metric.executionQualityScore}, Flag=${metric.flaggedForDrift}`,
      category: 'DRIFT',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-06',
      nameFa: 'پایشگر لغزش قیمت، تأخیر شبکه و امتیاز کیفیت اجرا (EQS)',
      nameEn: 'Drift Monitor, EQS Scoring & Slippage Tolerance Guard',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'DRIFT',
    });
  }

  // تست ۷: محافظت الزام حد ضرر و حد سود قطعی در سفارش‌های لیمیت
  try {
    const engine = new LiveShadowExecutionEngine();

    // سناریوی الف: سفارش بدون حد ضرر
    const nakedIntent: OrderIntentPayload = {
      intentId: 'W3-NAKED-01',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-NAKED',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 0, // فاقد حد ضرر
      takeProfitPrice: 2670.0,
      reasonCode: 'TEST',
      createdTimestamp: 7000,
      idempotencyKey: 'NAKED-KEY-01',
    };

    const resA = await engine.submitOrder(nakedIntent, 7000);

    // سناریوی ب: معکوس بودن حد ضرر (حد ضرر خرید بالاتر از قیمت ورود)
    const invertedIntent: OrderIntentPayload = {
      intentId: 'W3-INVERTED-01',
      environment: 'PAPER_LIVE',
      accountNamespace: 'TEST',
      candidateId: 'CND-INV',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 2660.0, // غیرمنطقی
      takeProfitPrice: 2670.0,
      reasonCode: 'TEST',
      createdTimestamp: 7100,
      idempotencyKey: 'INV-KEY-01',
    };

    const resB = await engine.submitOrder(invertedIntent, 7100);

    const passed =
      resA.success === false &&
      resA.error?.includes('تعیین قطعی حد ضرر و حد سود') === true &&
      resB.success === false &&
      resB.error?.includes('حد ضرر باید پایین‌تر') === true;

    results.push({
      id: 'W3-07',
      nameFa: 'الزام سخت‌گیرانه وجود حد ضرر و حد سود محافظتی (No Naked Orders)',
      nameEn: 'Mandatory Stop-Loss & Take-Profit Broker-Side Protection',
      passed,
      details: passed
        ? 'سفارش‌های بدون حد ضرر یا با حدود نامعتبر و معکوس با موفقیت رد شده و از سرمایه حفاظت شد.'
        : `سفارش فاقد حد ضرر به اشتباه پذیرفته شد: resA=${resA.error}, resB=${resB.error}`,
      category: 'RISK_GUARD',
    });
  } catch (err: unknown) {
    results.push({
      id: 'W3-07',
      nameFa: 'الزام سخت‌گیرانه وجود حد ضرر و حد سود محافظتی (No Naked Orders)',
      nameEn: 'Mandatory Stop-Loss & Take-Profit Broker-Side Protection',
      passed: false,
      details: `استثنا در اجرای تست: ${(err as Error).message}`,
      category: 'RISK_GUARD',
    });
  }

  return results;
}
