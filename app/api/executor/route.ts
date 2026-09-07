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
      // سوئیچ مستقیم دستگاه توسط کاربر
      const res = ExecutorManager.forceSwitchExecutor(targetDevice || 'windows', targetSessionId || `session-${Date.now()}`);
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
