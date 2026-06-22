'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function DisputesPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.disputes()
      .then(setList)
      .catch((e) => setError(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }, []);

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
            </div>
          ))}
        </div>
      )}
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
