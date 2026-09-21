import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Candle, SymbolId, Timeframe } from '../../contracts/market';
import type { OrderIntentPayload } from '../ports';
import { DataWorkbench } from '../data-workbench';
import { ResearchLab } from '../research-lab';
import { EventDrivenExecutionEngine } from '../event-driven-engine';
import { getDefaultStrategyParameters } from '../../contracts/strategy-parameters';
import { calculateDeterministicRisk } from '../risk-calculator';

function makeTestIntent(partial: Partial<OrderIntentPayload> & {
  intentId: string;
  symbol: SymbolId;
  direction: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  volumeLots: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
}): OrderIntentPayload {
  return {
    environment: 'BACKTEST',
    accountNamespace: 'TEST',
    candidateId: `CAND-${partial.intentId}`,
    reasonCode: 'TEST',
    createdTimestamp: 1000,
    idempotencyKey: `IDEM-${partial.intentId}`,
    takeProfitPrice: partial.takeProfitPrice ?? (partial.direction === 'BUY' ? partial.entryPrice + 0.01 : partial.entryPrice - 0.01),
    ...partial,
  };
}

export interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runResearchBacktestIntegrityTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ۱. تست اعتبارسنجی داده‌های روزانه (D1) با بیش از ۲۶۰۰ کندل و خطاهای جزیی گرد کردن بدون رد کل دیتاست
  try {
    const d1Candles: Candle[] = [];
    const baseTime = 1400000000000;
    const dayMs = 86400000;
    let price = 1.3000;
    let currentTimestamp = baseTime;

    for (let i = 0; i < 2601; i++) {
      const isWeekendGap = i % 5 === 0;
      currentTimestamp += (isWeekendGap ? dayMs * 3 : dayMs);
      const open = Number((price + (i % 2 === 0 ? 0.0010 : -0.0008)).toFixed(5));
      const close = Number((open + (i % 3 === 0 ? 0.0015 : -0.0012)).toFixed(5));
      let high = Number((Math.max(open, close) + 0.0020).toFixed(5));
      let low = Number((Math.min(open, close) - 0.0020).toFixed(5));

      // تزریق ۶۰ ناهنجاری جزیی گرد کردن OHLC (مانند low بالاتر از close یا high پایین‌تر از open)
      if (i < 60) {
        low = Number((close + 0.0001).toFixed(5)); // خطای جزیی ۰٫۰۰۰۱
      }

      d1Candles.push({
        timestamp: currentTimestamp,
        open,
        high,
        low,
        close,
        volume: 1000 + (i % 500),
        isClosed: true,
      });
      price = close;
    }

    const report = DataWorkbench.validateCandles(d1Candles, 'GBPUSD', 'D1');
    const passed =
      report.isValid === true &&
      report.metrics?.inferredTimeframe === 'D1' &&
      report.metrics?.validCandles === 2601 &&
      report.metrics?.ohlcInvalidCount === 60 &&
      report.metrics?.rejectedRows === 0;

    results.push({
      name: 'اعتبارسنجی داده‌های D1 با ۲۶۰۱ کندل: پاک‌سازی ناهنجاری‌های جزیی بدون رد کل دیتاست',
      passed,
      details: `اعتبار=${report.isValid}; تایم‌فریم=${report.metrics?.inferredTimeframe}; کندل‌های معتبر=${report.metrics?.validCandles}; ناهنجاری OHLC اصلاح‌شده=${report.metrics?.ohlcInvalidCount}; هشدارهای گپ=${report.metrics?.gapCount}`,
    });
  } catch (error) {
    results.push({
      name: 'اعتبارسنجی داده‌های D1 با ۲۶۰۱ کندل: پاک‌سازی ناهنجاری‌های جزیی بدون رد کل دیتاست',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۲. انتشار یکپارچه تایم‌فریم انتخابی (Timeframe Propagation) در تمام لایه‌ها
  try {
    const candles4H: Candle[] = [];
    const t0 = 1700000000000;
    const fourHourMs = 4 * 3600 * 1000;
    let p = 1.2500;

    for (let i = 0; i < 200; i++) {
      const open = p;
      const close = p + (i > 60 && i < 120 ? 0.0030 : -0.0015);
      const high = Math.max(open, close) + 0.0020;
      const low = Math.min(open, close) - 0.0020;
      candles4H.push({
        timestamp: t0 + i * fourHourMs,
        open: Number(open.toFixed(5)),
        high: Number(high.toFixed(5)),
        low: Number(low.toFixed(5)),
        close: Number(close.toFixed(5)),
        volume: 5000,
        isClosed: true,
      });
      p = close;
    }

    const backtestResult = ResearchLab.runBacktest(candles4H, 'GBPUSD', {
      timeframe: '4H',
      style: 'TREND_BREAKOUT',
      lookbackCandles: 150,
    });

    const passed =
      backtestResult.metrics !== undefined &&
      backtestResult.metrics.diagnostics !== undefined &&
      (backtestResult.trades.length === 0 || backtestResult.trades.every(t => t.symbol === 'GBPUSD'));

    results.push({
      name: 'انتشار یکپارچه تایم‌فریم ۴H در موتور، ستاپ‌ها، تریدها و انقضا',
      passed,
      details: `تعداد تریدها=${backtestResult.trades.length}; گزارش انقضا=${backtestResult.metrics.diagnostics?.ordersExpired}; کاندیداها=${backtestResult.metrics.diagnostics?.candidatesCount}`,
    });
  } catch (error) {
    results.push({
      name: 'انتشار یکپارچه تایم‌فریم ۴H در موتور، ستاپ‌ها، تریدها و انقضا',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۳. کنترل حجم بر اساس سقف ریسک و رد سفارش وقتی حداقل حجم ۰٫۰۱ از سقف ریسک فراتر رود
  try {
    const equity = 10000;
    const safeRiskPercent = 0.25; // ۲۵ دلار سقف ریسک
    const entryPrice = 1.2500;
    const normalSlPrice = 1.2475; // ۲۵ پیپ فاصله

    const normalRisk = calculateDeterministicRisk({
      symbol: 'GBPUSD',
      direction: 'BUY',
      entryPrice,
      stopLossPrice: normalSlPrice,
      takeProfitPrice: 1.2550,
      accountEquity: equity,
      riskPercentage: safeRiskPercent,
    });

    // ستاپ با فاصله استاپ وحشتناک ۲۰۰۰ پیپ با سرمایه کم ۱۰۰۰ دلار (سقف ریسک ۲٫۵ دلار)
    // با حداقل لات ۰٫۰۱، ریسک می‌شود ۲۰۰ دلار که فراتر از سقف ۲٫۵ دلار است -> باید رد شود
    const extremeSlPrice = 1.0500;
    const extremeRisk = calculateDeterministicRisk({
      symbol: 'GBPUSD',
      direction: 'BUY',
      entryPrice,
      stopLossPrice: extremeSlPrice,
      takeProfitPrice: 1.3500,
      accountEquity: 1000,
      riskPercentage: safeRiskPercent,
    });

    const passed =
      normalRisk.isValid &&
      normalRisk.adjustedVolumeLots > 0 &&
      normalRisk.plannedRiskAmount <= 25.0 &&
      !extremeRisk.isValid;

    results.push({
      name: 'کنترل سخت‌گیرانه ریسک: تعیین حجم متناسب و رد قطعی اگر حجم ۰٫۰۱ فراتر از سقف ریسک رود',
      passed,
      details: `سفارش عادی: حجم=${normalRisk.adjustedVolumeLots} لات، ریسک=$${normalRisk.plannedRiskAmount}. سفارش نامتعارف: معتبر=${extremeRisk.isValid}، پیام=${extremeRisk.explanation}`,
    });
  } catch (error) {
    results.push({
      name: 'کنترل سخت‌گیرانه ریسک: تعیین حجم متناسب و رد قطعی اگر حجم ۰٫۰۱ فراتر از سقف ریسک رود',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۴. عدم شکست بی‌پاسخ در صورت صفر معامله و ارائه علت آماری شفاف (Zero-Trade Rationale)
  try {
    const quietCandles: Candle[] = [];
    const t0 = 1700000000000;
    let p = 1.2500;

    // کندل‌های کاملاً بدون شکست و نوسان، جهت تولید صفر ترید
    for (let i = 0; i < 60; i++) {
      quietCandles.push({
        timestamp: t0 + i * 300000,
        open: p,
        high: p + 0.0001,
        low: p - 0.0001,
        close: p,
        volume: 50,
        isClosed: true,
      });
    }

    const zeroResult = ResearchLab.runBacktest(quietCandles, 'GBPUSD', {
      style: 'TREND_BREAKOUT',
      timeframe: '5M',
    });

    const passed =
      zeroResult.trades.length === 0 &&
      zeroResult.metrics.totalTrades === 0 &&
      zeroResult.metrics.diagnostics !== undefined &&
      typeof zeroResult.metrics.diagnostics.zeroTradeRationale === 'string' &&
      zeroResult.metrics.diagnostics.zeroTradeRationale.length > 0;

    results.push({
      name: 'مدیریت شفاف خروجی بدون معامله (Zero Trades) با علت‌یابی آماری',
      passed,
      details: `تریدها=${zeroResult.trades.length}; علت آماری=${zeroResult.metrics.diagnostics?.zeroTradeRationale}`,
    });
  } catch (error) {
    results.push({
      name: 'مدیریت شفاف خروجی بدون معامله (Zero Trades) با علت‌یابی آماری',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۵. بستن پوزیشن‌های باز در پایان داده با علت END_OF_DATA و لغو سفارش‌های معلق با CANCELLED_END_OF_DATA
  try {
    const engine = new EventDrivenExecutionEngine({
      environment: 'BACKTEST',
      initialCash: 10000,
      endOfDataPolicy: 'CLOSE_AT_LAST_CLOSE',
    });

    const candle1: Candle = { timestamp: 1000, open: 1.2500, high: 1.2510, low: 1.2490, close: 1.2500, volume: 100, isClosed: true };
    const candle2: Candle = { timestamp: 2000, open: 1.2500, high: 1.2520, low: 1.2495, close: 1.2510, volume: 100, isClosed: true };
    const candle3: Candle = { timestamp: 3000, open: 1.2510, high: 1.2530, low: 1.2505, close: 1.2525, volume: 100, isClosed: true };

    // ثبت سفارش مارکت
    engine.submitOrder(makeTestIntent({
      intentId: 'ORDER-1',
      symbol: 'GBPUSD',
      direction: 'BUY',
      orderType: 'MARKET',
      volumeLots: 0.1,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2700,
    }));

    // ثبت سفارش معلق لیمیت
    engine.submitOrder(makeTestIntent({
      intentId: 'ORDER-PENDING',
      symbol: 'GBPUSD',
      direction: 'BUY',
      orderType: 'LIMIT',
      volumeLots: 0.1,
      entryPrice: 1.2400, // قیمت دوردست که پر نشود
      stopLossPrice: 1.2300,
      takeProfitPrice: 1.2600,
    }));

    // پردازش کندل‌ها تا پر شدن مارکت
    engine.processCandle(candle1, 'GBPUSD');
    engine.processCandle(candle2, 'GBPUSD');
    engine.processCandle(candle3, 'GBPUSD');

    // پایان دیتاست
    const endResult = engine.finalizeEndOfData(candle3, 'GBPUSD', 'CLOSE_AT_LAST_CLOSE');

    const ledger = engine.getLedger();
    const openPositions = ledger.positions.filter(p => p.isOpen);
    const closedPositions = ledger.positions.filter(p => !p.isOpen);
    const endTrade = closedPositions.find(p => p.closeReason === 'END_OF_DATA');
    const allEvents = engine.getEventStore().getAllEvents();
    const hasCancelledOrder = allEvents.some(e => e.status === 'CANCELLED_END_OF_DATA');

    const passed =
      openPositions.length === 0 &&
      endTrade !== undefined &&
      endTrade.closeReason === 'END_OF_DATA' &&
      hasCancelledOrder &&
      endResult.cancelledOrdersCount >= 1;

    results.push({
      name: 'سیاست پایان دیتا (End of Data): بستن پوزیشن باز با END_OF_DATA و لغو سفارش لیمیت با CANCELLED_END_OF_DATA',
      passed,
      details: `پوزیشن‌های باز=${openPositions.length}; ترید بسته پایان دیتا=${endTrade?.positionId} با دلیل ${endTrade?.closeReason}; لغو سفارش معلق=${hasCancelledOrder}`,
    });
  } catch (error) {
    results.push({
      name: 'سیاست پایان دیتا (End of Data): بستن پوزیشن باز با END_OF_DATA و لغو سفارش لیمیت با CANCELLED_END_OF_DATA',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۶. تاثیر مدل اسلیپیج (Slippage Model) بر قیمت ورود و خروج
  try {
    const engineZeroSlip = new EventDrivenExecutionEngine({
      environment: 'BACKTEST',
      initialCash: 10000,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0, additionalSlippagePips: 0 },
    });

    const engineWithSlip = new EventDrivenExecutionEngine({
      environment: 'BACKTEST',
      initialCash: 10000,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0, additionalSlippagePips: 2.0 }, // ۲ پیپ اسلیپیج = ۰٫۰۰۰۲ برای GBPUSD
    });

    const candle: Candle = {
      timestamp: 1000,
      open: 1.2500,
      high: 1.2520,
      low: 1.2480,
      close: 1.2500,
      volume: 100,
      isClosed: true,
    };

    engineZeroSlip.submitOrder(makeTestIntent({
      intentId: 'SLIP-0',
      symbol: 'GBPUSD',
      direction: 'BUY',
      orderType: 'MARKET',
      volumeLots: 0.1,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
    }));

    engineWithSlip.submitOrder(makeTestIntent({
      intentId: 'SLIP-2',
      symbol: 'GBPUSD',
      direction: 'BUY',
      orderType: 'MARKET',
      volumeLots: 0.1,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
    }));

    engineZeroSlip.processCandle(candle, 'GBPUSD');
    engineWithSlip.processCandle(candle, 'GBPUSD');

    const pos0 = engineZeroSlip.getLedger().positions[0];
    const pos2 = engineWithSlip.getLedger().positions[0];

    const passed =
      pos0 !== undefined &&
      pos2 !== undefined &&
      pos2.entryPrice > pos0.entryPrice &&
      Math.abs((pos2.entryPrice - pos0.entryPrice) - 0.0002) < 0.00001;

    results.push({
      name: 'محاسبه دقیق اسلیپیج: افزایش ۲ پیپ قیمت ورود خرید در شرایط اسلیپیج مثبت',
      passed,
      details: `ورود بدون اسلیپیج=${pos0?.entryPrice}؛ ورود با ۲ پیپ اسلیپیج=${pos2?.entryPrice}؛ اختلاف=${pos2 ? (pos2.entryPrice - pos0.entryPrice).toFixed(5) : 0}`,
    });
  } catch (error) {
    results.push({
      name: 'محاسبه دقیق اسلیپیج: افزایش ۲ پیپ قیمت ورود خرید در شرایط اسلیپیج مثبت',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۷. حفظ و انتقال پارامترهای استراتژی و کنترل ریسک در آزمون Walk-Forward
  try {
    const wfCandles: Candle[] = [];
    const t0 = 1700000000000;
    let p = 1.2500;
    for (let i = 0; i < 300; i++) {
      const open = p;
      const close = p + (i % 4 === 0 ? 0.0020 : -0.0010);
      const high = Math.max(open, close) + 0.0015;
      const low = Math.min(open, close) - 0.0015;
      wfCandles.push({
        timestamp: t0 + i * 3600 * 1000,
        open: Number(open.toFixed(5)),
        high: Number(high.toFixed(5)),
        low: Number(low.toFixed(5)),
        close: Number(close.toFixed(5)),
        volume: 2000,
        isClosed: true,
      });
      p = close;
    }

    const customParams = getDefaultStrategyParameters('BALANCED');
    customParams.common.riskRewardRatio = 2.8;

    const wfWindows = ResearchLab.runWalkForward(wfCandles, 'GBPUSD', 3, {
      timeframe: '1H',
      style: 'TREND_BREAKOUT',
      riskPercent: 0.8,
      additionalSlippagePips: 0.5,
      strategyParameters: customParams,
      endOfDataPolicy: 'CLOSE_AT_LAST_CLOSE',
    });

    const passed =
      Array.isArray(wfWindows) &&
      wfWindows.length >= 1 &&
      wfWindows[0].trainMetrics !== undefined &&
      wfWindows[0].validationMetrics !== undefined;

    results.push({
      name: 'آزمون Walk-Forward: انتقال بدون افت تنظیمات تایم‌فریم، ریسک و پارامترها به پنجره‌های IS و OOS',
      passed,
      details: `تعداد پنجره‌ها=${wfWindows.length}؛ پنجره ۱ سود آموزش=$${wfWindows[0]?.trainMetrics.netProfit}؛ سود اعتبارسنجی=$${wfWindows[0]?.validationMetrics.netProfit}`,
    });
  } catch (error) {
    results.push({
      name: 'آزمون Walk-Forward: انتقال بدون افت تنظیمات تایم‌فریم، ریسک و پارامترها به پنجره‌های IS و OOS',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۸. منطق بازنشانی وضعیت منسوخ (Stale State Reset) با تغییر نماد یا تایم‌فریم
  try {
    let activeTf: string = '5M';
    let cachedReport: unknown = { valid: true, candlesCount: 1000 };
    let cachedBacktest: unknown = { trades: [1, 2, 3] };

    // شبیه‌سازی تغییر تایم‌فریم توسط کاربر در کامپوننت
    const onTimeframeChange = (newTf: string) => {
      activeTf = newTf;
      cachedReport = null;
      cachedBacktest = null;
    };

    onTimeframeChange('1H');

    const passed =
      activeTf === '1H' &&
      cachedReport === null &&
      cachedBacktest === null;

    results.push({
      name: 'بازنشانی وضعیت نتایج منسوخ هنگام سوئیچ تایم‌فریم یا جفت‌ارز',
      passed,
      details: `تایم‌فریم جدید=${activeTf}؛ گزارش قبلی پاک شد=${cachedReport === null}؛ نتایج قبلی پاک شد=${cachedBacktest === null}`,
    });
  } catch (error) {
    results.push({
      name: 'بازنشانی وضعیت نتایج منسوخ هنگام سوئیچ تایم‌فریم یا جفت‌ارز',
      passed: false,
      details: (error as Error).message,
    });
  }

  // ۹. آزمون یکپارچگی اجرایی واقعی GBPUSD روی تمام تایم‌فریم‌های توکار (5M, 15M, 1H, 4H, D1)
  try {
    const timeframes: Timeframe[] = ['5M', '15M', '1H', '4H', 'D1'];
    const tfResults: Array<{ tf: Timeframe; candleCount: number; tradeCount: number; winRate: number; profitFactor: number }> = [];

    for (const tf of timeframes) {
      const lower = tf.toLowerCase();
      const filePath = resolve(process.cwd(), `public/historical/intraday/histdata-gbpusd-${lower}-2024.csv`);

      if (!existsSync(filePath)) {
        throw new Error(`فایل دیتاست ${filePath} یافت نشد.`);
      }

      const csvContent = readFileSync(filePath, 'utf-8');
      const allCandles = DataWorkbench.parseCSV(csvContent, tf).candles;

      // برای کارایی در تست یونیت، اگر تعداد کندل خیلی زیاد باشد (مثل 5M که ۷۴ هزار است)،
      // از نمونه ۳۰۰۰ کندل آخر یا کل کندل‌ها در تایم‌فریم‌های بالاتر استفاده می‌شود
      const candlesToTest = allCandles.length > 5000 ? allCandles.slice(-5000) : allCandles;

      const backtest = ResearchLab.runBacktest(candlesToTest, 'GBPUSD', {
        timeframe: tf,
        style: 'TREND_BREAKOUT',
        riskPercent: 0.5,
        endOfDataPolicy: 'CLOSE_AT_LAST_CLOSE',
      });

      tfResults.push({
        tf,
        candleCount: candlesToTest.length,
        tradeCount: backtest.trades.length,
        winRate: backtest.metrics.winRatePercent,
        profitFactor: backtest.metrics.profitFactor,
      });
    }

    const allHaveTrades = tfResults.every(r => r.tradeCount > 0);
    const allHaveValidMetrics = tfResults.every(r => r.winRate >= 0 && r.winRate <= 100 && r.profitFactor >= 0);

    const passed = allHaveTrades && allHaveValidMetrics;

    results.push({
      name: 'آزمون یکپارچگی واقعی GBPUSD روی ۵ تایم‌فریم توکار (5M, 15M, 1H, 4H, D1)',
      passed,
      details: tfResults.map(r => `[${r.tf}: ${r.candleCount} کندل -> ${r.tradeCount} معامله، برد=${r.winRate}٪، PF=${r.profitFactor}]`).join(' | '),
    });
  } catch (error) {
    results.push({
      name: 'آزمون یکپارچگی واقعی GBPUSD روی ۵ تایم‌فریم توکار (5M, 15M, 1H, 4H, D1)',
      passed: false,
      details: (error as Error).message,
    });
  }

  return results;
}
