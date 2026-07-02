/**
 * Product condition grades — SSOT.
 *
 * Founder ruling 2026-06-30: 5 grades, HK-style labels, definitions adopted
 * from Carousell's condition sheet. Ordinal 0 = newest → 4 = oldest.
 * Filter semantic is "≥ min" — pick grade N to see all listings with ordinal
 * ≤ N. Legacy listings (condition === null) are excluded when any filter is
 * active but shown when no filter is set (backwards compatible with pre-2026-06-30
 * catalog which had no structured condition column).
 */
export type ConditionGrade = 'BRAND_NEW' | 'NEARLY_NEW' | 'GOOD' | 'LIGHT_USE' | 'FAIR';

export interface ConditionSpec {
  id: ConditionGrade;
  ordinal: number;     // 0 (newest) → 4 (oldest)
  label: string;       // Display label (繁中 HK)
  description: string; // Seller-facing definition
}

export const CONDITION_GRADES: readonly ConditionSpec[] = [
  { id: 'BRAND_NEW',  ordinal: 0, label: '全新',       description: '從未使用過。可能含原包裝或標籤。' },
  { id: 'NEARLY_NEW', ordinal: 1, label: '幾乎全新',   description: '使用 1–2 次，幾乎和新的一樣。' },
  { id: 'GOOD',       ordinal: 2, label: '狀況良好',   description: '使用時都很小心。瑕疵（如果有的話）也幾乎看不出來。' },
  { id: 'LIGHT_USE',  ordinal: 3, label: '輕度使用',   description: '有輕微使用痕跡或瑕疵。' },
  { id: 'FAIR',       ordinal: 4, label: '狀況尚可',   description: '有明顯使用痕跡或瑕疵。' },
] as const;

/** Fast label lookup by grade id. */
export function conditionLabel(id: ConditionGrade | null | undefined): string {
  if (!id) return '';
  const g = CONDITION_GRADES.find((x) => x.id === id);
  return g?.label ?? '';
}

/** All grades with ordinal ≤ min (i.e. "min or newer"). Used by browse filter. */
export function gradesAtLeast(min: ConditionGrade): ConditionGrade[] {
  const spec = CONDITION_GRADES.find((x) => x.id === min);
  if (!spec) return [];
  return CONDITION_GRADES.filter((x) => x.ordinal <= spec.ordinal).map((x) => x.id);
}
