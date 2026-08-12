'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Facebook, Instagram } from 'lucide-react';
import { getClientLocale, createT } from '@authentik/utils';
import { LanguageSwitcher } from '@authentik/ui/language-switcher';
import { VersionBadge } from '@authentik/ui';

// Cross-app link to authenticator portal — env-driven so production / public-test
// deployment can override (Lesson #4: never hardcode cross-app URLs).
const AUTHENTICATOR_URL =
  process.env.NEXT_PUBLIC_AUTHENTICATOR_URL ?? 'http://localhost:3001';

/**
 * Social accounts (founder 2026-08-12). Hardcoded on purpose: unlike the
 * cross-app URLs above, these are not environment-dependent — UAT and PROD
 * point at the same two public pages.
 */
const SOCIALS = [
  {
    href: 'https://www.facebook.com/profile.php?id=61592681945644',
    Icon: Facebook,
    labelKey: 'layout.footer.followFacebook',
  },
  {
    href: 'https://www.instagram.com/certifine.hk/',
    Icon: Instagram,
    labelKey: 'layout.footer.followInstagram',
  },
] as const;

/**
 * L3 Footer — 4-column layout with wordmark + disclaimer, plus 買賣 / 信任 / 關於
 * link columns. Matches design-samples/final-L3/home.html .footer spec.
 *
 * The platform-neutral disclaimer copy is legally significant (Lesson: L'Oréal
 * v eBay + CLAUDE.md information intermediary stance) and MUST NOT be trimmed.
 */
export function Footer() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);
  return (
    <footer className="mt-16 border-t border-line bg-surface-2 text-sm">
      <div className="mx-auto flex max-w-container-l3 flex-wrap justify-between gap-10 px-4 py-11 sm:px-6">
        {/* Col 1 — brand + disclaimer */}
        <div className="max-w-[280px]">
          <div className="text-[18px] font-extrabold tracking-[0.2em] text-ink">
            CERTI<span className="text-brand-600">·</span>FINE
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-text-hint">
            {_t('layout.footer.disclaimer')}
            {' '}© {new Date().getFullYear()} Certifine Ltd.
            {/* Build stamp. Date only — a real buyer reading a git sha under the
                logo reads it as a broken site; 「更新 08-12」 reads as upkeep.
                Clicking still copies the full sha (founder 2026-08-12). Note
                ConditionalFooter hides this footer on /messages /login
                /register, so `/api/version` stays the authoritative check. */}
            {' · '}<VersionBadge
              label="更新"
              showSha={false}
              className="text-[11px] text-neutral-text-hint hover:text-neutral-text-muted"
            />
          </p>
          <div className="mt-4 flex items-center gap-3">
            {SOCIALS.map(({ href, Icon, labelKey }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={_t(labelKey)}
                title={_t(labelKey)}
                className="text-neutral-text-hint transition hover:text-brand-600"
              >
                <Icon className="h-[18px] w-[18px]" />
              </a>
            ))}
          </div>
          <div className="mt-4">
            <LanguageSwitcher variant="select" />
          </div>
        </div>

        {/* Col 2 — 買賣 */}
        <div>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">
            {_t('layout.footer.colBuySell')}
          </h4>
          <div className="space-y-2 text-[13px]">
            <Link href="/browse" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.browse')}
            </Link>
            <Link href="/sell" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.sell')}
            </Link>
            <Link href={'/about#authenticators' as any} className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.authRegistry')}
            </Link>
          </div>
        </div>

        {/* Col 3 — 信任 */}
        <div>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">
            {_t('layout.footer.colTrust')}
          </h4>
          <div className="space-y-2 text-[13px]">
            <Link href="/about" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.authMechanism')}
            </Link>
            <Link href="/about" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.escrow')}
            </Link>
            <Link href="/about" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.disputes')}
            </Link>
          </div>
        </div>

        {/* Col 4 — 關於 */}
        <div>
          <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-text-hint">
            {_t('layout.footer.colAbout')}
          </h4>
          <div className="space-y-2 text-[13px]">
            <Link href="/terms" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.terms')}
            </Link>
            <Link href="/privacy" className="block text-neutral-text-muted transition hover:text-ink">
              {_t('layout.footer.privacy')}
            </Link>
            <a
              href="mailto:hello@certifine.hk"
              className="block text-neutral-text-muted transition hover:text-ink"
            >
              {_t('layout.footer.contact')}
            </a>
            <a
              href={AUTHENTICATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-neutral-text-muted transition hover:text-ink"
            >
              {_t('layout.footer.authPortal')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
