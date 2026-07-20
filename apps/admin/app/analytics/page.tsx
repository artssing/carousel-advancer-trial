'use client';

/**
 * Analytics dashboard（analytics-tagging-spec.md §8 + analytics-charts-ia-proposal.md，
 * founder 2026-07-14 批：5-tab IA + A1 六個 chart）。
 *
 * Tab IA：總覽（日常 3 秒判斷）/ 交易健康 / 商品與搜尋 / 鑑定師營運 / 排查工具。
 * Real-time counter 10s polling；minute timeseries 30s auto-refresh。
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Overview = { membersOnline: number; guestsOnline: number; authenticatorsOnline: number; asOf: string };
type Split = { days: number; guest: number; member: number };
type SearchRow = { query: string; count: number; avgResults: number; zeroCount: number };
type Funnel = { days: number; steps: Array<{ name: string; label: string; count: number }> };
type EventRow = {
  id: string; eventName: string; occurredAt: string; portal: string;
  anonymousId: string; userId: string | null; role: string; sessionId: string;
  pagePath: string; properties: Record<string, unknown>;
};
type Timeseries = { interval: string; eventName: string; buckets: Array<{ t: string; count: number }> };
type ListingStat = {
  listingId: string; title: string; priceHKD: number | null; status: string | null;
  views: number; uniqueViewers: number; avgDwellSeconds: number | null;
  orders: number; conversionRate: number | null;
};
type Outcomes = { days: number; buckets: Array<{ name: string; label: string; count: number }> };
type TierFunnel = { days: number; tiers: Array<{ tier: number; steps: Array<{ name: string; count: number }> }> };
type NorthStar = {
  mau: number; gmvHKD: number; authPassRate: number | null;
  slaMetRate: number | null; disputeRate: number | null; takeRate: number | null;
};
type SlaRow = { name: string; jobs: number; avgHours: number; breaches: number };
type ZeroTrend = { days: string[]; series: Array<{ query: string; counts: number[] }> };

const TS_EVENTS = [
  { value: 'page_view', label: 'Page views' },
  { value: 'session_started', label: 'Sessions' },
  { value: 'search_performed', label: 'Searches' },
  { value: 'listing_viewed', label: 'Listing views' },
  { value: 'checkout_completed', label: '完成付款' },
];

const TABS = [
  { id: 'overview', label: '總覽' },
  { id: 'transactions', label: '交易健康' },
  { id: 'listings', label: '商品與搜尋' },
  { id: 'authenticators', label: '鑑定師營運' },
  { id: 'investigation', label: '排查工具' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const FUNNEL_STEP_LABEL: Record<string, string> = {
  listing_viewed: '睇過商品',
  checkout_started: '進入結帳',
  checkout_completed: '完成付款',
  order_completed: '訂單完成',
};

const OUTCOME_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500',
  AUTH_FAILED: 'bg-red-500',
  DISPUTED: 'bg-amber-500',
  REFUNDED: 'bg-purple-500',
  IN_FLIGHT: 'bg-slate-600',
};

const TREND_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#38bdf8'];

function fmtDwell(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}
function fmtPct(v: number | null): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [searches, setSearches] = useState<SearchRow[]>([]);
  const [zeroOnly, setZeroOnly] = useState(false);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [listingStats, setListingStats] = useState<ListingStat[]>([]);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [tierFunnel, setTierFunnel] = useState<TierFunnel | null>(null);
  const [northStar, setNorthStar] = useState<NorthStar | null>(null);
  const [sla, setSla] = useState<SlaRow[]>([]);
  const [zeroTrend, setZeroTrend] = useState<ZeroTrend | null>(null);

  const [tsInterval, setTsInterval] = useState<'hour' | 'minute'>('hour');
  const [tsEvent, setTsEvent] = useState('page_view');
  const [ts, setTs] = useState<Timeseries | null>(null);

  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [exploring, setExploring] = useState(false);

  // Real-time counters — 10s polling（所有 tab 都顯示，所以無條件 load）
  useEffect(() => {
    let alive = true;
    const load = () => api.analytics.overview().then((o) => alive && setOverview(o)).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Aggregates — per-tab lazy load（switch tab 先 fetch，減少無謂 query）
  useEffect(() => {
    if (tab === 'overview') {
      api.analytics.guestMemberSplit(days).then(setSplit).catch(() => {});
      api.analytics.northStar().then(setNorthStar).catch(() => {});
    }
    if (tab === 'transactions') {
      api.analytics.purchaseFunnel(days).then(setFunnel).catch(() => {});
      api.analytics.purchaseFunnelByTier(days).then(setTierFunnel).catch(() => {});
      api.analytics.orderOutcomes(days).then(setOutcomes).catch(() => {});
    }
    if (tab === 'listings') {
      api.analytics.listingStats(days).then(setListingStats).catch(() => {});
      api.analytics.zeroResultTrend(14).then(setZeroTrend).catch(() => {});
    }
    if (tab === 'authenticators') {
      api.analytics.slaHealth(30).then(setSla).catch(() => {});
    }
  }, [tab, days]);
  useEffect(() => {
    if (tab === 'listings') api.analytics.topSearches(days, zeroOnly).then(setSearches).catch(() => {});
  }, [tab, days, zeroOnly]);

  // Timeseries（總覽 tab）：minute 模式 30 秒自動 refresh
  useEffect(() => {
    if (tab !== 'overview') return;
    let alive = true;
    const span = tsInterval === 'minute' ? 60 : 48 * 60;
    const load = () =>
      api.analytics.timeseries(tsInterval, span, tsEvent).then((d) => alive && setTs(d)).catch(() => {});
    load();
    const t = tsInterval === 'minute' ? setInterval(load, 30_000) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [tab, tsInterval, tsEvent]);

  const explore = useCallback(async () => {
    if (!query.trim()) return;
    setExploring(true);
    try { setEvents(await api.analytics.events(query.trim())); }
    catch (e: any) { setError(e.message); }
    finally { setExploring(false); }
  }, [query]);

  const splitTotal = split ? split.guest + split.member : 0;

  return (
    <div className="px-8 py-8 text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">Event pipeline · real-time counters 每 10 秒更新</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          <option value={1}>過去 24 小時</option>
          <option value={7}>過去 7 日</option>
          <option value={30}>過去 30 日</option>
        </select>
      </div>

      {error && <p className="mt-3 rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* ═══ Real-time counters — 逢 tab 都見（「而家有幾多人」永遠 relevant）═══ */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Counter label="買家 / 賣家在線" value={overview?.membersOnline} accent="text-emerald-400" />
        <Counter label="Guest 瀏覽緊" value={overview?.guestsOnline} accent="text-sky-400" />
        <Counter label="鑑定師在線" value={overview?.authenticatorsOnline} accent="text-indigo-400" />
      </div>

      {/* ═══ Tabs ═══ */}
      <div className="mt-6 flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm transition ${
              tab === t.id
                ? 'border border-b-0 border-slate-700 bg-slate-900 font-semibold text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═════════ Tab 1：總覽 ═════════ */}
      {tab === 'overview' && (
        <div className="mt-6 space-y-6">
          {/* North-star KPI（30 日 rolling） */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="MAU（30 日）" value={northStar ? String(northStar.mau) : '—'} />
            <Kpi label="GMV（30 日）" value={northStar ? `HK$${northStar.gmvHKD.toLocaleString()}` : '—'} />
            <Kpi label="Auth pass rate" value={northStar ? fmtPct(northStar.authPassRate) : '—'} />
            <Kpi label="SLA met（48h）" value={northStar ? fmtPct(northStar.slaMetRate) : '—'} />
            <Kpi label="Dispute rate" value={northStar ? fmtPct(northStar.disputeRate) : '—'} />
            <Kpi label="Take rate" value={northStar ? fmtPct(northStar.takeRate) : '—'} />
          </div>

          {/* Guest vs Member */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Guest vs Member sessions（{days} 日）
            </h2>
            {split && splitTotal > 0 ? (
              <>
                <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-800">
                  <div className="bg-sky-500" style={{ width: `${(split.guest / splitTotal) * 100}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${(split.member / splitTotal) * 100}%` }} />
                </div>
                <div className="mt-3 flex gap-6 text-sm">
                  <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-500" />Guest {split.guest}（{Math.round((split.guest / splitTotal) * 100)}%）</span>
                  <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />Member {split.member}（{Math.round((split.member / splitTotal) * 100)}%）</span>
                </div>
              </>
            ) : <p className="mt-4 text-sm text-slate-500">暫無 session 數據</p>}
          </section>

          {/* Activity timeseries */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Activity — {tsInterval === 'minute' ? '每分鐘（近 60 分鐘，30 秒自動更新）' : '每小時（近 48 小時）'}
              </h2>
              <div className="flex gap-2">
                <select
                  value={tsEvent}
                  onChange={(e) => setTsEvent(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                >
                  {TS_EVENTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
                  <button
                    onClick={() => setTsInterval('hour')}
                    className={`px-3 py-1.5 ${tsInterval === 'hour' ? 'bg-indigo-600 font-semibold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                  >每小時</button>
                  <button
                    onClick={() => setTsInterval('minute')}
                    className={`px-3 py-1.5 ${tsInterval === 'minute' ? 'bg-indigo-600 font-semibold' : 'bg-slate-950 text-slate-400 hover:text-slate-200'}`}
                  >每分鐘</button>
                </div>
              </div>
            </div>
            {ts && ts.buckets.length ? (() => {
              const max = Math.max(...ts.buckets.map((b) => b.count), 1);
              return (
                <div className="mt-4">
                  <div className="flex h-28 items-end gap-px">
                    {ts.buckets.map((b) => (
                      <div
                        key={b.t}
                        title={`${new Date(b.t).toLocaleString('zh-HK', { hour12: false })} · ${b.count}`}
                        className="min-w-[3px] flex-1 rounded-t bg-indigo-500/80 hover:bg-indigo-400"
                        style={{ height: `${Math.max((b.count / max) * 100, b.count > 0 ? 4 : 1)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                    <span>{new Date(ts.buckets[0]!.t).toLocaleString('zh-HK', { hour12: false })}</span>
                    <span>而家</span>
                  </div>
                </div>
              );
            })() : <p className="mt-4 text-sm text-slate-500">暫無數據</p>}
          </section>
        </div>
      )}

      {/* ═════════ Tab 2：交易健康 ═════════ */}
      {tab === 'transactions' && (
        <div className="mt-6 space-y-6">
          {/* Order 最終狀態分布（A1-4） */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              付款後訂單去向（{days} 日內建立嘅單）
            </h2>
            {outcomes ? (() => {
              const total = outcomes.buckets.reduce((s, b) => s + b.count, 0);
              return total > 0 ? (
                <>
                  <div className="mt-4 flex h-5 overflow-hidden rounded-full bg-slate-800">
                    {outcomes.buckets.map((b) => b.count > 0 && (
                      <div
                        key={b.name}
                        title={`${b.label}: ${b.count}`}
                        className={OUTCOME_COLORS[b.name] ?? 'bg-slate-600'}
                        style={{ width: `${(b.count / total) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {outcomes.buckets.map((b) => (
                      <span key={b.name}>
                        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${OUTCOME_COLORS[b.name] ?? 'bg-slate-600'}`} />
                        {b.label} {b.count}（{Math.round((b.count / total) * 100)}%）
                      </span>
                    ))}
                  </div>
                </>
              ) : <p className="mt-4 text-sm text-slate-500">期內冇已付款訂單</p>;
            })() : <p className="mt-4 text-sm text-slate-500">載入中…</p>}
          </section>

          {/* 整體購買 funnel */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">購買 Funnel（{days} 日）</h2>
            <div className="mt-4 space-y-3">
              {funnel?.steps.map((s, i) => {
                const prev = i > 0 ? funnel.steps[i - 1] : undefined;
                const max = Math.max(...funnel.steps.map((x) => x.count), 1);
                return (
                  <div key={s.name}>
                    <div className="mb-1 flex justify-between text-xs text-slate-400">
                      <span>{s.label}</span>
                      <span>
                        {s.count}
                        {prev && prev.count > 0 && (
                          <span className="ml-2 text-slate-500">({Math.round((s.count / prev.count) * 100)}%)</span>
                        )}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded bg-slate-800">
                      <div className="h-full rounded bg-indigo-500" style={{ width: `${(s.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              }) ?? <p className="text-sm text-slate-500">載入中…</p>}
            </div>
          </section>

          {/* Funnel 按 tier 拆（A1-1） */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Funnel 按 Tier 拆（{days} 日）— Tier 3 強制鑑定 vs 其他
            </h2>
            {tierFunnel ? (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {tierFunnel.tiers.map((t) => {
                  const max = Math.max(...t.steps.map((s) => s.count), 1);
                  const first = t.steps[0]?.count ?? 0;
                  const last = t.steps[t.steps.length - 1]?.count ?? 0;
                  return (
                    <div key={t.tier} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-semibold">
                          Tier {t.tier}
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            {t.tier === 3 ? '≥$10k 強制鑑定' : t.tier === 2 ? '$1k–9,999' : '<$1k'}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400">
                          整體轉化 {first > 0 ? `${((last / first) * 100).toFixed(1)}%` : '—'}
                        </p>
                      </div>
                      <div className="mt-3 space-y-2">
                        {t.steps.map((s) => (
                          <div key={s.name}>
                            <div className="mb-0.5 flex justify-between text-[11px] text-slate-500">
                              <span>{FUNNEL_STEP_LABEL[s.name] ?? s.name}</span>
                              <span>{s.count}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded bg-slate-800">
                              <div
                                className={`h-full rounded ${t.tier === 3 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                style={{ width: `${(s.count / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">載入中…</p>}
          </section>
        </div>
      )}

      {/* ═════════ Tab 3：商品與搜尋 ═════════ */}
      {tab === 'listings' && (
        <div className="mt-6 space-y-6">
          {/* Listing 表現 + conversion（A1-2） */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Listing 表現（{days} 日）— views / 停留 / 轉化
            </h2>
            {listingStats.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Listing</th>
                      <th className="py-2 pr-4">狀態</th>
                      <th className="py-2 pr-4 text-right">價錢</th>
                      <th className="py-2 pr-4 text-right">Views</th>
                      <th className="py-2 pr-4 text-right">獨立訪客</th>
                      <th className="py-2 pr-4 text-right">平均停留</th>
                      <th className="py-2 pr-4 text-right">訂單</th>
                      <th className="py-2 text-right">View→訂單</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {listingStats.map((l) => (
                      <tr key={l.listingId}>
                        <td className="max-w-xs truncate py-2 pr-4 font-medium" title={l.listingId}>{l.title}</td>
                        <td className="py-2 pr-4 text-xs text-slate-400">{l.status ?? '—'}</td>
                        <td className="py-2 pr-4 text-right text-slate-300">
                          {l.priceHKD != null ? `HK$${l.priceHKD.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right font-semibold">{l.views}</td>
                        <td className="py-2 pr-4 text-right">{l.uniqueViewers}</td>
                        <td className="py-2 pr-4 text-right">{fmtDwell(l.avgDwellSeconds)}</td>
                        <td className="py-2 pr-4 text-right">{l.orders}</td>
                        <td className={`py-2 text-right font-semibold ${
                          l.conversionRate == null ? 'text-slate-500'
                            : l.conversionRate >= 0.1 ? 'text-emerald-400'
                            : l.conversionRate > 0 ? 'text-slate-300' : 'text-red-400'
                        }`}>
                          {l.conversionRate != null ? `${(l.conversionRate * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-3 text-sm text-slate-500">暫無 listing view 數據</p>}
          </section>

          {/* Top searches */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Top Searches（{days} 日）</h2>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={zeroOnly}
                  onChange={(e) => setZeroOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-indigo-500"
                />
                只睇 zero-result（supply gap）
              </label>
            </div>
            {searches.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Query</th>
                      <th className="py-2 pr-4 text-right">次數</th>
                      <th className="py-2 pr-4 text-right">平均結果數</th>
                      <th className="py-2 text-right">Zero-result 次數</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {searches.map((s) => (
                      <tr key={s.query}>
                        <td className="py-2 pr-4 font-medium">{s.query}</td>
                        <td className="py-2 pr-4 text-right">{s.count}</td>
                        <td className="py-2 pr-4 text-right">{s.avgResults}</td>
                        <td className={`py-2 text-right ${s.zeroCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{s.zeroCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-3 text-sm text-slate-500">暫無 search 數據</p>}
          </section>

          {/* Zero-result trend（A1-3） */}
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Zero-result 趨勢（近 14 日，top 5 query）— 持續出現 = 招商方向
            </h2>
            {zeroTrend && zeroTrend.series.length ? (() => {
              const max = Math.max(...zeroTrend.series.flatMap((s) => s.counts), 1);
              const W = 600; const H = 120;
              const n = zeroTrend.days.length;
              const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0);
              const y = (c: number) => H - (c / max) * (H - 8);
              return (
                <div className="mt-4">
                  <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
                    {zeroTrend.series.map((s, si) => (
                      <polyline
                        key={s.query}
                        fill="none"
                        stroke={TREND_COLORS[si % TREND_COLORS.length]}
                        strokeWidth="2"
                        points={s.counts.map((c, i) => `${x(i)},${y(c)}`).join(' ')}
                      />
                    ))}
                  </svg>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                    <span>{zeroTrend.days[0]}</span>
                    <span>{zeroTrend.days[zeroTrend.days.length - 1]}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    {zeroTrend.series.map((s, si) => (
                      <span key={s.query}>
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: TREND_COLORS[si % TREND_COLORS.length] }} />
                        {s.query}（{s.counts.reduce((a, b) => a + b, 0)}）
                      </span>
                    ))}
                  </div>
                </div>
              );
            })() : <p className="mt-4 text-sm text-slate-500">近 14 日冇 zero-result search</p>}
          </section>
        </div>
      )}

      {/* ═════════ Tab 4：鑑定師營運 ═════════ */}
      {tab === 'authenticators' && (
        <div className="mt-6 space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              鑑定師 SLA 健康度（近 30 日）— 紅線 48 小時
            </h2>
            {sla.length ? (() => {
              const max = Math.max(...sla.map((s) => s.avgHours), 48);
              return (
                <div className="mt-4 space-y-3">
                  {sla.map((s) => (
                    <div key={s.name}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-slate-300">{s.name}</span>
                        <span className="text-slate-400">
                          平均 {s.avgHours}h · {s.jobs} 單
                          {s.breaches > 0 && <span className="ml-2 text-red-400">⚠ {s.breaches} 次超 48h</span>}
                        </span>
                      </div>
                      <div className="relative h-3 overflow-hidden rounded bg-slate-800">
                        <div
                          className={`h-full rounded ${s.avgHours > 48 ? 'bg-red-500' : s.avgHours > 36 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min((s.avgHours / max) * 100, 100)}%` }}
                        />
                        {/* 48h 紅線 */}
                        <div className="absolute inset-y-0 w-px bg-red-400/70" style={{ left: `${Math.min((48 / max) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })() : <p className="mt-4 text-sm text-slate-500">近 30 日冇完成嘅鑑定單（要 receivedByAuthAt + authCompletedAt 齊先計到）</p>}
          </section>
          <p className="text-xs text-slate-500">
            Phase 2（要 wire auth_portal domain events）：inbox→接單→verdict 漏斗、P50/P90 處理時間分布。
          </p>
        </div>
      )}

      {/* ═════════ Tab 5：排查工具 ═════════ */}
      {tab === 'investigation' && (
        <div className="mt-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Event Explorer — user / session / order / listing id
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); void explore(); }} className="mt-3 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="貼 user_id / anonymous_id / session_id / order_id / listing_id"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={exploring || !query.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40"
              >
                {exploring ? '搜尋中…' : '搜尋'}
              </button>
            </form>
            {events !== null && (
              events.length ? (
                <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-950 uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">時間</th>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2">Portal</th>
                        <th className="px-3 py-2">Role</th>
                        <th className="px-3 py-2">Page</th>
                        <th className="px-3 py-2">Properties</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {events.map((ev) => (
                        <tr key={ev.id} className="align-top">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                            {new Date(ev.occurredAt).toLocaleString('zh-HK')}
                          </td>
                          <td className="px-3 py-2 font-mono font-medium text-indigo-300">{ev.eventName}</td>
                          <td className="px-3 py-2">{ev.portal}</td>
                          <td className="px-3 py-2">{ev.role}</td>
                          <td className="px-3 py-2 text-slate-400">{ev.pagePath}</td>
                          <td className="max-w-md px-3 py-2 font-mono text-[10px] text-slate-400">
                            {JSON.stringify(ev.properties)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">冇對應 event（記住 UAT/PROD 數據分開）</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Counter({ label, value, accent }: { label: string; value: number | undefined; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent}`}>{value ?? '—'}</p>
      <p className="mt-1 text-[10px] text-slate-500">2 分鐘內有活動</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
