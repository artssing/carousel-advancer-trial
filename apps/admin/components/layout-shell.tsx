'use client';

import { usePathname } from 'next/navigation';
import { AdminSidebar } from './admin-sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname?.startsWith('/login');
  if (isLogin) return <>{children}</>;
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
