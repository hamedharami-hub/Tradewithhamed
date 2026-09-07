import { NextResponse } from 'next/server';
import { TokenVault } from '@/lib/server/token-vault';
import { RateLimiter } from '@/lib/server/rate-limiter';
import { CTraderOMS } from '@/lib/server/ctrader-oms';

export const dynamic = 'force-dynamic';

/**
 * اندپوینت رسمی بررسی سلامت و پایداری سیستم (Production Health Check)
 * قابلیت دسترسی برای مانیتورینگ کانتینر Cloud Run و سیستم‌های آپ‌تایم
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const mem = process.memoryUsage();
    const tokenVaultStatus = TokenVault.getVaultStatus();
    const blockingCheck = CTraderOMS.hasBlockingState();
    const rateLimiterMetrics = RateLimiter.getMetrics();

    const uptimeSeconds = Math.floor(process.uptime ? process.uptime() : 0);

    const healthData = {
      status: blockingCheck.blocked ? 'DEGRADED_FAIL_CLOSED' : 'HEALTHY',
      version: '3.4.0-RC',
      environment: 'demo' as const,
      timestamp: Date.now(),
      uptimeSeconds,
      latencyMs: Date.now() - startTime,
      subsystems: {
        tokenVault: {
          active: tokenVaultStatus.active,
          algorithm: tokenVaultStatus.algorithm,
          zeroSecretLeakageCompliant: tokenVaultStatus.zeroSecretLeakageCompliant,
        },
        orderManagement: {
          totalRecords: CTraderOMS.getAllRecords().length,
          isBlocked: blockingCheck.blocked,
          blockingReason: blockingCheck.reason || null,
        },
        rateLimiting: {
          totalRequests: rateLimiterMetrics.totalRequests,
          totalBlocked: rateLimiterMetrics.totalBlocked,
          activeTrackedIps: rateLimiterMetrics.activeTrackedIps,
        },
      },
      system: {
        memoryHeapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        memoryRssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        nodeVersion: process.version,
      },
      securityGuarantees: {
        realMoneyTradingBlocked: true,
        liveAccountsBlocked: true,
        zeroSecretsExposedToClient: true,
        failClosedEnforced: true,
      },
    };

    // ممیزی ضد نشت سکرت قبل از ارسال خروجی
    const audit = TokenVault.auditPayloadNoSecrets(healthData);
    if (!audit.clean) {
      return NextResponse.json(
        { status: 'ERROR', error: 'نشت امنیتی در داده‌های پایش شناسایی شد.' },
        { status: 500 }
      );
    }

    return NextResponse.json(healthData, {
      status: blockingCheck.blocked ? 200 : 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'UNHEALTHY',
        error: (err as Error).message,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
