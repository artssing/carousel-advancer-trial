'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Status = 'PENDING' | 'APPLIED' | 'CANCELLED' | 'DIRECT_EDIT';
type Row = Awaited<ReturnType<typeof api.admin.listPriceChanges>>['items'][number];

const STATUS_PILL: Record<Status, { label: string; cls: string }> = {
  PENDING:     { label: '待生效',  cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
  APPLIED:     { label: '已生效',  cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  CANCELLED:   { label: '已取消',  cls: 'bg-slate-700 text-slate-400 ring-slate-600' },
  DIRECT_EDIT: { label: '即時改價', cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
};

function formatHKD(n: number) { return `HK$${n.toLocaleString('en-HK')}`; }
function formatDT(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('zh-HK')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

export default function PriceChangesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [status, setStatus] = useState<Status | ''>('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [suspicious, setSuspicious] = useState(false);

  function refresh() {
    setLoading(true);
    api.admin.listPriceChanges({
      status: status || undefined,
      sellerEmail: sellerEmail.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      suspicious: suspicious || undefined,
      limit: 100,
    })
      .then((r) => { setRows(r.items); setTotal(r.total); })
      .catch((e: any) => setErr(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const suspCount = rows.filter((r) => r.suspicious).length;

  return (
    <div className="px-8 py-8 text-slate-100">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Price Changes</h1>
        <p className="text-xs text-slate-400">{total} 條記錄 · 顯示緊 {rows.length} 條 · {suspCount} 可疑</p>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        所有賣家改價記錄。可疑 flag 由 server 計算：7 日內 ≥3 次減價、即時加價 &gt;50%、或 PENDING 喺 24 小時內被覆蓋。
      </p>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Status</label>
          <select
            value={status} onChange={(e) => setStatus(e.target.value as any)}
            className="mt-1 w-full rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="">全部</option>
            <option value="PENDING">待生效</option>
            <option value="APPLIED">已生效</option>
            <option value="CANCELLED">已取消</option>
            <option value="DIRECT_EDIT">即時改價</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">賣家 Email</label>
          <input
            value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)}
            placeholder="alice@demo.hk"
            className="mt-1 w-full rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">由</label>
          <input
            type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">至</label>
          <input
            type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div className="flex items-center gap-2 md:col-span-4">
          <input
            id="susp" type="checkbox" checked={suspicious}
            onChange={(e) => setSuspicious(e.target.checked)}
            className="h-4 w-4 rounded bg-slate-950"
          />
          <label htmlFor="susp" className="text-xs text-slate-300">只顯示可疑</label>
        </div>
        <div className="md:col-span-2 flex gap-2">
          <button
            onClick={refresh}
            className="flex-1 rounded bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
          >套用篩選</button>
          <button
            onClick={() => {
              setStatus(''); setSellerEmail(''); setFrom(''); setTo(''); setSuspicious(false);
              setTimeout(refresh, 0);
            }}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >重設</button>
        </div>
      </div>

      {err && <p className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/60 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">時間</th>
              <th className="px-3 py-2">賣家</th>
              <th className="px-3 py-2">商品</th>
              <th className="px-3 py-2 text-right">舊價</th>
              <th className="px-3 py-2 text-right">新價</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2">狀態</th>
              <th className="px-3 py-2">Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">載入中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">冇符合條件嘅記錄。</td></tr>
            ) : rows.map((r) => {
              const pill = STATUS_PILL[r.status];
              const deltaCls = r.deltaHKD < 0 ? 'text-rose-300' : r.deltaHKD > 0 ? 'text-amber-300' : 'text-slate-400';
              return (
                <tr key={r.id} className={r.suspicious ? 'bg-red-500/5' : ''}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">{formatDT(r.requestedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-[11px] text-slate-200">{r.sellerEmail}</div>
                    {r.sellerDisplayName && <div className="text-[10px] text-slate-500">{r.sellerDisplayName}</div>}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-slate-300" title={r.listingTitle}>
                    <span className="font-mono text-[10px] text-slate-500">#{r.listingId.slice(0, 8)}</span>
                    <div className="truncate">{r.listingTitle}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{formatHKD(r.oldPriceHKD)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{formatHKD(r.newPriceHKD)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${deltaCls}`}>
                    {r.deltaHKD > 0 ? '+' : ''}{r.deltaPct}%
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${pill.cls}`}>
                      {pill.label}
                    </span>
                    {r.status === 'PENDING' && r.effectiveAt && (
                      <div className="mt-0.5 text-[10px] text-slate-500">→ {formatDT(r.effectiveAt)}</div>
                    )}
                    {r.status === 'CANCELLED' && r.cancelReason && (
                      <div className="mt-0.5 text-[10px] text-slate-500">{r.cancelReason}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.suspicious ? (
                      <div className="space-y-0.5">
                        {r.suspiciousReasons.map((reason, i) => (
                          <div key={i} className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300 ring-1 ring-red-500/30">
                            ⚠ {reason}
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-[10px] text-slate-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
