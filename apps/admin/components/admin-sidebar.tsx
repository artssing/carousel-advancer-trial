'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users, ShieldCheck, ShoppingBag, AlertOctagon, Wallet, FileSearch, BarChart3, LayoutDashboard, FileCheck, LogOut, Settings, TrendingDown, Megaphone,
} from 'lucide-react';
import { clearToken } from '@/lib/api';

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/users/kyc', label: 'KYC Queue', icon: FileCheck },
  { href: '/banners', label: 'Emergency Banners', icon: Megaphone },
  { href: '/disputes', label: 'Disputes', icon: AlertOctagon },
  { href: '/authenticators', label: 'Authenticators', icon: ShieldCheck },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/finance', label: 'Finance', icon: Wallet },
  { href: '/content-review', label: 'Content Review', icon: FileSearch },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/price-changes', label: 'Price Changes', icon: TrendingDown },
  { href: '/platform-config', label: 'Platform Config', icon: Settings },
];

export function AdminSidebar() {
  const router = useRouter();
  function onLogout() {
    clearToken();
    router.push('/login');
  }
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 p-4">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-sm font-semibold text-slate-200">
        <ShieldCheck className="h-5 w-5 text-brand-400" />
        Admin Console
      </Link>
      <nav className="flex-1 space-y-1 text-sm">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href as any}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={onLogout}
        className="mt-4 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        登出
      </button>
      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
        <p className="font-medium text-slate-300">2FA required</p>
        <p className="mt-1">All actions are audit-logged.</p>
      </div>
    </aside>
  );
}
