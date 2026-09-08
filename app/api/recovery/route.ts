import { NextRequest, NextResponse } from 'next/server';
import { DisasterRecoveryEngine } from '@/lib/server/disaster-recovery';
import { RateLimiter } from '@/lib/server/rate-limiter';
import { TokenVault } from '@/lib/server/token-vault';
import { getOperatorSession } from '@/lib/server/operator-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!getOperatorSession(req)) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED_SESSION: بازیابی اضطراری به نشست اپراتور نیاز دارد.' }, { status: 401 });
  }

  const clientIp = RateLimiter.extractClientIdentifier(req.headers);
  const rateLimitResult = RateLimiter.checkLimit('DISASTER_RECOVERY', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  try {
    const snapshot = DisasterRecoveryEngine.createEmergencySnapshot();
    const rateLimiterMetrics = RateLimiter.getMetrics();

    // تست رمزنگاری یک کلید نمونه در سرور برای اثبات عملکرد TokenVault
    const testEncrypted = TokenVault.encrypt(`DEMO-SESSION-TOKEN-${Date.now()}`);
    const testDecrypted = TokenVault.decrypt(testEncrypted);
    const vaultAudit = TokenVault.auditZeroSecretLeakage({
      snapshot,
      rateLimiterMetrics,
    });

    return NextResponse.json({
      success: true,
      snapshot,
      rateLimiterMetrics,
      tokenVaultStatus: {
        algorithm: 'AES-256-GCM',
        active: true,
        testVaultCheck: testDecrypted.startsWith('DEMO-SESSION-TOKEN'),
        zeroSecretLeakageCompliant: vaultAudit.isClean,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!getOperatorSession(req)) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED_SESSION: بازیابی اضطراری به نشست اپراتور نیاز دارد.' }, { status: 401 });
  }

  const clientIp = RateLimiter.extractClientIdentifier(req.headers);
  const rateLimitResult = RateLimiter.checkLimit('DISASTER_RECOVERY', clientIp);

  if (!rateLimitResult.allowed) {
    return RateLimiter.createBlockedResponse(rateLimitResult);
  }

  try {
    const body = await req.json();
    const { action, snapshot } = body;

    if (action === 'RESTORE_SNAPSHOT') {
      if (!snapshot) {
        return NextResponse.json(
          { error: 'ارائه اسنپ‌شات برای بازیابی اضطراری الزامی است.' },
          { status: 400 }
        );
      }
      const restoreResult = DisasterRecoveryEngine.restoreEmergencySnapshot(snapshot);
      return NextResponse.json(restoreResult);
    }

    if (action === 'SIMULATE_COLD_CRASH') {
      const crashResult = DisasterRecoveryEngine.simulateColdCrashAndRecover();
      return NextResponse.json(crashResult);
    }

    return NextResponse.json({ error: 'عملیات نامعتبر است.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
