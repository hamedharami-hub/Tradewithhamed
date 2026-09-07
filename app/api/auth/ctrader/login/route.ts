import { NextResponse } from 'next/server';
import { CTraderServerSecurity } from '@/lib/server/ctrader-auth';

export async function GET() {
  const stateToken = `CSRF-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  const { url, error } = CTraderServerSecurity.generateAuthorizationUrl(stateToken);

  if (!url) {
    return NextResponse.json(
      {
        error: 'CONFIGURATION_BLOCKED',
        message: error || 'کلیدهای cTrader در سرور تنظیم نشده‌اند.',
      },
      { status: 400 }
    );
  }

  return NextResponse.redirect(url);
}
