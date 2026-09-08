import { NextRequest, NextResponse } from 'next/server';
import { ExecutorManager } from '@/lib/server/executor-manager';

export async function GET() {
  const state = ExecutorManager.getExecutorState();
  return NextResponse.json({
    success: true,
    state,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, epoch, targetDevice, targetSessionId } = body;

    if (action === 'renew') {
      const res = ExecutorManager.renewLease(sessionId, epoch);
      return NextResponse.json(res);
    }

    if (action === 'initiate_handoff') {
      const res = ExecutorManager.initiateHandoff(sessionId, epoch, targetDevice, targetSessionId);
      return NextResponse.json(res);
    }

    if (action === 'complete_handoff') {
      const res = ExecutorManager.completeHandoff(targetSessionId, targetDevice);
      return NextResponse.json(res);
    }

    if (action === 'switch') {
      if (!targetDevice || (targetDevice !== 'windows' && targetDevice !== 'pixel')) {
        return NextResponse.json({ success: false, error: 'دستگاه نامعتبر است. مجاز: windows یا pixel' }, { status: 400 });
      }
      if (!targetSessionId || typeof targetSessionId !== 'string') {
        return NextResponse.json({ success: false, error: 'شناسه نشست مقصد الزامی است.' }, { status: 400 });
      }
      if (!body.userConfirmation) {
        return NextResponse.json({ success: false, error: 'تایید صریح کاربر برای سوئیچ اجباری مجری الزامی است.' }, { status: 403 });
      }
      // سوئیچ مستقیم دستگاه توسط کاربر تاییدشده
      const res = ExecutorManager.forceSwitchExecutor(targetDevice, targetSessionId);
      return NextResponse.json({ success: true, ...res, state: ExecutorManager.getExecutorState() });
    }

    return NextResponse.json(
      { success: false, error: 'اکشن نامعتبر است. اکشن‌های مجاز: renew, initiate_handoff, complete_handoff, switch' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
