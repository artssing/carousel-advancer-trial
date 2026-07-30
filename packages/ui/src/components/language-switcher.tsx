'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';

function readCookie(): 'zh' | 'en' {
  if (typeof document === 'undefined') return 'zh';
  const m = document.cookie.match(/(?:^|;\s*)lang=(\w+)/);
  if (m && (m[1] === 'en' || m[1] === 'zh')) return m[1] as 'zh' | 'en';
  return 'zh';
}

function currentPath(): string {
  return typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}`
    : '/';
}

function localeHref(lang: 'zh' | 'en'): string {
  return `/api/locale?lang=${lang}&from=${encodeURIComponent(currentPath())}`;
}

interface Props {
  /**
   * `button` (default) — bordered pill toggle to the OPPOSITE language.
   *   Used top-right in authenticator / admin chrome.
   * `select` — subtle Carousell-style dropdown listing both languages, meant
   *   to sit inline among footer links (quiet, no heavy border/shadow).
   */
  variant?: 'button' | 'select';
}

/**
 * Language switcher. Navigates to /api/locale?lang=X&from=/current/path,
 * which sets the `lang` cookie server-side and redirects back.
 */
export function LanguageSwitcher({ variant = 'button' }: Props) {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    setLocale(readCookie());
  }, []);

  if (variant === 'select') {
    return (
      <div className="inline-flex items-center gap-1.5 text-neutral-text-hint">
        <Languages className="h-3.5 w-3.5" aria-hidden />
        <select
          aria-label="Language / 語言"
          value={locale}
          onChange={(e) => {
            window.location.href = localeHref(e.target.value as 'zh' | 'en');
          }}
          className="cursor-pointer border-0 bg-transparent py-0.5 pr-4 text-[13px] text-neutral-text-muted outline-none transition hover:text-ink focus:text-ink"
        >
          <option value="zh">繁體中文</option>
          <option value="en">English</option>
        </select>
      </div>
    );
  }

  // Default: pill toggle to the opposite language. Zero-JS <a> — cannot fail.
  const nextLang = locale === 'zh' ? 'en' : 'zh';
  const label = locale === 'zh' ? 'EN' : '繁';
  const title = locale === 'zh' ? 'Switch to English' : '切換至繁體中文';

  return (
    <a
      href={localeHref(nextLang)}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 py-1.5 text-[13px] font-semibold text-neutral-text-muted shadow-sh1 transition hover:border-verify hover:text-neutral-text no-underline"
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{label}</span>
    </a>
  );
}
