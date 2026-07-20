'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@authentik/ui';
import { api } from '@/lib/api';

/**
 * Disputes — list + resolve (P0).
 * Resolution = server-computed state transition only (REFUND_BUYER /
 * RELEASE_SELLER) — admin never edits amounts. Note is mandatory and must
 * reference the named authenticator's verdict, never a platform authenticity
 * judgement (L'Oréal v eBay posture).
 */
export default function DisputesPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ConfirmDialog v2（founder 2026-07-12）
  const [resolving, setResolving] = useState<{ id: string; resolution: 'REFUND_BUYER' | 'RELEASE_SELLER'; title?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.admin.disputes()
      .then(setList)
      .catch((e) => setError(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  async function confirmResolve(dialogNote?: string) {
    if (!resolving || !dialogNote?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.resolveDispute(resolving.id, resolving.resolution, dialogNote.trim());
      setResolving(null);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? '處理失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Disputes</h1>
      <p className="mt-1 text-sm text-slate-400">狀態 = DISPUTED 嘅訂單 · 平台中立調解</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
      {loading && <p className="mt-6 text-sm text-slate-400">載入中…</p>}
      {!loading && list.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          目前無爭議 case。
        </p>
      )}
      {!loading && list.length > 0 && (
        <div className="mt-6 space-y-3">
          {list.map((o) => (
            <div key={o.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{o.listing?.title ?? '—'}</p>
                <span className="rounded-full bg-red-950 px-2 py-0.5 text-[10px] font-medium text-red-300">
                  #{o.id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                <Field label="買家">{o.buyer?.displayName} <span className="text-slate-500">({o.buyer?.email})</span></Field>
                <Field label="賣家">{o.seller?.displayName} <span className="text-slate-500">({o.seller?.email})</span></Field>
                <Field label="鑑定師">{o.authenticator?.displayName ?? '無'}</Field>
                <Field label="售價">HK${o.salePriceHKD?.toLocaleString('en-HK')}</Field>
                <Field label="鑑定費">HK${o.authFeeHKD?.toLocaleString('en-HK')}</Field>
                <Field label="付款方式">{o.paymentMethod}</Field>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                落單於 {new Date(o.createdAt).toLocaleString('zh-HK', { hour12: false })}
              </p>

              {/* ── Resolve actions (OPS_ADMIN+) — ConfirmDialog v2 ── */}
              <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                <button
                  onClick={() => setResolving({ id: o.id, resolution: 'REFUND_BUYER', title: o.listing?.title })}
                  className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900"
                >
                  退款買家
                </button>
                <button
                  onClick={() => setResolving({ id: o.id, resolution: 'RELEASE_SELLER', title: o.listing?.title })}
                  className="rounded-lg bg-emerald-900/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900"
                >
                  放款賣家
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!resolving}
        portal="admin"
        severity="danger"
        title={resolving?.resolution === 'REFUND_BUYER' ? '爭議裁決 — 退款買家？' : '爭議裁決 — 放款賣家？'}
        description={resolving?.title}
        consequence={resolving?.resolution === 'REFUND_BUYER'
          ? '呢個動作會將訂單轉為 REFUNDED、買家獲全額退款、商品返回 ACTIVE。備註必須引述具名鑑定師嘅判定／證據，唔可以寫成平台自己嘅真偽判斷。'
          : '呢個動作會將訂單轉為 COMPLETED、放款畀賣家。備註必須引述具名鑑定師嘅判定／證據，唔可以寫成平台自己嘅真偽判斷。'}
        confirmLabel={resolving?.resolution === 'REFUND_BUYER' ? '確認退款' : '確認放款'}
        requireReason
        reasonLabel="處理備註（必填，寫入 audit log）"
        reasonPlaceholder="例：據鑑定師 Milan Authentication 判定為 FAIL，按證據退款買家"
        dismissOnBackdrop={false}
        busy={busy}
        onConfirm={(r) => confirmResolve(r)}
        onCancel={() => setResolving(null)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-200">{children}</p>
    </div>
  );
}
