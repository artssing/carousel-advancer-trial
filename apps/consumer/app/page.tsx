'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, CardContent, TierPill, Badge } from '@authentik/ui';
import { ShieldCheck, Camera, Coins, Search } from 'lucide-react';
import { formatHKD, tierForPrice } from '@authentik/utils';
import { api } from '@/lib/api';

export default function HomePage() {
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    api.listings.list().then(setListings).catch(() => setListings([]));
  }, []);

  const featured = listings.slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-14 text-white">
        <div className="max-w-2xl">
          <Badge variant="gold" className="mb-4">
            <ShieldCheck className="mr-1 h-3 w-3" /> 由業界星級鑑定師驗證
          </Badge>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            香港首個 <span className="text-yellow-300">保證真貨</span> 二手交易平台
          </h1>
          <p className="mt-4 text-lg text-brand-50">
            手袋、iPhone、Pokemon Card —— HKD 10,000 以上必經第三方實體鑑定，鑑定錯誤由鑑定方按合約 + E&O 保險賠付。
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/browse">
              <Button size="lg" variant="secondary">
                <Search className="mr-2 h-4 w-4" /> 開始瀏覽
              </Button>
            </Link>
            <Link href="/sell">
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-white/10"
              >
                我要賣
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <ShieldCheck className="h-8 w-8 text-brand-600" />
            <div>
              <h3 className="font-semibold">3 級鑑定制</h3>
              <p className="mt-1 text-sm text-slate-600">
                按成交價自動分級 · 萬元以上強制鑑定 · 買家可付費選 2 位鑑定師複核
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <Camera className="h-8 w-8 text-brand-600" />
            <div>
              <h3 className="font-semibold">全程錄影 + 電子簽名</h3>
              <p className="mt-1 text-sm text-slate-600">
                每單鑑定有片有報告 · 鑑定師署名 · 可作為日後追討證據
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <Coins className="h-8 w-8 text-brand-600" />
            <div>
              <h3 className="font-semibold">Escrow 託管付款</h3>
              <p className="mt-1 text-sm text-slate-600">
                資金經持牌支付夥伴託管 · 鑑定通過 + 買家收貨後才放款給賣家
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold">精選商品</h2>
          <Link href="/browse" className="text-sm text-brand-600 hover:underline">
            查看全部 →
          </Link>
        </div>
        {featured.length === 0 ? (
          <p className="text-sm text-slate-500">未有商品。請執行 API seed 或先上架。</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {featured.map((l) => {
              const tier = tierForPrice(l.priceHKD) as 1 | 2 | 3;
              return (
                <Link key={l.id} href={`/listing/${l.id}`}>
                  <Card className="overflow-hidden transition hover:shadow-md">
                    <div className="aspect-[4/3] bg-slate-100" />
                    <CardContent className="space-y-2 p-4">
                      <TierPill tier={tier} />
                      <h3 className="line-clamp-2 text-sm font-medium">{l.title}</h3>
                      <p className="text-lg font-semibold text-slate-900">
                        {formatHKD(l.priceHKD)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
