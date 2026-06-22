'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Row = { key: string; value: any; updatedAt: string };

/**
 * Admin platform-config page — list and toggle config entries.
 * Founder ruling 2026-06-11: featureGate-style keys (e.g. `videoUploadEnabled`)
 * use inline 2-step confirm (Lesson #16). OPS_ADMIN+ only.
 */
export default function PlatformConfigPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    api.admin.listPlatformConfig()
      .then(setRows)
      .catch((e: any) => setErr(e?.message ?? '載入失敗'))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  return (
    <div className="px-8 py-8 text-slate-100">
      <h1 className="text-2xl font-bold">Platform Config</h1>
      <p className="mt-1 text-xs text-slate-400">
        全平台 feature toggle 同 admin-tunable values。改動需要 OPS_ADMIN+ 權限，每次操作都會寫 audit log。
      </p>

      {err && <p className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">載入中…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded border border-slate-800 bg-slate-900 p-4 text-center text-sm text-slate-400">
          冇任何 config entry。
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <ConfigRow key={r.key} row={r} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  // Detect "enabled" flag-style config — render as toggle switch
  const isFlag = row.value && typeof row.value === 'object' && 'enabled' in row.value;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draftJson, setDraftJson] = useState(JSON.stringify(row.value, null, 2));
  const [jsonEditOpen, setJsonEditOpen] = useState(false);

  async function doToggle() {
    setBusy(true); setErr(null);
    try {
      const newValue = { ...row.value, enabled: !row.value.enabled };
      await api.admin.setPlatformConfig(row.key, newValue);
      setConfirmOpen(false);
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '改動失敗');
    } finally { setBusy(false); }
  }

  async function doJsonSave() {
    setBusy(true); setErr(null);
    try {
      const parsed = JSON.parse(draftJson);
      await api.admin.setPlatformConfig(row.key, parsed);
      setJsonEditOpen(false);
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? '改動失敗（JSON 格式錯誤？）');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium">{row.key}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            上次更新：{new Date(row.updatedAt).toLocaleString('zh-HK')}
          </p>
        </div>
        {isFlag ? (
          row.value.enabled ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">已啟用</span>
          ) : (
            <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">已停用</span>
          )
        ) : null}
      </div>

      <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-[11px] text-slate-300">{JSON.stringify(row.value, null, 2)}</pre>

      {err && <p className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{err}</p>}

      {isFlag ? (
        !confirmOpen ? (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            className={`mt-3 w-full rounded-md px-3 py-2 text-xs font-medium ${
              row.value.enabled
                ? 'border border-red-500/40 text-red-300 hover:bg-red-500/10'
                : 'bg-emerald-700 text-white hover:bg-emerald-600'
            }`}
          >
            {row.value.enabled ? '停用呢個功能' : '啟用呢個功能'}
          </button>
        ) : (
          <div className="mt-3 space-y-2 rounded border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-300">
              ⚠ 確認{row.value.enabled ? '停用' : '啟用'} <span className="font-mono">{row.key}</span>？
            </p>
            <p className="text-[10px] text-slate-400">
              改動會即時生效，所有用戶 next page load 即看到差別。Audit log 已 enabled。
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs">取消</button>
              <button onClick={doToggle} disabled={busy} className={`flex-1 rounded px-2 py-1.5 text-xs font-medium text-white ${row.value.enabled ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-700 hover:bg-emerald-600'}`}>
                {busy ? '處理中…' : '確認'}
              </button>
            </div>
          </div>
        )
      ) : (
        !jsonEditOpen ? (
          <button
            onClick={() => { setDraftJson(JSON.stringify(row.value, null, 2)); setJsonEditOpen(true); }}
            className="mt-3 w-full rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
          >修改 JSON 值</button>
        ) : (
          <div className="mt-3 space-y-2">
            <textarea
              value={draftJson}
              onChange={(e) => setDraftJson(e.target.value)}
              rows={6}
              className="w-full rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-200"
            />
            <div className="flex gap-2">
              <button onClick={() => setJsonEditOpen(false)} className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs">取消</button>
              <button onClick={doJsonSave} disabled={busy} className="flex-1 rounded bg-brand-700 px-2 py-1.5 text-xs font-medium">
                {busy ? '處理中…' : '儲存'}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
