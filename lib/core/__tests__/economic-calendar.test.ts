// lib/core/__tests__/economic-calendar.test.ts
// آزمون‌های واحد موتور تقویم اقتصادی، پنجره‌های بلک‌اوت و جهش اسپرد اخباری

import { EconomicCalendarEngine, EconomicEvent } from '../economic-calendar';

export async function runEconomicCalendarTests() {
  const checks: { name: string; passed: boolean; details?: string }[] = [];

  // ۱. بررسی تولید رویدادهای کلیدی ماکرو برای ماه سپتامبر ۲۰۲۶
  const eventsSep2026 = EconomicCalendarEngine.getMacroEventsForMonth(2026, 8); // 8 = September
  const hasNfp = eventsSep2026.some(e => e.id.startsWith('NFP') && e.currency === 'USD');
  const hasCpi = eventsSep2026.some(e => e.id.startsWith('CPI') && e.currency === 'USD');
  const hasFomc = eventsSep2026.some(e => e.id.startsWith('FOMC') && e.currency === 'USD');
  const hasEcb = eventsSep2026.some(e => e.id.startsWith('ECB') && e.currency === 'EUR');

  checks.push({
    name: 'تولید دقیق رویدادهای ماکرو (NFP, CPI, FOMC, ECB)',
    passed: hasNfp && hasCpi && hasFomc && hasEcb,
    details: `تعداد رویدادهای تولیدشده: ${eventsSep2026.length}`,
  });

  // ۲. بررسی حساسیت نماد طلا (XAUUSD) به دلار آمریکا
  const goldAffectedByUsd = EconomicCalendarEngine.isSymbolAffectedByCurrency('XAUUSD', 'USD');
  const goldAffectedByEur = EconomicCalendarEngine.isSymbolAffectedByCurrency('XAUUSD', 'EUR');
  const eurUsdAffectedByEur = EconomicCalendarEngine.isSymbolAffectedByCurrency('EURUSD', 'EUR');
  const eurUsdAffectedByJpy = EconomicCalendarEngine.isSymbolAffectedByCurrency('EURUSD', 'JPY');

  checks.push({
    name: 'تفکیک ارزهای متاثر بر هر جفت‌ارز و طلا',
    passed: goldAffectedByUsd && !goldAffectedByEur && eurUsdAffectedByEur && !eurUsdAffectedByJpy,
    details: 'طلا منحصراً به USD و اخبار بین‌المللی حساس است.',
  });

  // ۳. آزمون بلک‌اوت خبری (۱۵ دقیقه قبل و بعد) با یک رویداد معین
  const testTimestamp = Date.UTC(2026, 8, 15, 12, 30, 0); // ساعت ۱۲:۳۰
  const customEvent: EconomicEvent = {
    id: 'TEST-NFP',
    titleFa: 'آزمون داده تورمی آمریکا',
    titleEn: 'Test US Event',
    currency: 'USD',
    impact: 'HIGH',
    timestamp: testTimestamp,
  };

  EconomicCalendarEngine.registerEvents([customEvent]);

  // نقطه ۵ دقیقه قبل از خبر (باید در بلک‌اوت باشد)
  const fiveMinBefore = testTimestamp - 5 * 60 * 1000;
  const blackoutBefore = EconomicCalendarEngine.isNewsBlackout(fiveMinBefore, 'XAUUSD', 15, 15);

  // نقطه ۲۰ دقیقه قبل از خبر (نباید در بلک‌اوت باشد)
  const twentyMinBefore = testTimestamp - 20 * 60 * 1000;
  const blackoutOutside = EconomicCalendarEngine.isNewsBlackout(twentyMinBefore, 'XAUUSD', 15, 15);

  // نقطه ۲ دقیقه بعد از خبر (باید در بلک‌اوت باشد)
  const twoMinAfter = testTimestamp + 2 * 60 * 1000;
  const blackoutAfter = EconomicCalendarEngine.isNewsBlackout(twoMinAfter, 'XAUUSD', 15, 15);

  checks.push({
    name: 'تشخیص پنجره بلک‌اوت خبری ۱۵ دقیقه قبل و بعد از رویداد قرمز',
    passed: blackoutBefore.inBlackout && !blackoutOutside.inBlackout && blackoutAfter.inBlackout,
    details: `۵ دقیقه قبل: ${blackoutBefore.inBlackout}, ۲۰ دقیقه قبل: ${blackoutOutside.inBlackout}, ۲ دقیقه بعد: ${blackoutAfter.inBlackout}`,
  });

  // ۴. بررسی ضریب اتساع اسپرد در دقایق خبر
  const spreadMultiplierAtPeak = EconomicCalendarEngine.getNewsSpreadMultiplier(testTimestamp, 'XAUUSD');
  const spreadMultiplierCalm = EconomicCalendarEngine.getNewsSpreadMultiplier(twentyMinBefore, 'XAUUSD');

  checks.push({
    name: 'شبیه‌سازی جهش اسپرد در لحظه انتشار خبر (تا ۴.۵ برابر)',
    passed: spreadMultiplierAtPeak >= 4.0 && spreadMultiplierCalm === 1.0,
    details: `اسپرد لحظه خبر: ${spreadMultiplierAtPeak}x, اسپرد حالت عادی: ${spreadMultiplierCalm}x`,
  });

  // ۵. پاکسازی رویدادهای اختصاصی
  EconomicCalendarEngine.clearEvents();
  const blackoutAfterClear = EconomicCalendarEngine.isNewsBlackout(fiveMinBefore, 'XAUUSD', 15, 15);

  checks.push({
    name: 'پاکسازی و ایزولاسیون حافظه رویدادهای تقویم',
    passed: !blackoutAfterClear.inBlackout,
    details: 'رویداد آزمایشی با موفقیت حذف شد.',
  });

  return checks;
}
