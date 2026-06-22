/**
 * Chat-list timestamp formatter — WhatsApp-style.
 *
 * - 同一日（calendar day）           → "14:32"
 * - 琴日                            → "昨天"
 * - 一星期內（2–6 日前同一週）        → "週一" / "週二" …
 * - 過咗一星期                       → "DD/MM/YYYY"
 *
 * 純 calendar-based 比較，避免 24/72 小時 sliding-window 帶嚟嘅 confusion。
 */
const WEEKDAY_ZH_HK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export function formatChatTime(dateStr: string | Date | null | undefined, now: Date = new Date()): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '';

  // Midnight of "today" / "that day" in local timezone (we run on user's browser locale).
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const today = startOfDay(now);
  const that = startOfDay(d);
  const diffDays = Math.round((today.getTime() - that.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    // Same calendar day → HH:mm
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (diffDays === 1) {
    return '昨天';
  }
  if (diffDays > 1 && diffDays < 7) {
    return WEEKDAY_ZH_HK[d.getDay()] ?? '週一';
  }
  // ≥ 7 days OR future date → DD/MM/YYYY
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo}/${d.getFullYear()}`;
}
