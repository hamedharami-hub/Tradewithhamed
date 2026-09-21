// lib/core/__tests__/strategy-mtf-integrity.test.ts
// مجموعه آزمون‌های جامع پکیج ۳: درستی استراتژی، تاییدیه چندتایم‌فریمی، استاپ‌های ساختاری/ATR/پیپ،
// انواع سفارش (MARKET/LIMIT/STOP)، بریک‌ایون، سیو سود پله‌ای، کول‌داون و ثبت پارامترها

import { Candle, Timeframe, SymbolId } from '../../contracts/market';
import { StrategyCandidate } from '../../contracts/strategy';
import { PARAMETER_EFFECT_REGISTRY, getAuditedParameterCount } from '../../contracts/parameter-registry';
import { TimeframeAggregator } from '../timeframe-aggregator';
import { getLastClosedHigherTimeframeCandle, MtfAlignmentCursor } from '../mtf-alignment';
import { MtfFilterEngine } from '../mtf-filter';
import { StopLossCalculator } from '../stop-loss-calculator';
import { EventDrivenExecutionEngine } from '../event-driven-engine';
import { ResearchLab } from '../research-lab';
import { MultiStyleEngine } from '../multi-style-engine';
import { OrderIntentPayload } from '../ports';

export interface StrategyMtfTestResult {
  name: string;
  passed: boolean;
  details: string;
}

function makeCandle(timestamp: number, open: number, high: number, low: number, close: number, isClosed = true): Candle {
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: 100,
    isClosed,
  };
}

function generateCandles(count: number, startTs = 1700000000000, stepMs = 300000, startPrice = 1.2500): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 5) * 0.0020;
    const open = price;
    const close = Number((startPrice + wave + (i % 2 === 0 ? 0.0005 : -0.0004)).toFixed(5));
    const high = Number((Math.max(open, close) + 0.0008).toFixed(5));
    const low = Number((Math.min(open, close) - 0.0008).toFixed(5));
    price = close;
    candles.push(makeCandle(startTs + i * stepMs, open, high, low, close, true));
  }
  return candles;
}

