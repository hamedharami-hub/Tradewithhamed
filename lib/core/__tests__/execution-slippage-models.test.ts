// lib/core/__tests__/execution-slippage-models.test.ts
// پکیج C: آزمون‌های جامع موتور شبیه‌ساز سفارشات، اسلیپیج نوسان‌پذیر، رفع ابهام درون‌کندلی و اصطکاک اجرای واقع‌گرایانه

import { EventDrivenExecutionEngine } from '../event-driven-engine';
import { ResearchLab } from '../research-lab';
import { Candle, SymbolId } from '../../contracts/market';
import { OrderIntentPayload } from '../ports';
import { getDefaultStrategyParameters } from '../../contracts/strategy-parameters';
import { SeededRNG } from '../seeded-rng';

export function runExecutionSlippageModelsTestSuite(): {
  name: string;
  passed: boolean;
  details: string;
}[] {
  const checks: { name: string; passed: boolean; details: string }[] = [];

  const baseTimestamp = 1700000000000;
  const mockCandle = (offsetIndex: number, open: number, high: number, low: number, close: number): Candle => ({
    timestamp: baseTimestamp + offsetIndex * 60_000,
    open,
    high,
    low,
    close,
    volume: 100,
    isClosed: true,
  });

  // ۱. اعتبارسنجی اسلیپیج ثابت (FIXED Slippage)
  try {
    const engine = new EventDrivenExecutionEngine({
      slippageModel: {
        modelType: 'FIXED',
        baseSlippagePips: 0.5,
        volatilityMultiplier: 0.0,
      },
      defaultSpreadPips: 1.0,
    });

    const order: OrderIntentPayload = {
      intentId: 'INT-FIXED-01',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-01',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.11000,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-01',
    };

    engine.submitOrder(order);
    const candle1 = mockCandle(1, 1.10000, 1.10500, 1.09900, 1.10200);
    const events = engine.processCandle(candle1, 'EURUSD');

    const fillEvent = events.find(e => e.status === 'FILLED');
    const ledger = engine.getLedger();
    const position = ledger.positions[0];

    // پیپ پوینت EURUSD = 0.0001
    // اسلیپیج = 0.5 پیپ (0.00005)
    // نیم‌اسپرد = 0.5 پیپ (0.00005)
    // قیمت ورود مورد انتظار: 1.10000 + 0.00005 + 0.00005 = 1.10010
    const expectedFill = 1.10010;
    const passed = Math.abs((fillEvent?.fillPrice || 0) - expectedFill) < 1e-5 &&
      position.entrySlippagePips === 0.5 &&
      position.spreadCostDollar! > 0;

    checks.push({
      name: 'Fixed Slippage Execution Model',
      passed,
      details: passed
        ? `اسلیپیج ثابت ۰.۵ پیپ در سفارش مارکت با قیمت پر شدن ${fillEvent?.fillPrice} و ثبت دقیق هزینه اسلیپیج پیاده شد.`
        : `خطا در اسلیپیج ثابت. قیمت محاسبه‌شده: ${fillEvent?.fillPrice}`,
    });
  } catch (err) {
    checks.push({
      name: 'Fixed Slippage Execution Model',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. اعتبارسنجی اسلیپیج نوسان‌پذیر بر مبنای دامنه کندل (VOLATILITY_SCALED)
  try {
    const engine = new EventDrivenExecutionEngine({
      slippageModel: {
        modelType: 'VOLATILITY_SCALED',
        baseSlippagePips: 0.2,
        volatilityMultiplier: 0.2,
      },
      defaultSpreadPips: 1.0,
    });

    const order: OrderIntentPayload = {
      intentId: 'INT-VOL-01',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-02',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.11000,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-02',
    };

    engine.submitOrder(order);
    // کندل بسیار پرنوسان: دامنه ۳۰ پیپ (1.10300 - 1.10000 = 0.0030 = 30 pips)
    // volFactor = 1 + 0.2 * (30 / 10) = 1 + 0.6 = 1.6
    // totalSlippage = 0.2 * 1.6 = 0.32 pips
    const candleWide = mockCandle(1, 1.10000, 1.10300, 1.10000, 1.10250);
    const events = engine.processCandle(candleWide, 'EURUSD');

    const fillEvent = events.find(e => e.status === 'FILLED');
    const pos = engine.getLedger().positions[0];
    const isScaled = (fillEvent?.slippagePips || 0) > 0.2 && Math.abs((pos.entrySlippagePips || 0) - 0.32) < 0.01;

    checks.push({
      name: 'Volatility Scaled Slippage Engine',
      passed: isScaled,
      details: isScaled
        ? `اسلیپیج در کندل ۳۰ پیپی با ضریب نوسان از ۰.۲ به ${(pos.entrySlippagePips || 0)} پیپ افزایش یافت.`
        : `خطا در اسلیپیج نوسانی. اسلیپیج ثبت‌شده: ${pos?.entrySlippagePips}`,
    });
  } catch (err) {
    checks.push({
      name: 'Volatility Scaled Slippage Engine',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. اعتبارسنجی اسلیپیج وزنی حجم سفارش (VOLUME_WEIGHTED)
  try {
    const engine = new EventDrivenExecutionEngine({
      slippageModel: {
        modelType: 'VOLUME_WEIGHTED',
        baseSlippagePips: 0.2,
        volatilityMultiplier: 0.5,
      },
      defaultSpreadPips: 1.0,
    });

    const largeOrder: OrderIntentPayload = {
      intentId: 'INT-VOLW-01',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-03',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 3.0, // حجم بزرگ
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.11000,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-03',
    };

    engine.submitOrder(largeOrder);
    const c1 = mockCandle(1, 1.10000, 1.10050, 1.09950, 1.10020);
    engine.processCandle(c1, 'EURUSD');

    const pos = engine.getLedger().positions[0];
    // volFactor برای حجم بالا به سمت ۲ میل می‌کند -> اسلیپیج > 0.2
    const passed = (pos.entrySlippagePips || 0) > 0.25;

    checks.push({
      name: 'Volume Weighted Slippage Model',
      passed,
      details: passed
        ? `اسلیپیج برای سفارش ۳ لاتی با مدل وزنی حجم به ${pos.entrySlippagePips} پیپ افزایش یافت.`
        : `خطا در مدل وزنی حجم. اسلیپیج: ${pos.entrySlippagePips}`,
    });
  } catch (err) {
    checks.push({
      name: 'Volume Weighted Slippage Model',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. اعتبارسنجی اجرای گپ ورود در سفارشات استاپ و لیمیت (Gap Entry)
  try {
    const engine = new EventDrivenExecutionEngine({
      defaultSpreadPips: 1.0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });

    // سفارش استاپ خرید در 1.10200
    const stopOrder: OrderIntentPayload = {
      intentId: 'INT-STOP-GAP',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-04',
      symbol: 'EURUSD',
      orderType: 'STOP',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10200,
      stopLossPrice: 1.09800,
      takeProfitPrice: 1.11000,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-04',
    };

    engine.submitOrder(stopOrder);

    // کندل با گپ بالاتر از قیمت استاپ باز می‌شود: open = 1.10300
    const gapCandle = mockCandle(1, 1.10300, 1.10400, 1.10250, 1.10350);
    const events = engine.processCandle(gapCandle, 'EURUSD');
    const fillEvt = events.find(e => e.status === 'FILLED');

    // اجرای گپ باید از کندل open (1.10300) به اضافه نیم‌اسپرد شروع شود نه قیمت استاپ 1.10200
    const passed = (fillEvt?.fillPrice || 0) >= 1.10300 && engine.diagnostics.gapEntryCount > 0;

    checks.push({
      name: 'Gap Entry Realism on Stop Orders',
      passed,
      details: passed
        ? `سفارش استاپ با گپ بازگشایی در قیمت واقعی ${fillEvt?.fillPrice} اجرا و شمارنده گپ فعال شد.`
        : `خطا در پر شدن گپ استاپ. قیمت: ${fillEvt?.fillPrice}`,
    });
  } catch (err) {
    checks.push({
      name: 'Gap Entry Realism on Stop Orders',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. اعتبارسنجی اجرای گپ خروج در حد ضرر (Gap Exit on Stop Loss)
  try {
    const engine = new EventDrivenExecutionEngine({
      defaultSpreadPips: 1.0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });

    const mktOrder: OrderIntentPayload = {
      intentId: 'INT-GAP-SL',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-05',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.11000,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-05',
    };

    engine.submitOrder(mktOrder);
    const c1 = mockCandle(1, 1.10000, 1.10100, 1.09900, 1.10050);
    engine.processCandle(c1, 'EURUSD');

    // کندل بعد با گپ شدید منفی زیر حد ضرر باز می‌شود: open = 1.09300 (حد ضرر 1.09500 بود)
    const gapDownCandle = mockCandle(2, 1.09300, 1.09350, 1.09100, 1.09200);
    const events = engine.processCandle(gapDownCandle, 'EURUSD');
    const closeEvt = events.find(e => e.status === 'FILLED' && e.notes?.includes('بسته'));
    const pos = engine.getLedger().positions[0];

    // خروج نباید در قیمت ایده‌آل 1.09500 ثبت شود بلکه در بازگشایی گپ 1.09300 منهای هزینه‌ها
    const passed = (pos.exitPrice || 0) <= 1.09300 && engine.diagnostics.gapExitCount > 0;

    checks.push({
      name: 'Gap Exit Realism on Adverse Stop Loss',
      passed,
      details: passed
        ? `حد ضرر با گپ نامطلوب در قیمت واقعی ${pos.exitPrice} تسویه و اسلیپیج منفی گپ ثبت شد.`
        : `خطا در خروج گپ. قیمت خروج: ${pos.exitPrice}`,
    });
  } catch (err) {
    checks.push({
      name: 'Gap Exit Realism on Adverse Stop Loss',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۶. اعتبارسنجی رفع ابهام درون‌کندلی بدبینانه (PESSIMISTIC Intrabar Ambiguity)
  try {
    const engine = new EventDrivenExecutionEngine({
      ambiguityPolicy: 'PESSIMISTIC',
      defaultSpreadPips: 1.0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });

    const mktOrder: OrderIntentPayload = {
      intentId: 'INT-AMBIG-PESS',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-06',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.10500,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-06',
    };

    engine.submitOrder(mktOrder);
    const c1 = mockCandle(1, 1.10000, 1.10050, 1.09950, 1.10000);
    engine.processCandle(c1, 'EURUSD');

    // کندل واید که هم سقف 1.10600 (بالاتر از TP) و هم کف 1.09400 (پایین‌تر از SL) را لمس می‌کند
    const ambigCandle = mockCandle(2, 1.10000, 1.10600, 1.09400, 1.10000);
    engine.processCandle(ambigCandle, 'EURUSD');

    const pos = engine.getLedger().positions[0];
    const passed = pos.closeReason === 'SL' && engine.diagnostics.ambiguousExitCount > 0;

    checks.push({
      name: 'Pessimistic Intrabar Ambiguity Policy',
      passed,
      details: passed
        ? 'در برخورد همزمان SL و TP، سیاست بدبینانه اولویت را به حد ضرر اختصاص داد و ابهام را ثبت کرد.'
        : `خطا در سیاست بدبینانه. علت خروج: ${pos.closeReason}`,
    });
  } catch (err) {
    checks.push({
      name: 'Pessimistic Intrabar Ambiguity Policy',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۷. اعتبارسنجی رفع ابهام درون‌کندلی خوش‌بینانه (OPTIMISTIC Intrabar Ambiguity)
  try {
    const engine = new EventDrivenExecutionEngine({
      ambiguityPolicy: 'OPTIMISTIC',
      defaultSpreadPips: 1.0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });

    const mktOrder: OrderIntentPayload = {
      intentId: 'INT-AMBIG-OPT',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-07',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.10500,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-07',
    };

    engine.submitOrder(mktOrder);
    const c1 = mockCandle(1, 1.10000, 1.10050, 1.09950, 1.10000);
    engine.processCandle(c1, 'EURUSD');

    const ambigCandle = mockCandle(2, 1.10000, 1.10600, 1.09400, 1.10000);
    engine.processCandle(ambigCandle, 'EURUSD');

    const pos = engine.getLedger().positions[0];
    const passed = pos.closeReason === 'TP' && engine.diagnostics.ambiguousExitCount > 0;

    checks.push({
      name: 'Optimistic Intrabar Ambiguity Policy',
      passed,
      details: passed
        ? 'در برخورد همزمان، سیاست خوش‌بینانه اولویت خروج را به Take Profit داد.'
        : `خطا در سیاست خوش‌بینانه. علت خروج: ${pos.closeReason}`,
    });
  } catch (err) {
    checks.push({
      name: 'Optimistic Intrabar Ambiguity Policy',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۸. اعتبارسنجی رفع ابهام بر مبنای قطبیت کندل (BAR_POLARITY)
  try {
    const engine = new EventDrivenExecutionEngine({
      ambiguityPolicy: 'BAR_POLARITY',
      defaultSpreadPips: 1.0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });

    const mktOrder: OrderIntentPayload = {
      intentId: 'INT-AMBIG-POL',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-08',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.10500,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-08',
    };

    engine.submitOrder(mktOrder);
    const c1 = mockCandle(1, 1.10000, 1.10050, 1.09950, 1.10000);
    engine.processCandle(c1, 'EURUSD');

    // کندل سبز قدرتمند (close > open): open=1.09600, close=1.10550, high=1.10600, low=1.09400
    // در معامله خرید BUY با کندل صعودی، اول ابتدا کف لمس شده (SL) سپس به سمت سقف رفته است.
    const greenCandle = mockCandle(2, 1.09600, 1.10600, 1.09400, 1.10550);
    engine.processCandle(greenCandle, 'EURUSD');

    const pos = engine.getLedger().positions[0];
    const passed = pos.closeReason === 'SL';

    checks.push({
      name: 'Bar Polarity Ambiguity Resolution',
      passed,
      details: passed
        ? 'الگوریتم قطبیت کندل توالی مسیر حرکت قیمت را به درستی شبیه‌سازی کرد.'
        : `خطا در قطبیت کندل. خروج: ${pos.closeReason}`,
    });
  } catch (err) {
    checks.push({
      name: 'Bar Polarity Ambiguity Resolution',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۹. اعتبارسنجی محاسبه سود ناخالص و تفکیک هزینه اصطکاک (Friction Cost Breakdown)
  try {
    const engine = new EventDrivenExecutionEngine({
      commissionPerLot: 7.0,
      defaultSpreadPips: 1.5,
      slippageModel: {
        modelType: 'FIXED',
        baseSlippagePips: 0.3,
        volatilityMultiplier: 0,
      },
    });

    const mktOrder: OrderIntentPayload = {
      intentId: 'INT-FRICTION-01',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-09',
      symbol: 'EURUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.10500,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-09',
    };

    engine.submitOrder(mktOrder);
    const c1 = mockCandle(1, 1.10000, 1.10050, 1.09950, 1.10000);
    engine.processCandle(c1, 'EURUSD');

    // کندل رسیدن به تارگت
    const c2 = mockCandle(2, 1.10200, 1.10600, 1.10100, 1.10550);
    engine.processCandle(c2, 'EURUSD');

    const pos = engine.getLedger().positions[0];
    const hasSpreadCost = (pos.spreadCostDollar || 0) > 0;
    const hasSlippageCost = (pos.slippageCostDollar || 0) > 0;
    const hasGrossPnl = pos.grossRealizedPnl !== undefined && pos.grossRealizedPnl > pos.realizedPnl;

    const passed = hasSpreadCost && hasSlippageCost && hasGrossPnl && pos.commissionPaid === 7.0;

    checks.push({
      name: 'Friction Cost Accounting in Ledger',
      passed,
      details: passed
        ? `هزینه اسپرد ($${pos.spreadCostDollar})، اسلیپیج ($${pos.slippageCostDollar})، کمیسیون ($${pos.commissionPaid}) و سود ناخالص ($${pos.grossRealizedPnl}) در پوزیشن ثبت شد.`
        : 'نقص در حسابداری اصطکاک در لجر پوزیشن.',
    });
  } catch (err) {
    checks.push({
      name: 'Friction Cost Accounting in Ledger',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۰. اعتبارسنجی محاسبه متریک‌های عملکرد درگ و اصطکاک (PerformanceMetrics Friction Telemetry)
  try {
    const mockPositions = [
      {
        positionId: 'P1',
        intentId: 'I1',
        environment: 'BACKTEST' as const,
        symbol: 'EURUSD' as SymbolId,
        direction: 'BUY' as const,
        volumeLots: 1.0,
        entryPrice: 1.10000,
        currentPrice: 1.10500,
        stopLossPrice: 1.09500,
        takeProfitPrice: 1.10500,
        realizedPnl: 450,
        unrealizedPnl: 0,
        commissionPaid: 7.0,
        financingSwap: 0,
        isOpen: false,
        openedTimestamp: baseTimestamp,
        closedTimestamp: baseTimestamp + 60_000,
        spreadCostDollar: 15.0,
        slippageCostDollar: 6.0,
        grossRealizedPnl: 478.0,
        maePips: 5,
        mfePips: 55,
      },
    ];

    const metrics = ResearchLab.calculateMetrics(mockPositions, 10000, [
      { timestamp: baseTimestamp, equity: 10000, drawdownPercent: 0 },
      { timestamp: baseTimestamp + 60_000, equity: 10450, drawdownPercent: 0 },
    ]);

    const passed = metrics.frictionCostDollar === (7.0 + 15.0 + 6.0) &&
      metrics.totalSpreadCostDollar === 15.0 &&
      metrics.totalSlippageCostDollar === 6.0 &&
      (metrics.frictionToGrossProfitRatio || 0) > 0;

    checks.push({
      name: 'PerformanceMetrics Friction Telemetry',
      passed,
      details: passed
        ? `کل اصطکاک $${metrics.frictionCostDollar} و نسبت درگ ${(metrics.frictionToGrossProfitRatio! * 100).toFixed(2)}٪ در خروجی متریک‌ها محاسبه شد.`
        : 'خطا در محاسبه متریک‌های درگ اصطکاک.',
    });
  } catch (err) {
    checks.push({
      name: 'PerformanceMetrics Friction Telemetry',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۱. اعتبارسنجی عدم پر شدن تصادفی اردر لیمیت با سید تکرارپذیر (Deterministic Skipped Fills)
  try {
    const engineWithSkips = new EventDrivenExecutionEngine({
      randomSkippedFillsPercent: 100, // ۱۰۰٪ اردرهای لیمیت رد شوند
      randomSeed: 42,
    });

    const limitOrder: OrderIntentPayload = {
      intentId: 'INT-SKIP-01',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-11',
      symbol: 'EURUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.10000,
      stopLossPrice: 1.09500,
      takeProfitPrice: 1.11000,
      reasonCode: 'TEST',
      createdTimestamp: baseTimestamp,
      idempotencyKey: 'IDEMP-11',
    };

    engineWithSkips.submitOrder(limitOrder);
    // کندل به قیمت لیمیت می‌رسد: low = 1.09900 <= 1.10000
    const candleTouch = mockCandle(1, 1.10050, 1.10100, 1.09900, 1.10020);
    const events = engineWithSkips.processCandle(candleTouch, 'EURUSD');

    // به دلیل skipped fills، اردر نباید پر شده باشد
    const isSkipped = !events.some(e => e.status === 'FILLED') && engineWithSkips.getLedger().positions.length === 0;

    checks.push({
      name: 'Deterministic Skipped Fills Simulation',
      passed: isSkipped,
      details: isSkipped
        ? 'اردر لیمیت با نرخ پر نشدن ۱۰۰٪ و سید قطعی شبیه‌سازی بازار واقعی به درستی در صف باقی ماند.'
        : 'خطا: اردر لیمیت علی‌رغم تعیین پر نشدن ۱۰۰٪ تکمیل شد.',
    });
  } catch (err) {
    checks.push({
      name: 'Deterministic Skipped Fills Simulation',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۲. اعتبارسنجی سازگاری بدون رگرسیون پریست‌های پیش‌فرض
  try {
    const paramsBalanced = getDefaultStrategyParameters('BALANCED');
    const paramsConservative = getDefaultStrategyParameters('CONSERVATIVE');
    const paramsAggressive = getDefaultStrategyParameters('AGGRESSIVE');

    const validFriction =
      paramsBalanced.executionFriction?.slippageModelType === 'VOLATILITY_SCALED' &&
      paramsConservative.executionFriction?.spreadModelType === 'DYNAMIC_SESSION' &&
      paramsAggressive.executionFriction?.intrabarAmbiguityPolicy === 'BAR_POLARITY';

    checks.push({
      name: 'Default Execution Friction Presets Integrity',
      passed: validFriction,
      details: validFriction
        ? 'پریست‌های BALANCED، CONSERVATIVE و AGGRESSIVE به طور کامل به متغیرهای اصطکاک و اسلیپیج پکیج C مجهز شدند.'
        : 'خطا در پریست‌های پیش‌فرض اصطکاک.',
    });
  } catch (err) {
    checks.push({
      name: 'Default Execution Friction Presets Integrity',
      passed: false,
      details: (err as Error).message,
    });
  }

  return checks;
}
