// lib/core/economic-calendar.ts
// موتور تقویم اقتصادی و محافظت در برابر رویدادهای پرریسک (Red-Folder News Blackout Engine)
// پیاده‌سازی ۱۰۰٪ قطعی، بدون سوگیری آینده‌نگر (No Lookahead Bias)

import { SymbolId } from '../contracts/market';

export type NewsImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EconomicEvent {
  id: string;
  titleFa: string;
  titleEn: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'ALL';
  impact: NewsImpact;
  timestamp: number; // زمان دقیق به میلی‌ثانیه UTC
  forecast?: string;
  previous?: string;
}

export interface NewsBlackoutCheckResult {
  inBlackout: boolean;
  activeEvent?: EconomicEvent;
  minutesToEvent?: number;
  reasonFa?: string;
}

export class EconomicCalendarEngine {
  private static customEvents: EconomicEvent[] = [];

  /**
   * ثبت رویدادهای تاریخی یا اختصاصی تقویم
   */
  public static registerEvents(events: EconomicEvent[]): void {
    this.customEvents = [...this.customEvents, ...events];
  }

  /**
   * پاکسازی رویدادهای ثبت‌شده
   */
  public static clearEvents(): void {
    this.customEvents = [];
  }

  /**
   * بررسی انطباق نماد معاملاتی با ارز رویداد
   */
  public static isSymbolAffectedByCurrency(symbol: SymbolId, currency: string): boolean {
    if (currency === 'ALL') return true;
    if (symbol === 'XAUUSD') {
      // طلا به شدت به داده‌های دلار حساس است
      return currency === 'USD';
    }
    return symbol.includes(currency);
  }

  /**
   * تولید الگوریتمی رویدادهای پرتکرار ماکرو برای یک بازه زمانی (در صورت عدم دسترسی به دیتابیس آنلاین)
   * شامل: NFP (اولین جمعه ماه ساعت ۱۲:۳۰/۱۳:۳۰ UTC)، CPI و FOMC
   */
  public static getMacroEventsForMonth(year: number, monthIndex: number): EconomicEvent[] {
    const events: EconomicEvent[] = [];

    // ۱. اشتغال غیرکشاورزی آمریکا (NFP) - اولین جمعه هر ماه میلادی ساعت ۱۳:۳۰ UTC
    let firstFridayDate = 1;
    for (let day = 1; day <= 7; day++) {
      const d = new Date(Date.UTC(year, monthIndex, day));
      if (d.getUTCDay() === 5) {
        firstFridayDate = day;
        break;
      }
    }
    const nfpTime = Date.UTC(year, monthIndex, firstFridayDate, 13, 30, 0, 0);
    events.push({
      id: `NFP-${year}-${monthIndex + 1}`,
      titleFa: 'گزارش اشتغال بخش غیرکشاورزی آمریکا (NFP) و نرخ بیکاری',
      titleEn: 'US Non-Farm Payrolls & Unemployment Rate',
      currency: 'USD',
      impact: 'HIGH',
      timestamp: nfpTime,
    });

    // ۲. شاخص قیمت مصرف‌کننده آمریکا (CPI) - حوالی روز ۱۲ام ماه ساعت ۱۳:۳۰ UTC (اگر آخر هفته نباشد)
    let cpiDate = 12;
    const cpiDay = new Date(Date.UTC(year, monthIndex, cpiDate)).getUTCDay();
    if (cpiDay === 0) cpiDate = 13; // یکشنبه -> دوشنبه
    if (cpiDay === 6) cpiDate = 11; // شنبه -> جمعه
    const cpiTime = Date.UTC(year, monthIndex, cpiDate, 13, 30, 0, 0);
    events.push({
      id: `CPI-${year}-${monthIndex + 1}`,
      titleFa: 'شاخص تورم مصرف‌کننده آمریکا (US CPI)',
      titleEn: 'US Consumer Price Index (CPI)',
      currency: 'USD',
      impact: 'HIGH',
      timestamp: cpiTime,
    });

    // ۳. نشست تصمیم‌گیری نرخ بهره بانک مرکزی آمریکا (FOMC) - چهارشنبه سوم هر دو ماه یک‌بار ساعت ۱۸:۰۰ UTC
    const fomcMonths = [0, 2, 4, 5, 6, 8, 10, 11];
    if (fomcMonths.includes(monthIndex)) {
      let wednesdayCount = 0;
      let fomcDate = 15;
      for (let day = 1; day <= 28; day++) {
        const d = new Date(Date.UTC(year, monthIndex, day));
        if (d.getUTCDay() === 3) {
          wednesdayCount++;
          if (wednesdayCount === 3) {
            fomcDate = day;
            break;
          }
        }
      }
      const fomcTime = Date.UTC(year, monthIndex, fomcDate, 18, 0, 0, 0);
      events.push({
        id: `FOMC-${year}-${monthIndex + 1}`,
        titleFa: 'بیانیه نرخ بهره و کنفرانس مطبوعاتی فدرال رزرو (FOMC)',
        titleEn: 'FOMC Interest Rate Decision & Press Conference',
        currency: 'USD',
        impact: 'HIGH',
        timestamp: fomcTime,
      });
    }

    // ۴. نشست نرخ بهره بانک مرکزی اروپا (ECB) - پنج‌شنبه‌های مشخص ساعت ۱۲:۱۵ UTC
    if ([0, 2, 3, 5, 6, 8, 9, 11].includes(monthIndex)) {
      const ecbTime = Date.UTC(year, monthIndex, 15, 12, 15, 0, 0);
      events.push({
        id: `ECB-${year}-${monthIndex + 1}`,
        titleFa: 'تصمیم‌گیری نرخ بهره بانک مرکزی اروپا (ECB)',
        titleEn: 'ECB Monetary Policy Statement',
        currency: 'EUR',
        impact: 'HIGH',
        timestamp: ecbTime,
      });
    }

    // ۵. نشست نرخ بهره بانک مرکزی انگلستان (BoE) - پنج‌شنبه ساعت ۱۱:۰۰ UTC
    if ([1, 2, 4, 5, 7, 8, 10, 11].includes(monthIndex)) {
      const boeTime = Date.UTC(year, monthIndex, 10, 11, 0, 0, 0);
      events.push({
        id: `BOE-${year}-${monthIndex + 1}`,
        titleFa: 'تصمیم‌گیری نرخ بهره بانک مرکزی انگلستان (BoE)',
        titleEn: 'BoE Official Bank Rate Decision',
        currency: 'GBP',
        impact: 'HIGH',
        timestamp: boeTime,
      });
    }

    return events;
  }

