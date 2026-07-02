'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, Search, User, LogOut, Package, Store, MessageCircle, Wallet, UserCog } from 'lucide-react';
import { Button } from '@authentik/ui';
import { browseCategories } from '@authentik/utils';
import { api, hasToken, clearToken, AUTH_CHANGE_EVENT } from '@/lib/api';

// Top 3 sellable + browsable categories — derived from canonical registry.
const TOP_NAV_CATEGORIES = browseCategories().filter((c) => c.enabledInSell).slice(0, 3);

interface NavUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [orderBadge, setOrderBadge] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ── Resolve current auth state (token → /me) ──────────────────────────────
  useEffect(() => {
    let active = true;

    function refresh() {
      if (!hasToken()) {
        if (active) setUser(null);
        return;
      }
      api
        .me()
        .then((me) => {
          if (active) setUser({ id: me.id, displayName: me.displayName, email: me.email, avatarUrl: me.avatarUrl });
        })
        .catch((e: any) => {
          if (e?.status === 401) clearToken();
          if (active) setUser(null);
        });
    }

    refresh();
    // update on login/logout (same tab) and across tabs
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [pathname]);

  // close the account dropdown when navigating
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Poll unread messages + order action-required count every 15 seconds
  useEffect(() => {
    if (!user) { setUnreadCount(0); setOrderBadge(0); return; }
    let active = true;
    function poll() {
      api.conversations.unread()
        .then((d) => { if (active) setUnreadCount(d.unread); })
        .catch(() => {});
      api.orders.badgeCount()
        .then((d) => { if (active) setOrderBadge(d.count); })
        .catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  // close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  function onLogout() {
    clearToken();
    setMenuOpen(false);
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          <span>Authentik HK</span>
        </Link>
        <nav className="ml-6 hidden gap-4 text-sm text-slate-600 md:flex">
          <Link href="/browse">瀏覽</Link>
          {TOP_NAV_CATEGORIES.map((c) => (
            <Link key={c.id} href={`/browse?cat=${c.id}`}>{c.shortLabel}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/browse" className="rounded-lg p-2 hover:bg-slate-100" aria-label="搜尋">
            <Search className="h-4 w-4" />
          </Link>
          <Link href="/messages" className="relative rounded-lg p-2 hover:bg-slate-100" aria-label="訊息">
            <MessageCircle className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <Link href="/orders" className="relative rounded-lg p-2 hover:bg-slate-100" aria-label="買賣訂單">
            <Package className="h-4 w-4" />
            {orderBadge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {orderBadge > 9 ? '9+' : orderBadge}
              </span>
            )}
          </Link>

          {user ? (
            // ── Logged in: show name + account dropdown ───────────────────────
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-sm hover:bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {user.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    : user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[8rem] truncate font-medium text-slate-700 sm:inline">
                  {user.displayName}
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-800">{user.displayName}</p>
                    <p className="truncate text-xs text-slate-400">{user.email}</p>
                  </div>
                  <Link
                    href={'/account/profile' as any}
                    role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <UserCog className="h-4 w-4 text-slate-400" />
                    我的帳號
                  </Link>
                  <Link
                    href="/my-listings"
                    role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Store className="h-4 w-4 text-slate-400" />
                    我的商品
                  </Link>
                  <Link
                    href="/orders"
                    role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Package className="h-4 w-4 text-slate-400" />
                    我的訂單
                  </Link>
                  <Link
                    href="/account/wallet"
                    role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Wallet className="h-4 w-4 text-slate-400" />
                    我的錢包
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    登出
                  </button>
                </div>
              )}
            </div>
          ) : (
            // ── Logged out: link to login ─────────────────────────────────────
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">登入</span>
            </Link>
          )}

          <Link href="/sell">
            <Button size="sm">上架</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
