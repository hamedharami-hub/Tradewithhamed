import { NextRequest } from 'next/server';
import { getOperatorSession } from './operator-session';
import { RateLimiter } from './rate-limiter';
import { errorResponse } from './http';

export function requireOperator(request: NextRequest) {
  if (!getOperatorSession(request)) {
    return errorResponse(request, 'UNAUTHENTICATED', 'نشست معتبر اپراتور الزامی است.', 401);
  }
  return null;
}

export function requireRateLimit(request: NextRequest, bucket: Parameters<typeof RateLimiter.checkLimit>[0]) {
  const clientId = RateLimiter.extractClientIdentifier(request.headers);
  const result = RateLimiter.checkLimit(bucket, clientId);
  if (!result.allowed) {
    return errorResponse(request, 'RATE_LIMITED', 'تعداد درخواست‌ها بیش از حد مجاز است.', 429, {
      headers: { 'Retry-After': String(result.retryAfterSec) },
    });
  }
  return null;
}

export function requireOperatorAndRateLimit(
  request: NextRequest,
  bucket: Parameters<typeof RateLimiter.checkLimit>[0],
) {
  return requireOperator(request) || requireRateLimit(request, bucket);
}
