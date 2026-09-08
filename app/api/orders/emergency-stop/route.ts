import { NextRequest, NextResponse } from 'next/server';
import { CTraderOMS } from '@/lib/server/ctrader-oms';
import { ExecutorManager } from '@/lib/server/executor-manager';

export async function GET() {
  return NextResponse.json({
    success: true,
    isKillNewEntriesActive: CTraderOMS.isKillNewEntriesActive(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { active, sessionId, epoch, deviceLabel } = body;

    // احراز هویت تک‌مجری برای کنترل سوئیچ اضطراری
    if (!sessionId || epoch === undefined) {
      return NextResponse.json(
        { success: false, error: 'احراز هویت الزامی است: شناسه نشست (sessionId) و ایپاک مجری باید ارسال شود.' },
        { status: 403 }
      );
    }

    const validation = ExecutorManager.validateExecutor(sessionId, epoch, deviceLabel);
    if (!validation.authorized) {
      return NextResponse.json(
        { success: false, error: validation.reason || 'دستگاه یا نشست غیرمجاز است.' },
        { status: 403 }
      );
    }

    const isActive = Boolean(active);
    CTraderOMS.setKillNewEntries(isActive);
    return NextResponse.json({
      success: true,
      isKillNewEntriesActive: CTraderOMS.isKillNewEntriesActive(),
      message: isActive
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
