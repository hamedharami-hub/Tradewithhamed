import { NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';

export async function GET() {
  const records = CTraderOMS.getAllRecords();
  const blockingCheck = CTraderOMS.hasBlockingState();

  return NextResponse.json({
    records,
    isBlocked: blockingCheck.blocked,
    blockingReason: blockingCheck.reason,
  });
}
