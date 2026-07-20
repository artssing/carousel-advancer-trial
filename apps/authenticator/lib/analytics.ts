'use client';

/**
 * Analytics slim SDK — authenticator portal（spec MVP scope：session domain
 * only，供「鑑定師在線」counter 用）。Event registry SSOT 同 consumer 一樣
 * 來自 @authentik/utils；behaviour parity、code 有意精簡（唔使 search/checkout）。
 */
import type { AnalyticsEventEnvelope, AnalyticsEventName } from '@authentik/utils';
import { getToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const ANON_KEY = 'authentik_auth_anon_id';
const SESSION_KEY = 'authentik_auth_session';
const SESSION_IDLE_MS = 30 * 60_000;

let queue: AnalyticsEventEnvelope[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function anonymousId(): string {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) { id = uuid(); localStorage.setItem(ANON_KEY, id); }
  return id;
}

function sessionId(): string {
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
  } catch {}
  const id = uuid();
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActiveAt: now }));
  push('session_started', { entry_path: window.location.pathname }, id);
  return id;
}

function push(name: AnalyticsEventName, properties: Record<string, unknown>, sid?: string) {
  queue.push({
    event_name: name,
    event_id: uuid(),
    occurred_at: new Date().toISOString(),
    portal: 'AUTHENTICATOR',
    anonymous_id: anonymousId(),
    user_id: null, // server 以 JWT 為準
    role: 'AUTHENTICATOR',
    session_id: sid ?? sessionId(),
    page_path: window.location.pathname,
    referrer: null,
    device: window.innerWidth < 768 ? 'MOBILE' : 'DESKTOP',
    properties,
  });
}

async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, 20);
  try {
    const token = getToken();
    await fetch(`${API_URL}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch { /* fire-and-forget */ }
}

/** Layout provider 開機：session_started + 60s heartbeat（online presence）。 */
export function startAnalytics() {
  if (typeof window === 'undefined' || timer) return;
  sessionId();
  let lastHeartbeat = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible' && now - lastHeartbeat >= 60_000) {
      push('session_heartbeat', { active_seconds_since_last_heartbeat: Math.round((now - lastHeartbeat) / 1000) });
      lastHeartbeat = now;
    }
    void flush();
  }, 5_000);
  window.addEventListener('pagehide', () => void flush());
}
