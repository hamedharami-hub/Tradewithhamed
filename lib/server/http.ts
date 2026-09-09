import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
  };
}

export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
  requestId: string;
}

export function requestIdFrom(request: Request): string {
  return request.headers.get('x-request-id') || `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function successResponse<T>(request: Request, data: T, init?: ResponseInit) {
  const requestId = requestIdFrom(request);
  return NextResponse.json<ApiSuccessBody<T>>({ ok: true, data, requestId }, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      'x-request-id': requestId,
      ...init?.headers,
    },
  });
}

export function errorResponse(
  request: Request,
  code: ApiErrorCode,
  message: string,
  status: number,
  init?: ResponseInit,
) {
  const requestId = requestIdFrom(request);
  return NextResponse.json<ApiErrorBody>({
    ok: false,
    error: { code, message, requestId },
  }, {
    ...init,
    status,
    headers: {
      'Cache-Control': 'no-store',
      'x-request-id': requestId,
      ...init?.headers,
    },
  });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('بدنه درخواست باید یک شیء JSON باشد.');
  }
  return body as Record<string, unknown>;
}

export function finiteNumber(value: unknown, field: string, options?: { min?: number; max?: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} باید یک عدد معتبر باشد.`);
  }
  if (options?.min !== undefined && value < options.min) throw new Error(`${field} کمتر از حد مجاز است.`);
  if (options?.max !== undefined && value > options.max) throw new Error(`${field} بیشتر از حد مجاز است.`);
  return value;
}

export function requiredString(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${field} باید متن غیرخالی و کوتاه باشد.`);
  }
  return value.trim();
}
