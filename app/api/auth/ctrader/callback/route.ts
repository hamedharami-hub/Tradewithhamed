import { NextRequest, NextResponse } from 'next/server';

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

  const redirectUrl = new URL('/', request.url);
  redirectUrl.searchParams.set('ctrader_auth', 'success');
  return NextResponse.redirect(redirectUrl);
}
