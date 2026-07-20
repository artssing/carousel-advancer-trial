'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatHKD } from '@authentik/utils';
import { api, type InboxOrder, type Me } from '@/lib/api';
import { AuthTopline, AuthContent } from '@/components/auth-topline';
import { EAndOWarning } from '@/components/eando-warning';

const DELIVERY_LABEL: Record<string, string> = {
  SHIP: '順豐到件',
  MEETUP_AUTH: '鑑定師處面交',
  MEETUP_3WAY: '三方面交',
  MEETUP_DIRECT: '雙方面交',
};

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  PAID: { label: '待開始', cls: 'bg-authBrand-soft text-authBrand-600' },
  SHIPPED_TO_AUTHENTICATOR: { label: '已收貨', cls: 'bg-authBrand-soft text-authBrand-600' },
  AUTHENTICATING: { label: '進行中', cls: 'bg-verdict-incon-soft text-verdict-incon' },
};

const VERDICT_PILL: Record<string, { label: string; cls: string }> = {
  AUTH_PASSED: { label: '✓ 通過', cls: 'bg-verdict-pass-soft text-verdict-pass' },
  AUTH_FAILED: { label: '✕ 不通過', cls: 'bg-verdict-fail-soft text-verdict-fail' },
  AUTH_INCONCLUSIVE: { label: '？ 未能確定', cls: 'bg-verdict-incon-soft text-verdict-incon' },
};

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<InboxOrder[]>([]);

  useEffect(() => {
    Promise.all([api.me(), api.orders.inbox()])
      .then(([meData, inbox]) => { setMe(meData); setOrders(inbox); })
      .catch(() => {});
  }, []);

  const auth = me?.authenticator;
  const DONE_STATUSES = ['AUTH_PASSED', 'AUTH_FAILED', 'SHIPPED_TO_BUYER', 'DELIVERED', 'COMPLETED'];
  const pending = orders.filter((o) => !DONE_STATUSES.includes(o.status));
  const completed = orders.filter((o) => DONE_STATUSES.includes(o.status));
  const MEETUP_METHODS = ['MEETUP_AUTH', 'MEETUP_3WAY'];
  const actionNeeded = pending.filter((o) =>
    o.status === 'AUTHENTICATING' ||
    o.status === 'SHIPPED_TO_AUTHENTICATOR' ||
    (o.status === 'PAID' && MEETUP_METHODS.includes((o as any).deliveryMethod ?? ''))
  );

  // Today's meetups
  const todayMeetups = pending.filter((o) => MEETUP_METHODS.includes((o as any).deliveryMethod ?? ''));

  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCompleted = completed.filter((o) => (o.createdAt ?? '').startsWith(currentMonth));
  const monthlyIncome = thisMonthCompleted.reduce((sum, o) => sum + o.authFeeHKD, 0);
  const disputeRatePct = auth?.disputeRate != null
    ? `${(auth.disputeRate * 100).toFixed(1)}%`
    : '0%';

  const todayLabel = new Date().toLocaleDateString('zh-HK', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <>
      <AuthTopline title="工作台" subtitle={todayLabel} />
      <AuthContent>
        <EAndOWarning eAndOInsuranceExpiresAt={auth?.eAndOInsuranceExpiresAt} />

        {/* ═══ 4-col stat row ═══ */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard value={String(actionNeeded.length)} label="待鑑定" tint="authBrand" />
          <StatCard value={monthlyIncome > 0 ? formatHKD(monthlyIncome) : 'HK$0'} label="本月收入" tint="authBrand" />
          <StatCard value={disputeRatePct} label="爭議率" tint="pass" />
          <StatCard
            value={
              <>
                {auth?.starRating ?? '—'} <span className="text-verdict-incon">★</span>
              </>
            }
            label="平均評分"
            tint="authBrand"
          />
        </div>

        {/* ═══ 2-col split: queue + right rail ═══ */}
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          {/* Left: pending queue */}
          <div className="rounded-xl border border-line bg-white p-6 shadow-auth-sh1">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                待鑑定佇列
              </div>
              <Link href="/inbox" className="text-[13px] font-semibold text-authBrand-500 hover:text-authBrand-600">
                前往收件匣 →
              </Link>
            </div>

            {actionNeeded.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-text-hint">目前無需要你立即處理嘅訂單</p>
            ) : (
              actionNeeded.slice(0, 4).map((o) => {
                const pill = STATUS_PILL[o.status];
                return (
                  <div key={o.id} className="flex items-center gap-3 border-b border-line py-3.5 last:border-b-0">
                    <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[9px] bg-gradient-to-br from-authBrand-100 to-authBrand-200">
                      {o.listing.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.listing.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-authBrand-500">
                          {(o.listing as any).brand ?? 'ITEM'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-neutral-text">
                        {o.listing.title}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-neutral-text-hint">
                        訂單 #{o.id.slice(0, 8).toUpperCase()} ·{' '}
                        {DELIVERY_LABEL[(o as any).deliveryMethod ?? ''] ?? (o as any).deliveryMethod}
                      </p>
                    </div>
                    {pill && (
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pill.cls}`}>
                        {pill.label}
                      </span>
                    )}
                    <Link
                      href={`/authenticate/${o.id}`}
                      className="shrink-0 rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600"
                    >
                      {o.status === 'AUTHENTICATING' ? '繼續' : '鑑定'}
                    </Link>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: today meetups + recent results */}
          <div className="space-y-5">
            {/* Today meetups */}
            {todayMeetups.length > 0 && (
              <div className="rounded-xl border border-line bg-white p-6 shadow-auth-sh1">
                <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                  今日面交
                </div>
                {todayMeetups.slice(0, 3).map((o) => (
                  <div key={o.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                    <span className="w-[52px] shrink-0 text-[15px] font-extrabold text-authBrand-500">
                      {(o as any).scheduledMeetupAt
                        ? new Date((o as any).scheduledMeetupAt).toLocaleTimeString('zh-HK', {
                            hour: '2-digit', minute: '2-digit', hour12: false,
                          })
                        : '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-neutral-text">
                        {o.listing.title} · {DELIVERY_LABEL[(o as any).deliveryMethod ?? '']}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-neutral-text-hint">
                        {(o as any).meetupBranch?.name ?? '面交'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent results */}
            {completed.length > 0 && (
              <div className="rounded-xl border border-line bg-white p-6 shadow-auth-sh1">
                <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-neutral-text-hint">
                  最近結果
                </div>
                {completed.slice(0, 4).map((o) => {
                  const verdict = VERDICT_PILL[o.status] ?? VERDICT_PILL.AUTH_PASSED!;
                  return (
                    <div key={o.id} className="flex items-center justify-between border-b border-line py-2 last:border-b-0">
                      <span className="truncate text-[13px] text-neutral-text">{o.listing.title}</span>
                      <span className={`ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${verdict.cls}`}>
                        {verdict.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </AuthContent>
    </>
  );
}

function StatCard({
  value, label, tint,
}: {
  value: React.ReactNode;
  label: string;
  tint: 'authBrand' | 'pass' | 'incon';
}) {
  const numColor = tint === 'pass'
    ? 'text-verdict-pass'
    : tint === 'incon'
    ? 'text-verdict-incon'
    : 'text-authBrand-900';
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-auth-sh1">
      <div className={`text-[22px] font-extrabold ${numColor}`}>{value}</div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-text-hint">
        {label}
      </div>
    </div>
  );
}
