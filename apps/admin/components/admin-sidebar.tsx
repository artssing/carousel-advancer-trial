import Link from 'next/link';
import {
  Users,
  ShieldCheck,
  ShoppingBag,
  AlertOctagon,
  Wallet,
  FileSearch,
  BarChart3,
  LayoutDashboard,
} from 'lucide-react';

const nav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/authenticators', label: 'Authenticators', icon: ShieldCheck },
  { href: '/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/disputes', label: 'Disputes', icon: AlertOctagon },
  { href: '/finance', label: 'Finance', icon: Wallet },
  { href: '/content-review', label: 'Content Review', icon: FileSearch },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AdminSidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 p-4">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-sm font-semibold text-slate-200">
        <ShieldCheck className="h-5 w-5 text-brand-400" />
        Admin Console
      </Link>
      <nav className="space-y-1 text-sm">
        {nav.map((n) => {
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
        <p className="font-medium text-slate-300">2FA required</p>
        <p className="mt-1">All actions are audit-logged.</p>
      </div>
    </aside>
  );
}
