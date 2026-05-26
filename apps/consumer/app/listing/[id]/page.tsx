'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardContent, TierPill, StarRating, Badge } from '@authentik/ui';
import {
  formatHKD,
  tierForPrice,
  calculateFees,
  type CategoryId,
} from '@authentik/utils';
import { ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { api, hasToken, ApiError } from '@/lib/api';

const ENUM_TO_CATEGORY: Record<string, CategoryId> = {
  HANDBAG: 'handbag',
  IPHONE: 'iphone',
  POKEMON_CARD: 'pokemon_card',
  WATCH: 'watch',
  SNEAKER: 'sneaker',
  DESIGNER_TOY: 'designer_toy',
  OTHER: 'other',
};

export default function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [listing, setListing] = useState<any | null>(null);
  const [authenticators, setAuthenticators] = useState<any[]>([]);
  const [selectedAuth, setSelectedAuth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listings
      .get(id)
      .then((l) => {
        setListing(l);
        if (l) {
          return api.authenticators.list(l.category).then(setAuthenticators);
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function onBuy() {
    setError(null);
    if (!hasToken()) {
      router.push('/login');
      return;
    }
    if (!listing) return;
    const tier = tierForPrice(listing.priceHKD);
    if (tier === 3 && !selectedAuth) {
      setError('Tier 3 商品請先揀一位鑑定師');
      return;
    }
    setBusy(true);
    try {
      const order = await api.orders.create({
        listingId: listing.id,
        authenticatorId: selectedAuth ?? undefined,
      });
      await api.payments.confirm(order.id);
      router.push('/orders');
      router.refresh();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Failed to create order');
    } finally {
      setBusy(false);
    }
  }

  if (error && !listing) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-red-600">{error}</div>;
  }
  if (!listing) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-slate-500">載入中…</div>;
  }

  const tier = tierForPrice(listing.priceHKD);
  const categoryId = ENUM_TO_CATEGORY[listing.category] ?? 'other';
  const fees = calculateFees(categoryId, listing.priceHKD);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square rounded-xl bg-slate-100" />
        <div>
          <Badge variant="brand">Listing #{listing.id.slice(0, 6)}</Badge>
          <h1 className="mt-2 font-display text-2xl font-bold">{listing.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <TierPill tier={tier} showDescription />
          </div>
          <p className="mt-4 text-3xl font-semibold">{formatHKD(listing.priceHKD)}</p>
          <p className="mt-3 text-sm text-slate-600">{listing.description}</p>
          <p className="mt-2 text-xs text-slate-500">賣家：{listing.seller?.displayName}</p>

          {tier === 3 && (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" /> Tier 3 強制鑑定
              </p>
              <p className="mt-1 text-emerald-800">
                此商品價格 ≥ HKD 10,000，必須揀一位平台註冊鑑定師驗證後才會放款。
              </p>
            </div>
          )}

          {(tier === 2 || tier === 3) && (
            <>
              <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">
                {tier === 3 ? '揀鑑定師（必選 1）' : '揀鑑定師（可選）'}
              </h3>
              <div className="space-y-2">
                {authenticators.length === 0 && (
                  <p className="text-xs text-slate-500">此品類暫無註冊鑑定師。</p>
                )}
                {authenticators.map((a) => (
                  <Card
                    key={a.id}
                    onClick={() => setSelectedAuth(a.id)}
                    className={`cursor-pointer transition ${selectedAuth === a.id ? 'border-brand-500 ring-2 ring-brand-200' : ''}`}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{a.displayName}</p>
                        <p className="text-xs text-slate-500">已鑑定 {a.completedCount} 件</p>
                      </div>
                      <StarRating value={a.starRating} size="sm" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <h4 className="mb-2 font-semibold">費用明細</h4>
            <div className="space-y-1 text-slate-700">
              <p className="flex justify-between">
                <span>商品價</span>
                <span>{formatHKD(fees.total)}</span>
              </p>
              <p className="flex justify-between">
                <span>鑑定費（賣家付）</span>
                <span className="text-slate-500">-{formatHKD(fees.authFee)}</span>
              </p>
              <p className="flex justify-between">
                <span>平台撮合費 1.5%（賣家付）</span>
                <span className="text-slate-500">-{formatHKD(fees.platformFee)}</span>
              </p>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <Button size="lg" className="mt-6 w-full" onClick={onBuy} disabled={busy}>
            {busy ? '處理中…' : '付款並啟動鑑定流程'}
          </Button>

          <p className="mt-2 text-center text-xs text-slate-400">
            未登入？<Link href="/login" className="text-brand-600 hover:underline">先登入</Link>
          </p>

          <div className="mt-4 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" /> SF 上門收件
            </span>
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> 鑑定不過全額退款
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
