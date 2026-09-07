import { NextResponse } from 'next/server';
import { CTraderServerSecurity } from '@/lib/server/ctrader-auth';

export async function POST() {
  return NextResponse.json({
    success: true,
    session: CTraderServerSecurity.sanitizeSessionStatus({
      state: 'DISCONNECTED',
      isAuthenticated: false,
      activeAccount: null,
    }),
  });
}
