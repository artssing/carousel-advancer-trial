import './globals.css';
import type { Metadata } from 'next';
import { AdminAuthGuard } from '@/components/auth-guard';
import { LayoutShell } from '@/components/layout-shell';
import { LanguageSwitcher } from '@authentik/ui/language-switcher';

export const metadata: Metadata = {
  title: 'Certifine · Admin Console',
  robots: 'noindex,nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="fixed right-4 top-4 z-50">
          <LanguageSwitcher />
        </div>
        <AdminAuthGuard>
          <LayoutShell>{children}</LayoutShell>
        </AdminAuthGuard>
      </body>
    </html>
  );
}
