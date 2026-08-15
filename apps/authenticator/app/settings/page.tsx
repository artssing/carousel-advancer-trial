'use client';

/**
 * 鑑定師 Portal → 設定.
 *
 * Founder 2026-08-12: the language toggle used to float top-right, the same
 * placement that was already removed from the consumer portal. A portal that
 * people work in all day wants its preferences in one predictable place in the
 * nav, not a floating chip over the content — and language is the first of
 * several (notifications, handover defaults, timezone) that will live here.
 */
import { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@certifine/ui/language-switcher';
import { getClientLocale, createT } from '@certifine/web-kit';
import { AuthTopline, AuthContent } from '@/components/auth-topline';

export default function SettingsPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  return (
    <>
      <AuthTopline title={_t('authenticator.settings.title')} />
      <AuthContent>
        <p className="mb-6 text-[13px] text-neutral-text-muted">
          {_t('authenticator.settings.subtitle')}
        </p>

        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="text-[14px] font-semibold text-neutral-text">
            {_t('authenticator.settings.language.title')}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-text-hint">
            {_t('authenticator.settings.language.hint')}
          </p>
          <div className="mt-3">
            {/* `select` variant, not the pill: this is a settings row, and the
                pill's "switch to the other language" framing reads oddly once
                it is no longer floating chrome. */}
            <LanguageSwitcher variant="select" />
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-dashed border-line p-5">
          <h2 className="text-[14px] font-semibold text-neutral-text-muted">
            {_t('authenticator.settings.more.title')}
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-text-hint">
            {_t('authenticator.settings.more.hint')}
          </p>
        </section>
      </AuthContent>
    </>
  );
}
