import './globals.css';
import type { Metadata } from 'next';
import { AdminAuthGuard } from '@/components/auth-guard';
import { LayoutShell } from '@/components/layout-shell';

export const metadata: Metadata = {
  title: 'Certifine · Admin Console',
  robots: 'noindex,nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdminAuthGuard>
          <LayoutShell>{children}</LayoutShell>
        </AdminAuthGuard>
      </body>
    </html>
  );
}
