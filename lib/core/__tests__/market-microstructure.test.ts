// lib/core/__tests__/market-microstructure.test.ts
// آزمون‌های تضمین کیفیت لایه ریزساختار بازار: اسپرد پویا، فیلتر رول‌اور و حل ابهام درون‌کندلی

import {
  getSessionForTimestamp,
  isRolloverBlackout,
  getDynamicSpreadPips,
  resolveIntraBarExit,
} from '../market-microstructure';
import { Candle } from '../../contracts/market';
import { createThreeTierCostStressScenarios } from '../../research/acceptance-gate';

export function runMarketMicrostructureTests(): {
  name: string;
  passed: boolean;
  details: string;
}[] {
  const results: { name: string; passed: boolean; details: string }[] = [];

  // ۱. اعتبارسنجی سشن‌های زمانی معاملاتی
  try {
    // 04:00 UTC -> آسیا
    const asiaTs = Date.UTC(2026, 8, 10, 4, 0, 0);
    // 09:00 UTC -> لندن
    const londonTs = Date.UTC(2026, 8, 10, 9, 0, 0);
    // 14:30 UTC -> هم‌پوشانی لندن و نیویورک
    const overlapTs = Date.UTC(2026, 8, 10, 14, 30, 0);
    // 18:00 UTC -> نیویورک عصر
    const nyTs = Date.UTC(2026, 8, 10, 18, 0, 0);
    // 21:30 UTC -> خارج از ساعات اصلی / رول‌اور
    const offTs = Date.UTC(2026, 8, 10, 21, 30, 0);

    const passSessions =
      getSessionForTimestamp(asiaTs) === 'ASIA' &&
      getSessionForTimestamp(londonTs) === 'LONDON' &&
      getSessionForTimestamp(overlapTs) === 'LONDON_NY_OVERLAP' &&
      getSessionForTimestamp(nyTs) === 'NEW_YORK' &&
      getSessionForTimestamp(offTs) === 'OFF_HOURS';

    results.push({
      name: 'Market Session Classification',
      passed: passSessions,
      details: passSessions
        ? 'تمامی ۵ سشن زمانی بر پایه ساعت UTC به درستی طبقه‌بندی شدند.'
        : 'خطا در طبقه‌بندی سشن‌های زمانی.',
    });
  } catch (e) {
    results.push({ name: 'Market Session Classification', passed: false, details: (e as Error).message });
  }

  // ۲. اعتبارسنجی فیلتر رول‌اور و تعطیلی آخر هفته
  try {
    // چهارشنبه 21:15 UTC -> در بازه رول‌اور
    const wednesdayRollover = Date.UTC(2026, 8, 9, 21, 15, 0);
    // چهارشنبه 10:00 UTC -> ساعات عادی
    const wednesdayNormal = Date.UTC(2026, 8, 9, 10, 0, 0);
    // شنبه 12:00 UTC -> تعطیلی آخر هفته
    const saturdayWeekend = Date.UTC(2026, 8, 12, 12, 0, 0);

    const passRollover =
      isRolloverBlackout(wednesdayRollover) === true &&
      isRolloverBlackout(wednesdayNormal) === false &&
      isRolloverBlackout(saturdayWeekend) === true;

    results.push({
      name: 'Rollover Blackout Detection',
      passed: passRollover,
      details: passRollover
        ? 'بازه رول‌اور شبانه (21:00-22:30 UTC) و آخر هفته به درستی مسدود شدند.'
        : 'خطا در تشخیص بازه رول‌اور.',
    });
  } catch (e) {
    results.push({ name: 'Rollover Blackout Detection', passed: false, details: (e as Error).message });
  }

  // ۳. اعتبارسنجی اسپرد پویای سشن‌ها
  try {
    const overlapTs = Date.UTC(2026, 8, 10, 14, 0, 0);
    const rolloverTs = Date.UTC(2026, 8, 10, 21, 15, 0);
    const asiaTs = Date.UTC(2026, 8, 10, 3, 0, 0);

    const baseSpread = 1.0;
    const overlapSpread = getDynamicSpreadPips('EURUSD', overlapTs, baseSpread);
    const rolloverSpread = getDynamicSpreadPips('EURUSD', rolloverTs, baseSpread);
    const asiaSpread = getDynamicSpreadPips('EURUSD', asiaTs, baseSpread);

    const passSpread = overlapSpread < baseSpread && rolloverSpread >= baseSpread * 3 && asiaSpread > overlapSpread;

    results.push({
      name: 'Dynamic Session Spread Modeling',
      passed: passSpread,
      details: passSpread
        ? `اسپرد هم‌پوشانی: ${overlapSpread} پیپ، آسیا: ${asiaSpread} پیپ، رول‌اور: ${rolloverSpread} پیپ.`
        : 'خطا در محاسبه اسپرد پویا.',
    });
  } catch (e) {
    results.push({ name: 'Dynamic Session Spread Modeling', passed: false, details: (e as Error).message });
  }

  // ۴. اعتبارسنجی حل ابهام درون‌کندلی با مدل قطبیت بدنه (Bar Polarity)
  try {
    // کندل صعودی (Open: 100, High: 115, Low: 90, Close: 110)
    // برای پوزیشن BUY: SL در 92، TP در 112
    const bullishCandle: Candle = {
      timestamp: Date.now(),
      open: 100,
      high: 115,
      low: 90,
      close: 110,
      volume: 1000,
      isClosed: true,
    };

    // در کندل صعودی، قیمت ابتدا به Low می‌رود -> برای BUY اول SL می‌خورد
    const buyBullishRes = resolveIntraBarExit(bullishCandle, 'BUY', 92, 112, 'BAR_POLARITY');
    // برای پوزیشن SELL: SL در 112، TP در 92
    // در کندل صعودی، قیمت ابتدا به Low می‌رود -> برای SELL اول TP می‌خورد
    const sellBullishRes = resolveIntraBarExit(bullishCandle, 'SELL', 112, 92, 'BAR_POLARITY');

    // کندل نزولی (Open: 110, High: 115, Low: 90, Close: 95)
    const bearishCandle: Candle = {
      timestamp: Date.now(),
      open: 110,
      high: 115,
      low: 90,
      close: 95,
      volume: 1000,
      isClosed: true,
    };
    // در کندل نزولی، قیمت ابتدا به High می‌رود -> برای BUY اول TP می‌خورد
    const buyBearishRes = resolveIntraBarExit(bearishCandle, 'BUY', 92, 112, 'BAR_POLARITY');

    const passAmbiguity =
      buyBullishRes.isAmbiguous &&
      buyBullishRes.firstExit === 'SL' &&
      sellBullishRes.isAmbiguous &&
      sellBullishRes.firstExit === 'TP' &&
      buyBearishRes.isAmbiguous &&
      buyBearishRes.firstExit === 'TP';

    results.push({
      name: 'Intra-Bar Ambiguity Resolution (Bar Polarity)',
      passed: passAmbiguity,
      details: passAmbiguity
        ? 'توالی حرکت درون‌کندلی بر اساس قطبیت بدنه به درستی ابهام را برطرف کرد.'
        : 'خطا در حل ابهام درون‌کندلی.',
    });
  } catch (e) {
    results.push({ name: 'Intra-Bar Ambiguity Resolution (Bar Polarity)', passed: false, details: (e as Error).message });
  }

  // ۵. اعتبارسنجی ماتریس استرس هزینه ۳ لایه‌ای
  try {
    const stressScenarios = createThreeTierCostStressScenarios(1000, 50, 10);
    const passStress =
      stressScenarios.length === 3 &&
      stressScenarios[0] === 1000 &&
      stressScenarios[1] < stressScenarios[0] &&
      stressScenarios[2] < stressScenarios[1];

    results.push({
      name: 'Three-Tier Cost Stress Matrix',
      passed: passStress,
      details: passStress
        ? `سطوح تنش محاسبه شدند: پایه (${stressScenarios[0]}$)، سخت‌گیرانه (${stressScenarios[1]}$)، بحرانی (${stressScenarios[2]}$).`
        : 'خطا در تولید سطوح استرس هزینه.',
    });
  } catch (e) {
    results.push({ name: 'Three-Tier Cost Stress Matrix', passed: false, details: (e as Error).message });
  }

  return results;
}
