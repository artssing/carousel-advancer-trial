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
 *
 * ⚠️ `from` MUST be resolved when the link is clicked, not when it is rendered.
 * The href is first computed during SSR, where `window` does not exist and
 * currentPath() falls back to `/`. It only gets corrected if the component
 * re-renders on the client — and the mount effect only changes state when the
 * cookie is `en`, because `zh` is already the initial state. So on a zh page
 * (the default) the link kept its SSR value and threw the user to `/` from
 * wherever they were, losing their page. Found on the authenticator portal
 * 2026-08-12; the consumer footer never showed it because its `select` variant
 * builds the URL inside onChange, i.e. at click time. The href stays as a
 * no-JS fallback.
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
            // Built at click time, which is why this variant never had the bug.
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

  // Transparent + currentColor, NOT bg-white: this component is mounted in all
  // three portals, and a hardcoded light chip renders as a white blob on the
  // admin dark-ops layout (found by QA 2026-08-02). A shared component must
  // inherit its host's theme, not impose the consumer's.
  return (
    <a
      href={localeHref(nextLang)}
      onClick={(e) => {
        // Resolve the path NOW, not at render — see the note above the component.
        e.preventDefault();
        window.location.href = localeHref(nextLang);
      }}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-transparent px-3 py-1.5 text-[13px] font-semibold opacity-70 transition hover:opacity-100 no-underline"
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{label}</span>
    </a>
  );
}
