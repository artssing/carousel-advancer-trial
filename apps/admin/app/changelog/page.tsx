'use client';

/**
 * Admin → Changelog. Renders the repo's CHANGELOG.md served by
 * /api/changelog, so what is on screen is the changelog inside THIS image —
 * it moves only when a deploy moves it.
 *
 * Rendering is a deliberately small markdown subset (headings, tables, lists,
 * code spans, bold). Pulling in a markdown library to render one internal file
 * would cost more than it returns, and the format is ours: if a future entry
 * needs something richer, add it here rather than loosening the parser.
 */
import { useEffect, useState } from 'react';
import { VersionBadge } from '@certifine/ui';

/** Bold and `code` inside a line of text. */
function inline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${key}-${i}`} className="text-slate-100">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code key={`${key}-${i}`} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-200">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${key}-${i}`}>{p}</span>;
  });
}

function renderMarkdown(md: string) {
  const out: React.ReactNode[] = [];
  const lines = md.split('\n');
  let list: string[] = [];
  let table: string[][] = [];

  const flushList = (k: string) => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${k}`} className="mb-4 ml-5 list-disc space-y-1 text-sm text-slate-400">
        {list.map((li, i) => <li key={i}>{inline(li, `${k}-${i}`)}</li>)}
      </ul>,
    );
    list = [];
  };
  const flushTable = (k: string) => {
    if (!table.length) return;
    const [head, ...body] = table;
    out.push(
      <div key={`tb-${k}`} className="mb-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-300">
              {head?.map((c, i) => <th key={i} className="py-1.5 pr-4 font-semibold">{inline(c, `h${i}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className="border-b border-slate-800/60 text-slate-400">
                {row.map((c, i) => <td key={i} className="py-1.5 pr-4">{inline(c, `c${r}${i}`)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((raw, n) => {
    const line = raw.trimEnd();
    const k = String(n);

    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      // The |---|---| separator row carries no content.
      if (!cells.every((c) => /^:?-+:?$/.test(c))) table.push(cells);
      return;
    }
    flushTable(k);

    if (/^[-*] /.test(line)) { list.push(line.slice(2)); return; }
    flushList(k);

    if (line.startsWith('### ')) {
      out.push(<h3 key={k} className="mb-2 mt-5 text-sm font-semibold text-slate-200">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      out.push(<h2 key={k} className="mb-3 mt-8 border-t border-slate-800 pt-6 text-lg font-bold text-white">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      out.push(<h1 key={k} className="mb-4 text-2xl font-bold text-white">{line.slice(2)}</h1>);
    } else if (line === '---' || line === '') {
      // paragraph break — the spacing above already covers it
    } else {
      out.push(<p key={k} className="mb-3 text-sm leading-relaxed text-slate-400">{inline(line, k)}</p>);
    }
  });
  flushList('end');
  flushTable('end');
  return out;
}

export default function ChangelogPage() {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/changelog', { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setMd)
      .catch((e) => setError(e?.message ?? '讀唔到 CHANGELOG.md'));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Changelog</h1>
          <p className="mt-1 text-sm text-slate-400">
            呢一份係 <span className="font-mono">CHANGELOG.md</span>，同呢個 image 一齊 ship —— 佢淨係會喺 deploy 之後先變。
          </p>
        </div>
        <VersionBadge label="admin" className="shrink-0 text-xs text-slate-400 hover:text-slate-200" />
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {!md && !error && <div className="h-64 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />}
      {md && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">{renderMarkdown(md)}</div>
      )}
    </div>
  );
}
