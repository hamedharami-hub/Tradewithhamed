import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { createOperatorSession, OPERATOR_SESSION_COOKIE } from '../operator-session';
import * as executorRoute from '@/app/api/executor/route';

type TestResult = { name: string; passed: boolean; details: string };

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export async function runOperatorSessionTests(): Promise<TestResult[]> {
  const previousAccessKey = process.env.OPERATOR_ACCESS_KEY;
  const previousSessionSecret = process.env.OPERATOR_SESSION_SECRET;
  const results: TestResult[] = [];

  try {
    process.env.OPERATOR_ACCESS_KEY = 'test-operator-access-key-2026';
    process.env.OPERATOR_SESSION_SECRET = 'test-operator-session-secret-with-at-least-32-characters';

    const forgedPayload = JSON.stringify({ operator: 'attacker', exp: Date.now() + 60_000 });
    const forgedToken = `${Buffer.from(forgedPayload).toString('base64')}.${crypto
      .createHash('sha256')
      .update(forgedPayload + 'HAMED_EXECUTOR_DEFAULT_SECRET_V4')
      .digest('hex')}`;
    const forgedResponse = await executorRoute.GET(
      new NextRequest('http://localhost/api/executor', {
        headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${forgedToken}` },
      })
    );
    const forgedBody = await forgedResponse.json();
    results.push({
      name: 'Operator Session Rejects Legacy Forged Signature',
      passed: forgedBody.isAuthenticated === false && forgedBody.state === null,
      details: 'کوکی ساخته‌شده با کلید ثابت قدیمی باید هیچ وضعیت مجری یا مجوزی دریافت نکند.',
    });

    const fakeVaultResponse = await executorRoute.GET(
      new NextRequest('http://localhost/api/executor', {
        headers: {
          cookie: `ctrader_vault_token=${encodeURIComponent(JSON.stringify({ ciphertext: 'x', iv: 'x', tag: 'x' }))}`,
        },
      })
    );
    const fakeVaultBody = await fakeVaultResponse.json();
    results.push({
      name: 'Operator Session Rejects Fake cTrader Vault Cookie',
      passed: fakeVaultBody.isAuthenticated === false && fakeVaultBody.state === null,
      details: 'ظاهر یک کوکی گاوصندوق هرگز جای نشست مستقل اپراتور را نمی‌گیرد.',
    });

    const validSession = createOperatorSession();
    const validResponse = await executorRoute.GET(
      new NextRequest('http://localhost/api/executor', {
        headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${validSession}` },
      })
    );
    const validBody = await validResponse.json();
    results.push({
      name: 'Operator Session Allows Valid HMAC Cookie Only',
      passed: validBody.isAuthenticated === true && Boolean(validBody.state?.activeSessionId),
      details: 'فقط کوکی HMAC امضاشده با سکرت محیطی معتبر به کنترل مجری دسترسی می‌دهد.',
    });
  } catch (error) {
    results.push({
      name: 'Operator Session Security Suite',
      passed: false,
      details: (error as Error).message,
    });
  } finally {
    restoreEnv('OPERATOR_ACCESS_KEY', previousAccessKey);
    restoreEnv('OPERATOR_SESSION_SECRET', previousSessionSecret);
  }

  return results;
}
