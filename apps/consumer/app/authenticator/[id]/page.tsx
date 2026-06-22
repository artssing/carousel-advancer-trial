'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge, StarRating } from '@authentik/ui';
import { formatHKD, CATEGORIES, type CategoryId } from '@authentik/utils';
import { MapPin, Clock, ShieldCheck, Award, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';

const ENUM_TO_CATEGORY: Record<string, CategoryId> = {
  HANDBAG: 'handbag',
  IPHONE: 'iphone',
  POKEMON_CARD: 'pokemon_card',
  WATCH: 'watch',
  SNEAKER: 'sneaker',
  DESIGNER_TOY: 'designer_toy',
  OTHER: 'other',
};

function categoryLabel(enumVal: string): string {
  const id = ENUM_TO_CATEGORY[enumVal];
  return id ? CATEGORIES[id].labelZh : enumVal;
}

export default function AuthenticatorProfilePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [a, setA] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.authenticators
      .get(id)
      .then(setA)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-red-600">{error}</div>;
  }
  if (!a) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-slate-500">載入中…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-4 w-4" /> 返回
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold">{a.displayName}</h1>
              {a.storeName && <p className="mt-0.5 text-sm text-slate-500">{a.storeName}</p>}
              <div className="mt-2 flex items-center gap-2">
                <StarRating value={a.avgReviewRating ?? a.starRating} size="sm" />
                <span className="text-sm text-slate-500">
                  {(a.avgReviewRating ?? a.starRating).toFixed(1)}（{a.reviewCount} 個評價）
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">鑑定費率</p>
              <p className="text-lg font-semibold text-brand-700">
                {Math.round(a.feeRatePct * 1000) / 10}%
              </p>
              <p className="text-xs text-slate-500">最低 {formatHKD(a.feeMinHKD)}</p>
            </div>
          </div>

          {a.bio && <p className="mt-4 text-sm text-slate-600">{a.bio}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {(a.categories ?? []).map((c: string) => (
              <Badge key={c} variant="brand">
                {categoryLabel(c)}
              </Badge>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="已鑑定" value={`${a.completedCount} 件`} icon={Award} />
            <Stat label="爭議率" value={`${Math.round((a.disputeRate ?? 0) * 1000) / 10}%`} icon={ShieldCheck} />
            {a.yearsExperience != null && (
              <Stat label="年資" value={`${a.yearsExperience} 年`} icon={Award} />
            )}
            {a.acceptsMeetup && <Stat label="面交" value="接受" icon={MapPin} />}
          </div>

          {(a.locationAddress || a.businessHours) && (
            <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {a.locationAddress && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {a.locationAddress}
                  {a.district && <span className="text-slate-400">（{a.district}）</span>}
                </p>
              )}
              {a.businessHours && (
                <p className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {a.businessHours}
                </p>
              )}
            </div>
          )}

          {a.eAndOInsuranceExpiresAt && (
            <p className="mt-3 text-xs text-slate-400">
              已購 E&O 專業責任保險（有效期至 {new Date(a.eAndOInsuranceExpiresAt).toLocaleDateString('zh-HK')}）
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reviews */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">買家評價（{a.reviewCount}）</h2>
      {a.reviews?.length === 0 ? (
        <p className="text-sm text-slate-500">暫無評價。</p>
      ) : (
        <div className="space-y-3">
          {a.reviews?.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{r.buyerName}</p>
                  <StarRating value={r.rating} size="sm" />
                </div>
                {r.comment && <p className="mt-1.5 text-sm text-slate-600">{r.comment}</p>}
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString('zh-HK')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Active listings (authenticator selling) */}
      {a.activeListings?.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-semibold">佢賣緊嘅商品</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {a.activeListings.map((l: any) => (
              <Link key={l.id} href={`/listing/${l.id}`} className="group">
                <Card className="overflow-hidden transition group-hover:shadow-md">
                  <div className="aspect-square overflow-hidden bg-slate-100">
                    {l.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.images[0]} alt={l.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">暫無圖片</div>
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="truncate text-sm font-medium group-hover:text-brand-700">{l.title}</p>
                    <p className="mt-1 text-sm font-semibold">{formatHKD(l.priceHKD)}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Award }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5">
      <Icon className="h-4 w-4 text-slate-400" />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
