import './globals.css';
import type { Metadata } from 'next';
import { AuthGuard } from '@/components/auth-guard';
import { BannerBar } from '@/components/banner-bar';
import { AnalyticsProvider } from '@/components/analytics-provider';
import { LanguageSwitcher } from '@authentik/ui/language-switcher';

export const metadata: Metadata = {
  title: 'Certifine · Authenticator Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <AnalyticsProvider />
        <BannerBar />
        <div className="fixed right-4 top-4 z-50">
          <LanguageSwitcher />
        </div>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
