'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Inbox, LayoutDashboard, User, Coins, LogOut, MessageCircle, MapPin, ScanLine,
} from 'lucide-react';
import { api, clearToken, hasToken } from '@/lib/api';

/**
 * L3 鑑定師 Portal chrome — deep-indigo gradient sidebar + dark mobile bottom nav.
 * Source: design-samples/authenticator-L3/theme.css (`.sidebar` + `.snav`).
 *
 * Badge color convention (founder ruling 2026-07-05):
 *   - Ordinary nav badge (e.g. inbox count): `authBrand-300` (light indigo,
 *     brand-consistent, feels "just count").
 *   - IM unread badge: `red-500` (screaming red = urgency, breaks brand color).
 *
 * E&O insurance warning moved OUT of the sidebar into main content (per
 * coordinator note: amber alert on dark indigo bg is visually jarring +
 * legally-sensitive content shouldn't be truncated inside chrome).
 */
const nav = [
  { href: '/', label: '概覽', icon: LayoutDashboard, mobile: true, badge: 0 },
  { href: '/inbox', label: '待鑑定', icon: Inbox, mobile: true, badge: 0 },
  { href: '/scan', label: 'QR 交收', icon: ScanLine, mobile: true, badge: 0 },
  { href: '/messages', label: '訊息', icon: MessageCircle, showUnread: true, mobile: true, badge: 0 },
  { href: '/earnings', label: '收入', icon: Coins, mobile: true, badge: 0 },
  // Branches + profile: desktop sidebar only (avoiding bottom-nav overcrowding > 5 tabs)
  { href: '/branches', label: '分店地址', icon: MapPin, mobile: false, badge: 0 },
  { href: '/profile', label: '店面 Profile', icon: User, mobile: true, badge: 0 },
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

  function onLogout() {
    clearToken();
    router.push('/login');
  }

  const initial = (authProfile?.displayName ?? '?').slice(0, 1);

  return (
    <aside
      className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col bg-gradient-to-b from-authBrand-900 to-authBrand-950 px-4 py-5 text-white md:flex"
    >
      {/* Brand — matches .sidebar .brand */}
      <Link href="/" className="block px-2 pb-1 text-[18px] font-extrabold tracking-[0.18em]">
        AUTHEN<span className="text-authBrand-300">·</span>TIK
      </Link>
      <p className="px-2 pb-5 text-[11px] uppercase tracking-[0.1em] text-authBrand-200/70">
        鑑定師 Portal
      </p>

      {/* Nav — .snav */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {nav.map((n) => {
          const Icon = n.icon;
          const active = isActive(pathname, n.href);
          const showUnread = (n as any).showUnread && unread > 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] font-medium transition ${
                active
                  ? 'bg-authBrand-500 text-white shadow-auth-btn'
                  : 'text-authBrand-200/80 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
              <span className="flex-1">{n.label}</span>
              {showUnread && (
                // IM unread → red for urgency (founder ruling)
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-extrabold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Profile card at bottom — .sidebar .me */}
      {authProfile && (
        <div className="mt-2 flex items-center gap-2.5 border-t border-white/10 px-2 pt-3">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white/15 text-[14px] font-bold">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">
              {authProfile.storeName ?? authProfile.displayName}
            </p>
            <p className="text-[11px] text-authBrand-200/70">
              {'★'.repeat(Math.min(authProfile.starRating, 5))} · 在職
            </p>
          </div>
          <button
            onClick={onLogout}
            title="登出"
            className="rounded p-1 text-authBrand-200/70 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}

/**
 * L3 Mobile bottom nav — dark indigo to match desktop sidebar (brand continuity).
 * Active tab uses authBrand-300 (light indigo) which reads well on the dark bg.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const unread = useUnreadCount();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex bg-gradient-to-b from-authBrand-900 to-authBrand-950 shadow-[0_-8px_24px_-8px_rgba(38,48,94,0.5)] md:hidden">
      {nav.filter((n) => (n as any).mobile !== false).map((n) => {
        const Icon = n.icon;
        const active = isActive(pathname, n.href);
        const showUnread = (n as any).showUnread && unread > 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
              active ? 'text-white' : 'text-authBrand-200/70'
            }`}
          >
            <Icon className="h-5 w-5" />
            {n.label}
            {active && (
              <span className="absolute -top-0.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-b-full bg-authBrand-300" />
            )}
            {showUnread && (
              <span className="absolute right-3 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-extrabold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
