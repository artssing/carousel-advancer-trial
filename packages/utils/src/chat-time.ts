import { t, type TLocale } from './locales';

/**
 * Chat-list timestamp — the "how long ago did they message me" column.
 *
 * - 少過一分鐘          → "啱啱"
 * - 同一日（calendar）   → "14:32"
 * - 琴日                → "昨天"
 * - 2–6 日前            → "週一" / "週二" …
 * - 同一年、耐過一星期    → "03/08"
 * - 唔同年              → "03/08/2025"
 *
 * Calendar-based, never a sliding 24/72-hour window: a message at 23:50 should
 * read 「昨天」 at 00:10, not 「20 分鐘前」.
 *
 * Relative labels ("3 分鐘前") are deliberately avoided past the first minute.
 * The reason someone reads this column is to compare it against when they last
 * looked, and a relative label makes them do that arithmetic in their head.
 *
 * The strings were hardcoded zh here while `utils.chatTime.*` already existed in
 * ssot.json — the SSOT and the code had silently drifted (found 2026-08-12).
 * `locale` is optional so existing callers keep working; they get zh, which is
 * what they were hardcoding anyway.
 */
export function formatChatTime(
  dateStr: string | Date | null | undefined,
  now: Date = new Date(),
  locale: TLocale = 'zh',
): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '';

  // Clock skew between the server and the browser can put a message a few
  // seconds in the future; "啱啱" is the honest reading, a future date is not.
  const ms = now.getTime() - d.getTime();
  if (ms < 60_000) return t('utils.chatTime.justNow', undefined, locale);

  // Midnight of "today" / "that day" in local timezone (we run on user's browser locale).
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const today = startOfDay(now);
  const that = startOfDay(d);
  const diffDays = Math.round((today.getTime() - that.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (diffDays === 1) {
    return t('utils.chatTime.yesterday', undefined, locale);
  }
  if (diffDays > 1 && diffDays < 7) {
    return t(`utils.chatTime.weekday.${d.getDay()}`, undefined, locale);
  }

  // Day/month ORDER is a translated pattern, not a hardcoded DD/MM — en-US
  // would want it the other way round, and that decision belongs in the SSOT.
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === now.getFullYear()
    ? t('utils.chatTime.dateShort', { d: dd, m: mo }, locale)
    : t('utils.chatTime.dateFull', { d: dd, m: mo, y: d.getFullYear() }, locale);
}

/** Full timestamp for a `title=` / `<time>` tooltip. */
export function formatChatTimeFull(dateStr: string | Date | null | undefined, locale: TLocale = 'zh'): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale === 'en' ? 'en-HK' : 'zh-HK', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
