'use client';

// Analytics bootstrap — authenticator portal（「鑑定師在線」counter 來源）。
import { useEffect } from 'react';
import { startAnalytics } from '@/lib/analytics';

export function AnalyticsProvider() {
  useEffect(() => { startAnalytics(); }, []);
  return null;
}
