import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { CTraderDemoGateway } from '@/lib/gateway/ctrader-gateway';
import { registerDemoExecutionBridge } from '@/lib/server/demo-execution-bridge';
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

  registerDemoExecutionBridge();

  try {
    const { intentId } = await request.json() as { intentId?: string };
    const snapshot = await CTraderDemoGateway.getInstance().requestReconcile();
    const report = CTraderOMS.reconcileSnapshot(snapshot);
    if (!intentId) return NextResponse.json(report);
    const record = CTraderOMS.getRecord(intentId);
    const matched = report.matchedIntentIds.includes(intentId);
    return NextResponse.json({
      ...report,
      requestedIntentId: intentId,
      reconciled: matched && !report.unresolvedIntentIds.includes(intentId),
      record: record || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        reconciled: false,
        error: (error as Error).message,
      },
      { status: 503 }
    );
  }
}
