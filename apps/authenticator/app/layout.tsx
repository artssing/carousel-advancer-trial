import './globals.css';
import type { Metadata } from 'next';
import { AuthGuard } from '@/components/auth-guard';
import { BannerBar } from '@/components/banner-bar';
import { AnalyticsProvider } from '@/components/analytics-provider';

export const metadata: Metadata = {
  title: 'Certifine · Authenticator Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <AnalyticsProvider />
        <BannerBar />
        {/* The floating top-right language pill moved into /settings
            (founder 2026-08-12) — same call as was already made for the
            consumer portal. Chrome that hovers over content is for things you
            need on every screen; language is set once. */}
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
