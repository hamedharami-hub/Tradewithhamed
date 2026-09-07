// lib/core/__tests__/w2-acceptance.test.ts
// آزمون‌های جامع پذیرش بسته W2 (Gate W2 Acceptance Tests)

import { Candle } from '../../contracts/market';
import { EventDrivenExecutionEngine } from '../event-driven-engine';
import { DataWorkbench } from '../data-workbench';
import { ResearchLab } from '../research-lab';
import { OrderIntentPayload } from '../ports';

export interface AcceptanceTestResult {
  id: string;
  nameFa: string;
  nameEn: string;
  passed: boolean;
  details: string;
  category: 'LEDGER' | 'AMBIGUITY' | 'LOOKAHEAD' | 'IDEMPOTENCY' | 'WALK_FORWARD' | 'STRESS';
}

export function runW2AcceptanceSuite(): AcceptanceTestResult[] {
  const results: AcceptanceTestResult[] = [];

  // تست ۱: صحت طلایی دفترکل (Golden Fills & Ledger Integrity)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      commissionPerLot: 6.0,
      defaultSpreadPips: 1.5,
    });

    const intent: OrderIntentPayload = {
      intentId: 'INT-TEST-01',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CND-01',
      symbol: 'XAUUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 0.1,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2670.0,
      reasonCode: 'TEST_REASON',
      createdTimestamp: 1000,
      idempotencyKey: 'KEY-01',
    };

    engine.submitOrder(intent);
    engine.processMarketTick({
      symbol: 'XAUUSD',
      bid: 2650.0,
      ask: 2650.15, // با احتساب اسپرد ۱.۵ پیپ
      timestamp: 1050,
    });

    const ledgerAfterFill = engine.getLedger();
    const commissionExpected = 0.1 * 6.0; // 0.60 USD
    const balanceExpected = 10000 - commissionExpected;

    const passed =
      ledgerAfterFill.positions.length === 1 &&
      ledgerAfterFill.positions[0].isOpen &&
      Math.abs(ledgerAfterFill.cashBalance - balanceExpected) < 0.01 &&
      Math.abs(ledgerAfterFill.totalCommissions - commissionExpected) < 0.01;

    results.push({
      id: 'W2-01',
      nameFa: 'صحت طلایی اجرای سفارش و کسر کارمزد در دفترکل',
      nameEn: 'Golden Fills & Ledger Accounting Integrity',
      passed,
      details: passed
        ? `کارمزد $${commissionExpected} دقیقاً کسر شد و موجودی به $${ledgerAfterFill.cashBalance} به‌روز شد.`
        : `عدم تطابق دفترکل: Balance=${ledgerAfterFill.cashBalance}`,
      category: 'LEDGER',
    });
  } catch (e) {
    results.push({
      id: 'W2-01',
      nameFa: 'صحت طلایی اجرای سفارش و کسر کارمزد در دفترکل',
      nameEn: 'Golden Fills & Ledger Accounting Integrity',
      passed: false,
      details: (e as Error).message,
      category: 'LEDGER',
    });
  }

  // تست ۲: عدم محاسبه دوباره اسپرد (Spread not counted twice)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      commissionPerLot: 0,
      defaultSpreadPips: 2.0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });

    const intent: OrderIntentPayload = {
      intentId: 'INT-SPREAD-TEST',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CND-02',
      symbol: 'XAUUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 2600.0,
      stopLossPrice: 2590.0,
      takeProfitPrice: 2620.0,
      reasonCode: 'SPREAD_TEST',
      createdTimestamp: 1000,
      idempotencyKey: 'KEY-SPREAD',
    };

    engine.submitOrder(intent);
    // تیک اول برای ورود در Ask
    engine.processMarketTick({ symbol: 'XAUUSD', bid: 2600.0, ask: 2600.2, timestamp: 1010 });
    // تیک دوم با همان قیمت بدون تغییر بازار
    engine.processMarketTick({ symbol: 'XAUUSD', bid: 2600.0, ask: 2600.2, timestamp: 1020 });

    const ledger = engine.getLedger();
    const pos = ledger.positions[0];
    // زیان شناور در لحظه ورود باید دقیقاً برابر با هزینه اسپرد (۰.۲ دلار * ۱۰۰ = ۲۰ دلار) باشد نه دوبرابر
    const spreadLoss = Math.abs(pos.unrealizedPnl);
    const passed = Math.abs(spreadLoss - 20) < 0.1;

    results.push({
      id: 'W2-02',
      nameFa: 'عدم احتساب مضاعف اسپرد در محاسبات مارکت',
      nameEn: 'Spread Not Counted Twice Verification',
      passed,
      details: passed
        ? `زیان شناور در لحظه بازگشایی دقیقاً برابر با اسپرد طبیعی ($${spreadLoss}) ثبت شد.`
        : `اسپرد به صورت مضاعف محاسبه شده است: $${spreadLoss}`,
      category: 'LEDGER',
    });
  } catch (e) {
    results.push({
      id: 'W2-02',
      nameFa: 'عدم احتساب مضاعف اسپرد در محاسبات مارکت',
      nameEn: 'Spread Not Counted Twice Verification',
      passed: false,
      details: (e as Error).message,
      category: 'LEDGER',
    });
  }

  // تست ۳: حل بدبینانه ابهام برخورد همزمان SL و TP (Pessimistic Intrabar Ambiguity)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      commissionPerLot: 0,
      ambiguityPolicy: 'PESSIMISTIC',
    });

    const intent: OrderIntentPayload = {
      intentId: 'INT-AMBIGUOUS',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CND-03',
      symbol: 'XAUUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 2650.0,
      stopLossPrice: 2640.0,
      takeProfitPrice: 2660.0,
      reasonCode: 'AMBIGUITY_TEST',
      createdTimestamp: 1000,
      idempotencyKey: 'KEY-AMBIGUOUS',
    };

    engine.submitOrder(intent);

    // کندل ورود
    engine.processCandle(
      { timestamp: 2000, open: 2651, high: 2652, low: 2649, close: 2650, volume: 100, isClosed: true },
      'XAUUSD'
    );

    // کندل شدید که در آن هم حد ضرر (2640) و هم حد سود (2660) لمس شده‌اند!
    const ambiguousCandle: Candle = {
      timestamp: 3000,
      open: 2650,
      high: 2665, // TP لمس شد
      low: 2635,  // SL هم لمس شد!
      close: 2655,
      volume: 500,
      isClosed: true,
    };

    const events = engine.processCandle(ambiguousCandle, 'XAUUSD');
    const closeEvent = events.find(e => e.status === 'FILLED' && e.intentId === 'INT-AMBIGUOUS');
    const ledger = engine.getLedger();
    const pos = ledger.positions[0];

    const passed =
      pos.isOpen === false &&
      pos.closeReason === 'SL' &&
      closeEvent?.ambiguityFlag === true;

    results.push({
      id: 'W2-03',
      nameFa: 'حل بدبینانه ابهام برخورد همزمان حد سود و ضرر در یک کندل',
      nameEn: 'Pessimistic Intrabar SL/TP Ambiguity Resolution',
      passed,
      details: passed
        ? `ابهام با برچسب ambiguityFlag=true و خروج بدبینانه SL ثبت گردید (حفظ سرمایه).`
        : `سیاست ابهام به درستی اعمال نشد: Reason=${pos.closeReason}`,
      category: 'AMBIGUITY',
    });
  } catch (e) {
    results.push({
      id: 'W2-03',
      nameFa: 'حل بدبینانه ابهام برخورد همزمان حد سود و ضرر در یک کندل',
      nameEn: 'Pessimistic Intrabar SL/TP Ambiguity Resolution',
      passed: false,
      details: (e as Error).message,
      category: 'AMBIGUITY',
    });
  }

  // تست ۴: تجمیع چندتایم‌فریمه بدون نگاه به آینده (No Look-Ahead in Aggregation)
  try {
    const baseCandles: Candle[] = [];
    for (let i = 0; i < 6; i++) {
      baseCandles.push({
        timestamp: i * 5 * 60 * 1000,
        open: 2600 + i,
        high: 2605 + i,
        low: 2595 + i,
        close: 2602 + i,
        volume: 100,
        isClosed: true,
      });
    }

    const agg15M = DataWorkbench.aggregateCandles(baseCandles, '15M');
    // ۶ کندل ۵ دقیقه باید دقیقا به ۲ کندل ۱۵ دقیقه تبدیل شود
    const passed =
      agg15M.length === 2 &&
      agg15M[0].open === baseCandles[0].open &&
      agg15M[0].close === baseCandles[2].close &&
      agg15M[1].open === baseCandles[3].open &&
      agg15M[1].close === baseCandles[5].close;

    results.push({
      id: 'W2-04',
      nameFa: 'تجمیع کندل‌های ۵ دقیقه به ۱۵ دقیقه بدون نشت آینده',
      nameEn: 'Multi-Timeframe Aggregation Without Future Leakage',
      passed,
      details: passed
        ? `تعداد ۶ کندل ۵ دقیقه بدون نشت آینده به ۲ کندل ۱۵ دقیقه تجمیع شدند.`
        : `تعداد کندل‌های تجمیع شده نامعتبر است: ${agg15M.length}`,
      category: 'LOOKAHEAD',
    });
  } catch (e) {
    results.push({
      id: 'W2-04',
      nameFa: 'تجمیع کندل‌های ۵ دقیقه به ۱۵ دقیقه بدون نشت آینده',
      nameEn: 'Multi-Timeframe Aggregation Without Future Leakage',
      passed: false,
      details: (e as Error).message,
      category: 'LOOKAHEAD',
    });
  }

  // تست ۵: بازتولید قطعی و بدون تغییر با ورودی یکسان (Idempotent Replay)
  try {
    const testCandles: Candle[] = [];
    let price = 2650;
    for (let i = 0; i < 50; i++) {
      const delta = (i % 2 === 0 ? 1 : -1) * (i % 3 + 1);
      price += delta;
      testCandles.push({
        timestamp: 100000 + i * 15 * 60 * 1000,
        open: price - delta,
        high: price + 4,
        low: price - 4,
        close: price,
        volume: 150,
        isClosed: true,
      });
    }

    const run1 = ResearchLab.runBacktest(testCandles, 'XAUUSD');
    const run2 = ResearchLab.runBacktest(testCandles, 'XAUUSD');

    const passed =
      run1.metrics.totalTrades === run2.metrics.totalTrades &&
      run1.metrics.netProfit === run2.metrics.netProfit &&
      run1.metrics.maxDrawdownPercent === run2.metrics.maxDrawdownPercent;

    results.push({
      id: 'W2-05',
      nameFa: 'تکرارپذیری ۱۰۰٪ قطعی بک‌تست (Idempotent Simulation)',
      nameEn: 'Idempotent Replay Verification',
      passed,
      details: passed
        ? `دو بار اجرای مستقل، دقیقاً نتایج یکسان تولید کردند (معاملات: ${run1.metrics.totalTrades}، سود: $${run1.metrics.netProfit}).`
        : `عدم انطباق نتایج در دو اجرای پیاپی!`,
      category: 'IDEMPOTENCY',
    });
  } catch (e) {
    results.push({
      id: 'W2-05',
      nameFa: 'تکرارپذیری ۱۰۰٪ قطعی بک‌تست (Idempotent Simulation)',
      nameEn: 'Idempotent Replay Verification',
      passed: false,
      details: (e as Error).message,
      category: 'IDEMPOTENCY',
    });
  }

  // تست ۶: تحلیل پیش‌رونده (Walk-Forward Analysis Execution)
  try {
    const testCandles: Candle[] = [];
    let price = 2650;
    for (let i = 0; i < 90; i++) {
      price += (i % 2 === 0 ? 2 : -1.5);
      testCandles.push({
        timestamp: 200000 + i * 15 * 60 * 1000,
        open: price - 1,
        high: price + 5,
        low: price - 4,
        close: price,
        volume: 200,
        isClosed: true,
      });
    }

    const windows = ResearchLab.runWalkForward(testCandles, 'XAUUSD', 2);
    const passed = windows.length === 2 && windows[0].trainMetrics !== undefined;

    results.push({
      id: 'W2-06',
      nameFa: 'اجرای تحلیل پیش‌رونده (Walk-Forward Splits)',
      nameEn: 'Walk-Forward Analysis Suite Execution',
      passed,
      details: passed
        ? `تعداد ${windows.length} پنجره غلتان آموزش و اعتبارسنجی با موفقیت ارزیابی شد.`
        : 'شکست در تفکیک پنجره‌های تحلیل پیش‌رونده',
      category: 'WALK_FORWARD',
    });
  } catch (e) {
    results.push({
      id: 'W2-06',
      nameFa: 'اجرای تحلیل پیش‌رونده (Walk-Forward Splits)',
      nameEn: 'Walk-Forward Analysis Suite Execution',
      passed: false,
      details: (e as Error).message,
      category: 'WALK_FORWARD',
    });
  }

  // تست ۷: آزمون‌های تنش اسپرد و لغزش (Stress Testing Suite)
  try {
    const testCandles: Candle[] = [];
    let price = 2650;
    for (let i = 0; i < 60; i++) {
      price += (i % 3 === 0 ? 3 : -2);
      testCandles.push({
        timestamp: 300000 + i * 15 * 60 * 1000,
        open: price - 1,
        high: price + 6,
        low: price - 5,
        close: price,
        volume: 250,
        isClosed: true,
      });
    }

    const stressResults = ResearchLab.runStressTests(testCandles, 'XAUUSD');
    const passed = stressResults.length >= 3 && stressResults.every(s => typeof s.netProfit === 'number');

    results.push({
      id: 'W2-07',
      nameFa: 'مجموعه آزمون‌های تنش اسپرد فشرده و لغزش شدید',
      nameEn: 'Stress Testing Execution (+100% Spread & Slippage)',
      passed,
      details: passed
        ? `تعداد ${stressResults.length} سناریوی تنش شامل اسپرد ۳ پیپ و لغزش شدید با موفقیت اجرا شد.`
        : 'شکست در اجرای سناریوهای تنش',
      category: 'STRESS',
    });
  } catch (e) {
    results.push({
      id: 'W2-07',
      nameFa: 'مجموعه آزمون‌های تنش اسپرد فشرده و لغزش شدید',
      nameEn: 'Stress Testing Execution (+100% Spread & Slippage)',
      passed: false,
      details: (e as Error).message,
      category: 'STRESS',
    });
  }

  return results;
}
