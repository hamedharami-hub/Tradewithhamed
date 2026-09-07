import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';

export async function GET() {
  return NextResponse.json({
    success: true,
    isKillNewEntriesActive: CTraderOMS.isKillNewEntriesActive(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const active = Boolean(body.active);
    CTraderOMS.setKillNewEntries(active);
    return NextResponse.json({
      success: true,
      isKillNewEntriesActive: CTraderOMS.isKillNewEntriesActive(),
      message: active
        ? 'سوئیچ اضطراری فعال شد؛ ورود به معاملات جدید مسدود گردید.'
        : 'سوئیچ اضطراری غیرفعال شد؛ ارسال معاملات مجاز شد.',
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
