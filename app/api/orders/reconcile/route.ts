import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { RateLimiter } from '@/lib/server/rate-limiter';
import { getOperatorSession } from '@/lib/server/operator-session';

export async function POST(request: NextRequest) {
  if (!getOperatorSession(request)) {
    return NextResponse.json({ reconciled: false, error: 'UNAUTHENTICATED_SESSION: بازتطبیق سفارش به نشست اپراتور نیاز دارد.' }, { status: 401 });
  }

  const clientIp = RateLimiter.extractClientIdentifier(request.headers);
  const rateLimitResult = RateLimiter.checkLimit('ORDER_RECONCILE', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  try {
    const { intentId } = await request.json();

    if (!intentId) {
      return NextResponse.json(
        { error: 'شناسه اینتنت برای بازتطبیق الزامی است.' },
        { status: 400 }
      );
    }

    const result = await CTraderOMS.reconcileOrder(intentId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        reconciled: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
