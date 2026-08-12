'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, hasToken, clearToken } from '@/lib/api';

const ADMIN_ROLES = ['OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'];

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname?.startsWith('/login');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (isLogin) { setReady(true); return; }
    if (!hasToken()) { router.replace('/login'); return; }
    api.me()
      .then((m) => {
        if (!m.roles?.some((r) => ADMIN_ROLES.includes(r))) {
          clearToken();
          router.replace('/login');
          return;
        }
        setReady(true);
      })
      .catch((e: any) => {
        // Same rule as the authenticator portal (2026-08-12): only a real auth
        // failure clears the token. A 502 or a dropped connection must not end
        // the session — an outage should not look like an account problem.
        if (e?.status === 401 || e?.status === 403) {
          clearToken();
          router.replace('/login');
          return;
        }
        setLoadError(true);
      });
  }, [isLogin, router]);

  if (loadError && !isLogin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-sm text-slate-400">
        <p>連唔到伺服器。你仲係登入緊嘅 —— 等陣再試。</p>
        <button
          type="button"
          onClick={() => { setLoadError(false); router.refresh(); }}
          className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 transition hover:bg-slate-800"
        >
          再試一次
        </button>
      </div>
    );
  }
  if (!ready && !isLogin) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">載入中…</div>;
  }
  return <>{children}</>;
}
