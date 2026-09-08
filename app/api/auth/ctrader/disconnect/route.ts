import { NextRequest, NextResponse } from 'next/server';
import { CTraderServerSecurity } from '@/lib/server/ctrader-auth';
import { getOperatorSession } from '@/lib/server/operator-session';

export async function POST(request: NextRequest) {
  if (!getOperatorSession(request)) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED_SESSION: قطع نشست بروکر به نشست اپراتور نیاز دارد.' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    session: CTraderServerSecurity.sanitizeSessionStatus({
      state: 'DISCONNECTED',
      isAuthenticated: false,
      activeAccount: null,
    }),
  });
}
