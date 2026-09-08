import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

export const OPERATOR_SESSION_COOKIE = 'trader_operator_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface OperatorSessionPayload {
  version: 1;
  subject: 'operator';
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

function getSessionSecret(): string | null {
  const secret = process.env.OPERATOR_SESSION_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(payloadB64: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isOperatorAccessConfigured(): boolean {
  const accessKey = process.env.OPERATOR_ACCESS_KEY?.trim();
  return Boolean(accessKey && accessKey.length >= 16 && getSessionSecret());
}

export function validateOperatorAccessKey(candidate: unknown): boolean {
  const expected = process.env.OPERATOR_ACCESS_KEY?.trim();
  if (!expected || expected.length < 16 || typeof candidate !== 'string') return false;
  return safeEqual(candidate, expected);
}

export function createOperatorSession(): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('OPERATOR_SESSION_NOT_CONFIGURED');
  }

  const now = Date.now();
  const payload: OperatorSessionPayload = {
    version: 1,
    subject: 'operator',
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
    sessionId: crypto.randomUUID(),
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export function getOperatorSession(request: NextRequest): OperatorSessionPayload | null {
  const secret = getSessionSecret();
  const token = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (!secret || !token) return null;

  const [payloadB64, signature, extra] = token.split('.');
  if (!payloadB64 || !signature || extra || !safeEqual(signature, sign(payloadB64, secret))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as OperatorSessionPayload;
    if (
      payload.version !== 1 ||
      payload.subject !== 'operator' ||
      typeof payload.sessionId !== 'string' ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function sessionMaxAgeSeconds(): number {
  return SESSION_TTL_MS / 1000;
}
