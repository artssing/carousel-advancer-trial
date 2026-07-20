'use client';

import { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';
import { api } from '@/lib/api';

/** Poll interval — 60s per coordinator (see docs/backlog/banner-backlog.md for
 *  SSE-based sub-10s alternative). */
const POLL_MS = 60_000;
const DISMISS_KEY = 'authentik_dismissed_banners';

interface Banner {
  id: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  audience: 'ALL' | 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS';
  dismissible: boolean;
  priority: number;
  createdAt: string;
}

function readDismissedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function writeDismissedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(ids))); } catch {}
}

const SEVERITY_STYLE: Record<Banner['severity'], { bar: string; icon: React.ReactNode; iconColor: string }> = {
  INFO: {
    bar: 'bg-blue-50 border-b border-blue-200 text-blue-900',
    icon: <Info className="h-4 w-4" />,
    iconColor: 'text-blue-600',
  },
  WARNING: {
    bar: 'bg-amber-50 border-b border-amber-300 text-amber-900',
    icon: <AlertTriangle className="h-4 w-4" />,
    iconColor: 'text-amber-600',
  },
  CRITICAL: {
    bar: 'bg-red-600 border-b border-red-700 text-white',
    icon: <AlertOctagon className="h-4 w-4" />,
    iconColor: 'text-white',
  },
};

export function BannerBar() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Initial + polling fetch
  useEffect(() => {
    setDismissed(readDismissedIds());
    let cancelled = false;
    async function poll() {
      try {
        const items = await api.banners.list('BUYERS');
        if (!cancelled) setBanners(items);
      } catch { /* swallow — banner failure must not break page */ }
    }
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  function onDismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissedIds(next);
      return next;
    });
  }

  // Cull dismissed banners (keep CRITICAL non-dismissible even if id in set)
  const visible = banners.filter((b) => b.dismissible ? !dismissed.has(b.id) : true);
  if (visible.length === 0) return null;

  return (
    <div className="w-full">
      {visible.map((b) => {
        const style = SEVERITY_STYLE[b.severity];
        return (
          <div key={b.id} className={`${style.bar} px-4 py-2`}>
            <div className="mx-auto flex max-w-6xl items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 ${style.iconColor}`}>{style.icon}</span>
              <p className="flex-1 leading-snug">{b.message}</p>
              {b.dismissible && (
                <button
                  type="button"
                  onClick={() => onDismiss(b.id)}
                  className="shrink-0 rounded p-0.5 hover:bg-black/10"
                  aria-label="關閉此通知"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
