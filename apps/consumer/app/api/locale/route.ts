/**
 * GET /api/locale?lang=en|zh&from=/current-page
 *
 * Sets the `lang` cookie and redirects back. Simple <a> link,
 * zero client-side JS — reliable across all portals.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const from = searchParams.get('from') || '/';

  // Build absolute URL for redirect within same app
  const redirectUrl = new URL(from, request.nextUrl.origin);
  // Don't allow open redirects off-site
  if (redirectUrl.origin !== request.nextUrl.origin) {
    redirectUrl.pathname = '/';
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set('lang', lang, { path: '/', maxAge: 365 * 24 * 60 * 60, sameSite: 'lax' });
  return response;
}
