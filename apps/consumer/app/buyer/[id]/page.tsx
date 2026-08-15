'use client';

import { useEffect, useState } from 'react';
import { getClientLocale, createT } from '@certifine/web-kit';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, Badge } from '@certifine/ui';
import { ShieldCheck, Package, Calendar, Lock } from 'lucide-react';
import { api, hasToken, clearToken, ApiError } from '@/lib/api';

interface BuyerProfile {
  id: string;
  displayName: string;
  kycVerified: boolean;
  joinedAt: string;
  completedBuyCount: number;
}

function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BuyerPage() {
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

  const params = useParams() as { id: string };
  const router = useRouter();
  const id = params.id;
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gateDenied, setGateDenied] = useState(false);

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    api.users.buyerProfile(id)
      .then(setProfile)
      .catch((e: any) => {
        if (e?.status === 401) { clearToken(); router.replace('/login'); return; }
        if (e?.status === 403) { setGateDenied(true); return; }
        setError(e?.message ?? _t('buyer.error.load'));
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (gateDenied) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Lock className="h-10 w-10 text-slate-400" />
            <h1 className="text-lg font-semibold">{_t('buyer.restricted.title')}</h1>
            <p className="max-w-md text-sm text-slate-500">
              {_t('buyer.restricted.body')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-600">{error ?? _t('buyer.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{profile.displayName}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="h-3 w-3" />
                {_t('buyer.joinedFormat', { ym: joinedLabel(profile.joinedAt) })}
              </p>
            </div>
            {profile.kycVerified ? (
              <Badge className="shrink-0 bg-emerald-100 text-emerald-700">
                <ShieldCheck className="mr-1 h-3 w-3" />
                {_t('buyer.verified')}
              </Badge>
            ) : (
              <Badge className="shrink-0 bg-amber-100 text-amber-700">{_t('buyer.pendingReview')}</Badge>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-xs text-slate-500">{_t('buyer.completedOrders')}</p>
              <p className="mt-1 flex items-baseline gap-1">
                <Package className="h-4 w-4 text-slate-400" />
                <span className="text-2xl font-bold">{profile.completedBuyCount}</span>
                <span className="text-xs text-slate-500">{_t('buyer.ordersUnit')}</span>
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            {_t('buyer.privacyNote')}
            {_t('buyer.intermediaryNote')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
