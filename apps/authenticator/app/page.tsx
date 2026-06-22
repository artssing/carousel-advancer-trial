'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, Badge, StarRating } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { TrendingUp, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, type InboxOrder, type Me } from '@/lib/api';

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<InboxOrder[]>([]);

  useEffect(() => {
    Promise.all([api.me(), api.orders.inbox()])
      .then(([meData, inbox]) => {
        setMe(meData);
        setOrders(inbox);
      })
      .catch(() => {});
  }, []);

  const auth = me?.authenticator;
  const DONE_STATUSES = ['AUTH_PASSED', 'AUTH_FAILED', 'SHIPPED_TO_BUYER', 'DELIVERED', 'COMPLETED'];
  const pending = orders.filter((o) => !DONE_STATUSES.includes(o.status));
  const completed = orders.filter((o) => DONE_STATUSES.includes(o.status));
  // 面交 PAID 嘅單都算 urgent（鑑定師需要行動）
  const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY'];
  const actionNeeded = pending.filter((o) =>
    o.status === 'AUTHENTICATING' ||
    o.status === 'SHIPPED_TO_AUTHENTICATOR' ||
    (o.status === 'PAID' && MEETUP_METHODS.includes((o as any).deliveryMethod ?? ''))
  );
  const nextUrgent = actionNeeded[0];
  // 本月收入
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCompleted = completed.filter((o) => (o.createdAt ?? '').startsWith(currentMonth));
  const monthlyIncome = thisMonthCompleted.reduce((sum, o) => sum + o.authFeeHKD, 0);
  // 爭議率
  const disputeRateStr = auth?.disputeRate != null
    ? `${(auth.disputeRate * 100).toFixed(1)}%`
    : '0%';

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {auth?.storeName ?? auth?.displayName ?? '鑑定師 Portal'}
          </h1>
          {auth && (
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <StarRating value={auth.starRating} size="sm" showValue />
              · 已鑑定 {auth.completedCount} 件
            </div>
          )}
        </div>
        {auth && (
          <Badge variant={auth.status === 'ACTIVE' ? 'success' : 'warning'}>
            {auth.status === 'ACTIVE' ? 'Active' : auth.status}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Clock} label="需要處理" value={String(actionNeeded.length)} hint={`共 ${pending.length} 件進行中`} tint="amber" />
        <Stat icon={CheckCircle2} label="本月完成" value={String(thisMonthCompleted.length)} hint={`累計 ${completed.length} 件`} tint="emerald" />
        <Stat
          icon={TrendingUp}
          label="本月收入"
          value={monthlyIncome > 0 ? formatHKD(monthlyIncome) : 'HK$0'}
          hint={currentMonth}
          tint="brand"
        />
        <Stat icon={AlertTriangle} label="爭議率" value={disputeRateStr} tint="slate" />
      </div>

      {actionNeeded.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>需要處理（{actionNeeded.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {actionNeeded.slice(0, 3).map((o) => (
              <Link key={o.id} href={`/authenticate/${o.id}`}>
                <div className="rounded-lg bg-amber-50 p-4 text-amber-900 transition hover:bg-amber-100">
                  <p className="font-medium">
                    {o.listing.title} · {formatHKD(o.salePriceHKD)}
                  </p>
                  <p className="mt-1 text-sm">#{o.id.slice(0, 8)} · 點擊進入鑑定工作台</p>
                </div>
              </Link>
            ))}
            {actionNeeded.length > 3 && (
              <Link href="/inbox" className="block text-center text-sm text-brand-600 hover:underline">
                查看全部 {actionNeeded.length} 件 →
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {actionNeeded.length === 0 && (
        <Card className="mt-6">
          <CardContent className="p-6 text-center text-sm text-slate-400">
            目前無需要你立即處理嘅訂單。
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tint: 'amber' | 'emerald' | 'brand' | 'slate';
}) {
  const tintMap = {
    amber: 'text-amber-700 bg-amber-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    brand: 'text-brand-700 bg-brand-50',
    slate: 'text-slate-700 bg-slate-50',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${tintMap[tint]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            {hint && <p className="text-xs text-slate-400">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
