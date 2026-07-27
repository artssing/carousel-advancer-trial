import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const cookie = request.cookies.get('lang');
  const locale = cookie?.value === 'en' ? 'en' : 'zh';
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', locale);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
