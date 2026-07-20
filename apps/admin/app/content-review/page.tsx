'use client';

import { useEffect, useState } from 'react';
import { formatHKD } from '@authentik/utils';
import { ConfirmDialog } from '@authentik/ui';
import { api } from '@/lib/api';

/**
 * Content Review — listing moderation (P0, replaces the empty placeholder).
 * Take-down (counterfeit report / legal takedown / IP complaint) + restore,
 * both with mandatory reason → AdminAction audit log.
 */
const STATUS_OPTIONS = ['', 'ACTIVE', 'RESERVED', 'SOLD', 'DRAFT', 'REMOVED'];

export default function ContentReviewPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Inline 2-step confirm (lesson #16)
  const [acting, setActing] = useState<{ id: string; mode: 'remove' | 'restore' } | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    setLoading(true);
    api.admin.listings({ q: q || undefined, status: status || undefined, limit: 50 })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => setError(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [status]);

  async function confirmAct(dialogReason?: string) {
    if (!acting || !dialogReason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (acting.mode === 'remove') await api.admin.removeListing(acting.id, dialogReason.trim());
      else await api.admin.restoreListing(acting.id, dialogReason.trim());
      setActing(null);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? '執行失敗');
    } finally {
      setBusy(false);
    }
  }

  const actingListing = acting ? items.find((l) => l.id === acting.id) : null;

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Content Review</h1>
      <p className="mt-1 text-sm text-slate-400">商品審查 · 下架 / 還原（共 {total} 件）— 冒牌舉報 / 法律下架用</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && refresh()}
          placeholder="商品名 / 品牌 / 賣家 email / listing ID — 撳 Enter"
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

      <div className="mt-6 space-y-2">
        {loading && <p className="text-sm text-slate-400">載入中…</p>}
        {!loading && items.length === 0 && <p className="text-sm text-slate-500">冇符合商品。</p>}
        {items.map((l) => (
          <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{l.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {formatHKD(l.priceHKD)} · {l.category}{l.brand ? ` · ${l.brand}` : ''} · 賣家 {l.seller?.email} · {l._count?.orders ?? 0} 張訂單 · #{l.id.slice(0, 8)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  l.status === 'REMOVED' ? 'bg-red-950 text-red-300'
                  : l.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300'
                  : 'bg-slate-800 text-slate-400'
                }`}>
                  {l.status === 'REMOVED'
                    ? `REMOVED · ${l.removedByRole === 'ADMIN' ? '平台下架' : '賣家自刪'}`
                    : l.status}
                </span>
                {l.status !== 'REMOVED' ? (
                  <button
                    onClick={() => setActing({ id: l.id, mode: 'remove' })}
                    className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900"
                  >
                    下架
                  </button>
                ) : (
                  <button
                    onClick={() => setActing({ id: l.id, mode: 'restore' })}
                    className="rounded-lg bg-emerald-900/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900"
                  >
                    還原
                  </button>
                )}
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* ConfirmDialog v2 live mock（founder 2026-07-12 — admin dark 卡）*/}
      <ConfirmDialog
        open={!!acting}
        portal="admin"
        severity={acting?.mode === 'remove' ? 'danger' : 'info'}
        title={acting?.mode === 'remove' ? '下架呢件商品？' : '還原呢件商品？'}
        description={actingListing ? `${actingListing.title}（賣家 ${actingListing.seller?.email}）` : undefined}
        consequence={
          acting?.mode === 'remove'
            ? '呢個動作會將商品狀態轉為 REMOVED — 買家即時搵唔到、直接連結會 404。可以隨時喺呢度還原。'
            : '呢個動作會將商品還原做 ACTIVE — 買家即時可以再搵到同購買。'
        }
        confirmLabel={acting?.mode === 'remove' ? '確認下架' : '確認還原'}
        requireReason
        reasonLabel="原因（必填，寫入 audit log）"
        reasonPlaceholder={acting?.mode === 'remove' ? '例：收到品牌方 IP 投訴 ref#123' : '例：投訴撤回'}
        busy={busy}
        onConfirm={(r) => confirmAct(r)}
        onCancel={() => setActing(null)}
      />
    </div>
  );
}
