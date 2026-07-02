import './globals.css';
import type { Metadata } from 'next';
import { AuthGuard } from '@/components/auth-guard';
import { BannerBar } from '@/components/banner-bar';

export const metadata: Metadata = {
  title: 'Authentik HK · Authenticator Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>
        <BannerBar />
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
