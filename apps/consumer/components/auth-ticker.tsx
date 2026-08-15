'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { getClientLocale, createT } from '@certifine/web-kit';

/**
 * L3 「實時鑑定」 ticker — floating trust bar shown on the home page hero.
 *
 * Founder ruling 2026-07-02: MUST use real data. Fake authenticity claims
 * would violate the L'Oréal v eBay information-intermediary stance
 * (see CLAUDE.md — 核心法律姿態).
 *
 * Design contract (design-samples/final-L3/home.html .ticker):
 *   - 14px rounded card, sh-2 floating shadow
 *   - 56px inner row, gap-6
 *   - Pulsing brand-400 dot next to uppercase "實時鑑定" label
 *   - Horizontal scroll of `title · authenticator ✓ 通過` items
 *
 * If the API returns no data yet (fresh install), we surface a small "示例"
 * fallback so the UI never collapses.
 */

interface Item {
  key: string;
  title: string;
  /** Live rows carry a category name from the API; the demo fallback carries a
   *  t() key instead, so the sample rows follow the locale too. */
  category?: string;
  categoryKey?: string;
  brand: string | null;
  authenticatorName: string;
  passedAt: string;
}

const FALLBACK: Item[] = [
  { key: 'demo-1', title: 'Chanel Classic Flap Medium', categoryKey: 'homepage.ticker.category.handbag', brand: 'Chanel', authenticatorName: 'Milan Leung', passedAt: '' },
  { key: 'demo-2', title: 'Rolex Submariner Date', categoryKey: 'homepage.ticker.category.watch', brand: 'Rolex', authenticatorName: 'ProCheck', passedAt: '' },
  { key: 'demo-3', title: 'Air Jordan 1 Chicago', categoryKey: 'homepage.ticker.category.sneaker', brand: 'Nike', authenticatorName: 'StepAuth', passedAt: '' },
];

export function AuthTicker() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const [items, setItems] = useState<Item[] | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    let alive = true;
    api.orders.recentPassed()
      .then((data) => {
        if (!alive) return;
        if (data.length > 0) {
          setItems(data);
          setIsFallback(false);
        } else {
          setItems(FALLBACK);
          setIsFallback(true);
        }
      })
      .catch(() => {
        if (alive) { setItems(FALLBACK); setIsFallback(true); }
      });
    // Refresh every 45s so the ticker stays live during a browsing session.
    const timer = setInterval(() => {
      api.orders.recentPassed()
        .then((data) => {
          if (!alive) return;
          if (data.length > 0) {
            setItems(data);
            setIsFallback(false);
          }
        })
        .catch(() => {});
    }, 45_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const display = items ?? FALLBACK;
  // Duplicate the list so the marquee reads seamlessly on wrap-around
  const doubled = [...display, ...display];

  return (
    <div className="mt-9 overflow-hidden rounded-[14px] border border-line bg-white shadow-sh2">
      <div className="flex h-14 items-center gap-6 px-5">
        {/* Label + pulsing dot */}
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">
          <span className="relative flex h-1.5 w-1.5 items-center justify-center">
            <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" />
          </span>
          {_t('homepage.ticker.title')}
        </div>

        {/* Marquee content */}
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee items-center gap-6 whitespace-nowrap text-[13px] text-neutral-text-muted">
            {doubled.map((it, i) => (
              <span key={`${it.key}-${i}`} className="flex items-center gap-2">
                <b data-user-content className="font-semibold text-neutral-text">{it.title}</b>
                <span className="text-neutral-text-hint">·</span>
                <span data-user-content>{it.authenticatorName}</span>
                <span className="flex items-center gap-1 font-bold text-verify">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  {_t('homepage.ticker.passed')}
                </span>
                <span className="mx-1 text-neutral-text-hint">•</span>
              </span>
            ))}
          </div>
        </div>

        {isFallback && (
          <span className="hidden shrink-0 rounded-full border border-line-2 bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-neutral-text-hint md:inline-block">
            {_t('homepage.ticker.sample')}
          </span>
        )}
      </div>
    </div>
  );
}
