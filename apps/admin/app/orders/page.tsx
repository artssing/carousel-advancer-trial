'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@authentik/ui';
import { api } from '@/lib/api';

/**
 * Orders admin — real search / detail / escrow overrides (P0, replaces the
 * old hardcoded mock rows). Money actions = server-computed state transitions
 * (force-refund / release-escrow) with mandatory reason → AdminAction.
 */
const STATUS_OPTIONS = [
  '', 'AWAITING_PAYMENT', 'PAID', 'HANDOVER_TO_AUTH', 'SELLER_ACK_PENDING', 'CUSTODY',
  'SHIPPED_TO_AUTHENTICATOR', 'AUTH_RECEIVED_PENDING_SELLER_ACK', 'AUTHENTICATING',
  'AUTH_PASSED', 'AUTH_FAILED', 'AWAITING_BUYER_PICKUP', 'SHIPPED_TO_BUYER',
  'DELIVERED_PENDING_AUTH_ACK', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED',
];

export default function OrdersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [action, setAction] = useState<'refund' | 'release' | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    setLoading(true);
    api.admin.orders({ q: q || undefined, status: status || undefined, limit: 50 })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setError(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [status]);

  async function openDetail(id: string) {
    setDetail(null);
    setAction(null);
    try { setDetail(await api.admin.orderDetail(id)); }
    catch (e: any) { setError(e?.message ?? '載入訂單失敗'); }
  }

  async function confirmAction(dialogReason?: string) {
    if (!detail || !action || !dialogReason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'refund') await api.admin.forceRefund(detail.id, dialogReason.trim());
      else await api.admin.releaseEscrow(detail.id, dialogReason.trim());
      setAction(null);
      await openDetail(detail.id);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? '執行失敗');
    } finally {
      setBusy(false);
    }
  }

  const terminal = detail && ['COMPLETED', 'REFUNDED'].includes(detail.status);

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Orders</h1>
      <p className="mt-1 text-sm text-slate-400">全平台訂單 · 查單 / escrow 介入（共 {total} 張）</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Search + filter */}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refresh()}
          placeholder="訂單 ID / 買賣家 email / 商品名 — 撳 Enter 搜尋"
          className="w-80 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-slate-500"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || '全部狀態'}</option>)}
        </select>
        <button onClick={refresh} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white">搜尋</button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* List */}
        <div className="space-y-2">
          {loading && <p className="text-sm text-slate-400">載入中…</p>}
          {!loading && items.length === 0 && <p className="text-sm text-slate-500">冇符合訂單。</p>}
          {items.map((o) => (
            <button
              key={o.id}
              onClick={() => openDetail(o.id)}
              className={`block w-full rounded-xl border p-4 text-left transition hover:border-slate-600 ${detail?.id === o.id ? 'border-slate-500 bg-slate-800' : 'border-slate-800 bg-slate-900'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{o.listing?.title ?? '—'}</p>
                <StatusPill status={o.status} />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                #{o.id.slice(0, 8)} · HK${o.salePriceHKD?.toLocaleString('en-HK')} · 買 {o.buyer?.email} · 賣 {o.seller?.email}
              </p>
            </button>
          ))}
        </div>

        {/* Detail */}
        {detail && (
          <div className="h-fit rounded-xl border border-slate-700 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{detail.listing?.title}</h2>
              <StatusPill status={detail.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Field label="訂單 ID">{detail.id}</Field>
              <Field label="售價">HK${detail.salePriceHKD?.toLocaleString('en-HK')}</Field>
              <Field label="買家">{detail.buyer?.displayName} ({detail.buyer?.email})</Field>
              <Field label="賣家">{detail.seller?.displayName} ({detail.seller?.email})</Field>
              <Field label="鑑定師">{detail.authenticator?.displayName ?? '無'}</Field>
              <Field label="Escrow">{detail.escrowHeld ? '持有中' : '已釋放'}</Field>
            </div>

            {/* Payments */}
            <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Payments</h3>
            {(detail.payments ?? []).length === 0
              ? <p className="mt-1 text-xs text-slate-500">無付款記錄</p>
              : (detail.payments ?? []).map((p: any) => (
                <p key={p.id} className="mt-1 text-xs text-slate-300">
                  HK${p.amountHKD?.toLocaleString('en-HK')} · {p.status} · {p.gatewayRef ?? '—'}
                </p>
              ))}

            {/* Evidence */}
            <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">鑑定證據（{(detail.evidence ?? []).length}）</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {(detail.evidence ?? []).map((ev: any) => (
                <a key={ev.id} href={ev.mediaUrl} target="_blank" rel="noreferrer"
                  className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-slate-500">
                  {ev.kind} · {new Date(ev.createdAt).toLocaleDateString('zh-HK')}
                </a>
              ))}
            </div>

            {/* Admin action history */}
            {(detail.adminActions ?? []).length > 0 && (
              <>
                <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">Admin 操作史</h3>
                {(detail.adminActions ?? []).map((a: any) => (
                  <p key={a.id} className="mt-1 text-[10px] text-slate-400">
                    {a.action} · {new Date(a.createdAt).toLocaleString('zh-HK', { hour12: false })}
                    {a.payload?.reason ? ` · ${a.payload.reason}` : ''}
                  </p>
                ))}
              </>
            )}

            {/* Overrides — ConfirmDialog v2 + typed confirmation（founder 2026-07-12） */}
            {!terminal && (
              <div className="mt-4 flex gap-2 border-t border-slate-800 pt-3">
                <button onClick={() => setAction('refund')}
                  className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900">
                  Force Refund（退款買家）
                </button>
                <button onClick={() => setAction('release')}
                  className="rounded-lg bg-emerald-900/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900">
                  Release Escrow（放款賣家）
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* T1 force actions — typed confirmation 「確認」 unlock（founder 拍板 2026-07-12） */}
      <ConfirmDialog
        open={!!action && !!detail}
        portal="admin"
        severity="danger"
        title={action === 'refund' ? 'Force Refund — 退款買家？' : 'Release Escrow — 放款賣家？'}
        description={detail ? `${detail.listing?.title}（#${detail.id.slice(0, 8)} · HK$${detail.salePriceHKD?.toLocaleString('en-HK')}）` : undefined}
        consequence={action === 'refund'
          ? '呢個動作會將訂單轉為 REFUNDED、商品返回 ACTIVE、escrow hold 取消/退款。金額由 server 按訂單原數計算，唔可以手改。原因寫入 audit log，不可撤回。'
          : '呢個動作會將訂單轉為 COMPLETED、商品轉 SOLD、escrow capture 放款畀賣家。金額由 server 按訂單原數計算，唔可以手改。原因寫入 audit log，不可撤回。'}
        confirmLabel={action === 'refund' ? '確認退款' : '確認放款'}
        requireReason
        reasonLabel="原因（必填，寫入 audit log）"
        reasonPlaceholder="例：卡喺 AUTHENTICATING 超過 SLA，賣家失聯"
        typedConfirmation="確認"
        dismissOnBackdrop={false}
        busy={busy}
        onConfirm={(r) => confirmAction(r)}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-300'
    : status === 'DISPUTED' ? 'bg-red-950 text-red-300'
    : status === 'REFUNDED' ? 'bg-slate-800 text-slate-400'
    : 'bg-sky-950 text-sky-300';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>{status}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 break-all text-slate-200">{children}</p>
    </div>
  );
}
