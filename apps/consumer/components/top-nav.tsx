'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search, User, LogOut, Package, Store, MessageCircle, Wallet, UserCog, Menu, X,
} from 'lucide-react';
import { Button } from '@authentik/ui';
import { api, hasToken, clearToken, AUTH_CHANGE_EVENT } from '@/lib/api';

interface NavUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * L3 TopNav — sticky half-transparent header with wordmark + verbal navigation.
 *
 * Verbal nav (L3 spec from design-samples/final-L3/theme.css `.nav`):
 *   瀏覽 · 鑑定師 · 出售 · 信任機制
 *
 * Behavioural contract preserved from pre-L3 nav:
 *   - Sticky top + backdrop-blur (now stronger per L3 sh-2 shadow)
 *   - Auth state resolves via /me on token change
 *   - Unread + order badges poll every 15s while logged in
 *   - Account dropdown with 我的帳號 / 我的商品 / 我的訂單 / 我的錢包 / 登出
 *   - Avatar fallback letter (Founder ruling 2026-06-30)
 *   - Primary CTA "刊登出售" always visible
 *
 * Mobile (<md): verbal nav collapses into hamburger drawer.
 */

interface NavLink {
  href: string;
  label: string;
  matchPrefix?: string;
}

const NAV_LINKS: NavLink[] = [
  { href: '/browse', label: '瀏覽', matchPrefix: '/browse' },
  { href: '/sell', label: '出售', matchPrefix: '/sell' },
  // 鑑定師 nav removed 2026-07-05: authenticator directory 未 build，link 落 /about
  // anchor 對用戶嚟講太隱蔽 —— 想了解具名鑑定師制度可以喺「信任機制」入面睇。
  { href: '/about', label: '信任機制' },
];

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [orderBadge, setOrderBadge] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // ── Auth state ────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    function refresh() {
      if (!hasToken()) { if (active) setUser(null); return; }
      api.me()
        .then((me) => {
          if (active) setUser({ id: me.id, displayName: me.displayName, email: me.email, avatarUrl: me.avatarUrl });
        })
        .catch((e: any) => {
          if (e?.status === 401) clearToken();
          if (active) setUser(null);
        });
    }
    refresh();
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [pathname]);

  // Close dropdowns on route change
  useEffect(() => { setMenuOpen(false); setDrawerOpen(false); }, [pathname]);

  // Badges poll
  useEffect(() => {
    if (!user) { setUnreadCount(0); setOrderBadge(0); return; }
    let active = true;
    function poll() {
      api.conversations.unread().then((d) => { if (active) setUnreadCount(d.unread); }).catch(() => {});
      api.orders.badgeCount().then((d) => { if (active) setOrderBadge(d.count); }).catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  // Lock body scroll while mobile drawer open
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [drawerOpen]);

  function onLogout() {
    clearToken();
    setMenuOpen(false);
    router.push('/');
    router.refresh();
  }

  function isActive(link: NavLink): boolean {
    if (link.matchPrefix) return pathname?.startsWith(link.matchPrefix) ?? false;
    return pathname === link.href;
  }

  return (
    <header className="border-b border-line bg-white/85 backdrop-blur-[12px]">
      <div className="mx-auto flex h-[66px] max-w-container-l3 items-center justify-between gap-6 px-4 sm:px-6">
        {/* ── Left: wordmark ────────────────────────────────────────────── */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center text-[20px] font-extrabold tracking-[0.2em] text-ink">
            CERTI<span className="text-brand-600">·</span>FINE
          </Link>

          {/* ── Center: verbal nav (desktop) ────────────────────────── */}
          <nav className="hidden gap-7 text-sm text-neutral-text-muted md:flex">
            {NAV_LINKS.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.href}
                  href={link.href as any}
                  className={
                    active
                      ? 'font-semibold text-ink transition hover:text-ink'
                      : 'transition hover:text-ink'
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ── Right: badges + account + CTA (desktop) ─────────────────── */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search — icon-only (mobile too, since search is core) */}
          <Link
            href="/browse"
            className="rounded-lg p-2 text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink"
            aria-label="搜尋"
          >
            <Search className="h-4 w-4" />
          </Link>

          {/* Messages badge — only when logged in */}
          {user && (
            <Link
              href="/messages"
              className="relative rounded-lg p-2 text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink"
              aria-label="訊息"
            >
              <MessageCircle className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}

          {/* Orders link + badge — shown as verbal on desktop when logged in */}
          {user && (
            <Link
              href="/orders"
              className="relative hidden items-center rounded-lg p-2 text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink md:flex"
              aria-label="訂單"
            >
              <span className="text-sm">訂單</span>
              {orderBadge > 0 && (
                <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {orderBadge > 9 ? '9+' : orderBadge}
                </span>
              )}
            </Link>
          )}
          {user && (
            <Link
              href="/orders"
              className="relative rounded-lg p-2 text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink md:hidden"
              aria-label="訂單"
            >
              <Package className="h-4 w-4" />
              {orderBadge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
                  {orderBadge > 9 ? '9+' : orderBadge}
                </span>
              )}
            </Link>
          )}

          {/* Account or Login */}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-sm text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {user.avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    : user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[8rem] truncate font-medium sm:inline">
                  {user.displayName}
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-sh3"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-sm font-medium text-ink">{user.displayName}</p>
                    <p className="truncate text-xs text-neutral-text-hint">{user.email}</p>
                  </div>
                  <Link href={'/account/profile' as any} role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-text-muted hover:bg-surface-2 hover:text-ink">
                    <UserCog className="h-4 w-4 text-neutral-text-hint" />
                    我的帳號
                  </Link>
                  <Link href="/my-listings" role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-text-muted hover:bg-surface-2 hover:text-ink">
                    <Store className="h-4 w-4 text-neutral-text-hint" />
                    我的商品
                  </Link>
                  <Link href="/orders" role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-text-muted hover:bg-surface-2 hover:text-ink md:hidden">
                    <Package className="h-4 w-4 text-neutral-text-hint" />
                    我的訂單
                  </Link>
                  <Link href="/account/wallet" role="menuitem"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-text-muted hover:bg-surface-2 hover:text-ink">
                    <Wallet className="h-4 w-4 text-neutral-text-hint" />
                    我的錢包
                  </Link>
                  <button type="button" role="menuitem" onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-sm text-danger hover:bg-danger-soft">
                    <LogOut className="h-4 w-4" />
                    登出
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">登入</span>
            </Link>
          )}

          {/* Primary CTA */}
          <Link href="/sell" className="hidden sm:block">
            <Button size="sm">刊登出售</Button>
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-neutral-text-muted transition hover:bg-surface-2 hover:text-ink md:hidden"
            aria-label="開啟主目錄"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────────────
           Portal 去 <body>：<header> 有 backdrop-blur，會令入面嘅 `fixed`
           drawer 對住 header（66px）而唔係 viewport → 之前 drawer 被切到剩返
           頂條、下面透晒（founder 2026-07-20 mobile bug #6）。 */}
      {drawerOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-sh3">
            <div className="flex h-[66px] items-center justify-between border-b border-line px-4">
              <span className="text-[16px] font-extrabold tracking-[0.2em] text-ink">
                CERTI<span className="text-brand-600">·</span>FINE
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-neutral-text-muted hover:bg-surface-2"
                aria-label="關閉主目錄"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-1">
                {NAV_LINKS.map((link) => {
                  const active = isActive(link);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href as any}
                        onClick={() => setDrawerOpen(false)}
                        className={`block rounded-lg px-3 py-3 text-base transition ${
                          active
                            ? 'bg-verify-soft text-verify'
                            : 'text-neutral-text-muted hover:bg-surface-2 hover:text-ink'
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 border-t border-line pt-4">
                <Link
                  href="/sell"
                  onClick={() => setDrawerOpen(false)}
                  className="block"
                >
                  <Button className="w-full">刊登出售</Button>
                </Link>
              </div>
            </nav>
          </aside>
        </div>,
        document.body,
      )}
    </header>
  );
}
