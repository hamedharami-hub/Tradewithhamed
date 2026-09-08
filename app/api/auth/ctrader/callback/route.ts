import { NextRequest, NextResponse } from 'next/server';
import { TokenVault } from '@/lib/server/token-vault';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('ctrader_error', error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code) {
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('ctrader_error', 'MISSING_AUTHORIZATION_CODE');
    return NextResponse.redirect(redirectUrl);
  }

  const clientId = process.env.CTRADER_CLIENT_ID?.trim();
  const clientSecret = process.env.CTRADER_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CTRADER_REDIRECT_URI?.trim() || `${request.nextUrl.origin}/api/auth/ctrader/callback`;

  // اصل شفافیت سیستم: در صورت عدم تعریف سکرت‌های واقعی بروکر، موفقیت جعلی صادر نمی‌شود
  if (!clientId || !clientSecret) {
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('ctrader_error', 'BROKER_CREDENTIALS_NOT_CONFIGURED');
    redirectUrl.searchParams.set('details', 'کلیدهای احراز هویت cTrader در متغیرهای محیطی سرور تنظیم نشده‌اند.');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const tokenEndpoint = new URL('https://openapi.ctrader.com/apps/token');
    tokenEndpoint.searchParams.set('grant_type', 'authorization_code');
    tokenEndpoint.searchParams.set('code', code);
    tokenEndpoint.searchParams.set('redirect_uri', redirectUri);
    tokenEndpoint.searchParams.set('client_id', clientId);
    tokenEndpoint.searchParams.set('client_secret', clientSecret);

    const response = await fetch(tokenEndpoint.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const tokenData = await response.json();

    if (!response.ok || tokenData.errorCode || !tokenData.accessToken) {
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('ctrader_error', tokenData.errorCode || 'TOKEN_EXCHANGE_FAILED');
      redirectUrl.searchParams.set(
        'details',
        tokenData.errorDescription || 'تبادل توکن احراز هویت با سرور cTrader با خطا مواجه شد.'
      );
      return NextResponse.redirect(redirectUrl);
    }

    // ذخیره توکن رمزنگاری‌شده در کوکی امن سروری (بدون هیچ‌گونه نشت به جاوااسکریپت کلاینت)
    const encryptedPayload = TokenVault.encrypt(tokenData.accessToken);

    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('ctrader_auth', 'success');
    redirectUrl.searchParams.set('account_type', 'DEMO');

    const redirectResponse = NextResponse.redirect(redirectUrl);
    redirectResponse.cookies.set('ctrader_vault_token', JSON.stringify(encryptedPayload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expiresIn || 2592000,
      path: '/',
    });

    return redirectResponse;
  } catch (exchangeErr: any) {
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('ctrader_error', 'NETWORK_OR_VAULT_ERROR');
    redirectUrl.searchParams.set('details', exchangeErr.message || 'خطا در ارتباط با سرور cTrader یا گاوصندوق توکن');
    return NextResponse.redirect(redirectUrl);
  }
}
