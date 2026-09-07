import { NextRequest, NextResponse } from 'next/server';
import { CTraderServerSecurity } from '@/lib/server/ctrader-auth';
import { RateLimiter } from '@/lib/server/rate-limiter';

export async function GET(request: NextRequest) {
  const clientIp = RateLimiter.extractClientIdentifier(request.headers);
  const rateLimitResult = RateLimiter.checkLimit('AUTH', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  const { isConfigured, reason } = CTraderServerSecurity.getConfig();

  if (!isConfigured) {
    return NextResponse.json(
      CTraderServerSecurity.sanitizeSessionStatus({
        state: 'BLOCKED',
        errorCode: 'CREDENTIALS_REQUIRED',
        errorMessage: reason || 'تنظیم کلیدهای سرور cTrader الزامی است.',
      })
    );
  }

  return NextResponse.json(
    CTraderServerSecurity.sanitizeSessionStatus({
      state: 'DISCONNECTED',
      errorMessage: 'کلیدهای سرور معتبر است؛ آماده شروع فرآیند احراز هویت دمو.',
    })
  );
}
