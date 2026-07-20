'use client';

// Analytics bootstrap（spec MVP）：session_started / heartbeat / page_view 自動化。
// 掛喺 root layout — 唔 render 任何嘢，純 side effect。
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { startAnalytics, trackPageView } from '@/lib/analytics';

export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => { startAnalytics(); }, []);
  useEffect(() => { if (pathname) trackPageView(pathname); }, [pathname]);

  return null;
}
