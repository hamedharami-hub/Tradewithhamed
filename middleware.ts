import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SECRET_SEED = 'HAMED_EXECUTOR_DEFAULT_SECRET_V4';

async function createOperatorSessionToken(): Promise<string> {
  const payload = JSON.stringify({
    operator: 'hamed',
    exp: Date.now() + 30 * 24 * 3600 * 1000,
    nonce: crypto.randomUUID(),
  });
  const encoder = new TextEncoder();
  const data = encoder.encode(payload + SECRET_SEED);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sig = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const payloadB64 = btoa(payload);
  return `${payloadB64}.${sig}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // اعمال فقط روی صفحات کاربری مرورگر (و نه فراخوانی‌های مستقیم API بدون نشست)
  if (pathname === '/' || (!pathname.startsWith('/api') && !pathname.startsWith('/_next') && !pathname.includes('.'))) {
    const existingSession = request.cookies.get('trader_operator_session')?.value;
    if (!existingSession) {
      const response = NextResponse.next();
      const token = await createOperatorSessionToken();
      response.cookies.set('trader_operator_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 3600,
      });
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
