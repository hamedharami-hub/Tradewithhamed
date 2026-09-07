import { NextResponse } from 'next/server';
import {
  RateLimitCategory,
  RateLimitPolicy,
  RateLimitResult,
  RateLimiterMetrics,
} from '../contracts/security';

interface ClientRecord {
  timestamps: number[];
  lastRequestTime: number;
}

const DEFAULT_POLICIES: Record<RateLimitCategory, RateLimitPolicy> = {
  AUTH: {
    category: 'AUTH',
    windowMs: 60 * 1000,
    maxRequests: 5,
  },
  ORDER_SUBMIT: {
    category: 'ORDER_SUBMIT',
    windowMs: 10 * 1000,
    maxRequests: 2,
    minIntervalMs: 1500, // حداقل ۱٫۵ ثانیه فاصله بین دو ارسال متوالی
  },
  ORDER_RECONCILE: {
    category: 'ORDER_RECONCILE',
    windowMs: 60 * 1000,
    maxRequests: 10,
  },
  JOURNAL: {
    category: 'JOURNAL',
    windowMs: 60 * 1000,
    maxRequests: 20,
  },
  DISASTER_RECOVERY: {
    category: 'DISASTER_RECOVERY',
    windowMs: 60 * 1000,
    maxRequests: 5,
  },
};

const globalForLimiter = globalThis as unknown as {
  tradingRateLimiterBuckets?: Map<string, ClientRecord>;
  tradingRateLimiterMetrics?: {
    totalRequests: number;
    totalAllowed: number;
    totalBlocked: number;
    blockedByCategory: Record<RateLimitCategory, number>;
  };
};

const buckets =
  globalForLimiter.tradingRateLimiterBuckets ?? new Map<string, ClientRecord>();
const metrics = globalForLimiter.tradingRateLimiterMetrics ?? {
  totalRequests: 0,
  totalAllowed: 0,
  totalBlocked: 0,
  blockedByCategory: {
    AUTH: 0,
    ORDER_SUBMIT: 0,
    ORDER_RECONCILE: 0,
    JOURNAL: 0,
    DISASTER_RECOVERY: 0,
  },
};

if (!globalForLimiter.tradingRateLimiterBuckets) {
  globalForLimiter.tradingRateLimiterBuckets = buckets;
}
if (!globalForLimiter.tradingRateLimiterMetrics) {
  globalForLimiter.tradingRateLimiterMetrics = metrics;
}

export class RateLimiter {
  private static policies = DEFAULT_POLICIES;

  public static resetForTesting(): void {
    buckets.clear();
    metrics.totalRequests = 0;
    metrics.totalAllowed = 0;
    metrics.totalBlocked = 0;
    metrics.blockedByCategory = {
      AUTH: 0,
      ORDER_SUBMIT: 0,
      ORDER_RECONCILE: 0,
      JOURNAL: 0,
      DISASTER_RECOVERY: 0,
    };
  }

  /**
   * استخراج شناسه کلاینت یا آی‌پی از هدرهای درخواست
   */
  public static extractClientIdentifier(headers: Headers): string {
    const forwarded = headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = headers.get('x-real-ip');
    if (realIp) {
      return realIp.trim();
    }
    return 'demo-session-client';
  }

  /**
   * بررسی نرخ درخواست بر اساس الگوریتم پنجره لغزان (Sliding Window)
   */
  public static checkLimit(
    category: RateLimitCategory,
    clientIp: string,
    now: number = Date.now()
  ): RateLimitResult {
    metrics.totalRequests++;

    const policy = this.policies[category];
    const key = `${category}:${clientIp}`;

    let record = buckets.get(key);
    if (!record) {
      record = { timestamps: [], lastRequestTime: 0 };
      buckets.set(key, record);
    }

    // ۱. بررسی فاصله زمانی مینیمم (در صورت تعریف)
    if (policy.minIntervalMs && record.lastRequestTime > 0) {
      const interval = now - record.lastRequestTime;
      if (interval < policy.minIntervalMs) {
        metrics.totalBlocked++;
        metrics.blockedByCategory[category]++;
        const retryAfterSec = Math.max(1, Math.ceil((policy.minIntervalMs - interval) / 1000));
        return {
          allowed: false,
          remaining: 0,
          resetMs: policy.minIntervalMs - interval,
          retryAfterSec,
          clientIp,
          category,
        };
      }
    }

    // ۲. فیلتر کردن درخواست‌های خارج از پنجره زمانی
    const windowStart = now - policy.windowMs;
    record.timestamps = record.timestamps.filter(ts => ts > windowStart);

    // ۳. بررسی سقف تعداد مجاز در پنجره
    if (record.timestamps.length >= policy.maxRequests) {
      metrics.totalBlocked++;
      metrics.blockedByCategory[category]++;

      const oldestInWindow = record.timestamps[0];
      const resetMs = Math.max(0, oldestInWindow + policy.windowMs - now);
      const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000));

      return {
        allowed: false,
        remaining: 0,
        resetMs,
        retryAfterSec,
        clientIp,
        category,
      };
    }

    // ۴. ثبت درخواست مجاز
    record.timestamps.push(now);
    record.lastRequestTime = now;
    metrics.totalAllowed++;

    const remaining = policy.maxRequests - record.timestamps.length;
    return {
      allowed: true,
      remaining,
      resetMs: policy.windowMs,
      retryAfterSec: 0,
      clientIp,
      category,
    };
  }

  /**
   * بازگرداندن متریک‌های آماری ریت‌لیمیتر برای داشبورد امنیت
   */
  public static getMetrics(): RateLimiterMetrics {
    return {
      totalRequests: metrics.totalRequests,
      totalAllowed: metrics.totalAllowed,
      totalBlocked: metrics.totalBlocked,
      blockedByCategory: { ...metrics.blockedByCategory },
      activeTrackedIps: buckets.size,
    };
  }

  /**
   * تولید پاسخ رسمی HTTP 429 Too Many Requests با متن فارسی و هدرهای استاندارد
   */
  public static createBlockedResponse(result: RateLimitResult): NextResponse {
    return NextResponse.json(
      {
        success: false,
        error: `نرخ درخواست فراتر از حد مجاز امنیتی است (${result.category}). لطفاً ${result.retryAfterSec} ثانیه صبر کنید.`,
        category: result.category,
        retryAfterSec: result.retryAfterSec,
        securityViolation: 'RATE_LIMIT_EXCEEDED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfterSec),
          'X-RateLimit-Category': result.category,
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetMs / 1000)),
        },
      }
    );
  }
}
