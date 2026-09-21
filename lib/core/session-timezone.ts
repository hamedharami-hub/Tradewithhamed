// lib/core/session-timezone.ts
// موتور مدیریت مناطق زمانی استاندارد IANA، تغییرات ساعت تابستانه/زمستانه (DST)،
// فیلتر سشن‌های معاملاتی، روزهای هفته و پنجره‌های بلک‌اوت

import {
  SessionFilter,
  SessionTimezoneConfig,
  TimezoneOption,
} from '../contracts/strategy-parameters';

export interface LocalTimeComponents {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  dayOfWeek: number; // 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat, 7 = Sun
  timeInMinutes: number; // hour * 60 + minute
  dateKey: string; // "YYYY-MM-DD"
}

export class SessionTimezoneEngine {
  private static formatterCache: Map<string, Intl.DateTimeFormat> = new Map();

  private static getFormatter(timezone: string): Intl.DateTimeFormat {
    let fmt = this.formatterCache.get(timezone);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      });
      this.formatterCache.set(timezone, fmt);
    }
    return fmt;
  }

  /**
   * تجزیه دقیق زمان محلی بر حسب منطقه زمانی استاندارد IANA یا افست ثابت بروکر
   */
  public static getLocalTime(
    timestamp: number,
    timezone: TimezoneOption = 'UTC',
    brokerOffsetMinutes = 0
  ): LocalTimeComponents {
    if (timezone === 'BROKER_FIXED') {
      const shifted = new Date(timestamp + brokerOffsetMinutes * 60_000);
      const year = shifted.getUTCFullYear();
      const month = shifted.getUTCMonth() + 1;
      const day = shifted.getUTCDate();
      const hour = shifted.getUTCHours();
      const minute = shifted.getUTCMinutes();
      const second = shifted.getUTCSeconds();
      const rawDay = shifted.getUTCDay(); // 0 = Sun
      const dayOfWeek = rawDay === 0 ? 7 : rawDay;
      const monthStr = month < 10 ? `0${month}` : `${month}`;
      const dayStr = day < 10 ? `0${day}` : `${day}`;
      return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        dayOfWeek,
        timeInMinutes: hour * 60 + minute,
        dateKey: `${year}-${monthStr}-${dayStr}`,
      };
    }

    const fmt = this.getFormatter(timezone);
    const date = new Date(timestamp);
    const parts = fmt.formatToParts(date);

    let year = 1970;
    let month = 1;
    let day = 1;
    let hour = 0;
    let minute = 0;
    let second = 0;
    let dayOfWeek = 1;

    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      else if (p.type === 'month') month = parseInt(p.value, 10);
      else if (p.type === 'day') day = parseInt(p.value, 10);
      else if (p.type === 'hour') {
        const val = parseInt(p.value, 10);
        hour = val === 24 ? 0 : val;
      } else if (p.type === 'minute') minute = parseInt(p.value, 10);
      else if (p.type === 'second') second = parseInt(p.value, 10);
      else if (p.type === 'weekday') {
        switch (p.value.toLowerCase()) {
          case 'mon': dayOfWeek = 1; break;
          case 'tue': dayOfWeek = 2; break;
          case 'wed': dayOfWeek = 3; break;
          case 'thu': dayOfWeek = 4; break;
          case 'fri': dayOfWeek = 5; break;
          case 'sat': dayOfWeek = 6; break;
          case 'sun': default: dayOfWeek = 7; break;
        }
      }
    }

    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const dayStr = day < 10 ? `0${day}` : `${day}`;

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      dayOfWeek,
      timeInMinutes: hour * 60 + minute,
      dateKey: `${year}-${monthStr}-${dayStr}`,
    };
  }

  /**
   * دریافت کلید روز به فرمت YYYY-MM-DD
   */
  public static getDayKey(
    timestamp: number,
    timezone: TimezoneOption = 'UTC',
    brokerOffsetMinutes = 0
  ): string {
    return this.getLocalTime(timestamp, timezone, brokerOffsetMinutes).dateKey;
  }

  /**
   * تبدیل رشته "HH:mm" به تعداد دقایق از ابتدای روز (۰ تا ۱۴۳۹)
   */
  public static parseTimeToMinutes(timeStr: string): number {
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    return Math.max(0, Math.min(1439, h * 60 + m));
  }

  /**
   * بررسی حضور یک زمان در بازه سشن (با پشتیبانی از سشن‌های شبانه/Overnight)
   */
  public static isWithinTimeRange(
    currentMinutes: number,
    startMinutes: number,
    endMinutes: number,
    excludeEdgeMinutes = 0
  ): boolean {
    if (startMinutes === endMinutes) return true;

    let inRange = false;
    let sessionDuration = 0;
    let minutesFromStart = 0;
    let minutesToEnd = 0;

    if (startMinutes < endMinutes) {
      // سشن درون‌روزی معمول (مانند 08:00 تا 16:30)
      inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      if (inRange) {
        sessionDuration = endMinutes - startMinutes;
        minutesFromStart = currentMinutes - startMinutes;
        minutesToEnd = endMinutes - currentMinutes;
      }
    } else {
      // سشن شبانه / Overnight (مانند 22:00 تا 06:00 روز بعد)
      inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      if (inRange) {
        sessionDuration = 1440 - startMinutes + endMinutes;
        if (currentMinutes >= startMinutes) {
          minutesFromStart = currentMinutes - startMinutes;
          minutesToEnd = sessionDuration - minutesFromStart;
        } else {
          minutesFromStart = (1440 - startMinutes) + currentMinutes;
          minutesToEnd = endMinutes - currentMinutes;
        }
      }
    }

    if (!inRange) return false;

    // حذف دقایق لبه (اول یا آخر سشن)
    if (excludeEdgeMinutes > 0 && sessionDuration > excludeEdgeMinutes * 2) {
      if (minutesFromStart < excludeEdgeMinutes || minutesToEnd < excludeEdgeMinutes) {
        return false;
      }
    }

    return true;
  }

  /**
   * تشخیص نام سشن معاملاتی که در لحظه جاری فعال است
   */
  public static getCurrentActiveSessionName(timestamp: number): string {
    const londonTime = this.getLocalTime(timestamp, 'Europe/London');
    const nyTime = this.getLocalTime(timestamp, 'America/New_York');
    const utcTime = this.getLocalTime(timestamp, 'UTC');

    const isLondonOpen = londonTime.timeInMinutes >= 8 * 60 && londonTime.timeInMinutes < 16 * 60 + 30;
    const isNyOpen = nyTime.timeInMinutes >= 8 * 60 && nyTime.timeInMinutes < 17 * 60;
    const isTokyoOpen = utcTime.timeInMinutes >= 0 && utcTime.timeInMinutes < 9 * 60;

    if (isLondonOpen && isNyOpen) return 'LONDON_NEW_YORK_OVERLAP';
    if (isLondonOpen) return 'LONDON';
    if (isNyOpen) return 'NEW_YORK';
    if (isTokyoOpen) return 'ASIAN';
    return 'OFF_HOURS';
  }

  /**
   * ارزیابی جامع فیلتر سشن، روزهای هفته، بلک‌اوت و ساعات مجاز
   */
  public static isEntryAllowed(
    timestamp: number,
    config?: SessionTimezoneConfig
  ): {
    allowed: boolean;
    reason?: string;
    activeSession: string;
  } {
    const activeSession = this.getCurrentActiveSessionName(timestamp);

    if (!config || config.session === 'ALL') {
      // اگر همه سشن‌ها فعال باشند، تنها بلک‌اوت رول‌اور و روز هفته بررسی می‌شوند
      const tz = config?.timezone || 'UTC';
      const local = this.getLocalTime(timestamp, tz, config?.brokerOffsetMinutes);

      if (config?.selectedWeekdays && config.selectedWeekdays.length > 0) {
        if (!config.selectedWeekdays.includes(local.dayOfWeek)) {
          return { allowed: false, reason: 'REJECTED_WEEKDAY_FILTER', activeSession };
        }
      }

      if (config?.useRolloverBlackout && this.isRolloverBlackout(timestamp)) {
        return { allowed: false, reason: 'REJECTED_BLACKOUT_WINDOW', activeSession };
      }

      return { allowed: true, activeSession };
    }

    // بررسی روز هفته بر حسب تایم‌زون کاربر
    const localUserTime = this.getLocalTime(
      timestamp,
      config.timezone,
      config.brokerOffsetMinutes
    );

    if (config.selectedWeekdays && config.selectedWeekdays.length > 0) {
      if (!config.selectedWeekdays.includes(localUserTime.dayOfWeek)) {
        return { allowed: false, reason: 'REJECTED_WEEKDAY_FILTER', activeSession };
      }
    }

    // بررسی رول‌اور
    if (config.useRolloverBlackout && this.isRolloverBlackout(timestamp)) {
      return { allowed: false, reason: 'REJECTED_BLACKOUT_WINDOW', activeSession };
    }

    // بررسی بر حسب سشن انتخابی
    switch (config.session) {
      case 'ASIAN': {
        // سشن توکیو: 00:00 تا 09:00 UTC
        const utc = this.getLocalTime(timestamp, 'UTC');
        const allowed = this.isWithinTimeRange(
          utc.timeInMinutes,
          0,
          9 * 60,
          config.excludeEdgeMinutes
        );
        return {
          allowed,
          reason: allowed ? undefined : 'REJECTED_SESSION_FILTER',
          activeSession,
        };
      }

      case 'LONDON': {
        // سشن لندن: 08:00 تا 16:30 به وقت محلی لندن (با مدیریت خودکار DST استاندارد IANA)
        const lon = this.getLocalTime(timestamp, 'Europe/London');
        const allowed = this.isWithinTimeRange(
          lon.timeInMinutes,
          8 * 60,
          16 * 60 + 30,
          config.excludeEdgeMinutes
        );
        return {
          allowed,
          reason: allowed ? undefined : 'REJECTED_SESSION_FILTER',
          activeSession,
        };
      }

      case 'NEW_YORK': {
        // سشن نیویورک: 08:00 تا 17:00 به وقت محلی نیویورک (با مدیریت خودکار DST استاندارد IANA)
        const ny = this.getLocalTime(timestamp, 'America/New_York');
        const allowed = this.isWithinTimeRange(
          ny.timeInMinutes,
          8 * 60,
          17 * 60,
          config.excludeEdgeMinutes
        );
        return {
          allowed,
          reason: allowed ? undefined : 'REJECTED_SESSION_FILTER',
          activeSession,
        };
      }

      case 'LONDON_NEW_YORK_OVERLAP': {
        // هم‌پوشانی طلایی: هر دو سشن لندن و نیویورک باید همزمان باز باشند
        const lon = this.getLocalTime(timestamp, 'Europe/London');
        const ny = this.getLocalTime(timestamp, 'America/New_York');
        const inLondon = this.isWithinTimeRange(lon.timeInMinutes, 8 * 60, 16 * 60 + 30);
        const inNy = this.isWithinTimeRange(ny.timeInMinutes, 8 * 60, 17 * 60);
        const allowed = inLondon && inNy;
        return {
          allowed,
          reason: allowed ? undefined : 'REJECTED_SESSION_FILTER',
          activeSession,
        };
      }

      case 'CUSTOM': {
        const startMin = config.customStartTime
          ? this.parseTimeToMinutes(config.customStartTime)
          : 8 * 60;
        const endMin = config.customEndTime
          ? this.parseTimeToMinutes(config.customEndTime)
          : 17 * 60;
        const local = this.getLocalTime(
          timestamp,
          config.timezone,
          config.brokerOffsetMinutes
        );
        const allowed = this.isWithinTimeRange(
          local.timeInMinutes,
          startMin,
          endMin,
          config.excludeEdgeMinutes
        );
        return {
          allowed,
          reason: allowed ? undefined : 'REJECTED_SESSION_FILTER',
          activeSession,
        };
      }

      default:
        return { allowed: true, activeSession };
    }
  }

  /**
   * بلک‌اوت رول‌اور (۲۱:۵۵ تا ۲۲:۱۵ UTC)
   */
  public static isRolloverBlackout(timestamp: number): boolean {
    const date = new Date(timestamp);
    const day = date.getUTCDay();
    const timeInMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();

    // تعطیلی آخر هفته
    if (day === 5 && timeInMinutes >= 21 * 60 + 55) return true;
    if (day === 6) return true;
    if (day === 0 && timeInMinutes < 21 * 60) return true;

    // رول‌اور روزانه
    return timeInMinutes >= 21 * 60 + 55 && timeInMinutes <= 22 * 60 + 15;
  }

  public static getHourAndMinute(
    timestamp: number,
    timezone: TimezoneOption = 'UTC',
    brokerOffsetMinutes = 0
  ): { hour: number; minute: number } {
    const local = this.getLocalTime(timestamp, timezone, brokerOffsetMinutes);
    return { hour: local.hour, minute: local.minute };
  }

  public static isTimestampAllowed(
    timestamp: number,
    config?: SessionTimezoneConfig
  ): { allowed: boolean; reasonCode?: string; activeSession: string } {
    const res = this.isEntryAllowed(timestamp, config);
    return {
      allowed: res.allowed,
      reasonCode: res.reason,
      activeSession: res.activeSession,
    };
  }
}

