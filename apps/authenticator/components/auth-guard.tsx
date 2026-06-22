'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar, MobileBottomNav } from '@/components/sidebar';
import { MessageSoundNotifier } from '@/components/message-sound-notifier';
import { api, hasToken, clearToken } from '@/lib/api';

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
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        載入中…
      </div>
    );
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
