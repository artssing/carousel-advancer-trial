'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function KycQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.admin.kycQueue().then(setQueue).catch((e) => setError(e?.message ?? '載入失敗')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function approve(id: string) {
    setBusy(id); setError(null);
    try { await api.admin.approveKyc(id); load(); }
    catch (e: any) { setError(e?.message ?? '失敗'); }
    finally { setBusy(null); }
  }
  async function reject(id: string) {
    setBusy(id); setError(null);
    try { await api.admin.rejectKyc(id); load(); }
    catch (e: any) { setError(e?.message ?? '失敗'); }
    finally { setBusy(null); }
  }

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">KYC Queue（{queue.length}）</h1>
      <p className="mt-1 text-sm text-slate-400">PENDING 嘅用戶 · 審批 / 拒絕</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
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
                  onClick={() => approve(u.id)}
                  disabled={busy === u.id}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  通過
                </button>
                <button
                  onClick={() => reject(u.id)}
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
    </div>
  );
}