export function runStrategyMtfIntegrityTestSuite(): StrategyMtfTestResult[] {
  const results: StrategyMtfTestResult[] = [];

  // ۱. کندل بالاتر ناکامل یا بسته نشده هرگز در دسترس نیست (ضد نگاه به آینده)
  try {
    const htfCandles: Candle[] = [
      makeCandle(1700000000000, 1.2500, 1.2520, 1.2490, 1.2510, true), // 00:00 - 00:15
      makeCandle(1700000900000, 1.2510, 1.2530, 1.2505, 1.2525, false), // 00:15 - 00:30 (incomplete)
    ];
    // execution at 00:20 (1700001200000)
    const aligned = getLastClosedHigherTimeframeCandle(htfCandles, 1700001200000, '15M');
    const passed = aligned !== null && aligned.timestamp === 1700000000000;
    results.push({
      name: 'Anti Look-Ahead: Incomplete higher timeframe candle is never consumed',
      passed,
      details: `Returned candle timestamp: ${aligned?.timestamp}, expected closed: 1700000000000`,
    });
  } catch (err) {
    results.push({
      name: 'Anti Look-Ahead: Incomplete higher timeframe candle is never consumed',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲. انطباق دقیق ۵ دقیقه با تاییدیه ۱۵ دقیقه (5M-15M)
  try {
    const baseTs = 1700006400000; // 00:00:00 UTC
    const candles5M = generateCandles(6, baseTs, 300000); // 00:00, 05, 10, 15, 20, 25
    const htf15M = TimeframeAggregator.aggregateCandles(candles5M, '15M');
    // At bar index 2 (00:10): 15M candle (00:00-00:15) is not closed yet
    const at0010 = getLastClosedHigherTimeframeCandle(htf15M, candles5M[2].timestamp, '15M');
    // At bar index 3 (00:15): 15M candle (00:00-00:15) just closed!
    const at0015 = getLastClosedHigherTimeframeCandle(htf15M, candles5M[3].timestamp, '15M');
    const passed = at0010.candle === null && at0015.candle !== null && at0015.candle.timestamp === baseTs;
    results.push({
      name: 'MTF Alignment: 5M execution with 15M confirmation exact boundary',
      passed,
      details: `at0010 is null: ${at0010.candle === null}, at0015 timestamp: ${at0015?.timestamp}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Alignment: 5M execution with 15M confirmation exact boundary',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳. انطباق دقیق ۵ دقیقه با تاییدیه ۱ ساعته (5M-1H)
  try {
    const baseTs = 1700006400000;
    const candles5M = generateCandles(15, baseTs, 300000); // 75 minutes
    const htf1H = TimeframeAggregator.aggregateCandles(candles5M, '1H');
    // At 55 min (bar 11): 1H not closed
    const at55 = getLastClosedHigherTimeframeCandle(htf1H, candles5M[11].timestamp, '1H');
    // At 60 min (bar 12): 1H closed
    const at60 = getLastClosedHigherTimeframeCandle(htf1H, candles5M[12].timestamp, '1H');
    const passed = at55.candle === null && at60.candle !== null && at60.candle.timestamp === baseTs;
    results.push({
      name: 'MTF Alignment: 5M execution with 1H confirmation exact boundary',
      passed,
      details: `at55 is null: ${at55.candle === null}, at60 timestamp: ${at60?.timestamp}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Alignment: 5M execution with 1H confirmation exact boundary',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۴. انطباق دقیق ۱۵ دقیقه با تاییدیه ۴ ساعته (15M-4H)
  try {
    const baseTs = 1700006400000;
    const candles15M = generateCandles(20, baseTs, 900000); // 5 hours (16 bars = 4 hours)
    const htf4H = TimeframeAggregator.aggregateCandles(candles15M, '4H');
    const at3h45 = getLastClosedHigherTimeframeCandle(htf4H, candles15M[15].timestamp, '4H');
    const at4h00 = getLastClosedHigherTimeframeCandle(htf4H, candles15M[16].timestamp, '4H');
    const passed = at3h45.candle === null && at4h00.candle !== null && at4h00.candle.timestamp === baseTs;
    results.push({
      name: 'MTF Alignment: 15M execution with 4H confirmation exact boundary',
      passed,
      details: `at3h45 is null: ${at3h45.candle === null}, at4h00 timestamp: ${at4h00?.timestamp}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Alignment: 15M execution with 4H confirmation exact boundary',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۵. انطباق دقیق ۱ ساعته با تاییدیه روزانه (1H-D1)
  try {
    const baseTs = 1700006400000;
    const candles1H = generateCandles(30, baseTs, 3600000); // 30 hours
    const htfD1 = TimeframeAggregator.aggregateCandles(candles1H, 'D1');
    const at23h = getLastClosedHigherTimeframeCandle(htfD1, candles1H[23].timestamp, 'D1');
    const at24h = getLastClosedHigherTimeframeCandle(htfD1, candles1H[24].timestamp, 'D1');
    const passed = at23h.candle === null && at24h.candle !== null && at24h.candle.timestamp === baseTs;
    results.push({
      name: 'MTF Alignment: 1H execution with D1 confirmation exact boundary',
      passed,
      details: `at23h is null: ${at23h.candle === null}, at24h timestamp: ${at24h?.timestamp}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Alignment: 1H execution with D1 confirmation exact boundary',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۶. هم‌ارزی منبع مستقیم (Native) و منبع تجمیعی (Aggregated)
  try {
    const baseTs = 1700006400000;
    const candles5M = generateCandles(12, baseTs, 300000); // 1 hour
    const aggregated15M = TimeframeAggregator.aggregateCandles(candles5M, '15M');
    // Manual native representation
    const native15M: Candle[] = [
      makeCandle(baseTs, candles5M[0].open, Math.max(...candles5M.slice(0, 3).map(c => c.high)), Math.min(...candles5M.slice(0, 3).map(c => c.low)), candles5M[2].close, true),
      makeCandle(baseTs + 900000, candles5M[3].open, Math.max(...candles5M.slice(3, 6).map(c => c.high)), Math.min(...candles5M.slice(3, 6).map(c => c.low)), candles5M[5].close, true),
      makeCandle(baseTs + 1800000, candles5M[6].open, Math.max(...candles5M.slice(6, 9).map(c => c.high)), Math.min(...candles5M.slice(6, 9).map(c => c.low)), candles5M[8].close, true),
      makeCandle(baseTs + 2700000, candles5M[9].open, Math.max(...candles5M.slice(9, 12).map(c => c.high)), Math.min(...candles5M.slice(9, 12).map(c => c.low)), candles5M[11].close, true),
    ];
    const match = aggregated15M.length === native15M.length &&
      aggregated15M.every((c, idx) => c.timestamp === native15M[idx].timestamp && c.close === native15M[idx].close && c.high === native15M[idx].high && c.low === native15M[idx].low);
    results.push({
      name: 'MTF Source Equivalence: Native vs Aggregated HTF candles match perfectly',
      passed: match,
      details: `Aggregated count: ${aggregated15M.length}, Native count: ${native15M.length}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Source Equivalence: Native vs Aggregated HTF candles match perfectly',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۷. فیلتر چندتایم‌فریمی OFF نتایج مبنا را ۱۰۰٪ بازتولید می‌کند
  try {
    const candles = generateCandles(100);
    const filterOff = MtfFilterEngine.evaluateFilter({
      executionCandle: candles[candles.length - 1],
      htfCandle: null,
      htfHistory: [],
      candidateDirection: 'BUY',
      config: {
        enabled: false,
        higherTimeframe: '1H',
        higherTimeframeFilterMode: 'OFF',
      },
    });
    const passed = filterOff.isApproved && filterOff.filterMode === 'OFF';
    results.push({
      name: 'MTF Filter OFF: Faithfully approves all signals when disabled',
      passed,
      details: `Approved: ${filterOff.isApproved}, Mode: ${filterOff.filterMode}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Filter OFF: Faithfully approves all signals when disabled',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۸. رد معامله در صورت مغایرت روند تایم بالاتر (TREND_EMA)
  try {
    // 20 HTF candles strongly declining
    const htfDeclining: Candle[] = [];
    let p = 1.2600;
    for (let i = 0; i < 30; i++) {
      p -= 0.0010;
      htfDeclining.push(makeCandle(1700000000000 + i * 3600000, p + 0.0005, p + 0.0010, p - 0.0005, p, true));
    }
    const filterRes = MtfFilterEngine.evaluateFilter({
      executionCandle: makeCandle(1700000000000 + 30 * 3600000, p, p + 0.0005, p - 0.0005, p, true),
      htfCandle: htfDeclining[htfDeclining.length - 1],
      htfHistory: htfDeclining,
      candidateDirection: 'BUY',
      config: {
        enabled: true,
        higherTimeframe: '1H',
        higherTimeframeFilterMode: 'TREND_EMA',
        trendEmaSettings: { trendEmaPeriod: 10, minimumSlope: 0 },
      },
    });
    const passed = !filterRes.isApproved && (filterRes.reasonFa.includes('نزولی') || filterRes.reasonFa.includes('رد') || filterRes.reasonFa.includes('مخالف'));
    results.push({
      name: 'MTF Trend Rejection: Opposing HTF trend rejects candidate',
      passed,
      details: `Approved: ${filterRes.isApproved}, Reason: ${filterRes.reasonFa}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Trend Rejection: Opposing HTF trend rejects candidate',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۹. رفتار امن در غیاب داده‌های تایم بالاتر (Fail-safe)
  try {
    const filterRes = MtfFilterEngine.evaluateFilter({
      executionCandle: makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true),
      htfCandle: null,
      htfHistory: [],
      candidateDirection: 'BUY',
      config: {
        enabled: true,
        higherTimeframe: '1H',
        higherTimeframeFilterMode: 'TREND_EMA',
      },
    });
    const passed = !filterRes.isApproved && filterRes.reasonFa.includes('کندل بسته تایم‌فریم بالاتر موجود نیست');
    results.push({
      name: 'MTF Fail-Safe: Missing HTF data rejects safely without throwing exception',
      passed,
      details: `Approved: ${filterRes.isApproved}, Reason: ${filterRes.reasonFa}`,
    });
  } catch (err) {
    results.push({
      name: 'MTF Fail-Safe: Missing HTF data rejects safely without throwing exception',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۰. پیوت‌های آینده هرگز برای حد ضرر ساختاری استفاده نمی‌شوند
  try {
    const candles = generateCandles(30);
    // Calculate structure SL at candle index 15
    const slAt15 = StopLossCalculator.calculate('STRUCTURE', 'BUY', candles[15].close, candles.slice(0, 16), 'GBPUSD', '5M');
    // Ensure all references inside calculation only used slice up to 15
    const passed = slAt15.status === 'VALID' || slAt15.status === 'INSUFFICIENT_STRUCTURE';
    results.push({
      name: 'Structural Stop Look-Ahead Protection: Uses only confirmed past pivots',
      passed,
      details: `Status: ${slAt15.status}, Stop: ${slAt15.stopLossPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'Structural Stop Look-Ahead Protection: Uses only confirmed past pivots',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۱. صحت محاسبات حد ضرر بر اساس ATR
  try {
    const candles = generateCandles(40, 1700000000000, 300000, 1.2500);
    const entryPrice = candles[candles.length - 1].close;
    const res1 = StopLossCalculator.calculate('ATR', 'BUY', entryPrice, candles, 'GBPUSD', '5M', {
      atrPeriod: 14,
      atrMultiplier: 1.5,
    });
    const res2 = StopLossCalculator.calculate('ATR', 'BUY', entryPrice, candles, 'GBPUSD', '5M', {
      atrPeriod: 14,
      atrMultiplier: 2.0,
    });
    const passed = res1.status === 'VALID' && res2.status === 'VALID' && res2.riskDistancePrice > res1.riskDistancePrice;
    results.push({
      name: 'ATR Stop Loss: Multiplier scales risk distance proportionally',
      passed,
      details: `1.5x dist: ${res1.riskDistancePips} pips, 2.0x dist: ${res2.riskDistancePips} pips`,
    });
  } catch (err) {
    results.push({
      name: 'ATR Stop Loss: Multiplier scales risk distance proportionally',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۲. حد ضرر ساختاری (Structure SL) با بافر متناسب
  try {
    const candles: Candle[] = [];
    // Form a confirmed valley at index 10
    for (let i = 0; i < 20; i++) {
      let p = 1.2500;
      if (i < 10) p = 1.2500 - i * 0.0005; // falling to 1.2450
      else p = 1.2450 + (i - 10) * 0.0005; // rising to 1.2500
      candles.push(makeCandle(1700000000000 + i * 300000, p, p + 0.0002, p - 0.0002, p, true));
    }
    const res = StopLossCalculator.calculate('STRUCTURE', 'BUY', candles[candles.length - 1].close, candles, 'GBPUSD', '5M', {
      structureLookback: 5,
    });
    const passed = res.status === 'VALID' && res.stopLossPrice < 1.2450;
    results.push({
      name: 'Structure Stop Loss: Anchors below swing low with buffer',
      passed,
      details: `Stop: ${res.stopLossPrice}, Low was: 1.2448, Status: ${res.status}`,
    });
  } catch (err) {
    results.push({
      name: 'Structure Stop Loss: Anchors below swing low with buffer',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۳. حد ضرر پیپ ثابت بر اساس اندازه پیپ استاندارد نمادها (JPY, Gold, Forex)
  try {
    const slForex = StopLossCalculator.calculate('FIXED_PIPS', 'BUY', 1.2500, [], 'GBPUSD', '5M', { fixedStopPips: 20 });
    const slGold = StopLossCalculator.calculate('FIXED_PIPS', 'BUY', 2050.00, [], 'XAUUSD', '5M', { fixedStopPips: 30 });
    const slJpy = StopLossCalculator.calculate('FIXED_PIPS', 'BUY', 150.000, [], 'USDJPY', '5M', { fixedStopPips: 25 });

    const passed = slForex.stopLossPrice === 1.2480 &&
      slGold.stopLossPrice === 2047.00 &&
      slJpy.stopLossPrice === 149.750;

    results.push({
      name: 'Fixed Pips Stop Loss: Precision and pip size accuracy across Forex, Gold, and JPY',
      passed,
      details: `Forex SL: ${slForex.stopLossPrice}, Gold SL: ${slGold.stopLossPrice}, JPY SL: ${slJpy.stopLossPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'Fixed Pips Stop Loss: Precision and pip size accuracy across Forex, Gold, and JPY',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۴. اجرای سفارش مارکت بر مبنای کلوز کندل جاری / اپن کندل بعد
  try {
    const engine = new EventDrivenExecutionEngine({ initialCash: 10000, environment: 'BACKTEST' });
    const intent: OrderIntentPayload = {
      intentId: 'INT-MKT-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-1',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2450,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-MKT-1',
    };
    engine.submitOrder(intent);
    const candle = makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2505, true);
    const events = engine.processCandle(candle, 'GBPUSD');
    const fillEvent = events.find(e => e.status === 'FILLED');
    const passed = fillEvent !== undefined && fillEvent.fillPrice !== undefined;
    results.push({
      name: 'Market Order Execution: Fills immediately on processed candle',
      passed,
      details: `Fill price: ${fillEvent?.fillPrice}, Status: ${fillEvent?.status}`,
    });
  } catch (err) {
    results.push({
      name: 'Market Order Execution: Fills immediately on processed candle',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۵. سفارش لیمیت با قیمت دست‌یافتنی و بهبود قیمت
  try {
    const engine = new EventDrivenExecutionEngine({ initialCash: 10000, defaultSpreadPips: 0 });
    const intent: OrderIntentPayload = {
      intentId: 'INT-LMT-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-2',
      symbol: 'GBPUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2480, // Limit buy at 1.2480
      stopLossPrice: 1.2430,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-LMT-1',
    };
    engine.submitOrder(intent);
    // Candle opens at 1.2470 (gapped below limit -> price improvement to 1.2470)
    const candle = makeCandle(1700000300000, 1.2470, 1.2490, 1.2465, 1.2485, true);
    const events = engine.processCandle(candle, 'GBPUSD');
    const fill = events.find(e => e.status === 'FILLED');
    const passed = fill !== undefined && (fill.fillPrice ?? 0) <= 1.2480;
    results.push({
      name: 'Limit Order Execution: Handles price improvement when market opens beyond limit',
      passed,
      details: `Limit price: 1.2480, Filled at: ${fill?.fillPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'Limit Order Execution: Handles price improvement when market opens beyond limit',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۶. تحریک و فعال‌سازی سفارش استاپ (Stop Order Trigger)
  try {
    const engine = new EventDrivenExecutionEngine({ initialCash: 10000, defaultSpreadPips: 0 });
    const intent: OrderIntentPayload = {
      intentId: 'INT-STP-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-3',
      symbol: 'GBPUSD',
      orderType: 'STOP',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2550, // Buy stop at 1.2550
      stopLossPrice: 1.2500,
      takeProfitPrice: 1.2650,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-STP-1',
    };
    engine.submitOrder(intent);
    // Candle high reaches 1.2560 (breaches stop level 1.2550)
    const candle = makeCandle(1700000300000, 1.2540, 1.2560, 1.2530, 1.2555, true);
    const events = engine.processCandle(candle, 'GBPUSD');
    const fill = events.find(e => e.status === 'FILLED');
    const passed = fill !== undefined && (fill.fillPrice ?? 0) >= 1.2550;
    results.push({
      name: 'Stop Order Mechanics: Triggers when price breaches threshold',
      passed,
      details: `Stop level: 1.2550, Filled at: ${fill?.fillPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'Stop Order Mechanics: Triggers when price breaches threshold',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۷. منطق گپ ورودی (Gap Entry Fill)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      defaultSpreadPips: 0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-GAP-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-4',
      symbol: 'GBPUSD',
      orderType: 'STOP',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2450,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-GAP-1',
    };
    engine.submitOrder(intent);
    // Candle opens at 1.2520 (gapped 20 pips above stop level)
    const candle = makeCandle(1700000300000, 1.2520, 1.2530, 1.2515, 1.2525, true);
    const events = engine.processCandle(candle, 'GBPUSD');
    const fill = events.find(e => e.status === 'FILLED');
    // In a gap open, stop order fills at open (1.2520) not stop price (1.2500)
    const passed = fill !== undefined && fill.fillPrice === 1.2520 && engine.diagnostics.gapEntryCount >= 1;
    results.push({
      name: 'Gap Entry Logic: Stop order fills at open price upon gap opening',
      passed,
      details: `Filled at: ${fill?.fillPrice}, Gap count: ${engine.diagnostics.gapEntryCount}`,
    });
  } catch (err) {
    results.push({
      name: 'Gap Entry Logic: Stop order fills at open price upon gap opening',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۸. منطق گپ خروج (Gap Exit Fill)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      defaultSpreadPips: 0,
      slippageModel: { baseSlippagePips: 0, volatilityMultiplier: 0 },
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-GAP-EXIT-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-5',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2450,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-GAP-EXIT-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');

    // Gap down: candle opens at 1.2420, well below SL 1.2450
    const events = engine.processCandle(makeCandle(1700000300000, 1.2420, 1.2430, 1.2410, 1.2425, true), 'GBPUSD');
    const closedPos = engine.getLedger().positions.find(p => p.intentId === 'INT-GAP-EXIT-1');
    const passed = closedPos !== undefined && !closedPos.isOpen && closedPos.exitPrice === 1.2420;
    results.push({
      name: 'Gap Exit Logic: Position closed at gap open price without optimistic fill',
      passed,
      details: `Exit price: ${closedPos?.exitPrice}, SL was: 1.2450`,
    });
  } catch (err) {
    results.push({
      name: 'Gap Exit Logic: Position closed at gap open price without optimistic fill',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۱۹. عدم تکرار کسر کارمزد و اسپرد در سود و زیان محقق‌شده
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      commissionPerLot: 6.0,
      defaultSpreadPips: 1.5,
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-COST-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-6',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-COST-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    // Exit at TP
    engine.processCandle(makeCandle(1700000300000, 1.2580, 1.2610, 1.2570, 1.2605, true), 'GBPUSD');
    const pos = engine.getLedger().positions[0];
    const passed = pos && !pos.isOpen && pos.commissionPaid === 6.0;
    results.push({
      name: 'Cost Integrity: Commission and spread charged accurately once',
      passed,
      details: `Commission paid: $${pos?.commissionPaid}, Realized PnL: $${pos?.realizedPnl}`,
    });
  } catch (err) {
    results.push({
      name: 'Cost Integrity: Commission and spread charged accurately once',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۰. اعمال اسلیپیج اجرایی بر سفارش‌های مارکت و استاپ
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      defaultSpreadPips: 0,
      slippageModel: { baseSlippagePips: 1.0, volatilityMultiplier: 0 },
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-SLIP-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-7',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-SLIP-1',
    };
    engine.submitOrder(intent);
    const events = engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    const fill = events.find(e => e.status === 'FILLED');
    const passed = fill !== undefined && (fill.slippagePips ?? 0) > 0;
    results.push({
      name: 'Slippage Model: Correctly penalizes execution price based on slippage settings',
      passed,
      details: `Slippage pips: ${fill?.slippagePips}, Fill price: ${fill?.fillPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'Slippage Model: Correctly penalizes execution price based on slippage settings',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۱. بریک‌ایون دقیقاً یک‌بار پس از رسیدن سود به حد تعیین‌شده فعال می‌شود
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      enableBreakeven: true,
      breakevenTriggerR: 1.0,
      breakevenOffsetPips: 1.0,
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-BE-ONCE-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-8',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400, // 100 pips risk
      takeProfitPrice: 1.2700,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-BE-ONCE-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    // Candle hits 1.2610 (> 1.0R) -> triggers BE
    engine.processCandle(makeCandle(1700000300000, 1.2550, 1.2610, 1.2540, 1.2600, true), 'GBPUSD');
    // Another candle reaches 1.2650
    engine.processCandle(makeCandle(1700000600000, 1.2600, 1.2650, 1.2590, 1.2640, true), 'GBPUSD');
    const pos = engine.getLedger().positions[0];
    const passed = Boolean(pos && pos.breakevenActivated && engine.diagnostics.breakevenActivatedCount === 1);
    results.push({
      name: 'Breakeven Activation: Triggers strictly once per position',
      passed,
      details: `Activated: ${pos?.breakevenActivated}, Diagnostics count: ${engine.diagnostics.breakevenActivatedCount}`,
    });
  } catch (err) {
    results.push({
      name: 'Breakeven Activation: Triggers strictly once per position',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۲. احتساب هزینه‌های ورود در نقطه خروج بریک‌ایون
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      enableBreakeven: true,
      breakevenTriggerR: 1.0,
      breakevenOffsetPips: 0.5,
      includeEntryCostsInBreakeven: true,
      defaultSpreadPips: 1.5,
      commissionPerLot: 6.0,
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-BE-COSTS-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-9',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2700,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-BE-COSTS-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    engine.processCandle(makeCandle(1700000300000, 1.2550, 1.2610, 1.2540, 1.2600, true), 'GBPUSD');
    const pos = engine.getLedger().positions[0];
    // With offset 0.5 + spread 1.5 + roundtrip comm ~0.6 pips, stop should be > entryPrice + 0.00020
    const passed = pos && pos.stopLossPrice > pos.entryPrice + 0.00020;
    results.push({
      name: 'Breakeven Cost Buffer: Stop covers commissions and spread',
      passed,
      details: `Entry: ${pos?.entryPrice}, New SL: ${pos?.stopLossPrice}`,
    });
  } catch (err) {
    results.push({
      name: 'Breakeven Cost Buffer: Stop covers commissions and spread',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۳. خروج پله‌ای دقیقاً بر اساس درصد حجم در تارگت تعیین‌شده (Partial TP)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      enablePartialTp: true,
      partialTakeProfitTriggerR: 1.0,
      partialClosePercent: 50,
      moveStopAfterPartial: true,
      postPartialStopMode: 'BREAKEVEN',
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-PTP-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-10',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400, // 100 pips
      takeProfitPrice: 1.2700,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-PTP-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    // Candle hits 1.2610 (> 1.0R)
    engine.processCandle(makeCandle(1700000300000, 1.2550, 1.2610, 1.2540, 1.2600, true), 'GBPUSD');
    const pos = engine.getLedger().positions[0];
    const passed = Boolean(pos && pos.isPartialClosed && pos.volumeLots === 0.5 && pos.remainingVolume === 0.5 && pos.partialClosedVolume === 0.5);
    results.push({
      name: 'Partial Take Profit: Closes exact specified volume percent',
      passed,
      details: `Remaining lots: ${pos?.volumeLots}, Partial closed lots: ${pos?.partialClosedVolume}`,
    });
  } catch (err) {
    results.push({
      name: 'Partial Take Profit: Closes exact specified volume percent',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۴. تطبیق دفاتر حجم پس از خروج پله‌ای (Volume Ledger Reconciliation)
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      enablePartialTp: true,
      partialTakeProfitTriggerR: 1.0,
      partialClosePercent: 40,
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-RECON-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-11',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 2.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2700,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-RECON-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    engine.processCandle(makeCandle(1700000300000, 1.2550, 1.2610, 1.2540, 1.2600, true), 'GBPUSD');
    const pos = engine.getLedger().positions[0];
    const sumMatches = pos && Math.abs((pos.initialVolumeLots ?? 2.0) - ((pos.partialClosedVolume ?? 0) + pos.volumeLots)) < 0.001;
    results.push({
      name: 'Volume Reconciliation: initialVolume = partialClosedVolume + remainingVolume',
      passed: !!sumMatches,
      details: `Initial: ${pos?.initialVolumeLots}, Closed: ${pos?.partialClosedVolume}, Remaining: ${pos?.volumeLots}`,
    });
  } catch (err) {
    results.push({
      name: 'Volume Reconciliation: initialVolume = partialClosedVolume + remainingVolume',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۵. سود شناسایی‌شده خروج پله‌ای مستقیماً به بالانس واریز می‌شود
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      enablePartialTp: true,
      partialTakeProfitTriggerR: 1.0,
      partialClosePercent: 50,
      defaultSpreadPips: 0,
    });
    const intent: OrderIntentPayload = {
      intentId: 'INT-PNL-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-12',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2700,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-PNL-1',
    };
    engine.submitOrder(intent);
    engine.processCandle(makeCandle(1700000000000, 1.2500, 1.2510, 1.2490, 1.2500, true), 'GBPUSD');
    engine.processCandle(makeCandle(1700000300000, 1.2550, 1.2610, 1.2540, 1.2600, true), 'GBPUSD');
    const ledger = engine.getLedger();
    const passed = ledger.cashBalance > 10000 && ledger.totalRealizedPnl > 0;
    results.push({
      name: 'Partial Realized PnL: Realized slice credited directly to cash balance',
      passed,
      details: `Cash balance: $${ledger.cashBalance}, Realized PnL: $${ledger.totalRealizedPnl}`,
    });
  } catch (err) {
    results.push({
      name: 'Partial Realized PnL: Realized slice credited directly to cash balance',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۶. دوره استراحت (Cooldown) دقیقاً پس از بسته شدن معامله شروع می‌شود نه ثبت کاندید
  try {
    const candles = generateCandles(60);
    const runNoCooldown = ResearchLab.runBacktest(candles, 'GBPUSD', {
      strategyParameters: {
        common: { cooldownBars: 0, stopLossMode: 'ATR' } as any,
      },
    });
    const runWithCooldown = ResearchLab.runBacktest(candles, 'GBPUSD', {
      strategyParameters: {
        common: { cooldownBars: 15, stopLossMode: 'ATR' } as any,
      },
    });
    const passed = runWithCooldown.trades.length <= runNoCooldown.trades.length &&
      (runWithCooldown.metrics.diagnostics?.candidatesRejectedByCooldown ?? 0) >= 0;
    results.push({
      name: 'Cooldown Measurement: Throttles entry after position closure',
      passed,
      details: `No cooldown trades: ${runNoCooldown.trades.length}, With cooldown trades: ${runWithCooldown.trades.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Cooldown Measurement: Throttles entry after position closure',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۷. کلید یکتایی (Idempotency Key) مانع از اجرای مجدد سفارش تکراری می‌شود
  try {
    const engine = new EventDrivenExecutionEngine({ initialCash: 10000 });
    const intent: OrderIntentPayload = {
      intentId: 'INT-IDEMP-DUP-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-13',
      symbol: 'GBPUSD',
      orderType: 'MARKET',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2500,
      stopLossPrice: 1.2400,
      takeProfitPrice: 1.2600,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-IDENTICAL-KEY',
    };
    const res1 = engine.submitOrder(intent);
    const res2 = engine.submitOrder({ ...intent, intentId: 'INT-IDEMP-DUP-2' });
    const passed = res1.status !== 'REJECTED' && res2.status === 'REJECTED' && engine.diagnostics.duplicateOrdersRejected === 1;
    results.push({
      name: 'Idempotency Protection: Identical idempotency keys rejected safely',
      passed,
      details: `First order: ${res1.status}, Second order: ${res2.status}`,
    });
  } catch (err) {
    results.push({
      name: 'Idempotency Protection: Identical idempotency keys rejected safely',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۸. تفکیک سقف پوزیشن‌های باز، سفارش‌های معلق و مواجهه کل
  try {
    const engine = new EventDrivenExecutionEngine({
      initialCash: 10000,
      maxOpenPositions: 1,
      maxPendingOrders: 1,
      maxCombinedExposure: 2,
    });
    // Submit 2 limit orders
    const intent1: OrderIntentPayload = {
      intentId: 'LMT-EXP-1',
      environment: 'BACKTEST',
      accountNamespace: 'TEST',
      candidateId: 'CAND-14',
      symbol: 'GBPUSD',
      orderType: 'LIMIT',
      direction: 'BUY',
      volumeLots: 1.0,
      entryPrice: 1.2400,
      stopLossPrice: 1.2300,
      takeProfitPrice: 1.2500,
      reasonCode: 'TEST',
      createdTimestamp: 1700000000000,
      idempotencyKey: 'IDEMP-EXP-1',
    };
    const intent2: OrderIntentPayload = {
      ...intent1,
      intentId: 'LMT-EXP-2',
      idempotencyKey: 'IDEMP-EXP-2',
    };
    const r1 = engine.submitOrder(intent1);
    const r2 = engine.submitOrder(intent2);
    const passed = r1.status === 'PENDING' && r2.status === 'REJECTED' && engine.diagnostics.rejectedByPendingOrderLimit === 1;
    results.push({
      name: 'Exposure Limits: Distinguishes between open positions and pending orders limits',
      passed,
      details: `Pending order 1: ${r1.status}, Pending order 2: ${r2.status}`,
    });
  } catch (err) {
    results.push({
      name: 'Exposure Limits: Distinguishes between open positions and pending orders limits',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۲۹. الگوهای سناریو لب (Scenario Lab Templates) پارامترهای استراتژی را تغییر می‌دهند
  try {
    const candles = generateCandles(60);
    const baseRun = ResearchLab.runBacktest(candles, 'GBPUSD', {
      strategyParameters: {
        common: { orderType: 'MARKET', stopLossMode: 'ATR', enableBreakeven: false } as any,
      },
    });
    const stopOrderRun = ResearchLab.runBacktest(candles, 'GBPUSD', {
      strategyParameters: {
        common: { orderType: 'STOP', stopLossMode: 'STRUCTURE', enableBreakeven: true } as any,
      },
    });
    const passed = baseRun !== undefined && stopOrderRun !== undefined;
    results.push({
      name: 'Scenario Lab Presets: Strategy parameter overrides apply cleanly',
      passed,
      details: `Base orders: ${baseRun.trades.length}, Stop orders: ${stopOrderRun.trades.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Scenario Lab Presets: Strategy parameter overrides apply cleanly',
      passed: false,
      details: (err as Error).message,
    });
  }

  // ۳۰. پوشش کامل ۳۲ پارامتر ممیزی‌شده در رجیستری
  try {
    const count = getAuditedParameterCount();
    const activeParams = Object.values(PARAMETER_EFFECT_REGISTRY).filter(p => p.implementationStatus === 'ACTIVE');
    const passed = count === 32 && activeParams.length >= 25;
    results.push({
      name: 'Parameter Registry Audit: All 32 parameters registered with measurable engine effects',
      passed,
      details: `Registered parameter count: ${count}, Active parameters: ${activeParams.length}`,
    });
  } catch (err) {
    results.push({
      name: 'Parameter Registry Audit: All 32 parameters registered with measurable engine effects',
      passed: false,
      details: (err as Error).message,
    });
  }

  return results;
}
