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

      <PayoutQueue />
    </div>
  );
}

/**
 * Payout queue (P0) — advance PayoutRequest through its state machine.
 * The bank transfer itself happens OUTSIDE the platform; this records it.
 * PENDING → PROCESSING | FAILED; PROCESSING → SUCCEEDED | FAILED | REVERSED.
 */
function PayoutQueue() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [error, setError] = useState<string | null>(null);
  // Inline 2-step confirm (lesson #16)
  const [acting, setActing] = useState<{ id: string; next: string } | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.admin.payouts()
      .then(setItems)
      .catch((e) => setError(e?.message ?? '載入 payouts 失敗'));
  }
  useEffect(refresh, []);

  const NEXT: Record<string, string[]> = {
    PENDING: ['PROCESSING', 'FAILED'],
    PROCESSING: ['SUCCEEDED', 'FAILED', 'REVERSED'],
  };
  const needsReason = (s: string) => s === 'FAILED' || s === 'REVERSED';
  const visible = filter === 'open'
    ? items.filter((p) => ['PENDING', 'PROCESSING'].includes(p.status))
    : items;

  async function confirmAct() {
    if (!acting) return;
    if (needsReason(acting.next) && !failureReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.setPayoutStatus(acting.id, acting.next, failureReason.trim() || undefined);
      setActing(null);
      setFailureReason('');
      refresh();
    } catch (e: any) {
      setError(e?.message ?? '執行失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">提款隊列（Payout Queue）</h2>
        <div className="flex gap-1 rounded-lg border border-slate-700 p-0.5 text-xs">
          {(['open', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 ${filter === f ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}>
              {f === 'open' ? '待處理' : '全部'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        銀行過數喺平台外進行 — 呢度記錄狀態。PENDING → PROCESSING → SUCCEEDED / FAILED / REVERSED。
      </p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="mt-4 space-y-2">
        {visible.length === 0 && (
          <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center text-sm text-slate-500">
            {filter === 'open' ? '冇待處理提款。' : '冇提款記錄。'}
          </p>
        )}
        {visible.map((p) => {
          const snap = p.methodSnapshot ?? {};
          return (
            <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {formatHKD(p.netHKD)} <span className="text-[11px] font-normal text-slate-500">（毛 {formatHKD(p.amountHKD)} − 手續費 {formatHKD(p.feeHKD)}）</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {p.reference} · {p.user?.displayName} ({p.user?.email}) · {snap.displayLabel ?? snap.type ?? '—'}
                    {p.failureReason ? ` · ⚠ ${p.failureReason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    p.status === 'SUCCEEDED' ? 'bg-emerald-950 text-emerald-300'
                    : p.status === 'FAILED' || p.status === 'REVERSED' ? 'bg-red-950 text-red-300'
                    : p.status === 'PROCESSING' ? 'bg-amber-950 text-amber-300'
                    : 'bg-sky-950 text-sky-300'
                  }`}>{p.status}</span>
                  {(NEXT[p.status] ?? []).map((n) => (
                    <button key={n}
                      onClick={() => { setActing({ id: p.id, next: n }); setFailureReason(''); }}
                      className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800">
                      → {n}
                    </button>
                  ))}
                </div>
              </div>

              {acting && acting.id === p.id && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <p className="text-xs font-semibold">確認將 {p.reference} 轉去 {acting.next}？</p>
                  {needsReason(acting.next) && (
                    <input
                      value={failureReason}
                      onChange={(e) => setFailureReason(e.target.value)}
                      placeholder="原因（必填）— 例：BANK_REJECTED / 帳戶號碼錯誤"
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none placeholder:text-slate-600 focus:border-slate-500"
                    />
                  )}
                  <div className="mt-2 flex gap-2">
                    <button onClick={confirmAct}
                      disabled={busy || (needsReason(acting.next) && !failureReason.trim())}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-white disabled:opacity-40">
                      {busy ? '處理中…' : '確認'}
                    </button>
                    <button onClick={() => setActing(null)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
