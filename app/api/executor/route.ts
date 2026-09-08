import { NextRequest, NextResponse } from 'next/server';
import { ExecutorManager } from '@/lib/server/executor-manager';
import { getOperatorSession } from '@/lib/server/operator-session';

export const dynamic = 'force-dynamic';

function unauthenticatedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'UNAUTHENTICATED_SESSION: کنترل مجری فقط پس از بازگشایی نشست اپراتور مجاز است.',
    },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: NextRequest) {
  if (!getOperatorSession(request)) {
    return NextResponse.json(
      { success: true, isAuthenticated: false, state: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { success: true, isAuthenticated: true, state: ExecutorManager.getExecutorState() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  if (!getOperatorSession(request)) return unauthenticatedResponse();

  try {
    const body = await request.json();
    const { action, sessionId, epoch, targetDevice, targetSessionId } = body;

    if (action === 'renew') return NextResponse.json(ExecutorManager.renewLease(sessionId, epoch));
    if (action === 'initiate_handoff') {
      return NextResponse.json(ExecutorManager.initiateHandoff(sessionId, epoch, targetDevice, targetSessionId));
    }
    if (action === 'complete_handoff') {
      return NextResponse.json(ExecutorManager.completeHandoff(targetSessionId, targetDevice));
    }

    if (action === 'switch') {
      if (targetDevice !== 'windows' && targetDevice !== 'pixel') {
        return NextResponse.json({ success: false, error: 'دستگاه نامعتبر است. مجاز: windows یا pixel' }, { status: 400 });
      }
      if (!targetSessionId || typeof targetSessionId !== 'string') {
        return NextResponse.json({ success: false, error: 'شناسه نشست مقصد الزامی است.' }, { status: 400 });
      }
      if (body.userConfirmation !== true) {
        return NextResponse.json({ success: false, error: 'تأیید صریح اپراتور برای واگذاری مجری الزامی است.' }, { status: 403 });
      }

      const res = ExecutorManager.forceSwitchExecutor(targetDevice, targetSessionId);
      return NextResponse.json({ success: true, ...res, state: ExecutorManager.getExecutorState() });
    }

    return NextResponse.json(
      { success: false, error: 'اکشن نامعتبر است. اکشن‌های مجاز: renew, initiate_handoff, complete_handoff, switch' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
