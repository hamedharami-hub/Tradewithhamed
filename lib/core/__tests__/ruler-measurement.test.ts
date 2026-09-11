// lib/core/__tests__/ruler-measurement.test.ts
// آزمون‌های اعتبارسنجی محاسبات ابزار خط‌کش اندازه‌گیری پیپ، درصد، تعداد کندل‌ها و زمان

import { DriftMonitor } from '../drift-monitor';

export interface RulerMeasurementTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface RulerMeasurementData {
  startPrice: number;
  endPrice: number;
  priceDelta: number;
  pipsDelta: number;
  percentChange: number;
  barCount: number;
  durationMinutes: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
}

export function calculateRulerMetrics(
  symbol: 'XAUUSD' | 'EURUSD',
  startPrice: number,
  endPrice: number,
  startCandleIdx: number,
  endCandleIdx: number,
  timeframeMinutes: number = 5
): RulerMeasurementData {
  const pipSize = DriftMonitor.getPipSize(symbol);
  const priceDelta = Number((endPrice - startPrice).toFixed(symbol === 'XAUUSD' ? 2 : 5));
  const pipsDelta = Number((priceDelta / pipSize).toFixed(1));
  const percentChange = Number((((endPrice - startPrice) / startPrice) * 100).toFixed(2));
  const barCount = Math.abs(endCandleIdx - startCandleIdx) + 1;
  const durationMinutes = barCount * timeframeMinutes;
  const direction = priceDelta > 0 ? 'UP' : priceDelta < 0 ? 'DOWN' : 'FLAT';

  return {
    startPrice,
    endPrice,
    priceDelta,
    pipsDelta,
    percentChange,
    barCount,
    durationMinutes,
    direction,
  };
}

export async function runRulerMeasurementSuite(): Promise<RulerMeasurementTestResult[]> {
  const results: RulerMeasurementTestResult[] = [];

  // ۱. تست اندازه‌گیری صعودی طلا (XAUUSD)
  const goldUp = calculateRulerMetrics('XAUUSD', 2650.0, 2664.5, 10, 21, 5);
  const test1Passed =
    goldUp.priceDelta === 14.5 &&
    goldUp.pipsDelta === 145.0 &&
    goldUp.percentChange === 0.55 &&
    goldUp.barCount === 12 &&
    goldUp.durationMinutes === 60 &&
    goldUp.direction === 'UP';

  results.push({
    id: 'RULER-01-GOLD-BULLISH',
    name: 'محاسبه دقیق پیپ، درصد و مدت زمان حرکت صعودی در طلا (XAUUSD)',
    passed: test1Passed,
    details: `ΔPrice: +$${goldUp.priceDelta}, Pips: +${goldUp.pipsDelta}p, %: +${goldUp.percentChange}%, Bars: ${goldUp.barCount}, Time: ${goldUp.durationMinutes}m`,
  });

  // ۲. تست اندازه‌گیری نزولی طلا (XAUUSD)
  const goldDown = calculateRulerMetrics('XAUUSD', 2660.0, 2648.0, 5, 14, 5);
  const test2Passed =
    goldDown.priceDelta === -12.0 &&
    goldDown.pipsDelta === -120.0 &&
    goldDown.percentChange === -0.45 &&
    goldDown.direction === 'DOWN';

  results.push({
    id: 'RULER-02-GOLD-BEARISH',
    name: 'محاسبه دقیق مقادیر منفی پیپ و افت قیمت در نزول طلا',
    passed: test2Passed,
    details: `ΔPrice: -$${Math.abs(goldDown.priceDelta)}, Pips: ${goldDown.pipsDelta}p, %: ${goldDown.percentChange}%`,
  });

  // ۳. تست اندازه‌گیری در یورو/دلار (EURUSD) با اعشار ۰.۰۰۰۱
  const eurusdMove = calculateRulerMetrics('EURUSD', 1.085, 1.0885, 0, 9, 5);
  const test3Passed =
    eurusdMove.priceDelta === 0.0035 &&
    eurusdMove.pipsDelta === 35.0 &&
    eurusdMove.barCount === 10 &&
    eurusdMove.durationMinutes === 50;

  results.push({
    id: 'RULER-03-EURUSD-PIPS',
    name: 'محاسبه دقیق پیپ در جفت‌ارز یورو با مقیاس پیپ استاندارد فارکس',
    passed: test3Passed,
    details: `ΔPrice: ${eurusdMove.priceDelta}, Pips: ${eurusdMove.pipsDelta}p, Duration: ${eurusdMove.durationMinutes}m`,
  });

  // ۴. تست شمارش کندل‌ها و مدت زمان در بازه معکوس
  const reverseRange = calculateRulerMetrics('XAUUSD', 2650.0, 2655.0, 20, 10, 5);
  const test4Passed = reverseRange.barCount === 11 && reverseRange.durationMinutes === 55;

  results.push({
    id: 'RULER-04-REVERSE-RANGE',
    name: 'پایداری شمارش کندل‌ها هنگام درگ از راست به چپ یا چپ به راست',
    passed: test4Passed,
    details: `Bars: ${reverseRange.barCount}, Duration: ${reverseRange.durationMinutes}m`,
  });

  return results;
}
