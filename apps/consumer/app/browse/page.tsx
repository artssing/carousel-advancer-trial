'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, TierPill, Input } from '@authentik/ui';
import { formatHKD, CATEGORIES, tierForPrice } from '@authentik/utils';
import { api } from '@/lib/api';

const CATEGORY_TO_ENUM: Record<string, string> = {
  handbag: 'HANDBAG',
  iphone: 'IPHONE',
  pokemon_card: 'POKEMON_CARD',
};

export default function BrowsePage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.listings
      .list(category ? CATEGORY_TO_ENUM[category] : undefined)
      .then(setListings)
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <Input placeholder="搜尋商品、品牌、型號…" className="md:max-w-md" />
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => setCategory(null)}
            className={`rounded-full border px-3 py-1 ${!category ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
          >
            全部
          </button>
          {Object.values(CATEGORIES)
            .filter((c) => c.enabledInMvp && c.id !== 'other')
            .map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`rounded-full border px-3 py-1 ${category === c.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
              >
                {c.labelZh}
              </button>
            ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : listings.length === 0 ? (
        <p className="text-sm text-slate-500">未有商品。請先 seed 資料庫，或登入後 <Link href="/sell" className="text-brand-600 hover:underline">上架</Link>。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`}>
              <Card className="overflow-hidden transition hover:shadow-md">
                <div className="aspect-square bg-slate-100" />
                <CardContent className="space-y-2 p-3">
                  <TierPill tier={tierForPrice(l.priceHKD) as 1 | 2 | 3} />
                  <h3 className="line-clamp-2 text-sm font-medium">{l.title}</h3>
                  <p className="text-base font-semibold">{formatHKD(l.priceHKD)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
