'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken, AUTH_CHANGE_EVENT } from '@/lib/api';

/**
 * L3 shared account-area left navigation (220px sticky rail).
 * Matches design-samples/final-L3/account.html .side.
 * Used by account/profile, account/wallet, account/wallet/payouts.
 */
const NAV: { href: string; label: string; match?: (p: string) => boolean }[] = [
  { href: '/account/profile', label: '個人檔案' },
  { href: '/account/wallet', label: '錢包', match: (p) => p === '/account/wallet' },
  { href: '/account/wallet/methods', label: '提現方式' },
  { href: '/orders', label: '我的訂單' },
  { href: '/my-listings', label: '我的上架' },
];

export function AccountSidebar() {
  const pathname = usePathname() ?? '';
  const router = useRouter();

  function onLogout() {
    clearToken();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    router.push('/');
    router.refresh();
  }

  return (
    <aside className="chrome-follow lg:sticky lg:top-[calc(var(--chrome-h)+16px)]">
      <nav className="flex gap-1 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain lg:flex-col lg:gap-0.5">
        {NAV.map((n) => {
          const active = n.match ? n.match(pathname) : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href as any}
              className={`block shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-[14px] font-medium transition ${
                active
                  ? 'bg-verify-soft text-verify'
                  : 'text-neutral-text-muted hover:bg-surface-2 hover:text-neutral-text'
              }`}
            >
              {n.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onLogout}
          className="block shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-left text-[14px] font-medium text-danger transition hover:bg-danger-soft"
        >
          登出
        </button>
      </nav>
    </aside>
  );
}
