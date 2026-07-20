'use client';

/**
 * MTR station picker — structured location selection, free text never lands.
 *
 * Founder rulings 2026-07-08:
 *  - Full heavy-rail network (98 stations / 10 lines), typeahead SUGGESTIONS
 *    while typing (searchStations SSOT helper) — the typed string itself is
 *    never committed.
 *  - MULTI-candidate: seller picks up to `max` stations (買家落單時揀邊個)。
 *  - Continuous picking: the panel stays OPEN after each pick — station chips
 *    toggle on/off so the seller can tap several along the same line without
 *    re-opening; 「完成」 closes.
 *
 * Committed value = official MTR station codes (e.g. ["MOK","TST"]); display
 * via stationDisplayLabel(). Empty state renders a dashed "＋ 選擇" target —
 * no text input masquerading as free text (lesson #11: no fake affordances).
 */
import { useMemo, useRef, useState } from 'react';
import { Check, MapPin, Search, X } from 'lucide-react';
import {
  MTR_LINES,
  type MTRLineKey,
  searchStations,
  stationsOfLine,
  linesForStation,
  stationDisplayLabel,
  lineToken,
  lineFromToken,
} from '@authentik/utils';

export function StationPicker({
  values,
  onChange,
  max = 3,
  placeholder = '＋ 選擇所在港鐵站（選填，最多 3 個候選）',
}: {
  values: string[];
  onChange: (codes: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeLine, setActiveLine] = useState<MTRLineKey | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const suggestions = useMemo(() => searchStations(query), [query]);
  const lineStations = useMemo(
    () => (activeLine ? stationsOfLine(activeLine) : []),
    [activeLine],
  );
  const atCap = values.length >= max;

  /** Toggle a station in/out; panel stays open for continuous picking. */
  function toggle(code: string) {
    if (values.includes(code)) {
      onChange(values.filter((v) => v !== code));
    } else if (!atCap) {
      onChange([...values, code]);
    }
    // Keep the query so typeahead flows: 揀完即清 query 返去綫 view 反而斷 flow
    // — but a committed suggestion usually ends that search, so clear it.
    if (query) setQuery('');
  }

  /**
   * Toggle a WHOLE line as one candidate (成條荃灣綫). Selecting a line
   * absorbs any individually-picked stations on that line (they'd be
   * redundant — the line already covers them).
   */
  function toggleLine(key: MTRLineKey) {
    const token = lineToken(key);
    if (values.includes(token)) {
      onChange(values.filter((v) => v !== token));
      return;
    }
    const lineCodes = new Set(stationsOfLine(key).map((s) => s.code));
    const kept = values.filter((v) => !lineCodes.has(v));
    if (kept.length >= max) return; // cap counts the line as one candidate
    onChange([...kept, token]);
  }

  function close() {
    setOpen(false);
    setQuery('');
    setActiveLine(null);
  }

  const chips = values.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-verify-soft px-3 py-1 text-sm font-medium text-brand-800"
        >
          <MapPin className="h-3.5 w-3.5 text-brand-600" />
          {stationDisplayLabel(code)}
          <button
            type="button"
            onClick={() => onChange(values.filter((v) => v !== code))}
            aria-label={`移除 ${stationDisplayLabel(code)}`}
            className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );

  // ── Collapsed ──
  if (!open) {
    return (
      <div className="mt-1 space-y-2">
        {chips}
        <button
          type="button"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          className="w-full rounded-lg border border-dashed border-line-2 px-3 py-2.5 text-left text-sm text-neutral-text-hint hover:border-brand-600 hover:text-brand-700"
        >
          {values.length > 0 ? `＋ 加候選站（${values.length}/${max}）` : placeholder}
        </button>
      </div>
    );
  }

  // ── Open picker panel ──
  return (
    <div className="mt-1 rounded-xl border border-line bg-white p-3 shadow-sh1">
      {/* Selected chips inside panel — live feedback while multi-picking */}
      {chips && <div className="mb-2">{chips}</div>}

      {/* Search + done */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-text-hint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveLine(null); }}
            placeholder="打站名（例：旺角）— 只可以喺建議入面揀"
            className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none placeholder:text-neutral-text-hint focus:border-brand-600"
          />
        </div>
        <button
          type="button"
          onClick={close}
          className="shrink-0 rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          完成
        </button>
      </div>

      {atCap && (
        <p className="mt-2 px-1 text-[11px] text-verdict-incon">
          已達 {max} 個候選上限 — 想換站請先移除一個
        </p>
      )}

      {/* Typeahead suggestions */}
      {query.trim() && (
        <div className="mt-2">
          {suggestions.length === 0 ? (
            <p className="px-1 py-2 text-xs text-neutral-text-muted">
              搵唔到「{query}」— 請由港鐵站揀選（唔可以自由填寫）
            </p>
          ) : (
            <div className="flex flex-col">
              {suggestions.map((s) => {
                const selected = values.includes(s.code);
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => toggle(s.code)}
                    disabled={!selected && atCap}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-40 ${selected ? 'text-brand-700' : 'text-ink'}`}
                  >
                    {selected
                      ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                      : <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-text-hint" />}
                    <span className="font-medium">{s.label}站</span>
                    <span className="ml-auto flex gap-1">
                      {linesForStation(s.code).map((l) => (
                        <span key={l.key} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} title={l.label} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Line drill-in (hidden while searching) */}
      {!query.trim() && (
        <>
          <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain pb-1">
            {MTR_LINES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setActiveLine(activeLine === l.key ? null : l.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  activeLine === l.key ? 'text-white' : 'bg-white hover:opacity-80'
                }`}
                style={
                  activeLine === l.key
                    ? { backgroundColor: l.color, borderColor: l.color }
                    : { borderColor: l.color, color: l.color }
                }
              >
                {l.label}
              </button>
            ))}
          </div>
          {activeLine && (() => {
            const lineCfg = MTR_LINES.find((l) => l.key === activeLine)!;
            const wholeLineSelected = values.includes(lineToken(activeLine));
            return (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* 成條綫 as ONE candidate — absorbs individual picks on the line */}
                <button
                  type="button"
                  onClick={() => toggleLine(activeLine)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    wholeLineSelected ? 'text-white' : 'bg-white hover:opacity-80'
                  }`}
                  style={
                    wholeLineSelected
                      ? { backgroundColor: lineCfg.color, borderColor: lineCfg.color }
                      : { borderColor: lineCfg.color, color: lineCfg.color }
                  }
                >
                  {wholeLineSelected && <Check className="h-3 w-3" />}
                  成條{lineCfg.label}
                </button>
                {lineStations.map((s) => {
                  const selected = values.includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggle(s.code)}
                      disabled={wholeLineSelected || (!selected && atCap)}
                      title={wholeLineSelected ? `已包含喺成條${lineCfg.label}內` : undefined}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                        selected
                          ? 'border-brand-600 bg-verify-soft text-brand-700'
                          : 'border-line bg-white text-ink hover:border-brand-600 hover:text-brand-700'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          {!activeLine && (
            <p className="mt-2 px-1 text-[11px] text-neutral-text-hint">
              揀一條綫連續多選（撳一下加、再撳取消），或者直接打站名搜尋
            </p>
          )}
        </>
      )}
    </div>
  );
}
