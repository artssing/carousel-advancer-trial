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
 * The VERSION LEADS (founder 2026-08-12): a release number is the thing that
 * maps to a CHANGELOG entry, which a build timestamp never did. Its SSOT is the
 * repo-root VERSION file, baked in as APP_VERSION at build.
 *
 * The commit sha stays underneath because a version alone cannot tell you
 * WHICH build of that version is running — two deploys of v0.1.0 are
 * indistinguishable by version — and the rollback tag is keyed by sha. Clicking
 * copies the full 40-char sha, which is what a retag command needs.
 *
 * `dev` means the server had no GIT_COMMIT — a `next dev` working tree, which
 * has no single commit. It is deliberately not dressed up as a release.
 */
import { useEffect, useState } from 'react';
import { getClientLocale, createT } from '@authentik/utils';

interface VersionInfo {
  app: string;
  /** Release number from the repo-root VERSION file, e.g. "0.1.0". */
  version?: string;
  commit: string;
  builtAt: string | null;
}

export interface VersionBadgeProps {
  /** Wrapper classes — each portal supplies its own colours. */
  className?: string;
  /**
   * Print the short sha after the version. Off for the consumer footer: a real
   * buyer reading `3f9a1c2` under the logo reads it as "this site is broken",
   * while `v0.1.0` reads as an ordinary product version. The sha is still one
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
  // Locale read in an effect, not during render: reading the cookie while
  // rendering gives the server a different answer to the client and React
  // discards the markup.
  const [locale, setLocale] = useState<'zh' | 'en'>('zh');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const _t = createT(locale);

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
  // The label reads as a prefix ("admin v0.1.0"), so it joins with a space;
  // only the stamp's own fields take the · separator.
  const body = isDev
    ? `${label ? `${label} ` : ''}${_t('ui.versionBadge.dev')}`
    : `${label ? `${label} ` : ''}${[`v${info.version ?? '0.0.0'}`, showSha ? shortSha(info.commit) : null].filter(Boolean).join(' · ')}`;

  return (
    <button
      type="button"
      title={`${info.app} v${info.version ?? '0.0.0'}\n${info.commit}${built ? `\nbuilt ${built}` : ''}\n${_t('ui.versionBadge.copyHint')}`}
      onClick={() => {
        navigator.clipboard?.writeText(info.commit).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
          () => {},
        );
      }}
      className={`cursor-pointer font-mono tabular-nums transition ${isDev ? 'line-through opacity-60' : ''} ${className ?? ''}`}
    >
      {copied ? _t('ui.versionBadge.copied') : body}
    </button>
  );
}
