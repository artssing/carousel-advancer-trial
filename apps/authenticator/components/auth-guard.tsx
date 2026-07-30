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
      .catch(() => {
        clearToken();
        router.replace('/login');
      });
  }, [pathname, isPublic, router]);

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
