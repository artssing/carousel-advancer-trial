'use client';

import { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';
import { api } from '@/lib/api';

type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
type Audience = 'ALL' | 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS';

interface Banner {
  id: string;
  message: string;
  severity: Severity;
  audience: Audience;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  dismissible: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

const SEVERITY_LABEL: Record<Severity, string> = { INFO: 'INFO', WARNING: 'WARNING', CRITICAL: 'CRITICAL' };
const SEVERITY_COLOR: Record<Severity, string> = {
  INFO: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  WARNING: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  CRITICAL: 'bg-red-500/25 text-red-300 border-red-500/50',
};
const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: '所有用戶', BUYERS: '買家', SELLERS: '賣家', AUTHENTICATORS: '鑑定師',
};

/**
 * Admin Emergency Banners page.
 * Founder ruling 2026-06-30: admin controls message + severity + count.
 * Hard cap = 3 active banners globally (server-enforced).
 */
export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    setLoading(true);
    api.banners.listAll()
      .then(setBanners)
      .catch((e: any) => setErr(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  const activeCount = banners.filter((b) => b.isActive).length;

  return (
    <div className="px-8 py-8 text-slate-100">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Emergency Banners</h1>
          <p className="mt-1 text-xs text-slate-400">
            全站緊急通知 — 消費者 / 鑑定師 portal 頂部橫幅。硬性上限 3 條 active banners（server 端 enforce）。
            訊息會被 sanitize 為純文字。
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setCreating(true); setEditing(null); }}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
        >
          + 新增 Banner
        </button>
      </div>

      <p className="mt-4 text-xs">
        <span className="text-slate-400">當前 active：</span>
        <span className={`ml-1 font-semibold ${activeCount >= 3 ? 'text-red-300' : 'text-emerald-300'}`}>
          {activeCount} / 3
        </span>
      </p>

      {err && <p className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">載入中…</p>
      ) : banners.length === 0 ? (
        <p className="mt-6 rounded border border-slate-800 bg-slate-900 p-4 text-center text-sm text-slate-400">
          冇任何 banner。撳「新增 Banner」創建。
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {banners.map((b) => (
            <BannerRow key={b.id} banner={b}
              onEdit={() => { setEditing(b); setCreating(false); }}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <BannerFormOverlay
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function BannerRow({ banner, onEdit, onChanged }: { banner: Banner; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggle() {
    setBusy(true); setErr(null);
    try {
      await api.banners.update(banner.id, { isActive: !banner.isActive });
      onChanged();
    } catch (e: any) { setErr(e?.message ?? '更新失敗'); }
    finally { setBusy(false); }
  }
  async function del() {
    setBusy(true); setErr(null);
    try {
      await api.banners.remove(banner.id);
      onChanged();
    } catch (e: any) { setErr(e?.message ?? '刪除失敗'); setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_COLOR[banner.severity]}`}>
          {SEVERITY_LABEL[banner.severity]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm text-slate-100">{banner.message}</p>
          <p className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
            <span>對象：{AUDIENCE_LABEL[banner.audience]}</span>
            <span>·</span>
            <span>優先度：{banner.priority}</span>
            <span>·</span>
            <span>{banner.dismissible ? '可關閉' : '不可關閉'}</span>
            {banner.startsAt && <><span>·</span><span>由 {new Date(banner.startsAt).toLocaleString('zh-HK')}</span></>}
            {banner.endsAt && <><span>·</span><span>至 {new Date(banner.endsAt).toLocaleString('zh-HK')}</span></>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            banner.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
          }`}>
            {banner.isActive ? 'ACTIVE' : 'INACTIVE'}
          </span>
          <button
            onClick={toggle}
            disabled={busy}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            {banner.isActive ? '停用' : '啟用'}
          </button>
          <button
            onClick={onEdit}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            編輯
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
            >
              刪除
            </button>
          ) : (
            <>
              <button onClick={del} disabled={busy}
                className="rounded bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-40">
                確認
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">
                取消
              </button>
            </>
          )}
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

function BannerFormOverlay({ initial, onClose, onSaved }: {
  initial: Banner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState(initial?.message ?? '');
  const [severity, setSeverity] = useState<Severity>(initial?.severity ?? 'INFO');
  const [audience, setAudience] = useState<Audience>(initial?.audience ?? 'ALL');
  const [isActive, setIsActive] = useState(initial?.isActive ?? false);
  const [dismissible, setDismissible] = useState(initial?.dismissible ?? true);
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [startsAt, setStartsAt] = useState(initial?.startsAt?.slice(0, 16) ?? '');
  const [endsAt, setEndsAt] = useState(initial?.endsAt?.slice(0, 16) ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!initial;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const payload = {
        message, severity, audience, isActive, dismissible, priority,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      };
      if (isEdit && initial) await api.banners.update(initial.id, payload);
      else await api.banners.create(payload);
      onSaved();
    } catch (e: any) { setErr(e?.message ?? '儲存失敗'); }
    finally { setBusy(false); }
  }

  const previewIcon = severity === 'CRITICAL' ? <AlertOctagon className="h-4 w-4" />
    : severity === 'WARNING' ? <AlertTriangle className="h-4 w-4" />
    : <Info className="h-4 w-4" />;
  const previewBar = severity === 'CRITICAL' ? 'bg-red-600 text-white'
    : severity === 'WARNING' ? 'bg-amber-50 border border-amber-300 text-amber-900'
    : 'bg-blue-50 border border-blue-200 text-blue-900';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-16 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? '編輯 Banner' : '新增 Banner'}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="mb-4">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">預覽</p>
          <div className={`${previewBar} rounded px-3 py-2 text-sm`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{previewIcon}</span>
              <p className="flex-1 leading-snug">{message || '（訊息預覽）'}</p>
              {dismissible && <X className="h-4 w-4 shrink-0 opacity-70" />}
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-400">訊息（純文字，上限 200 字） *</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={200}
              required
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-400"
            />
            <span className="mt-0.5 block text-right text-[10px] text-slate-500">{message.length}/200</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400">嚴重程度</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="INFO">INFO — 一般公告</option>
                <option value="WARNING">WARNING — 需注意</option>
                <option value="CRITICAL">CRITICAL — 緊急</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">對象</span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="ALL">所有用戶</option>
                <option value="BUYERS">買家（consumer）</option>
                <option value="SELLERS">賣家（consumer）</option>
                <option value="AUTHENTICATORS">鑑定師 portal</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400">生效時間（選填）</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">結束時間（選填）</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-brand-500" />
              <span className="text-xs">啟用中</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)}
                className="h-4 w-4 accent-brand-500" />
              <span className="text-xs">用戶可關閉</span>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">優先度</span>
              <input
                type="number" min={0} max={99}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>
          </div>
        </div>

        {err && <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            取消
          </button>
          <button type="submit" disabled={busy || !message.trim()}
            className="rounded bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-40">
            {busy ? '儲存中…' : (isEdit ? '儲存' : '建立')}
          </button>
        </div>
      </form>
    </div>
  );
}
