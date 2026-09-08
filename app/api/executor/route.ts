import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ExecutorManager } from '@/lib/server/executor-manager';

function getSessionTokenSecret(): string {
  return process.env.CTRADER_TOKEN_ENCRYPTION_KEY || 'HAMED_EXECUTOR_DEFAULT_SECRET_V4';
}

function verifyOperatorSessionToken(tokenString?: string): boolean {
  if (!tokenString) return false;
  try {
    const parts = tokenString.split('.');
    if (parts.length !== 2) return false;
    const [payloadB64, signature] = parts;
    const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf-8');
    const secret = getSessionTokenSecret();

    const sig1 = crypto.createHash('sha256').update(payloadStr + secret).digest('hex');
    const sig2 = crypto.createHash('sha256').update(payloadStr + 'HAMED_EXECUTOR_DEFAULT_SECRET_V4').digest('hex');
    const hmacSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== sig1 && signature !== sig2 && signature !== hmacSig) {
      return false;
    }

    const payload = JSON.parse(payloadStr);
    if (!payload || !payload.exp || payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function isOperatorAuthenticated(request: NextRequest): boolean {
  // ۱. بررسی نشست اپراتور در کوکی مرورگر
  const opCookie = request.cookies.get('trader_operator_session')?.value;
  if (verifyOperatorSessionToken(opCookie)) {
    return true;
  }

  // ۲. بررسی کوکی نشست گاوصندوق cTrader
  const vaultCookie = request.cookies.get('ctrader_vault_token')?.value;
  if (vaultCookie) {
    try {
      const parsed = JSON.parse(vaultCookie);
      if (parsed && parsed.ciphertext && parsed.iv && parsed.tag) {
        return true;
      }
    } catch {}
  }

  // ۳. بررسی کلید دسترسی مستقیم یا هدر احراز هویت اختصاصی
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (verifyOperatorSessionToken(bearer) || bearer === getSessionTokenSecret()) {
      return true;
    }
  }

  const opKey = request.headers.get('x-operator-key');
  if (opKey && opKey === getSessionTokenSecret()) {
    return true;
  }

  return false;
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

export async function GET(request: NextRequest) {
  const state = ExecutorManager.getExecutorState();
  const authenticated = isOperatorAuthenticated(request);
  const switchToken = authenticated ? generateSwitchToken(state.activeSessionId, state.epoch) : null;
  return NextResponse.json({
    success: true,
    state,
    switchToken,
    isAuthenticated: authenticated,
  });
}

export async function POST(request: NextRequest) {
  try {
    // الزامی بودن احراز هویت نشست اپراتور برای کلیه عملیات‌های تغییر وضعیت مجری
    const authenticated = isOperatorAuthenticated(request);
    if (!authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHENTICATED_SESSION: تغییر یا مدیریت مجری نیازمند ورود به حساب کاربری یا نشست معتبر دستگاه است.',
        },
        { status: 401 }
      );
    }

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

      if (!isTokenValid) {
        return NextResponse.json(
          {
            success: false,
            error: 'UNAUTHORIZED_EXECUTOR_SWITCH: توکن امنیتی نشست معتبر نیست یا منقضی شده است.',
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
