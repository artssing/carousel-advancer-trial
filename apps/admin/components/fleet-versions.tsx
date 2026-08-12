'use client';

/**
 * Fleet versions — the four containers side by side, with a drift verdict.
 *
 * The founder's actual problem is not "what version is this page"; it is that
 * the four images are built and tagged independently and on 2026-08-10 spanned
 * 18h41m without anyone noticing. Four separate badges across three portals
 * cannot answer that — you would need three tabs and mental arithmetic. This is
 * the one screen where a rollback decision can be made.
 */
import { useEffect, useState } from 'react';
import { shortSha, formatBuiltAt } from '@authentik/ui';

interface FleetEntry {
  service: string;
  version?: string | null;
  commit: string | null;
  builtAt: string | null;
  error?: string;
}

/** Thresholds are about deploy mechanics, not aesthetics: a four-service build
 *  takes minutes, so anything past half an hour means one of them did not get
 *  rebuilt — and past four hours it is certainly a different day's code. */
const AMBER_MS = 30 * 60 * 1000;
const RED_MS = 4 * 60 * 60 * 1000;

function drift(entries: FleetEntry[]): { tone: 'ok' | 'warn' | 'bad'; label: string } {
  if (entries.some((e) => e.error || !e.commit)) {
    return { tone: 'bad', label: '有服務答唔到' };
  }
  if (entries.some((e) => e.commit === 'dev' || e.commit === 'unknown')) {
    return { tone: 'bad', label: '有服務未 stamp（dev）' };
  }
  if (new Set(entries.map((e) => e.version ?? '?')).size > 1) {
    return { tone: 'bad', label: '版本號唔一致' };
  }
  if (new Set(entries.map((e) => e.commit)).size === 1) {
    return { tone: 'ok', label: `四個都係 v${entries[0]?.version ?? '?'}，同一個 commit` };
  }
  const times = entries.map((e) => (e.builtAt ? new Date(e.builtAt).getTime() : NaN));
  if (times.some(Number.isNaN)) return { tone: 'warn', label: 'commit 唔一致' };
  const spread = Math.max(...times) - Math.min(...times);
  if (spread > RED_MS) return { tone: 'bad', label: `版本不一致 · 相差 ${Math.round(spread / 3600000)} 個鐘` };
  if (spread > AMBER_MS) return { tone: 'warn', label: `相差 ${Math.round(spread / 60000)} 分鐘` };
  return { tone: 'warn', label: 'commit 唔同但同期 build' };
}

const TONE = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-400' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-400' },
  bad: { dot: 'bg-red-500', text: 'text-red-400' },
} as const;

export function FleetVersions() {
  const [entries, setEntries] = useState<FleetEntry[] | null>(null);

  useEffect(() => {
    fetch('/api/fleet-version', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEntries(d?.services ?? []))
      .catch(() => setEntries([]));
  }, []);

  if (!entries) {
    return <div className="mt-8 h-32 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />;
  }
  if (entries.length === 0) return null;

  const d = drift(entries);
  const tone = TONE[d.tone];

  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">Fleet versions</h2>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {d.label}
        </span>
      </div>
      <table className="mt-3 w-full text-left text-xs">
        <tbody>
          {entries.map((e) => (
            <tr key={e.service} className="border-t border-slate-800/70">
              <td className="py-1.5 pr-3 font-medium text-slate-300">{e.service}</td>
              <td className="py-1.5 pr-3 font-mono tabular-nums text-slate-200">
                {e.version ? `v${e.version}` : '—'}
              </td>
              <td className="py-1.5 pr-3 font-mono tabular-nums text-slate-500">
                {formatBuiltAt(e.builtAt) ?? '—'}
              </td>
              <td className="py-1.5 pr-3 font-mono text-slate-400">
                {e.commit ? shortSha(e.commit) : '—'}
              </td>
              <td className="py-1.5 text-right">
                {e.error ? (
                  <span className="text-red-400">{e.error}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(e.commit ?? '')}
                    title={`copy ${e.commit}`}
                    className="text-slate-500 transition hover:text-slate-300"
                  >
                    copy sha
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-slate-500">
        每個容器答自己嗰個 build。要 rollback 就用 <span className="font-mono">certifine-&lt;app&gt;:&lt;env&gt;-&lt;sha&gt;</span> 嗰個釘死 tag。
      </p>
    </div>
  );
}
