'use client';

// useSearchParams needs dynamic rendering — production build fix.
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, setToken } from '@/lib/api';
import { trackLogin } from '@/lib/analytics';
import { isPhoneIdentifier } from '@authentik/utils';
import { AuthHeroPanel } from '@/components/auth/auth-hero-panel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/orders';
  const ssoError = searchParams.get('ssoError');
  const returnUrl = searchParams.get('returnUrl');
  const [identifier, setIdentifier] = useState('seller@authentik.hk');
  const [password, setPassword] = useState('password123');
  const isPhone = isPhoneIdentifier(identifier);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auth-method feature toggles (admin-controlled via platform-config).
  const [googleOn, setGoogleOn] = useState(false);
  const [appleOn, setAppleOn] = useState(false);
  useEffect(() => {
    api.config.flag('authGoogleEnabled').then(setGoogleOn);
    api.config.flag('authAppleEnabled').then(setAppleOn);
  }, []);

  // Pick up JWT from URL hash after Google SSO callback redirect.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#token=')) return;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('token');
    const next = params.get('next') ?? '/';
    if (token) {
      setToken(token);
      trackLogin('GOOGLE'); // Analytics identity merge（spec §3）
      window.history.replaceState(null, '', window.location.pathname);
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
      trackLogin('PASSWORD'); // Analytics identity merge（spec §3）
      if (returnUrl && /^https?:\/\//.test(returnUrl)) {
        window.location.href = `${returnUrl}${returnUrl.includes('#') ? '&' : '#'}token=${res.accessToken}`;
        return;
      }
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

  const anyOAuth = googleOn || appleOn;

  return (
    <div className="grid min-h-[calc(100dvh-66px)] lg:grid-cols-[1.1fr_0.9fr]">
      {/* ═══ Left — shared navy gradient hero (used by /register too) ═══ */}
      <AuthHeroPanel />

      {/* ═══ Right — form card ═══ */}
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          {/* Seg tabs */}
          <div className="mb-6 flex rounded-[10px] bg-surface-2 p-1">
            <span className="flex-1 rounded-[7px] bg-white py-2.5 text-center text-[14px] font-semibold text-ink shadow-sh1">
              登入
            </span>
            <Link
              href="/register"
              className="flex-1 rounded-[7px] py-2.5 text-center text-[14px] font-semibold text-neutral-text-hint transition hover:text-neutral-text-muted"
            >
              註冊
            </Link>
          </div>

          {ssoError && (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Google 登入未能完成：{ssoError === 'cancelled' ? '已取消' : ssoError}
            </p>
          )}

          {/* OAuth buttons — gated by admin feature toggles */}
          {anyOAuth && (
            <>
              <div className="mb-[18px] flex gap-2.5">
                {googleOn && (
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line-2 bg-white py-2.5 text-[13px] font-semibold text-neutral-text shadow-sh1 transition hover:border-brand-600 hover:text-brand-600"
                  >
                    <GoogleIcon /> Google 登入
                  </button>
                )}
                {appleOn && (
                  <button
                    type="button"
                    onClick={() => setError('Apple 登入即將推出')}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line-2 bg-white py-2.5 text-[13px] font-semibold text-neutral-text shadow-sh1 transition hover:border-brand-600 hover:text-brand-600"
                  >
                    <AppleIcon /> Apple 登入
                  </button>
                )}
              </div>
              <div className="mb-[18px] mt-1.5 flex items-center gap-3 text-[12px] text-neutral-text-hint">
                <span className="h-px flex-1 bg-line" /> 或用電郵 <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {/* Email / phone form */}
          <form onSubmit={onSubmit}>
            <div className="mb-[18px]">
              <label className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">
                電郵 / 手機號碼
              </label>
              <input
                type="text"
                inputMode={isPhone ? 'tel' : 'email'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com 或 +852 XXXX XXXX"
                required
                autoComplete="username"
                className="w-full rounded-[8px] border border-line-2 bg-white px-3.5 py-2.5 text-[14px] text-neutral-text shadow-[inset_0_1px_2px_rgba(10,37,64,0.03)] outline-none transition focus:border-verify focus:ring-2 focus:ring-verify/15"
              />
              {isPhone && (
                <p className="mt-1 text-[10px] text-neutral-text-hint">已自動偵測為手機號碼登入</p>
              )}
            </div>
            <div className="mb-[18px]">
              <label className="mb-1.5 block text-[13px] font-semibold text-neutral-text-muted">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-[8px] border border-line-2 bg-white px-3.5 py-2.5 text-[14px] text-neutral-text shadow-[inset_0_1px_2px_rgba(10,37,64,0.03)] outline-none transition focus:border-verify focus:ring-2 focus:ring-verify/15"
              />
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[8px] bg-brand-600 py-3 text-[15px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(0,135,102,0.5)] transition hover:bg-brand-400 disabled:opacity-50"
            >
              {loading ? '登入中…' : '登入'}
            </button>

            <p className="mt-4 text-center text-[12px] text-neutral-text-hint">
              未有帳戶？<Link href="/register" className="font-semibold text-brand-600 hover:underline">立即註冊</Link>
            </p>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-neutral-text-hint">
              登入即表示你同意 <Link href="/terms" className="text-brand-600 hover:underline">服務條款</Link> 及{' '}
              <Link href="/privacy" className="text-brand-600 hover:underline">私隱政策</Link>。
            </p>
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-center text-[11px] text-neutral-text-hint">
              Dev demo：seller@authentik.hk / password123
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A9.001 9.001 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A9.001 9.001 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.9 2.37-4.29 2.48-4.36-1.35-1.98-3.46-2.25-4.21-2.28-1.79-.18-3.5 1.05-4.41 1.05-.91 0-2.31-1.03-3.8-1-1.95.03-3.76 1.13-4.76 2.88-2.03 3.52-.52 8.73 1.46 11.59.97 1.4 2.12 2.97 3.63 2.91 1.46-.06 2.01-.94 3.77-.94 1.76 0 2.26.94 3.8.91 1.57-.03 2.56-1.42 3.52-2.83 1.11-1.62 1.57-3.19 1.59-3.27-.03-.02-3.05-1.17-3.09-4.65zM14.13 3.42c.8-.98 1.35-2.33 1.2-3.42-1.16.05-2.57.77-3.4 1.75-.74.86-1.39 2.24-1.22 3.56 1.3.1 2.62-.66 3.42-1.89z"/>
    </svg>
  );
}
