'use client';

import { useEffect, useState } from 'react';
import { formatHKD } from '@authentik/utils';
import { api } from '@/lib/api';

export default function FinancePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.admin.financeSummary>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.financeSummary().then(setData).catch((e) => setError(e?.message ?? '無法載入'));
  }, []);

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Finance</h1>
      <p className="mt-1 text-sm text-slate-400">Escrow reconciliation + 平台收入</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      {!data ? (
        <p className="mt-6 text-sm text-slate-500">載入中…</p>
      ) : (
        <>
          {/* Primary revenue cards */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card
              title="平台累計收入"
              value={formatHKD(data.lifetimeRevenueHKD)}
              hint={`${data.lifetimeOrders} 張已完成線上託管訂單（由一開始計）`}
              accent="emerald"
            />
            <Card
              title={`本月收入 (${data.mtdMonth})`}
              value={formatHKD(data.mtdRevenueHKD)}
              hint={`${data.mtdOrders} 張本月已完成`}
              accent="brand"
            />
          </div>

          {/* Operational cards */}
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Card
              title="Escrow 持有中"
              value={formatHKD(data.escrowHeldHKD)}
              hint="Stripe AUTHORIZED 未 capture"
            />
            <Card
              title="未完成提款"
              value={formatHKD(data.pendingPayoutsHKD)}
              hint="PENDING + PROCESSING (賣家 / 鑑定師)"
            />
            <Card
              title="線下現金交易"
              value={`${data.offlineCashCompletedCount} 張`}
              hint="OFFLINE_CASH — 平台唔抽佣，不計入收入"
            />
          </div>

          <p className="mt-6 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-xs text-slate-400">
            ℹ️ {data.note}
          </p>
        </>
      )}
    </div>
  );
}

function Card({
  title, value, hint, accent,
}: { title: string; value: string; hint: string; accent?: 'emerald' | 'brand' }) {
  const valueCls = accent === 'emerald'
    ? 'text-emerald-300'
    : accent === 'brand'
    ? 'text-brand-300'
    : 'text-white';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${valueCls}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
