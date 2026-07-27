/**
 * GET /api/locale?lang=en|zh&from=/current-page
 *
 * Sets the `lang` cookie and redirects back. Simple <a> link,
 * zero client-side JS — reliable across all portals.
 *
 * Behind Cloudflare tunnel the container只見內部 host（e.g. localhost:3008）,
 * 用 request.nextUrl.origin 做 redirect 會彈返 localhost。改用
 * X-Forwarded-Host / X-Forwarded-Proto 攞返 public origin。
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lang = searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const from = searchParams.get('from') || '/';

  // Public origin behind proxy: prefer forwarded headers, fall back to nextUrl.
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const origin = `${proto}://${host}`;

  // Build absolute URL for redirect within same app.
  const redirectUrl = new URL(from, origin);
  // Don't allow open redirects off-site (e.g. from=//evil.com).
  if (redirectUrl.origin !== origin) {
    redirectUrl.href = origin;
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set('lang', lang, { path: '/', maxAge: 365 * 24 * 60 * 60, sameSite: 'lax' });
  return response;
}
