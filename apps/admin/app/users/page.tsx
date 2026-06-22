'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Row = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  emailVerified: boolean;
  avatarUrl: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  _count?: { proposedOffers?: number; sellerReviewsReceived?: number };
};

export default function UsersPage() {
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [kycFilter, setKycFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING' | 'REJECTED'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'BUYER' | 'SELLER' | 'AUTHENTICATOR' | 'OPS_AGENT' | 'OPS_ADMIN' | 'SUPER_ADMIN' | 'SUSPENDED'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function refresh() {
    api.admin.users().then(setUsers).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (kycFilter !== 'ALL' && u.kycStatus !== kycFilter) return false;
      if (roleFilter === 'SUSPENDED' && !u.suspendedAt) return false;
      if (roleFilter !== 'ALL' && roleFilter !== 'SUSPENDED' && !u.roles.includes(roleFilter)) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q)
        || (u.displayName ?? '').toLowerCase().includes(q)
        || u.id.toLowerCase().startsWith(q);
    });
  }, [users, query, kycFilter, roleFilter]);

  const suspendedCount = users.filter((u) => u.suspendedAt).length;

  return (
    <div className="px-8 py-8 text-slate-100">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="mt-1 text-xs text-slate-400">
            共 {users.length} 名用戶
            {suspendedCount > 0 && <span className="ml-2 text-red-400">· 已暫停 {suspendedCount}</span>}
          </p>
        </div>
        <Link href={'/users/kyc' as any} className="rounded-md bg-amber-700 px-3 py-1.5 text-sm hover:bg-amber-600">
          KYC Queue →
        </Link>
      </div>

      {/* Search + filters */}
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋 email / 名 / ID prefix"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-brand-500"
        />
        <select
          value={kycFilter}
          onChange={(e) => setKycFilter(e.target.value as any)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="ALL">KYC：全部</option>
          <option value="VERIFIED">已驗証</option>
          <option value="PENDING">待審</option>
          <option value="REJECTED">已拒絕</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="ALL">角色：全部</option>
          <option value="BUYER">買家</option>
          <option value="SELLER">賣家</option>
          <option value="AUTHENTICATOR">鑑定師</option>
          <option value="OPS_AGENT">OPS_AGENT</option>
          <option value="OPS_ADMIN">OPS_ADMIN</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="SUSPENDED">⊘ 已暫停</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">載入中…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-md border border-slate-800 bg-slate-900 p-4 text-center text-sm text-slate-400">
          冇 user 符合條件
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="pb-3">Email</th>
              <th className="pb-3">Display</th>
              <th className="pb-3">Roles</th>
              <th className="pb-3">KYC</th>
              <th className="pb-3">狀態</th>
              <th className="pb-3">Joined</th>
              <th className="pb-3 text-right">Offers</th>
              <th className="pb-3 text-right">Reviews</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`cursor-pointer text-sm transition hover:bg-slate-900 ${selectedId === r.id ? 'bg-slate-900' : ''}`}
              >
                <td className="py-2">{r.email}</td>
                <td>{r.displayName}</td>
                <td className="text-[10px] text-slate-400">{r.roles.join(', ')}</td>
                <td>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    r.kycStatus === 'VERIFIED' ? 'bg-emerald-500/15 text-emerald-300'
                    : r.kycStatus === 'PENDING' ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-red-500/15 text-red-300'
                  }`}>{r.kycStatus}</span>
                </td>
                <td>
                  {r.suspendedAt ? (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300" title={r.suspendedReason ?? ''}>
                      ⊘ 已暫停
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">—</span>
                  )}
                </td>
                <td className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleDateString('zh-HK')}</td>
                <td className="text-right text-slate-400">{r._count?.proposedOffers ?? 0}</td>
                <td className="text-right text-slate-400">{r._count?.sellerReviewsReceived ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedId && (
        <UserDrawer
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// ─── Drawer ──────────────────────────────────────────────────────────

function UserDrawer({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Suspend inline confirm state (Lesson #16)
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true); setErr(null);
    api.admin.userDetail(userId)
      .then(setData)
      .catch((e: any) => setErr(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [userId]);

  async function doSuspend() {
    setBusy(true); setErr(null);
    try {
      await api.admin.suspendUser(userId, suspendReason.trim());
      setSuspendOpen(false);
      setSuspendReason('');
      load();
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '暫停失敗');
    } finally {
      setBusy(false);
    }
  }

  async function doUnsuspend() {
    if (!confirm('確定恢復此帳戶？')) return;
    setBusy(true); setErr(null);
    try {
      await api.admin.unsuspendUser(userId);
      load();
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '恢復失敗');
    } finally {
      setBusy(false);
    }
  }

  // ── KYC change ──
  const [kycOpen, setKycOpen] = useState(false);
  const [kycNew, setKycNew] = useState<'PENDING' | 'VERIFIED' | 'REJECTED'>('PENDING');
  const [kycReason, setKycReason] = useState('');
  async function doKycChange() {
    setBusy(true); setErr(null);
    try {
      await api.admin.setKyc(userId, kycNew, kycReason.trim() || undefined);
      setKycOpen(false); setKycReason('');
      load(); onChanged();
    } catch (e: any) {
      setErr(e?.message ?? 'KYC 改動失敗');
    } finally { setBusy(false); }
  }

  // ── Role change ──
  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesDraft, setRolesDraft] = useState<string[]>([]);
  function openRoleEdit() {
    setRolesDraft([...(data?.roles ?? [])]);
    setRolesOpen(true);
  }
  function toggleRole(r: string) {
    setRolesDraft((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }
  async function doRoleChange() {
    setBusy(true); setErr(null);
    try {
      await api.admin.setRoles(userId, rolesDraft);
      setRolesOpen(false);
      load(); onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '角色改動失敗');
    } finally { setBusy(false); }
  }

  // ── Email verified toggle ──
  const [evToggleOpen, setEvToggleOpen] = useState(false);
  const [evReason, setEvReason] = useState('');
  async function doEvToggle(newValue: boolean) {
    setBusy(true); setErr(null);
    try {
      await api.admin.setEmailVerified(userId, newValue, evReason.trim() || undefined);
      setEvToggleOpen(false); setEvReason('');
      load(); onChanged();
    } catch (e: any) {
      setErr(e?.message ?? 'Email verified 改動失敗');
    } finally { setBusy(false); }
  }

  // ── Reset password ──
  const [resetOpen, setResetOpen] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  async function doResetPassword() {
    setBusy(true); setErr(null);
    try {
      const r = await api.admin.resetPassword(userId);
      setTempPw(r.tempPassword);
      load(); onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '重設密碼失敗');
    } finally { setBusy(false); }
  }

  // ── Admin notes ──
  const [notes, setNotes] = useState<any[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  function loadNotes() {
    api.admin.listNotes(userId).then(setNotes).catch(() => {});
  }
  useEffect(loadNotes, [userId]);
  async function doAddNote() {
    if (!noteDraft.trim()) return;
    setBusy(true); setErr(null);
    try {
      await api.admin.addNote(userId, noteDraft.trim());
      setNoteDraft('');
      loadNotes();
    } catch (e: any) {
      setErr(e?.message ?? '加 note 失敗');
    } finally { setBusy(false); }
  }

  // ── Display name override ──
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameReason, setNameReason] = useState('');
  function openNameEdit() {
    setNameDraft(data?.displayName ?? '');
    setNameReason('');
    setNameOpen(true);
  }
  async function doNameOverride() {
    setBusy(true); setErr(null);
    try {
      await api.admin.overrideDisplayName(userId, nameDraft.trim(), nameReason.trim());
      setNameOpen(false);
      load(); onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '改名失敗');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950 px-5 py-3">
          <h2 className="text-base font-semibold">User Detail</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800">✕</button>
        </div>

        {loading && <p className="p-5 text-sm text-slate-400">載入中…</p>}
        {err && <p className="m-5 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

        {data && (
          <div className="space-y-5 p-5">
            {/* Profile */}
            <section>
              <div className="flex items-center gap-3">
                {data.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.avatarUrl} className="h-12 w-12 rounded-full" alt="" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-lg font-bold">
                    {(data.displayName || data.email || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium">{data.displayName}</p>
                  <p className="truncate text-xs text-slate-400">{data.email}</p>
                </div>
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                <Row label="User ID" value={<span className="font-mono">{data.id}</span>} />
                <Row label="加入" value={new Date(data.createdAt).toLocaleString('zh-HK')} />
                <Row label="Email 驗証" value={data.emailVerified ? '✓ 已驗証' : '— 未驗証'} />
                <Row label="角色" value={data.roles.join(' · ')} />
                <Row label="KYC" value={
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    data.kycStatus === 'VERIFIED' ? 'bg-emerald-500/15 text-emerald-300'
                    : data.kycStatus === 'PENDING' ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-red-500/15 text-red-300'
                  }`}>{data.kycStatus}</span>
                } />
              </dl>
            </section>

            {/* Suspend state */}
            {data.suspendedAt ? (
              <section className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-sm font-semibold text-red-300">⊘ 帳戶已被暫停</p>
                <p className="mt-1 text-xs text-red-200">原因：{data.suspendedReason ?? '—'}</p>
                <p className="mt-1 text-[10px] text-red-300/70">
                  喺 {new Date(data.suspendedAt).toLocaleString('zh-HK')}
                </p>
                <button
                  onClick={doUnsuspend}
                  disabled={busy}
                  className="mt-3 w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                >
                  恢復帳戶
                </button>
              </section>
            ) : (
              <section>
                {!suspendOpen ? (
                  <button
                    onClick={() => setSuspendOpen(true)}
                    disabled={busy}
                    className="w-full rounded-md border border-red-500/50 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    暫停帳戶
                  </button>
                ) : (
                  <div className="space-y-2 rounded-md border border-red-500/40 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-red-300">⚠ 暫停後該用戶將無法登入或落單</p>
                    <textarea
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      placeholder="請輸入暫停原因（fraud / 違反條款 / KYC 文件偽造 ...）"
                      rows={3}
                      className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-red-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSuspendOpen(false); setSuspendReason(''); }}
                        disabled={busy}
                        className="flex-1 rounded-md bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
                      >取消</button>
                      <button
                        onClick={doSuspend}
                        disabled={busy || !suspendReason.trim()}
                        className="flex-1 rounded-md bg-red-700 px-3 py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                      >
                        {busy ? '處理中…' : '確認暫停'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Activity counts */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">活動數據</h3>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Stat label="商品" value={data._count?.listings ?? 0} />
                <Stat label="議價" value={data._count?.proposedOffers ?? 0} />
                <Stat label="評價" value={data._count?.sellerReviewsReceived ?? 0} />
              </div>
            </section>

            {/* OAuth */}
            {data.oauthAccounts?.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">已連接 SSO</h3>
                <ul className="space-y-1 text-xs">
                  {data.oauthAccounts.map((a: any, i: number) => (
                    <li key={i} className="rounded bg-slate-900 px-2 py-1.5">
                      {a.provider} · {new Date(a.createdAt).toLocaleDateString('zh-HK')}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recent orders */}
            {data.recentOrders?.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">最近訂單</h3>
                <ul className="space-y-1.5 text-xs">
                  {data.recentOrders.map((o: any) => (
                    <li key={o.id} className="rounded bg-slate-900 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{o.listing.title}</span>
                        <span className="shrink-0 text-slate-400">HKD {o.salePriceHKD.toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{o.role} · {o.status}</span>
                        <span>{new Date(o.createdAt).toLocaleDateString('zh-HK')}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Audit log */}
            {data.recentActions?.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">Admin 操作紀錄</h3>
                <ul className="space-y-1.5 text-xs">
                  {data.recentActions.map((a: any) => (
                    <li key={a.id} className="rounded bg-slate-900 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{a.action}</span>
                        <span className="text-[10px] text-slate-500">{new Date(a.createdAt).toLocaleString('zh-HK')}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        by {a.actor?.displayName ?? a.actorId}
                        {a.payload?.reason && <> · {a.payload.reason}</>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── KYC three-way toggle ────────────────────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">KYC 狀態</h3>
              {!kycOpen ? (
                <div className="flex items-center justify-between gap-2 rounded bg-slate-900 px-3 py-2">
                  <span className={`text-xs ${
                    data.kycStatus === 'VERIFIED' ? 'text-emerald-300'
                    : data.kycStatus === 'PENDING' ? 'text-amber-300' : 'text-red-300'
                  }`}>{data.kycStatus}</span>
                  <button onClick={() => { setKycNew(data.kycStatus); setKycOpen(true); }} className="text-xs text-brand-300 hover:underline">修改 →</button>
                </div>
              ) : (
                <div className="space-y-2 rounded border border-slate-700 bg-slate-900 p-3">
                  <label className="block text-xs">
                    <span className="block text-slate-400">新狀態</span>
                    <select value={kycNew} onChange={(e) => setKycNew(e.target.value as any)}
                      className="mt-1 w-full rounded bg-slate-950 px-2 py-1.5 text-sm">
                      <option value="PENDING">PENDING（重新審核）</option>
                      <option value="VERIFIED">VERIFIED</option>
                      <option value="REJECTED">REJECTED（自動暫停）</option>
                    </select>
                  </label>
                  {(kycNew === 'REJECTED' || kycNew === 'PENDING') && (
                    <textarea value={kycReason} onChange={(e) => setKycReason(e.target.value)}
                      placeholder="原因（必填）" rows={2}
                      className="w-full rounded bg-slate-950 p-2 text-xs" />
                  )}
                  {kycNew === 'REJECTED' && (
                    <p className="rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
                      ⚠ REJECTED 會同時自動暫停此帳戶（Q1=A）
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setKycOpen(false)} className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs">取消</button>
                    <button onClick={doKycChange} disabled={busy || data.kycStatus === kycNew}
                      className="flex-1 rounded bg-brand-700 px-2 py-1.5 text-xs disabled:opacity-50">確認</button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Role toggle ─────────────────────────────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">角色</h3>
              {!rolesOpen ? (
                <div className="flex items-center justify-between gap-2 rounded bg-slate-900 px-3 py-2">
                  <span className="truncate text-xs">{data.roles.join(' · ')}</span>
                  <button onClick={openRoleEdit} className="shrink-0 text-xs text-brand-300 hover:underline">修改 →</button>
                </div>
              ) : (
                <div className="space-y-2 rounded border border-slate-700 bg-slate-900 p-3">
                  <p className="text-[10px] text-slate-400">勾選即添加；移除最後 admin role 會被 reject。</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['BUYER', 'SELLER', 'AUTHENTICATOR', 'OPS_AGENT', 'OPS_ADMIN', 'SUPER_ADMIN'].map((r) => (
                      <label key={r} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={rolesDraft.includes(r)} onChange={() => toggleRole(r)} />
                        <span className={['OPS_ADMIN', 'SUPER_ADMIN'].includes(r) ? 'text-amber-300' : ''}>{r}</span>
                      </label>
                    ))}
                  </div>
                  <div className="rounded bg-slate-950 p-2 text-[10px] text-slate-400">
                    Diff：
                    {rolesDraft.filter((r) => !data.roles.includes(r)).map((r) => <span key={r} className="ml-1 text-emerald-300">+{r}</span>)}
                    {data.roles.filter((r: string) => !rolesDraft.includes(r)).map((r: string) => <span key={r} className="ml-1 text-red-300">−{r}</span>)}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setRolesOpen(false)} className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs">取消</button>
                    <button onClick={doRoleChange} disabled={busy} className="flex-1 rounded bg-brand-700 px-2 py-1.5 text-xs disabled:opacity-50">確認</button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Email verified toggle ───────────────────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">Email 驗証</h3>
              <div className="flex items-center justify-between gap-2 rounded bg-slate-900 px-3 py-2">
                <span className="text-xs">{data.emailVerified ? '✓ 已驗証' : '— 未驗証'}</span>
                {data.emailVerified ? (
                  !evToggleOpen ? (
                    <button onClick={() => setEvToggleOpen(true)} className="text-xs text-red-300 hover:underline">移除驗証</button>
                  ) : (
                    <div className="flex gap-1">
                      <input value={evReason} onChange={(e) => setEvReason(e.target.value)} placeholder="原因" className="rounded bg-slate-950 px-2 py-1 text-xs" />
                      <button onClick={() => doEvToggle(false)} disabled={busy} className="rounded bg-red-700 px-2 py-1 text-xs">確認</button>
                      <button onClick={() => setEvToggleOpen(false)} className="rounded bg-slate-800 px-2 py-1 text-xs">×</button>
                    </div>
                  )
                ) : (
                  <button onClick={() => doEvToggle(true)} disabled={busy} className="text-xs text-brand-300 hover:underline">手動驗証 →</button>
                )}
              </div>
            </section>

            {/* ── Display name override ───────────────────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">顯示名稱 override</h3>
              {!nameOpen ? (
                <div className="flex items-center justify-between gap-2 rounded bg-slate-900 px-3 py-2">
                  <span className="truncate text-xs">{data.displayName}</span>
                  <button onClick={openNameEdit} className="shrink-0 text-xs text-brand-300 hover:underline">修改 →</button>
                </div>
              ) : (
                <div className="space-y-2 rounded border border-slate-700 bg-slate-900 p-3">
                  <p className="text-[10px] text-amber-300">⚠ 改名會通知用戶（audit log 已 flag）</p>
                  <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="新顯示名稱" maxLength={40} className="w-full rounded bg-slate-950 px-2 py-1.5 text-sm" />
                  <textarea value={nameReason} onChange={(e) => setNameReason(e.target.value)} placeholder="原因（必填，例如：違反 ToS）" rows={2} className="w-full rounded bg-slate-950 p-2 text-xs" />
                  <div className="flex gap-2">
                    <button onClick={() => setNameOpen(false)} className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs">取消</button>
                    <button onClick={doNameOverride} disabled={busy || !nameDraft.trim() || !nameReason.trim()}
                      className="flex-1 rounded bg-brand-700 px-2 py-1.5 text-xs disabled:opacity-50">確認改名</button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Reset password ──────────────────────────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">重設密碼</h3>
              {tempPw ? (
                <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/10 p-3">
                  <p className="text-[10px] text-amber-200">⚠ 臨時密碼只顯示一次，請即時通知用戶：</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-slate-950 px-2 py-1.5 text-sm font-mono text-amber-200">{tempPw}</code>
                    <button onClick={() => navigator.clipboard.writeText(tempPw)} className="rounded bg-slate-800 px-2 py-1.5 text-xs">複製</button>
                  </div>
                  <button onClick={() => setTempPw(null)} className="w-full rounded bg-slate-800 px-2 py-1.5 text-xs">完成</button>
                </div>
              ) : !resetOpen ? (
                <button onClick={() => setResetOpen(true)} className="w-full rounded border border-amber-500/40 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10">
                  產生臨時密碼
                </button>
              ) : (
                <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-[10px] text-amber-300">⚠ 將產生 10 字元臨時密碼，舊密碼立即失效</p>
                  <div className="flex gap-2">
                    <button onClick={() => setResetOpen(false)} className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs">取消</button>
                    <button onClick={() => { setResetOpen(false); doResetPassword(); }} disabled={busy} className="flex-1 rounded bg-amber-700 px-2 py-1.5 text-xs">確認</button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Admin notes (append-only history) ───────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">內部備注 ({notes.length})</h3>
              <div className="space-y-2 rounded border border-slate-800 bg-slate-900 p-3">
                <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="加新 note（append-only history，用戶睇唔到）" rows={2}
                  className="w-full rounded bg-slate-950 p-2 text-xs" />
                <button onClick={doAddNote} disabled={busy || !noteDraft.trim()} className="w-full rounded bg-brand-700 px-2 py-1.5 text-xs disabled:opacity-50">加入 note</button>
                {notes.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {notes.map((n) => (
                      <li key={n.id} className="rounded bg-slate-950 px-2 py-1.5 text-[11px]">
                        <p className="whitespace-pre-wrap text-slate-200">{n.body}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {n.author?.displayName ?? n.authorId} · {new Date(n.createdAt).toLocaleString('zh-HK')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right text-slate-200">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-slate-900 px-2 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
