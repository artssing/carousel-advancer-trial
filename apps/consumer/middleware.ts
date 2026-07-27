/**
 * Middleware — reads `lang` cookie and sets `x-locale` header
 * so server components can detect the locale without hydration issues.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const cookie = request.cookies.get('lang');
  const locale = cookie?.value === 'en' ? 'en' : 'zh';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', locale);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Also update `<html lang>` attribute on the fly
  // (Next.js doesn't let us change it directly in layout at runtime
  //  without a full client component, so we do it here via header)
  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