  /**
   * دریافت تمام رویدادهای مربوطه در یک بازه زمانی
   */
  public static getEventsForTimeRange(
    startTimestamp: number,
    endTimestamp: number,
    symbol?: SymbolId
  ): EconomicEvent[] {
    const startDate = new Date(startTimestamp);
    const endDate = new Date(endTimestamp);

    const generatedEvents: EconomicEvent[] = [];
    let curYear = startDate.getUTCFullYear();
    let curMonth = startDate.getUTCMonth();
    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth();

    while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
      generatedEvents.push(...this.getMacroEventsForMonth(curYear, curMonth));
      curMonth++;
      if (curMonth > 11) {
        curMonth = 0;
        curYear++;
      }
    }

    const allEvents = [...this.customEvents, ...generatedEvents];

    return allEvents.filter(evt => {
      const inTime = evt.timestamp >= startTimestamp - 3600000 && evt.timestamp <= endTimestamp + 3600000;
      if (!inTime) return false;
      if (symbol && !this.isSymbolAffectedByCurrency(symbol, evt.currency)) return false;
      return true;
    });
  }

  /**
   * بررسی قرار داشتن زمان جاری در پنجره بلک‌اوت خبر پرریسک (Red-Folder Blackout Window)
   */
  public static isNewsBlackout(
    timestamp: number,
    symbol: SymbolId,
    windowBeforeMinutes: number = 15,
    windowAfterMinutes: number = 15
  ): NewsBlackoutCheckResult {
    const windowBeforeMs = windowBeforeMinutes * 60 * 1000;
    const windowAfterMs = windowAfterMinutes * 60 * 1000;

    const events = this.getEventsForTimeRange(
      timestamp - windowAfterMs,
      timestamp + windowBeforeMs,
      symbol
    );

    for (const evt of events) {
      if (evt.impact !== 'HIGH') continue;

      const diffMs = evt.timestamp - timestamp;
      const isInWindow = timestamp >= evt.timestamp - windowBeforeMs && timestamp <= evt.timestamp + windowAfterMs;

      if (isInWindow) {
        const minutesToEvent = Math.round(diffMs / 60000);
        const timingText =
          minutesToEvent > 0
            ? `${minutesToEvent} دقیقه تا انتشار`
            : minutesToEvent < 0
            ? `${Math.abs(minutesToEvent)} دقیقه پس از انتشار`
            : 'هم‌اکنون در لحظه انتشار';

        return {
          inBlackout: true,
          activeEvent: evt,
          minutesToEvent,
          reasonFa: `بلک‌اوت خبری فعال است (${evt.titleFa} - ${timingText}). ورود به معامله جهت جلوگیری از اسلیپیج مسدود است.`,
        };
      }
    }

    return {
      inBlackout: false,
    };
  }

  /**
   * ضریب جهش اسپرد در دقایق خبر برای تست پایداری استاپ‌ها
   */
  public static getNewsSpreadMultiplier(
    timestamp: number,
    symbol: SymbolId
  ): number {
    const events = this.getEventsForTimeRange(
      timestamp - 15 * 60 * 1000,
      timestamp + 15 * 60 * 1000,
      symbol
    );

    for (const evt of events) {
      if (evt.impact !== 'HIGH') continue;

      const diffMinutes = Math.abs(evt.timestamp - timestamp) / 60000;
      if (diffMinutes <= 3) {
        return 4.5;
      }
      if (diffMinutes <= 8) {
        return 2.5;
      }
      if (diffMinutes <= 15) {
        return 1.6;
      }
    }

    return 1.0;
  }
}
