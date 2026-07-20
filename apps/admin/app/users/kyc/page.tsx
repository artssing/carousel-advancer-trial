'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@authentik/ui';
import { api } from '@/lib/api';

export default function KycQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ConfirmDialog v2（founder 2026-07-12）：reject 要 dialog+原因；approve 直接 + toast
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.admin.kycQueue().then(setQueue).catch((e) => setError(e?.message ?? '載入失敗')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function approve(u: any) {
    setBusy(u.id); setError(null);
    try {
      await api.admin.approveKyc(u.id);
      setToast(`已通過 ${u.displayName} 嘅 KYC`);
      setTimeout(() => setToast(null), 3000);
      load();
    }
    catch (e: any) { setError(e?.message ?? '失敗'); }
    finally { setBusy(null); }
  }
  async function confirmReject(reason?: string) {
    if (!rejecting || !reason?.trim()) return;
    setBusy(rejecting.id); setError(null);
    // setKyc（唔係舊 rejectKyc）：必填原因 → AdminAction audit + auto-suspend
    try { await api.admin.setKyc(rejecting.id, 'REJECTED', reason.trim()); setRejecting(null); load(); }
    catch (e: any) { setError(e?.message ?? '失敗'); }
    finally { setBusy(null); }
  }

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">KYC Queue（{queue.length}）</h1>
      <p className="mt-1 text-sm text-slate-400">PENDING 嘅用戶 · 審批 / 拒絕</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
      {toast && (
        <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          ✓ {toast}
        </p>
      )}
      {loading && <p className="mt-6 text-sm text-slate-400">載入中…</p>}
      {!loading && queue.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">
          冇 KYC pending case。
        </p>
      )}
      {!loading && queue.length > 0 && (
        <div className="mt-6 space-y-3">
          {queue.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 font-semibold">
                {u.displayName?.slice(0, 1).toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{u.displayName}</p>
                <p className="text-[10px] text-slate-500">{u.email} · {new Date(u.createdAt).toLocaleDateString('zh-HK')}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => approve(u)}
                  disabled={busy === u.id}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  通過
                </button>
                <button
                  onClick={() => setRejecting(u)}
                  disabled={busy === u.id}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  拒絕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!rejecting}
        portal="admin"
        severity="danger"
        title="拒絕 KYC 申請？"
        description={rejecting ? `${rejecting.displayName}（${rejecting.email}）` : undefined}
        consequence="呢個動作會將用戶 KYC 狀態轉為 REJECTED 並自動暫停帳戶 — 佢將無法登入或交易，需聯絡客服重審。原因寫入 audit log。"
        confirmLabel="確認拒絕"
        requireReason
        reasonLabel="拒絕原因（必填，寫入 audit log）"
        reasonPlaceholder="例：文件模糊無法核實 / 資料與身份不符"
        busy={busy === rejecting?.id}
        onConfirm={(r) => confirmReject(r)}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
