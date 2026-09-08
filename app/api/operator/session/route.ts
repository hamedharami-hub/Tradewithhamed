import { NextRequest, NextResponse } from 'next/server';
import {
  createOperatorSession,
  getOperatorSession,
  isOperatorAccessConfigured,
  OPERATOR_SESSION_COOKIE,
  sessionMaxAgeSeconds,
  validateOperatorAccessKey,
} from '@/lib/server/operator-session';
import { RateLimiter } from '@/lib/server/rate-limiter';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    authenticated: Boolean(getOperatorSession(request)),
    configured: isOperatorAccessConfigured(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const clientIp = RateLimiter.extractClientIdentifier(request.headers);
  const rateLimitResult = RateLimiter.checkLimit('AUTH', clientIp);
  if (!rateLimitResult.allowed) return RateLimiter.createBlockedResponse(rateLimitResult);

  if (!isOperatorAccessConfigured()) {
    return NextResponse.json(
      { authenticated: false, error: 'OPERATOR_ACCESS_NOT_CONFIGURED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { accessKey } = await request.json();
    if (!validateOperatorAccessKey(accessKey)) {
      return NextResponse.json(
        { authenticated: false, error: 'INVALID_OPERATOR_ACCESS_KEY' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const response = NextResponse.json(
      { authenticated: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    response.cookies.set(OPERATOR_SESSION_COOKIE, createOperatorSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: sessionMaxAgeSeconds(),
    });
    return response;
  } catch {
    return NextResponse.json(
      { authenticated: false, error: 'INVALID_OPERATOR_ACCESS_REQUEST' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(OPERATOR_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
