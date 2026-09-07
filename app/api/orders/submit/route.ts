import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { OrderSubmissionRequest } from '@/lib/contracts/execution';
import { RateLimiter } from '@/lib/server/rate-limiter';

export async function POST(request: NextRequest) {
  const clientIp = RateLimiter.extractClientIdentifier(request.headers);
  const rateLimitResult = RateLimiter.checkLimit('ORDER_SUBMIT', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  try {
    const body = (await request.json()) as OrderSubmissionRequest & {
      simulateTimeout?: boolean;
      simulateRejection?: boolean;
    };

    if (!body.intentId || !body.idempotencyKey || !body.limitPrice || !body.stopLossPrice) {
      return NextResponse.json(
        { error: 'پارامترهای ارسالی برای ثبت سفارش ناقص است.' },
        { status: 400 }
      );
    }

    const res = await CTraderOMS.submitOrder(
      {
        intentId: body.intentId,
        idempotencyKey: body.idempotencyKey,
        symbol: body.symbol,
        direction: body.direction,
        volumeLots: body.volumeLots,
        limitPrice: body.limitPrice,
        stopLossPrice: body.stopLossPrice,
        takeProfitPrice: body.takeProfitPrice,
        userConfirmationTimestamp: body.userConfirmationTimestamp || Date.now(),
      },
      {
        simulateTimeout: body.simulateTimeout,
        simulateRejection: body.simulateRejection,
      }
    );

    return NextResponse.json(res);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'خطای غیرمنتظره در سرور OMS',
      },
      { status: 500 }
    );
  }
}
