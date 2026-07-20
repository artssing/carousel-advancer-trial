'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@authentik/ui';
import { api } from '@/lib/api';

/**
 * Authenticators admin（founder 2026-07-13 MVP：申請 + 審批 + suspend/remove）。
 * 換走舊 hardcoded mock。兩 tab：申請 queue / 鑑定師名單。
 * 紅線：審批 = 准入 marketplace，唔代表平台為鑑定結果背書；星級/dispute
 * 演算法派生只讀不可手改（L'Oréal v eBay）。
 */
type Tab = 'queue' | 'roster';

const APP_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: '待審批', NEEDS_MORE_INFO: '已要求補交', APPROVED: '已批核',
  REJECTED: '已拒絕', WITHDRAWN: '已撤回',
};

export default function AuthenticatorsPage() {
  const [tab, setTab] = useState<Tab>('queue');
  const [apps, setApps] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [approving, setApproving] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState<{ app: any; mode: 'reject' | 'more' } | null>(null);
  const [statusChange, setStatusChange] = useState<{ auth: any; next: 'SUSPENDED' | 'REMOVED' | 'ACTIVE' } | null>(null);
  const [busy, setBusy] = useState(false);

  function loadQueue() {
    setLoading(true);
    api.admin.authApplications()
      .then(setApps).catch((e) => setError(e?.message ?? '載入失敗')).finally(() => setLoading(false));
  }
  function loadRoster() {
    setLoading(true);
    api.admin.authenticators({ q: q || undefined, status: statusFilter || undefined })
      .then(setRoster).catch((e) => setError(e?.message ?? '載入失敗')).finally(() => setLoading(false));
  }
  useEffect(() => {
    if (tab === 'queue') loadQueue(); else loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  async function doApprove() {
    if (!approving) return;
    setBusy(true); setError(null);
    try { await api.admin.approveAuthApplication(approving.id); setApproving(null); loadQueue(); }
    catch (e: any) { setError(e?.message ?? '批核失敗'); }
    finally { setBusy(false); }
  }
  async function doReject(reason?: string) {
    if (!rejecting || !reason?.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.admin.rejectAuthApplication(rejecting.app.id, reason.trim(), rejecting.mode === 'more');
      setRejecting(null); loadQueue();
    } catch (e: any) { setError(e?.message ?? '操作失敗'); }
    finally { setBusy(false); }
  }
  async function doStatus(reason?: string) {
    if (!statusChange) return;
    if (statusChange.next !== 'ACTIVE' && !reason?.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.admin.setAuthenticatorStatus(statusChange.auth.id, statusChange.next, reason?.trim());
      setStatusChange(null); loadRoster();
    } catch (e: any) { setError(e?.message ?? '操作失敗'); }
    finally { setBusy(false); }
  }

  const pendingCount = apps.filter((a) => ['SUBMITTED', 'NEEDS_MORE_INFO'].includes(a.status)).length;

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Authenticators</h1>
      <p className="mt-1 text-sm text-slate-400">鑑定師申請審批 + 名單管理 · 審批 = 准入，唔代表平台背書</p>
      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-slate-800">
        {([['queue', `申請 queue（${pendingCount}）`], ['roster', '鑑定師名單']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as Tab)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? 'border-slate-100 text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-slate-400">載入中…</p>}

      {/* ═══ 申請 queue ═══ */}
      {tab === 'queue' && !loading && (
        <div className="mt-6 space-y-3">
          {apps.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-500">冇待審批申請。</p>}
          {apps.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{a.displayName} {a.storeName && <span className="text-slate-500">· {a.storeName}</span>}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    申請人 {a.user?.email} · {a.categories?.join(' / ') || '未填品類'} · 年資 {a.yearsExperience ?? '—'} · 收費 {(a.feeRatePct * 100).toFixed(1)}% (min HK${a.feeMinHKD})
                  </p>
                  {a.bio && <p className="mt-1.5 text-xs text-slate-400">{a.bio}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">
                    E&O 到期：{a.eAndOExpiresAt ? new Date(a.eAndOExpiresAt).toLocaleDateString('zh-HK') : '未提供'} · 資歷文件 {a.credentialDocs?.length ?? 0} 份
                  </p>
                  {a.status === 'NEEDS_MORE_INFO' && a.reviewNote && (
                    <p className="mt-1.5 rounded bg-amber-950/60 px-2 py-1 text-[11px] text-amber-300">已要求補交：{a.reviewNote}</p>
                  )}
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">{APP_STATUS_LABEL[a.status] ?? a.status}</span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                <button onClick={() => setApproving(a)} className="rounded-lg bg-emerald-900/60 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900">批核</button>
                <button onClick={() => setRejecting({ app: a, mode: 'more' })} className="rounded-lg bg-amber-900/60 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900">要求補交</button>
                <button onClick={() => setRejecting({ app: a, mode: 'reject' })} className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900">拒絕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ 鑑定師名單 ═══ */}
      {tab === 'roster' && !loading && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadRoster()}
              placeholder="鑑定師 / 店名 / email — 撳 Enter" className="w-72 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-slate-500" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none">
              {['', 'ACTIVE', 'SUSPENDED', 'REMOVED', 'PENDING'].map((s) => <option key={s} value={s}>{s || '全部狀態'}</option>)}
            </select>
            <button onClick={loadRoster} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white">搜尋</button>
          </div>
          <div className="mt-4 space-y-2">
            {roster.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-500">冇符合鑑定師。</p>}
            {roster.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.displayName} {a.storeName && <span className="text-slate-500">· {a.storeName}</span>}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {a.user?.email} · {a.categories?.join(' / ') || '—'} · ★{a.starRating} · 完成 {a.completedCount} · 爭議 {(a.disputeRate * 100).toFixed(1)}% · E&O {a.eAndOInsuranceExpiresAt ? new Date(a.eAndOInsuranceExpiresAt).toLocaleDateString('zh-HK') : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      a.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-300'
                      : a.status === 'SUSPENDED' ? 'bg-amber-950 text-amber-300'
                      : a.status === 'REMOVED' ? 'bg-red-950 text-red-300'
                      : 'bg-slate-800 text-slate-400'
                    }`}>{a.status}</span>
                    {a.status === 'ACTIVE' && (
                      <button onClick={() => setStatusChange({ auth: a, next: 'SUSPENDED' })} className="rounded-lg bg-amber-900/60 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-900">暫停</button>
                    )}
                    {a.status === 'SUSPENDED' && (
                      <button onClick={() => setStatusChange({ auth: a, next: 'ACTIVE' })} className="rounded-lg bg-emerald-900/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900">恢復</button>
                    )}
                    {a.status !== 'REMOVED' && (
                      <button onClick={() => setStatusChange({ auth: a, next: 'REMOVED' })} className="rounded-lg bg-red-900/60 px-2.5 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-900">移除</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ ConfirmDialog v2（portal=admin）═══ */}
      <ConfirmDialog
        open={!!approving}
        portal="admin"
        severity="info"
        title="批核呢個鑑定師申請？"
        description={approving ? `${approving.displayName}（${approving.user?.email}）` : undefined}
        consequence="呢個動作會建立 ACTIVE 鑑定師帳戶 + 加 AUTHENTICATOR 角色，佢即時可以接單。批核只核實身分與資歷真確性，唔代表平台為鑑定結果背書。"
        confirmLabel="確認批核"
        busy={busy}
        onConfirm={doApprove}
        onCancel={() => setApproving(null)}
      />
      <ConfirmDialog
        open={!!rejecting}
        portal="admin"
        severity={rejecting?.mode === 'reject' ? 'danger' : 'warning'}
        title={rejecting?.mode === 'reject' ? '拒絕呢個申請？' : '要求申請人補交資料？'}
        description={rejecting ? `${rejecting.app.displayName}（${rejecting.app.user?.email}）` : undefined}
        consequence={rejecting?.mode === 'reject'
          ? '申請會轉為 REJECTED（終態）。申請人可以重新遞交新申請。'
          : '申請會轉為 NEEDS_MORE_INFO — 申請人會見到你嘅備註，補交後可以再交同一份申請。'}
        confirmLabel={rejecting?.mode === 'reject' ? '確認拒絕' : '要求補交'}
        requireReason
        reasonLabel={rejecting?.mode === 'reject' ? '拒絕原因（必填，會通知申請人）' : '需補交咩（必填，會通知申請人）'}
        reasonPlaceholder={rejecting?.mode === 'reject' ? '例：資歷文件無法核實' : '例：請補交 E&O 保險證明 + 到期日'}
        busy={busy}
        onConfirm={(r) => doReject(r)}
        onCancel={() => setRejecting(null)}
      />
      <ConfirmDialog
        open={!!statusChange}
        portal="admin"
        severity={statusChange?.next === 'ACTIVE' ? 'info' : 'danger'}
        title={statusChange?.next === 'SUSPENDED' ? '暫停呢個鑑定師？' : statusChange?.next === 'REMOVED' ? '移除呢個鑑定師？' : '恢復呢個鑑定師？'}
        description={statusChange ? `${statusChange.auth.displayName}（${statusChange.auth.user?.email}）` : undefined}
        consequence={
          statusChange?.next === 'SUSPENDED' ? '暫停後新單唔會再配對佢；in-flight 訂單唔受影響。可以隨時恢復。'
          : statusChange?.next === 'REMOVED' ? '移除後佢唔可以再接單。有進行中訂單會擋 — 要先 reassign 或退款。歷史紀錄 + 評價保留。'
          : '恢復後佢可以再接新單。'}
        confirmLabel={statusChange?.next === 'SUSPENDED' ? '確認暫停' : statusChange?.next === 'REMOVED' ? '確認移除' : '確認恢復'}
        requireReason={statusChange?.next !== 'ACTIVE'}
        reasonLabel="原因（必填，寫入 audit log）"
        reasonPlaceholder="例：E&O 保險過期 / 多次爭議"
        dismissOnBackdrop={statusChange?.next !== 'REMOVED'}
        busy={busy}
        onConfirm={(r) => doStatus(r ?? '')}
        onCancel={() => setStatusChange(null)}
      />
    </div>
  );
}
