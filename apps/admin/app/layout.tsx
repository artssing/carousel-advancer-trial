import './globals.css';
import type { Metadata } from 'next';
import { AdminSidebar } from '@/components/admin-sidebar';

export const metadata: Metadata = {
  title: 'Authentik HK · Admin Console',
  robots: 'noindex,nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <AdminSidebar />
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
