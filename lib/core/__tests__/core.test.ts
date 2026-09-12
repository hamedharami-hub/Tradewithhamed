import { calculateWilderATR } from '../atr';
import { detectSwingPoints } from '../swings';
import { calculateDeterministicRisk } from '../risk-calculator';
import { Candle } from '../../contracts/market';
import { SimulatedBroker } from '../simulated-broker';
import { PositionScalingEngine } from '../position-scaling-engine';

export function runAllCoreTests(): {
  name: string;
  passed: boolean;
  details: string;
}[] {
  const results: { name: string; passed: boolean; details: string }[] = [];

  // تست ۱: محاسبه Wilder ATR(14)
  try {
    const mockCandles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      mockCandles.push({
        timestamp: 1000 + i * 60000,
        open: 2600 + i,
        high: 2605 + i,
        low: 2595 + i,
        close: 2602 + i,
        volume: 100,
        isClosed: true,
      });
    }
    const atrs = calculateWilderATR(mockCandles, 14);
    const passed = atrs.length > 0 && atrs[0] === 10;
    results.push({
      name: 'Wilder ATR(14) Calculation',
      passed,
      details: passed ? `ATR successfully calculated: ${atrs[0]}` : 'Failed ATR calculation',
    });
  } catch (e) {
    results.push({ name: 'Wilder ATR(14) Calculation', passed: false, details: (e as Error).message });
  }

  // تست ۲: عدم نگاه به آینده در کشف پیوت‌ها (Look-ahead bias prevention)
  try {
    const candles: Candle[] = [
      { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 10, isClosed: true },
      { timestamp: 2, open: 11, high: 14, low: 10, close: 13, volume: 10, isClosed: true },
      { timestamp: 3, open: 13, high: 20, low: 12, close: 18, volume: 10, isClosed: true }, // Pivot High در ایندکس 2
      { timestamp: 4, open: 18, high: 15, low: 13, close: 14, volume: 10, isClosed: true },
      { timestamp: 5, open: 14, high: 13, low: 11, close: 12, volume: 10, isClosed: true }, // تایید در ایندکس 4
    ];
    const swings = detectSwingPoints(candles, '5M');
    const pivot = swings.find(s => s.type === 'HIGH' && s.price === 20);
    const passed = pivot !== undefined && pivot.confirmedAtIndex === 4;
    results.push({
      name: 'Pivot High/Low Look-Ahead Bias Prevention',
      passed,
      details: passed
        ? `Pivot at index 2 confirmed strictly at closed candle index ${pivot?.confirmedAtIndex}`
        : 'Failed look-ahead prevention test',
    });
  } catch (e) {
    results.push({ name: 'Pivot High/Low Look-Ahead Bias Prevention', passed: false, details: (e as Error).message });
  }

  // تست ۳: محاسبه قطعی سقف ریسک ۰٫۲۵٪
  try {
    const risk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      accountEquity: 10000,
      riskPercentage: 0.25,
    });
    const usdjpyRisk = calculateDeterministicRisk({
      symbol: 'USDJPY',
      direction: 'BUY',
      entryPrice: 155.0,
      stopLossPrice: 154.6, // 40 pips
      takeProfitPrice: 156.0,
      accountEquity: 10000,
      riskPercentage: 0.25,
    });
    const maxAllowedDollarRisk = 25; // 0.25% of 10000
    const passed =
      risk.isValid &&
      risk.plannedRiskAmount <= maxAllowedDollarRisk &&
      usdjpyRisk.isValid &&
      usdjpyRisk.plannedRiskAmount <= maxAllowedDollarRisk &&
      usdjpyRisk.adjustedVolumeLots >= 0.01;
    results.push({
      name: 'Deterministic Risk 0.25% Cap',
      passed,
      details: passed
        ? `Risk capped: Gold=$${risk.plannedRiskAmount} (${risk.adjustedVolumeLots} lots), USDJPY=$${usdjpyRisk.plannedRiskAmount} (${usdjpyRisk.adjustedVolumeLots} lots)`
        : `Violated 0.25% cap: Gold=$${risk.plannedRiskAmount}, USDJPY=$${usdjpyRisk.plannedRiskAmount}`,
    });
  } catch (e) {
    results.push({ name: 'Deterministic Risk 0.25% Cap', passed: false, details: (e as Error).message });
  }

  // تست ۴: کسر کارمزد بروکر در محاسبه ریسک و ریوارد
  try {
    const risk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      accountEquity: 10000,
    });
    const passed = risk.commissionEstimated > 0 && risk.netRiskRewardRatio < risk.grossRiskRewardRatio;
    results.push({
      name: 'Broker Commission Deduction in Risk/Reward',
      passed,
      details: passed
        ? `Commission $${risk.commissionEstimated} deducted: Gross R:R=${risk.grossRiskRewardRatio}, Net R:R=${risk.netRiskRewardRatio}`
        : 'Failed commission deduction test',
    });
  } catch (e) {
    results.push({ name: 'Broker Commission Deduction in Risk/Reward', passed: false, details: (e as Error).message });
  }

  // تست ۵: پالایش ورودی و مسدودسازی NaN یا مقادیر منفی/معکوس در محاسبه ریسک
  try {
    const nanRisk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: NaN,
      stopLossPrice: 2645.0,
      takeProfitPrice: 2665.0,
      accountEquity: 10000,
    });

    const invertedRisk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2660.0, // حد ضرر بالاتر از ورود برای BUY (نامعتبر)
      takeProfitPrice: 2640.0,
      accountEquity: 10000,
    });

    const passed = !nanRisk.isValid && !invertedRisk.isValid && nanRisk.adjustedVolumeLots === 0;
    results.push({
      name: 'Strict Risk Calculator Input Sanitization (NaN & Direction Guard)',
      passed,
      details: passed
        ? 'ورودی‌های نامعتبر، مقادیر NaN و جهات معکوس حد ضرر با موفقیت مسدود و حجم به صفر تنظیم شد.'
        : 'خطا: سیستم ورودی‌های نامعتبر را مسدود نکرد.',
    });
  } catch (e) {
    results.push({ name: 'Strict Risk Calculator Input Sanitization', passed: false, details: (e as Error).message });
  }

  // تست ۶: مصونیت از شمارش دوبل اکوئیتی پس از بستن پوزیشن در شبیه‌ساز بروکر
  try {
    const testBroker = new SimulatedBroker(10000);

    // باز کردن پوزیشن خرید و تست رسیدن به TP
    testBroker.createMarketBracketOrder('XAUUSD', 'BUY', 0.1, 2650.0, 2640.0, 2660.0);
    
    // کندل بسته‌کننده حد سود
    testBroker.onNewCandle({
      timestamp: Date.now(),
      open: 2650.0,
      high: 2662.0,
      low: 2649.0,
      close: 2661.0,
      volume: 50,
      isClosed: true,
    }, 'XAUUSD');

    const brokerState = testBroker.getState();
    const openPos = brokerState.positions.filter(p => p.isOpen);
    const expectedUnrealized = openPos.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const expectedEquity = Number((brokerState.accountBalance + expectedUnrealized).toFixed(2));

    const noDoubleCount = brokerState.accountEquity === expectedEquity && openPos.length === 0;

    results.push({
      name: 'Equity Accounting Double-Counting Immunity',
      passed: noDoubleCount,
      details: noDoubleCount
        ? `اکوئیتی حساب ($${brokerState.accountEquity}) دقیقاً با موجودی پس از خروج ($${brokerState.accountBalance}) برابر است و شمارش دوبل رخ نداد.`
        : `خطای شمارش دوبل: موجودی=${brokerState.accountBalance}، اکوئیتی=${brokerState.accountEquity}`,
    });
  } catch (e) {
    results.push({ name: 'Equity Accounting Double-Counting Immunity', passed: false, details: (e as Error).message });
  }

  // تست ۷: سقف قطعی ریسک ۰٫۲۵٪ و رد سفارش در سرمایه ناکافی (ممانعت از تحمیل لات حداقل ۳٪)
  try {
    // سناریوی ممیزی: حساب ۱۰۰ دلاری با ریسک ۰٫۲۵٪ روی طلا
    const tinyAccountRisk = calculateDeterministicRisk({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryPrice: 2650.0,
      stopLossPrice: 2645.0, // ۵ دلار فاصله = ۵۰۰ دلار ریسک در هر لات
      takeProfitPrice: 2665.0,
      accountEquity: 100, // ۱۰۰ دلار کل سرمایه
      riskPercentage: 0.25, // حداکثر ریسک ۰.۲۵ دلار
    });

    const instantBracket = PositionScalingEngine.calculateInstantBracket(
      'XAUUSD',
      'BUY',
      2650.0,
      2.5,
      0.25,
      100
    );

    const isProperlyRejected =
      !tinyAccountRisk.isValid &&
      tinyAccountRisk.adjustedVolumeLots === 0 &&
      !instantBracket.isValid &&
      instantBracket.calculatedLots === 0;

    results.push({
      name: 'Zero Risk Inflation Guard (Strict 0.25% Cap & Sub-Minimum Lot Rejection)',
      passed: isProperlyRejected,
      details: isProperlyRejected
        ? 'معامله در سرمایه ۱۰۰ دلاری به جای تحمیل حجم حداقل و تحمیل ریسک ۳ درصدی، با موفقیت رد شد (حجم = ۰).'
        : `خطا در کنترل ریسک: حجم محاسبه‌شده=${tinyAccountRisk.adjustedVolumeLots}، وضعیت اعتبار=${tinyAccountRisk.isValid}`,
    });
  } catch (e) {
    results.push({ name: 'Zero Risk Inflation Guard', passed: false, details: (e as Error).message });
  }

  // تست ۸: بستن دستی پوزیشن و برابری مطلق اکوئیتی و بالانس
  try {
    const manualBroker = new SimulatedBroker(5000);
    const { position } = manualBroker.createMarketBracketOrder('EURUSD', 'BUY', 0.05, 1.0850, 1.0820, 1.0920);

    // بستن دستی پوزیشن در سود
    const closeRes = manualBroker.closePosition(position.id, 1.0890, 'MANUAL');
    const stateAfterClose = manualBroker.getState();
    const openPositionsCount = stateAfterClose.positions.filter(p => p.isOpen).length;

    const parityVerified =
      closeRes.success &&
      openPositionsCount === 0 &&
      stateAfterClose.accountEquity === stateAfterClose.accountBalance &&
      closeRes.netRealizedPnl > 0;

    results.push({
      name: 'Manual Position Close Ledger Parity (Equity === Balance)',
      passed: parityVerified,
      details: parityVerified
        ? `پوزیشن با موفقیت بسته شد و اکوئیتی ($${stateAfterClose.accountEquity}) با بالانس ($${stateAfterClose.accountBalance}) دقیقاً منطبق است.`
        : `عدم انطباق اکوئیتی و بالانس: اکوئیتی=${stateAfterClose.accountEquity}، بالانس=${stateAfterClose.accountBalance}`,
    });
  } catch (e) {
    results.push({ name: 'Manual Position Close Ledger Parity', passed: false, details: (e as Error).message });
  }

  return results;
}
