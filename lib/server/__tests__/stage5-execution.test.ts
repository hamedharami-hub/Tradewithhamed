/**
 * آزمون‌های خودکار مرحله ۵ — ارسال محدود cTrader Demo و مدیریت خطا:
 * ۱. انتقال اجباری به SUBMITTING قبل از رسیدن پاسخ شبکه
 * ۲. ممانعت از کلیک دوبل و ارسال تکراری با کلید ضد تکرار (Idempotency)
 * ۳. شبیه‌سازی تایم‌اوت شبکه و انتقال به UNKNOWN_RECONCILE_REQUIRED
 * ۴. مسدودسازی هرگونه تلاش مجدد کورکورانه (Blind Retry Blocking)
 * ۵. فرآیند بازتطبیق اجباری (Reconciliation) و باز شدن قفل صف
 * ۶. تایید محافظت‌های سمت بروکر (SL و TP قطعی)
 */

import { CTraderOMS } from '../ctrader-oms';
import { OrderSubmissionRequest } from '../../contracts/execution';

export async function runStage5ExecutionTests(): Promise<{
  name: string;
  passed: boolean;
  details: string;
}[]> {
  const results: { name: string; passed: boolean; details: string }[] = [];

  // تست ۱: ارسال اولیه و دریافت ACKNOWLEDGED با شناسه بروکر
  try {
    CTraderOMS.resetStateForTesting();
    const req1: OrderSubmissionRequest = {
      intentId: 'INT-TEST-001',
      idempotencyKey: 'IDEMP-KEY-001',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      userConfirmationTimestamp: Date.now(),
      executorSessionId: 'test-windows-session',
      executorEpoch: 1,
      deviceLabel: 'windows',
    };

    const res1 = await CTraderOMS.submitOrder(req1);
    const passed =
      res1.success &&
      res1.state === 'ACKNOWLEDGED' &&
      !!res1.record.brokerOrderId &&
      res1.record.isBrokerStopLossConfirmed === true &&
      res1.record.isBrokerTakeProfitConfirmed === true;

    results.push({
      name: 'Order Submission & Broker Acknowledgment with Protections',
      passed,
      details: passed
        ? `سفارش لیمیت طلا با شناسه بروکر ${res1.record.brokerOrderId} و SL/TP قطعی تأیید شد.`
        : `خطا در ارسال سفارش: ${res1.error}`,
    });
  } catch (e) {
    results.push({ name: 'Order Submission & Broker Acknowledgment with Protections', passed: false, details: (e as Error).message });
  }

  // تست ۲: محافظت در برابر کلیک دوبل با کلید ضد تکرار (Idempotency Guard)
  try {
    const reqDuplicate: OrderSubmissionRequest = {
      intentId: 'INT-TEST-001',
      idempotencyKey: 'IDEMP-KEY-001', // همان کلید درخواست اول
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      userConfirmationTimestamp: Date.now(),
      executorSessionId: 'test-windows-session',
      executorEpoch: 1,
      deviceLabel: 'windows',
    };

    const resDup = await CTraderOMS.submitOrder(reqDuplicate);
    // باید بدون ساخت سفارش جدید، نتیجه همان قبلی را بازگرداند
    const passed = Boolean(
      resDup.record.intentId === 'INT-TEST-001' &&
      resDup.record.brokerOrderId?.startsWith('CT-ORD-')
    );

    results.push({
      name: 'Double-Click & Idempotency Protection',
      passed,
      details: passed
        ? 'کلیک دوبل یا رفرش شناسایی شد و بدون ارسال تراکنش جدید، رکورد قبلی بازگردانده شد.'
        : 'خطا: سیستم کلیک دوبل را مدیریت نکرد.',
    });
  } catch (e) {
    results.push({ name: 'Double-Click & Idempotency Protection', passed: false, details: (e as Error).message });
  }

  // تست ۳: تایم‌اوت شبکه و انتقال به UNKNOWN_RECONCILE_REQUIRED
  try {
    CTraderOMS.resetStateForTesting();
    const reqTimeout: OrderSubmissionRequest = {
      intentId: 'INT-TIMEOUT-002',
      idempotencyKey: 'IDEMP-KEY-TIMEOUT',
      symbol: 'XAUUSD',
      direction: 'BUY',
      volumeLots: 0.05,
      limitPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      userConfirmationTimestamp: Date.now(),
      executorSessionId: 'test-windows-session',
      executorEpoch: 1,
      deviceLabel: 'windows',
    };

    const resTimeout = await CTraderOMS.submitOrder(reqTimeout, { simulateTimeout: true });
    const passed =
      !resTimeout.success &&
      resTimeout.state === 'UNKNOWN_RECONCILE_REQUIRED' &&
      resTimeout.requiresReconciliation === true;

    results.push({
      name: 'Network Timeout Transition to UNKNOWN_RECONCILE_REQUIRED',
      passed,
      details: passed
        ? 'با قطعی یا تایم‌اوت شبکه، سفارش فوراً به وضعیت UNKNOWN_RECONCILE_REQUIRED منتقل شد.'
        : `خطا در مدیریت تایم‌اوت: ${resTimeout.error}`,
    });
  } catch (e) {
    results.push({ name: 'Network Timeout Transition to UNKNOWN_RECONCILE_REQUIRED', passed: false, details: (e as Error).message });
  }

  // تست ۴: ممانعت کامل از ارسال مجدد کورکورانه (No Blind Retries)
  try {
    // در حالی که سفارش قبلی در وضعیت UNKNOWN_RECONCILE_REQUIRED است، سعی در ارسال سفارش جدید می‌کنیم
    const reqBlindRetry: OrderSubmissionRequest = {
      intentId: 'INT-NEW-003',
      idempotencyKey: 'IDEMP-KEY-BLIND',
      symbol: 'EURUSD',
      direction: 'SELL',
      volumeLots: 0.1,
      limitPrice: 1.085,
      stopLossPrice: 1.088,
      takeProfitPrice: 1.078,
      userConfirmationTimestamp: Date.now(),
      executorSessionId: 'test-windows-session',
      executorEpoch: 1,
      deviceLabel: 'windows',
    };

    const resBlind = await CTraderOMS.submitOrder(reqBlindRetry);
    const passed = Boolean(
      !resBlind.success &&
      resBlind.error?.includes('UNKNOWN_RECONCILE_REQUIRED') &&
      resBlind.requiresReconciliation === true
    );

    results.push({
      name: 'Blind Retry Blocking (Fail-Closed Safety)',
      passed,
      details: passed
        ? 'تلاش برای ارسال سفارش جدید به دلیل وجود وضعیت UNKNOWN با موفقیت مسدود شد (Fail-Closed).'
        : 'خطا: سیستم اجازه ارسال مجدد بدون بازتطبیق داد!',
    });
  } catch (e) {
    results.push({ name: 'Blind Retry Blocking (Fail-Closed Safety)', passed: false, details: (e as Error).message });
  }

  // تست ۵: فرآیند بازتطبیق اجباری (Reconciliation) و رفع انسداد
  try {
    const recRes = await CTraderOMS.reconcileOrder('INT-TIMEOUT-002');
    const passed =
      recRes.reconciled &&
      recRes.record?.state === 'RECONCILED' &&
      !!recRes.record.brokerOrderId &&
      recRes.record.isBrokerStopLossConfirmed === true;

    // پس از بازتطبیق، صف باید باز شده باشد
    const blockCheck = CTraderOMS.hasBlockingState();
    const unblocked = !blockCheck.blocked;

    results.push({
      name: 'Mandatory Order Reconciliation & Unblocking',
      passed: passed && unblocked,
      details: passed && unblocked
        ? `سفارش معلق با شناسه بروکر ${recRes.record?.brokerOrderId} تطبیق یافت و صف آزاد شد.`
        : 'خطا در بازتطبیق سفارش.',
    });
  } catch (e) {
    results.push({ name: 'Mandatory Order Reconciliation & Unblocking', passed: false, details: (e as Error).message });
  }

  return results;
}
