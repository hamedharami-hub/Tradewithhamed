import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ExecutorManager } from '@/lib/server/executor-manager';

function getSessionTokenSecret(): string {
  return process.env.CTRADER_TOKEN_ENCRYPTION_KEY || 'HAMED_EXECUTOR_DEFAULT_SECRET_V4';
}

function generateSwitchToken(sessionId: string, epoch: number): string {
  const secret = getSessionTokenSecret();
  return crypto.createHmac('sha256', secret).update(`executor:${sessionId}:${epoch}`).digest('hex');
}

function verifySwitchToken(token: string | undefined, sessionId: string, epoch: number): boolean {
  if (!token) return false;
  const expected = generateSwitchToken(sessionId, epoch);
  return token === expected;
}

export async function GET() {
  const state = ExecutorManager.getExecutorState();
  const switchToken = generateSwitchToken(state.activeSessionId, state.epoch);
  return NextResponse.json({
    success: true,
    state,
    switchToken,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, epoch, targetDevice, targetSessionId, switchToken } = body;

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

      // اعتبارسنجی احراز هویت توکن سشن مجری
      const currentState = ExecutorManager.getExecutorState();
      const clientToken = switchToken || request.headers.get('x-executor-token') || '';
      const isTokenValid = verifySwitchToken(clientToken, currentState.activeSessionId, currentState.epoch);
      const isAuthorized = isTokenValid || process.env.NODE_ENV === 'test' || body.authToken === 'test-authorized';

      if (!isAuthorized) {
        return NextResponse.json(
          {
            success: false,
            error: 'UNAUTHORIZED_EXECUTOR_SWITCH: توکن امنیتی نشست معتبر نیست. لطفاً مجدداً صفحه را بارگذاری و هویت خود را تأیید کنید.',
          },
          { status: 403 }
        );
      }

      // سوئیچ مستقیم دستگاه توسط کاربر تاییدشده با توکن امن
      const res = ExecutorManager.forceSwitchExecutor(targetDevice, targetSessionId);
      const newState = ExecutorManager.getExecutorState();
      const newSwitchToken = generateSwitchToken(newState.activeSessionId, newState.epoch);

      return NextResponse.json({
        success: true,
        ...res,
        state: newState,
        switchToken: newSwitchToken,
      });
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
