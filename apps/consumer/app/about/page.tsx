import Link from 'next/link';
import { cookies } from 'next/headers';
import { detectLocale, createT } from '@certifine/web-kit';
import { ShieldCheck, Users, Gavel, Coins, Layers } from 'lucide-react';

export const metadata = { title: '關於我們 · Certifine' }; // static <title>; locale-aware metadata is a separate job

export default function AboutPage() {
  // Server component — locale comes from the request cookie.
  const _t = createT(detectLocale(cookies().get('lang')?.value));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-700 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900">{_t('about.heading')}</h1>
        <p className="mt-2 text-sm text-slate-500">{_t('about.lastUpdated')}</p>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> {_t('about.whatWeAre.heading')}
        </h2>
        <p className="text-sm leading-relaxed">
          {_t('about.what.p1')}
        </p>
        <p className="text-sm leading-relaxed">
          {_t('about.what.p2.prefix')}
          <strong className="text-slate-900">{_t('about.what.p2.term')}</strong>
          {_t('about.what.p2.suffix')}
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Layers className="h-5 w-5 text-brand-600" /> {_t('about.tierSystem.heading')}
        </h2>
        <p className="text-sm leading-relaxed">
          {_t('about.tierSystem.subtitle')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tier 1</p>
            <p className="mt-1 text-xs text-slate-500">&lt; HKD 1,000</p>
            <p className="mt-2 text-xs leading-relaxed">{_t('about.tierSystem.tier1.description')}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tier 2</p>
            <p className="mt-1 text-xs text-slate-500">HKD 1,000 – 9,999</p>
            <p className="mt-2 text-xs leading-relaxed">{_t('about.tierSystem.tier2.description')}</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tier 3</p>
            <p className="mt-1 text-xs text-slate-500">≥ HKD 10,000</p>
            <p className="mt-2 text-xs leading-relaxed">{_t('about.tierSystem.tier3.description')}</p>
          </div>
        </div>
      </section>

      {/* Anchor target for top-nav 「鑑定師」 link (see top-nav.tsx NAV_LINKS).
          Also given `scroll-mt-*` so the sticky chrome doesn't cover the heading
          when the browser jumps to the anchor. */}
      <section id="authenticators" className="mt-6 scroll-mt-[calc(var(--chrome-h)+16px)] space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Users className="h-5 w-5 text-brand-600" /> {_t('about.authenticators.heading')}
        </h2>
        <p className="text-sm leading-relaxed">
          {_t('about.authenticators.intro')}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>{_t('about.authenticators.list.1')}</li>
          <li>{_t('about.authenticators.list.2')}</li>
          <li>{_t('about.authenticators.list.3')}</li>
          <li>{_t('about.authenticators.list.4')}</li>
        </ul>
        <p className="text-sm leading-relaxed">
          {_t('about.authenticators.responsibility')}
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Coins className="h-5 w-5 text-brand-600" /> {_t('about.fees.heading')}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li><strong>{_t('sell.rail.platformFee')}</strong>{_t('about.fees.platform')}</li>
          <li><strong>{_t('about.fees.authLabel')}</strong>{_t('about.fees.auth')}</li>
          <li><strong>{_t('about.fees.escrowLabel')}</strong>{_t('about.fees.escrow')}</li>
        </ul>
        <p className="text-sm leading-relaxed text-slate-500">
          {_t('about.fees.disclaimer')}
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Gavel className="h-5 w-5 text-brand-600" /> {_t('about.legal.heading')}
        </h2>
        <p className="text-sm leading-relaxed">
          {_t('about.legal.position')}
        </p>
        <p className="text-sm leading-relaxed">
          {_t('about.legal.compliance')}
          <Link href="/terms" className="ml-1 text-brand-600 hover:underline">{_t('about.legal.termsLink')}</Link> {_t('about.legal.and')}
          <Link href="/privacy" className="ml-1 text-brand-600 hover:underline">{_t('about.legal.privacyLink')}</Link>{_t('about.legal.period')}
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">{_t('about.contact.heading')}</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {_t('about.contact.generalLabel')}<a href="mailto:hello@certifine.hk" className="text-brand-600 hover:underline">hello@certifine.hk</a><br />
          {_t('about.contact.disputesLabel')}<a href="mailto:disputes@certifine.hk" className="text-brand-600 hover:underline">disputes@certifine.hk</a><br />
          {_t('about.contact.privacyLabel')}<a href="mailto:privacy@certifine.hk" className="text-brand-600 hover:underline">privacy@certifine.hk</a>
        </p>
      </section>
    </main>
  );
}
