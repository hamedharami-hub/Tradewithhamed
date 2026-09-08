import { NextRequest, NextResponse } from 'next/server';
import { JournalService } from '@/lib/server/journal-service';
import { RateLimiter } from '@/lib/server/rate-limiter';
import { getOperatorSession } from '@/lib/server/operator-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const positions = JournalService.getAllPositions();
    const auditLogs = JournalService.getAuditLogs();
    const statistics = JournalService.getStatistics();

    return NextResponse.json({
      positions,
      auditLogs,
      statistics,
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!getOperatorSession(req)) {
    return NextResponse.json({ error: 'UNAUTHENTICATED_SESSION: تغییر ژورنال به نشست اپراتور نیاز دارد.' }, { status: 401 });
  }

  const clientIp = RateLimiter.extractClientIdentifier(req.headers);
  const rateLimitResult = RateLimiter.checkLimit('JOURNAL', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  try {
    const body = await req.json();
    const { action, positionId, exitPrice, exitReason } = body;

    if (action === 'CLOSE_POSITION') {
      if (!positionId || !exitPrice || !exitReason) {
        return NextResponse.json(
          { error: 'فیلدهای positionId, exitPrice و exitReason الزامی هستند.' },
          { status: 400 }
        );
      }

      const closed = JournalService.closePosition(positionId, Number(exitPrice), exitReason);
      if (!closed) {
        return NextResponse.json({ error: 'پوزیشن باز برای بستن یافت نشد.' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        position: closed,
        message: `پوزیشن ${positionId} با موفقیت بسته شد.`,
      });
    }

    return NextResponse.json({ error: 'عملیات نامعتبر است.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
