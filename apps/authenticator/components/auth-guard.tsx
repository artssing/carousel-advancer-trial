'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, MobileBottomNav } from '@/components/sidebar';
import { MessageSoundNotifier } from '@/components/message-sound-notifier';
import { api, hasToken, clearToken } from '@/lib/api';
import { getClientLocale } from '@authentik/utils';

const PUBLIC_PATHS = ['/login', '/onboarding'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [authProfile, setAuthProfile] = useState<{
    displayName: string;
    storeName?: string;
    starRating: number;
    completedCount: number;
    status: string;
  } | null>(null);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isPublic) {
      setReady(true);
      return;
    }
    if (!hasToken()) {
      router.replace('/login');
      return;
    }
    api
      .me()
      .then((me) => {
        if (!me.authenticator) {
          clearToken();
          router.replace('/login');
          return;
        }
        setAuthProfile(me.authenticator);
        setReady(true);
      })
      .catch((e: any) => {
      // Only a REAL auth failure may clear the token. Any thrown error used to
      // log the user out, so a 502 or a dropped connection destroyed the session
      // — which is exactly what happened on 2026-08-12: the API was down, every
      // page load ran /me, and switching language (a full page load) appeared to
      // "log you out". A transient backend problem must not cost the session.
      if (e?.status === 401 || e?.status === 403) {
          clearToken();
          router.replace('/login');
          return;
        }
        setLoadError(true);
      });
  }, [pathname, isPublic, router]);

  if (loadError) {
    return <PortalError onRetry={() => { setLoadError(false); router.refresh(); }} />;
  }
  if (!ready) {
    return <PortalLoading />;
  }

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar authProfile={authProfile} />
      <main className="flex-1 overflow-x-hidden pb-16 md:pb-0">{children}</main>
      <MobileBottomNav />
      {/* Global beep on any incoming message (works in background tabs too) */}
      <MessageSoundNotifier />
    </div>
  );
}

/**
 * Branded full-screen loader for the auth-gate flash (token check + /me fetch).
 * Canvas matches the login page (`bg-slate-50`), not the raw `bg-slate-100`
 * body — otherwise the darker grey reads as an unstyled blank screen. Wordmark
 * + authBrand indigo spinner tie it to the portal chrome.
 */
function PortalLoading() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50">
      <div className="text-[20px] font-extrabold tracking-[0.22em] text-authBrand-900">
        CERTI<span className="text-authBrand-500">·</span>FINE
      </div>
      <div className="flex items-center gap-3 text-[13px] text-neutral-text-hint">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-authBrand-200 border-t-authBrand-500" />
        {locale === 'en' ? 'Loading…' : '載入中…'}
      </div>
    </div>
  );
}

/**
 * Backend unreachable — NOT logged out. The token is left alone so a retry can
 * succeed once the API is back; signing the user out over a 502 would make an
 * outage look like an account problem.
 */
function PortalError({ onRetry }: { onRetry: () => void }) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const en = locale === 'en';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-slate-50 px-6 text-center">
      <div className="text-[20px] font-extrabold tracking-[0.22em] text-authBrand-900">
        CERTI<span className="text-authBrand-500">·</span>FINE
      </div>
      <p className="max-w-sm text-[13px] leading-relaxed text-neutral-text-muted">
        {en
          ? 'Cannot reach the server right now. You are still signed in — try again in a moment.'
          : '而家連唔到伺服器。你仲係登入緊嘅，等陣再試。'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-authBrand-600"
      >
        {en ? 'Retry' : '再試一次'}
      </button>
    </div>
  );
}
