'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, TierPill, Badge } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { tierForPrice } from '@authentik/utils';
import { ShieldCheck, Package, Calendar, Store } from 'lucide-react';
import { api, hasToken, clearToken } from '@/lib/api';

interface SellerProfile {
  id: string;
  displayName: string;
  kycVerified: boolean;
  joinedAt: string;
  activeListingsCount: number;
  soldAsSellerCount: number;
  totalListings: number;
  authenticator: { id: string; storeName?: string; starRating: number; completedCount: number } | null;
  avgRating: number | null;
  reviewCount: number;
}

function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} 加入`;
}

export default function SellerPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const id = params.id;
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reviews, setReviews] = useState<{ total: number; averageRating: number | null; items: any[] } | null>(null);

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    Promise.all([
      api.users.sellerProfile(id),
      api.users.sellerListings(id, 24, 0),
      api.users.reviews(id),
    ])
      .then(([p, l, r]) => {
        setProfile(p);
        setListings(l.items);
        setTotal(l.total);
        setReviews(r);
      })
      .catch((e: any) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); return; }
        setError(e?.message ?? '無法載入賣家資料');
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-red-600">{error ?? '找不到賣家'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* ── Header card ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold text-slate-900">
                {profile.displayName}
              </h1>
              {profile.kycVerified && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
                  title="KYC 已通過實名驗證 — 平台不就貨品真偽作擔保"
                >
                  <ShieldCheck className="h-3 w-3" />
                  KYC 驗證
                </span>
              )}
              {profile.authenticator && (
                <Link href={`/authenticator/${profile.authenticator.id}`}>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100">
                    亦為鑑定師 →
                  </span>
                </Link>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {joinedLabel(profile.joinedAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Package className="h-3 w-3" />
                已售出 {profile.soldAsSellerCount} 件
              </span>
              <span className="inline-flex items-center gap-1">
                <Store className="h-3 w-3" />
                上架中 {profile.activeListingsCount} 件
              </span>
            </p>
            {/* Reputation — algorithm-derived, factual only */}
            <p className="mt-2 text-[11px] text-slate-400">
              {profile.reviewCount === 0
                ? '暫無買家評價'
                : `★ ${profile.avgRating?.toFixed(1)} · ${profile.reviewCount} 個評價`}
            </p>
          </div>
        </div>
        {/* Neutrality disclaimer */}
        <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-relaxed text-slate-400">
          以上資料由平台演算法統計，不構成任何保證。Authentik 為中立交易平台，
          貨品真偽由具名鑑定師按合約承擔，平台不就買賣雙方信用作背書。
        </p>
      </div>

      {/* ── Listings grid ──────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">
        上架中商品（{total}）
      </h2>

      {listings.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">
          呢個賣家暫時冇上架中嘅商品。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="flex">
              <Card className="flex w-full flex-col overflow-hidden transition hover:shadow-md">
                <div className="aspect-square shrink-0 bg-slate-100">
                  {l.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.images[0]}
                      alt={l.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <CardContent className="flex flex-1 flex-col gap-2 p-3">
                  <TierPill tier={tierForPrice(l.priceHKD) as 1 | 2 | 3} className="self-start" />
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">
                    {l.title}
                  </h3>
                  <div className="mt-auto">
                    <p className="text-base font-semibold">{formatHKD(l.priceHKD)}</p>
                    {l.createdAt && (
                      <p className="text-[10px] text-slate-400">
                        {(() => {
                          const diff = Date.now() - new Date(l.createdAt).getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 1) return '剛剛';
                          if (mins < 60) return `${mins} 分鐘前`;
                          const hours = Math.floor(mins / 60);
                          if (hours < 24) return `${hours} 小時前`;
                          const days = Math.floor(hours / 24);
                          if (days < 30) return `${days} 日前`;
                          const months = Math.floor(days / 30);
                          if (months < 12) return `${months} 個月前`;
                          return new Date(l.createdAt).toLocaleDateString('zh-HK');
                        })()}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* ── Reviews section ───────────────────────────────────────────────── */}
      {reviews && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            買家評價（{reviews.total}）
            {reviews.averageRating != null && (
              <span className="ml-2 text-amber-500">★ {reviews.averageRating.toFixed(1)}</span>
            )}
          </h2>
          {reviews.items.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
              暫無買家評價
            </p>
          ) : (
            <div className="space-y-2">
              {reviews.items.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {(r.buyerName ?? '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-slate-800">{r.buyerName}</span>
                      <span className="text-amber-500">{'★'.repeat(r.rating)}<span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span></span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString('zh-HK')}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
