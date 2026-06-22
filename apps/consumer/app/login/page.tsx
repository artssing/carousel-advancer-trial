'use client';

// useSearchParams needs dynamic rendering — production build fix.
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@authentik/ui';
import { api, setToken } from '@/lib/api';
import { isPhoneIdentifier } from '@authentik/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/orders';
  const ssoError = searchParams.get('ssoError');
  // Cross-app SSO (Founder ruling 2026-06-19 Q4=A): authenticator portal
  // redirects here with ?returnUrl=<absolute URL>; on success we redirect back
  // with token in URL hash (same pattern as Google OAuth callback).
  const returnUrl = searchParams.get('returnUrl');
  const [identifier, setIdentifier] = useState('seller@authentik.hk');
  const [password, setPassword] = useState('password123');
  const isPhone = isPhoneIdentifier(identifier);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Pick up JWT from URL hash after Google SSO callback redirect.
  // Format: #token=<jwt>&next=<url>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#token=')) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('token');
    const next = params.get('next') ?? '/';
    if (token) {
      setToken(token);
      // Clear hash before navigating
      window.history.replaceState(null, '', window.location.pathname);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(next as any);
      router.refresh();
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login({ identifier, password });
      setToken(res.accessToken);
      // Cross-app SSO: bounce back to caller (authenticator portal) with token
      // in URL hash. Allow-list scheme to prevent open-redirect: only http(s).
      if (returnUrl && /^https?:\/\//.test(returnUrl)) {
        window.location.href = `${returnUrl}${returnUrl.includes('#') ? '&' : '#'}token=${res.accessToken}`;
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(redirect as any);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function onGoogleSignIn() {
    const dest = redirect ? `&redirect=${encodeURIComponent(redirect)}` : '';
    window.location.href = `${API_URL.replace(/\/api$/, '')}/api/auth/google?_=1${dest}`;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>登入 Authentik HK</CardTitle>
        </CardHeader>
        <CardContent>
          {ssoError && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google 登入未能完成：{ssoError === 'cancelled' ? '已取消' : ssoError}
            </p>
          )}

          {/* Google SSO — top-of-form per coordinator UX guidance */}
          <button
            type="button"
            onClick={onGoogleSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <GoogleIcon />
            <span>用 Google 帳戶登入</span>
          </button>

          <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> 或用電郵 / 手機 <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="identifier">電郵 / 手機號碼</Label>
              <Input
                id="identifier"
                type="text"
                inputMode={isPhone ? 'tel' : 'email'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="example@email.com 或 +852 XXXX XXXX"
                className="mt-1"
                required
                autoComplete="username"
              />
              {isPhone && (
                <p className="mt-1 text-[10px] text-slate-400">
                  已自動偵測為手機號碼登入
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="pw">密碼</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登入中…' : '登入'}
            </Button>
            <p className="text-center text-xs text-slate-500">
              未有帳戶？<Link href="/register" className="text-brand-600 hover:underline">立即註冊</Link>
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Dev demo：seller@authentik.hk / password123（seed user）
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A9.001 9.001 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A9.001 9.001 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
