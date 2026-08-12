'use client';

/**
 * VersionBadge — what build is THIS portal serving right now?
 *
 * Reads the portal's own `GET /api/version` (every app has one). Same-origin on
 * purpose: the four images are built and tagged independently and have been as
 * much as 18h41m apart, so asking the API — or any single service — would
 * answer for the wrong container. The badge in the admin console must report
 * admin's build, not the API's.
 *
 * Build TIME leads, sha follows. The question being answered is "did the deploy
 * I just ran actually land here", and the time settles that; the short sha is
 * only what you paste into a retag command afterwards. Clicking copies the full
 * 40-char sha — the thing a rollback command actually needs, and not something
 * anyone should retype off a screen.
 *
 * `dev` means the server had no GIT_COMMIT — a `next dev` working tree, which
 * has no single commit. It is deliberately not dressed up as a version.
 */
import { useEffect, useState } from 'react';

interface VersionInfo {
  app: string;
  commit: string;
  builtAt: string | null;
}

export interface VersionBadgeProps {
  /** Wrapper classes — each portal supplies its own colours. */
  className?: string;
  /**
   * Print the short sha next to the time. Off for the consumer footer: a real
   * buyer reading `3f9a1c2` under the logo reads it as "this site is broken",
   * while 「更新 08-12」 reads as "someone maintains this". The sha is still one
   * click away, so the founder loses nothing but a click (founder 2026-08-12).
   */
  showSha?: boolean;
  /** Prefix, e.g. 「更新」 or "admin". Omit for none. */
  label?: string;
}

export function shortSha(commit: string): string {
  return commit === 'dev' || commit === 'unknown' ? commit : commit.slice(0, 7);
}

/**
 * "08-12 20:04" — day and time in HK terms. Not a relative time ("3 分鐘前"):
 * deciding whether to roll back means comparing this against when you ran the
 * deploy, and a relative label makes you do that arithmetic in your head.
 */
export function formatBuiltAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function VersionBadge({ className, showSha = true, label }: VersionBadgeProps) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/version', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setInfo(d); })
      // A failed fetch renders nothing. A badge reading "unknown" when the route
      // is merely unreachable would be worse than no badge: it looks like a
      // fact about the build.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!info) return null;

  const isDev = info.commit === 'dev' || info.commit === 'unknown';
  const built = formatBuiltAt(info.builtAt);
  const body = isDev
    ? `${label ? `${label} ` : ''}dev（本機）`
    // The label reads as a prefix to the stamp ("更新 08-12 15:23"), so it is
    // joined by a space; only the stamp's own parts take the · separator.
    : `${label ? `${label} ` : ''}${[built, showSha ? shortSha(info.commit) : null].filter(Boolean).join(' · ')}`;

  return (
    <button
      type="button"
      title={`${info.app} ${info.commit}${built ? `\nbuilt ${built}` : ''}\n撳一下 copy 完整 commit`}
      onClick={() => {
        navigator.clipboard?.writeText(info.commit).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
          () => {},
        );
      }}
      className={`cursor-pointer font-mono tabular-nums transition ${isDev ? 'line-through opacity-60' : ''} ${className ?? ''}`}
    >
      {copied ? '已複製' : body}
    </button>
  );
}
