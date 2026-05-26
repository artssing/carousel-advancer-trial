import Link from 'next/link';
import { ShieldCheck, Inbox, LayoutDashboard, User, Coins, GraduationCap } from 'lucide-react';

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: '待鑑定 Inbox', icon: Inbox },
  { href: '/earnings', label: '收入', icon: Coins },
  { href: '/profile', label: '個人 / 店面 Profile', icon: User },
  { href: '/onboarding', label: '入網申請', icon: GraduationCap },
];

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2 font-semibold">
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <span className="text-sm">Authenticator Portal</span>
      </Link>
      <nav className="space-y-1 text-sm">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100"
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
