import { SimulatedBroker } from '../simulated-broker';
import { PositionScalingEngine } from '../position-scaling-engine';
import { Candle } from '../../contracts/market';
import { DEFAULT_PARTIAL_TP_CONFIG } from '../../contracts/tactical-cockpit';

export interface TacticalCockpitTestResult {
  name: string;
  passed: boolean;
  details: string;
}

export function runTacticalCockpitTestSuite(): TacticalCockpitTestResult[] {
  const results: TacticalCockpitTestResult[] = [];

  // ۱. تست محاسبه آنی پارامترهای اردر براکت ۱-کلیکی (Instant Bracket Calculation)
  try {
    const bracket = PositionScalingEngine.calculateInstantBracket(
      'XAUUSD',
      'BUY',
      2050.0,
      2.5,
      0.25, // سقف مجاز پلتفرم ۰٫۲۵٪
      10000.0, // سرمایه ده‌هزار دلار (ریسک مجاز: ۲۵ دلار)
      DEFAULT_PARTIAL_TP_CONFIG
    );

    // فاصله SL باید 1.2 * 2.5 = 3.0 دلار باشد -> SL = 2047.0
    // مقدار ریسک ۲۵ دلار / (۳ دلار * ۱۰۰ + ۶ کارمزد) = ۰٫۰۸۱ -> ۰٫۰۸ لات با سقف ۰٫۲۵٪
    const expectedSl = 2047.0;
    const passed =
      bracket.direction === 'BUY' &&
      bracket.stopLossPrice === expectedSl &&
      bracket.calculatedLots === 0.08 &&
      bracket.tp1Price !== undefined &&
      bracket.tp1Price > bracket.entryPrice;

    results.push({
      name: '[Tactical Cockpit] Instant 1-Click Bracket Lot & Levels Calculation',
      passed,
      details: `اردر براکت خرید با قیمت ورود ${bracket.entryPrice}، حد ضرر ${bracket.stopLossPrice}، تارگت اول ${bracket.tp1Price} و حجم محاسبه‌شده ${bracket.calculatedLots} لات تایید شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Tactical Cockpit] Instant 1-Click Bracket Lot & Levels Calculation',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. تست ثبت آنی سفارش مارکت در بروکر (Market Execution Direct Fill)
  try {
    const broker = new SimulatedBroker(10000);
    const { order, position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.1,
      2050.0,
      2047.0,
      2055.0
    );

    const passed =
      order.status === 'FILLED' &&
      position.isOpen === true &&
      position.entryPrice === 2050.0 &&
      position.volumeLots === 0.1 &&
      broker.getState().positions.length === 1;

    results.push({
      name: '[Tactical Cockpit] Simulated Broker Instant Market Order Fill',
      passed,
      details: `سفارش مارکت به شناسه ${order.id} بلافاصله اجرا و پوزیشن باز به شناسه ${position.id} در بالانس ثبت شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Tactical Cockpit] Simulated Broker Instant Market Order Fill',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. تست منطق خروج پله‌ای (Partial Take-Profit TP1) و ریسک‌فری خودکار (Breakeven)
  try {
    const broker = new SimulatedBroker(10000);
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.2,
      2050.0,
      2047.0,
      2058.0
    );

    // کندلی که تارگت اول ۲۰۵۴ را تاچ کرده است
    const candleHitTP1: Candle = {
      timestamp: Date.now(),
      open: 2051,
      high: 2055, // تاچ تارگت
      low: 2050.5,
      close: 2054,
      volume: 100,
      isClosed: true,
    };

    const lifecycle = PositionScalingEngine.evaluatePositionLifecycle(
      position,
      candleHitTP1,
      2053.6, // قیمت TP1
      DEFAULT_PARTIAL_TP_CONFIG
    );

    const passed =
      lifecycle.actionTaken === 'PARTIAL_CLOSE_AND_BREAKEVEN' &&
      lifecycle.realizedPnl > 0 &&
      lifecycle.remainingLots === 0.1 &&
      lifecycle.newStopLoss !== undefined &&
      lifecycle.newStopLoss >= position.entryPrice;

    results.push({
      name: '[Tactical Cockpit] Partial TP1 50% Scaling & Auto-Breakeven Engine',
      passed,
      details: `خروج ۵۰٪ در تارگت اول محقق شد (سود ذخیره‌شده: $${lifecycle.realizedPnl}) و حد ضرر به نقطه ورود ${lifecycle.newStopLoss} منتقل شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Tactical Cockpit] Partial TP1 50% Scaling & Auto-Breakeven Engine',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. تست اعمال خروج پله‌ای در حافظه بروکر (Broker Partial Close Execution)
  try {
    const broker = new SimulatedBroker(10000);
    const { position } = broker.createMarketBracketOrder(
      'XAUUSD',
      'BUY',
      0.2,
      2050.0,
      2047.0,
      2060.0
    );

    // حرکت قیمت به سود ۲۰۵۴
    position.currentPrice = 2054.0;
    const res = broker.applyPartialClose(position.id, 0.5, true);

    const passed =
      res.success === true &&
      res.remainingLots === 0.1 &&
      res.realizedPnl === 40 && // 0.1 لات * 4 دلار * 100 = 40 دلار سود
      broker.getState().accountBalance === 10040 &&
      position.stopLoss === 2050.0 &&
      position.isBreakevenActive === true;

    results.push({
      name: '[Tactical Cockpit] Broker State Partial P&L Realization & Breakeven Lock',
      passed,
      details: `پوزیشن با موفقیت پله‌ای بسته شد؛ بالانس جدید $${broker.getState().accountBalance} و استاپ در نقطه ورود قفل شد.`,
    });
  } catch (err) {
    results.push({
      name: '[Tactical Cockpit] Broker State Partial P&L Realization & Breakeven Lock',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. تست کلید فیوز اضطراری Panic Kill-Switch (بستن آنی همه و لغو اردرها)
  try {
    const broker = new SimulatedBroker(10000);
    // ایجاد ۲ پوزیشن و ۱ اردر لیمیت
    broker.createMarketBracketOrder('XAUUSD', 'BUY', 0.1, 2050, 2047, 2055);
    broker.createMarketBracketOrder('EURUSD', 'SELL', 0.5, 1.085, 1.088, 1.080);
    broker.createOrderFromCandidate(
      {
        id: 'CAND-PENDING-1',
        strategyName: 'Test',
        symbol: 'XAUUSD',
        timeframe: '5M',
        direction: 'BUY',
        createdAtTimestamp: Date.now(),
        expiresAtTimestamp: Date.now() + 60000,
        entryPrice: 2040,
        stopLossPrice: 2035,
        takeProfitPrice: 2050,
        riskRewardRatio: 2.0,
        evidenceIds: {},
        rationale: '',
        status: 'CONFIRMED',
      },
      0.2
    );

    const event = PositionScalingEngine.triggerPanicKillSwitch(broker, 'MANUAL_PANIC');

    const openPos = broker.getState().positions.filter(p => p.isOpen);
    const pendingOrd = broker.getState().orders.filter(o => o.status === 'PENDING');

    const passed =
      event.closedPositionsCount === 2 &&
      event.cancelledOrdersCount === 1 &&
      openPos.length === 0 &&
      pendingOrd.length === 0;

    results.push({
      name: '[Tactical Cockpit] Panic Kill-Switch Emergency Flattening',
      passed,
      details: event.summaryFa,
    });
  } catch (err) {
    results.push({
      name: '[Tactical Cockpit] Panic Kill-Switch Emergency Flattening',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
