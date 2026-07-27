'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';

function readCookie(): 'zh' | 'en' {
  if (typeof document === 'undefined') return 'zh';
  const m = document.cookie.match(/(?:^|;\s*)lang=(\w+)/);
  if (m && (m[1] === 'en' || m[1] === 'zh')) return m[1] as 'zh' | 'en';
  return 'zh';
}

/**
 * Language switcher — shows the OPPOSITE language as a link.
 * Clicking navigates to /api/locale?lang=X&from=/current/path,
 * which sets the `lang` cookie server-side and redirects back.
 *
 * Zero JS onClick — just a plain <a> tag. Cannot fail.
 */
export function LanguageSwitcher() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');

  useEffect(() => {
    setLocale(readCookie());
  }, []);

  const nextLang = locale === 'zh' ? 'en' : 'zh';
  const label = locale === 'zh' ? 'EN' : '繁';
  const title = locale === 'zh' ? 'Switch to English' : '切換至繁體中文';

  // Build the toggle URL — will be resolved relative to the current app
  const from = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}`
    : '/';

  const href = `/api/locale?lang=${nextLang}&from=${encodeURIComponent(from)}`;

  return (
    <a
      href={href}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 py-1.5 text-[13px] font-semibold text-neutral-text-muted shadow-sh1 transition hover:border-verify hover:text-neutral-text no-underline"
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{label}</span>
    </a>
  );
}
