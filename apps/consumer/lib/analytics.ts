'use client';

/**
 * Analytics client SDK（docs/proposals/analytics-tagging-spec.md，MVP）。
 *
 * 原則：
 *  • 所有 event 必須用 @authentik/utils analytics-events SSOT 嘅名 + typed props
 *   （governance §9 — 唔准自由命名）。
 *  • Fire-and-forget：queue + batch flush，失敗 drop，永不影響 UI。
 *  • anonymous_id 存 localStorage（跨 tab 持久）；session 30 分鐘無活動輪換。
 */
import {
  type AnalyticsEventEnvelope,
  type AnalyticsEventName,
  type AnalyticsRole,
} from '@authentik/utils';
import { getToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const ANON_KEY = 'authentik_anon_id';
const SESSION_KEY = 'authentik_session'; // { id, lastActiveAt }
const SESSION_IDLE_MS = 30 * 60_000; // spec §3：GA4 standard
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_MAX_BATCH = 20;

let queue: AnalyticsEventEnvelope[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let lastPath: string | null = null;

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function anonymousId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(ANON_KEY);
  if (!id) { id = uuid(); localStorage.setItem(ANON_KEY, id); }
  return id;
}

function sessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { id: string; lastActiveAt: number };
      if (now - s.lastActiveAt < SESSION_IDLE_MS) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ id: s.id, lastActiveAt: now }));
        return s.id;
      }
    }
  } catch { /* corrupt → new session */ }
  const id = uuid();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActiveAt: now }));
  // 新 session 開波 event（放隊頭等 flush）
  queue.push(envelope('session_started', { entry_path: window.location.pathname }, id));
  return id;
}

function device(): 'MOBILE' | 'DESKTOP' | 'TABLET' {
  if (typeof window === 'undefined') return 'DESKTOP';
  const w = window.innerWidth;
  return w < 768 ? 'MOBILE' : w < 1024 ? 'TABLET' : 'DESKTOP';
}

/** Role context（spec §3）：consumer portal 內，賣家版面 = SELLER，其餘 = BUYER。 */
function roleContext(): AnalyticsRole {
  if (!getToken()) return 'GUEST';
  if (typeof window !== 'undefined') {
    const p = window.location.pathname;
    if (p.startsWith('/sell') || p.startsWith('/my-listings')) return 'SELLER';
  }
  return 'BUYER';
}

function envelope(
  name: AnalyticsEventName,
  properties: Record<string, unknown>,
  sid?: string,
): AnalyticsEventEnvelope {
  return {
    event_name: name,
    event_id: uuid(),
    occurred_at: new Date().toISOString(),
    portal: 'CONSUMER',
    anonymous_id: anonymousId(),
    user_id: null, // server 以 JWT 為準，client 唔自報（防 spoof）
    role: roleContext(),
    session_id: sid ?? sessionId(),
    page_path: typeof window !== 'undefined' ? window.location.pathname : '',
    referrer: lastPath,
    device: device(),
    properties,
  };
}

async function flush(useBeacon = false) {
  if (!queue.length) return;
  const batch = queue.splice(0, FLUSH_MAX_BATCH);
  const body = JSON.stringify({ events: batch });
  const url = `${API_URL}/analytics/events`;
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // sendBeacon 唔可以帶 Authorization header — guest envelope 照收，
      // member 嘅離場 event 會冇 user_id（可接受 trade-off，anonymous_id 有 link）
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    const token = getToken();
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
      keepalive: true,
    });
  } catch { /* fire-and-forget：drop，唔 retry-block UI */ }
}

/**
 * 主 tracking API。Typed by SSOT — event name 出咗 union type 會 compile error。
 * `track('search_performed', { query_raw: ... })`
 */
export function track(name: AnalyticsEventName, properties: Record<string, unknown> = {}): string {
  if (typeof window === 'undefined') return '';
  const e = envelope(name, properties);
  queue.push(e);
  if (queue.length >= FLUSH_MAX_BATCH) void flush();
  return e.event_id; // 畀 caller 做 funnel join key（例如 search query_id）
}

/** Route change hook（provider 用）：page_view + referrer chain 維護。 */
export function trackPageView(pathname: string) {
  if (pathname === lastPath) return;
  track('page_view', { page_path: pathname });
  lastPath = pathname;
}

/** Provider 開機：flush timer（5s）+ heartbeat（60s，spec §3）+ 離場 flush。 */
export function startAnalytics() {
  if (typeof window === 'undefined' || flushTimer) return;
  sessionId(); // 觸發 session_started（如新 session）
  let lastHeartbeat = Date.now();
  flushTimer = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible' && now - lastHeartbeat >= 60_000) {
      track('session_heartbeat', { active_seconds_since_last_heartbeat: Math.round((now - lastHeartbeat) / 1000) });
      lastHeartbeat = now;
    }
    void flush();
  }, FLUSH_INTERVAL_MS);
  window.addEventListener('pagehide', () => void flush(true));
}

/** 即時 flush（pagehide 場景：event push 咗之後 lib 嘅 flush 已經行完，要自己補一槍）。 */
export function flushAnalytics(useBeacon = false) {
  void flush(useBeacon);
}

/** Login 成功後 call（spec §3 identity merge）。 */
export function trackLogin(method: 'PASSWORD' | 'GOOGLE' = 'PASSWORD') {
  track('user_login', { method, previous_anonymous_id: anonymousId() });
  void flush();
}
