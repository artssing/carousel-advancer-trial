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
      .catch(() => {
        clearToken();
        router.replace('/login');
      });
  }, [isLogin, router]);

  if (!ready && !isLogin) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">載入中…</div>;
  }
  return <>{children}</>;
}
