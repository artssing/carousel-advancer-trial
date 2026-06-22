'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, Inbox, LayoutDashboard, User, Coins, LogOut, MessageCircle, MapPin } from 'lucide-react';
import { api, clearToken, hasToken } from '@/lib/api';

const nav = [
  { href: '/', label: '概覽', icon: LayoutDashboard, mobile: true },
  { href: '/inbox', label: '待鑑定', icon: Inbox, mobile: true },
  { href: '/messages', label: '訊息', icon: MessageCircle, showBadge: true, mobile: true },
  { href: '/earnings', label: '收入', icon: Coins, mobile: true },
  // Branches + profile: desktop sidebar only; mobile users use top-right menu
  // (avoiding bottom-nav overcrowding > 5 tabs)
  { href: '/branches', label: '分店地址', icon: MapPin, mobile: false },
  { href: '/profile', label: '店面 Profile', icon: User, mobile: true },
];

interface SidebarProps {
  authProfile: {
    displayName: string;
    storeName?: string;
    starRating: number;
    completedCount: number;
    status: string;
    eAndOInsuranceExpiresAt?: string | null;
  } | null;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

function useUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!hasToken()) return;
    let active = true;
    function poll() {
      api.conversations.unread()
        .then((d) => { if (active) setCount(d.unread); })
        .catch(() => {});
    }
    poll();
    const t = setInterval(poll, 15000);
    return () => { active = false; clearInterval(t); };
  }, []);
  return count;
}

export function Sidebar({ authProfile }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const unread = useUnreadCount();

  // E&O insurance warning
  const eAndOWarning = (() => {
    if (!authProfile?.eAndOInsuranceExpiresAt) return null;
    const daysLeft = Math.ceil(
      (new Date(authProfile.eAndOInsuranceExpiresAt).getTime() - Date.now()) / (86400000)
    );
    if (daysLeft <= 0) return { text: '保險已過期', color: 'bg-red-500' };
    if (daysLeft <= 30) return { text: `保險 ${daysLeft} 日後到期`, color: 'bg-amber-500' };
    return null;
  })();

  function onLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="border-b border-slate-100 p-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <span className="text-sm">鑑定師 Portal</span>
        </Link>
      </div>

      {authProfile && (
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-medium text-slate-700">{authProfile.storeName ?? authProfile.displayName}</p>
          <p className="text-xs text-slate-500">{'★'.repeat(Math.min(authProfile.starRating, 5))} · {authProfile.completedCount} 件</p>
          {eAndOWarning && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${eAndOWarning.color}`} />
              <span className="text-[10px] font-medium text-amber-700">{eAndOWarning.text}</span>
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 space-y-0.5 p-2 text-sm">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = isActive(pathname, n.href);
          const showBadge = (n as any).showBadge && unread > 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition
                ${active
                  ? 'border-l-[3px] border-brand-600 bg-brand-50 font-medium text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
              <span className="flex-1">{n.label}</span>
              {showBadge && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-2">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-500 transition hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          登出
        </button>
      </div>
    </aside>
  );
}

/** Mobile bottom tab bar — shown below md breakpoint */
export function MobileBottomNav() {
  const pathname = usePathname();
  const unread = useUnreadCount();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-200 bg-white md:hidden">
      {nav.filter((n) => (n as any).mobile !== false).map((n) => {
        const Icon = n.icon;
        const active = isActive(pathname, n.href);
        const showBadge = (n as any).showBadge && unread > 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition
              ${active ? 'text-brand-600' : 'text-slate-400'}`}
          >
            <Icon className={`h-5 w-5 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
            {n.label}
            {showBadge && (
              <span className="absolute right-3 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
