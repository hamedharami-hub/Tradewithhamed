import { CTraderServerSecurity } from '../ctrader-auth';
import { CTraderFeedTracker } from '../ctrader-websocket';

export function runAllCTraderSecurityTests(): {
  name: string;
  passed: boolean;
  details: string;
}[] {
  const results: { name: string; passed: boolean; details: string }[] = [];

  try {
    let liveRejected = false;
    try {
      CTraderServerSecurity.validateDemoAccountOrReject({
        accountId: 9876543,
        isLive: true,
        accountType: 'LIVE',
      });
    } catch (err) {
      liveRejected = (err as Error).message.includes('حساب‌های واقعی مسدود است');
    }

    results.push({
      name: 'Server-Side Live Account Rejection Guard',
      passed: liveRejected,
      details: liveRejected
        ? 'حساب لایو به صورت سخت‌گیرانه توسط سرور رد و مسدود شد.'
        : 'خطا: حساب لایو توسط سرور رد نشد!',
    });
  } catch (e) {
    results.push({ name: 'Server-Side Live Account Rejection Guard', passed: false, details: (e as Error).message });
  }

  try {
    const demoAcc = CTraderServerSecurity.validateDemoAccountOrReject({
      accountId: 12345678,
      isLive: false,
      accountType: 'DEMO',
      currency: 'USD',
      balance: 50000,
    });

    const passed =
      demoAcc.accountType === 'DEMO' &&
      demoAcc.accountId === 'DEMO-****5678' &&
      demoAcc.isLiveRejected === true;

    results.push({
      name: 'Demo Account Masking & Sanitization',
      passed,
      details: `Account ID masked to: ${demoAcc.accountId}, isLiveRejected: ${demoAcc.isLiveRejected}`,
    });
  } catch (e) {
    results.push({ name: 'Demo Account Masking & Sanitization', passed: false, details: (e as Error).message });
  }

  try {
    const sanitized = CTraderServerSecurity.sanitizeSessionStatus({
      state: 'CONNECTED',
      activeAccount: {
        accountId: 'DEMO-****1234',
        accountType: 'DEMO',
        depositCurrency: 'USD',
        leverage: 100,
        balance: 10000,
        equity: 10000,
        isLiveRejected: true,
      },
    });

    const hasSecretKey = 'clientSecret' in sanitized || 'accessToken' in sanitized || 'refreshToken' in sanitized;
    const passed = !hasSecretKey && sanitized.demoBadge === true;

    results.push({
      name: 'Sanitized Session Token Isolation',
      passed,
      details: passed
        ? 'اطلاعات جلسه کاملاً پالایش شده و فاقد هرگونه فیلد سکرت یا توکن است.'
        : 'خطا: فیلدهای حساس در خروجی جلسه کلاینت وجود دارند!',
    });
  } catch (e) {
    results.push({ name: 'Sanitized Session Token Isolation', passed: false, details: (e as Error).message });
  }

  try {
    const tracker = new CTraderFeedTracker();
    const oldQuote = {
      symbol: 'XAUUSD',
      bid: 2650.1,
      ask: 2650.3,
      spreadPips: 2.0,
      timestamp: Date.now() - 5000,
      quality: 'STALE' as const,
    };

    const res = tracker.recordQuote(oldQuote);
    const passed = !res.isFresh && res.delayMs >= 5000;

    results.push({
      name: 'Data Freshness & Stale Feed Detection',
      passed,
      details: `Stale quote detected with delay: ${res.delayMs}ms, isFresh: ${res.isFresh}`,
    });
  } catch (e) {
    results.push({ name: 'Data Freshness & Stale Feed Detection', passed: false, details: (e as Error).message });
  }

  return results;
}
