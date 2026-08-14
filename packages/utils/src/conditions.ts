import { t, type TLocale } from './locales';
import { CONDITION_GRADES, type ConditionGrade } from '@certifine/domain';

export * from '@certifine/domain';

/**
 * Display copy for condition grades.
 *
 * The GRADES themselves (ordinals, `gradesAtLeast`) moved to
 * `@certifine/domain` — the API filters on them. What stayed here is the
 * part that reads a locale bundle, which is the whole reason the split is
 * worth making: domain must never depend on the translation data.
 */

/**
 * Label for a grade. Pass `locale` to translate — without it you get the
 * Chinese in `CONDITION_GRADES`, which is the registry's data, not UI copy.
 *
 * The optional argument is deliberate: every existing caller keeps working and
 * keeps showing Chinese, so pages migrate one at a time instead of all of them
 * breaking at once. QA IN-03 found `狀況良好` on an otherwise-English /browse
 * for exactly this reason.
 */
export function conditionLabel(id: ConditionGrade | null | undefined, locale?: TLocale): string {
  if (!id) return '';
  const g = CONDITION_GRADES.find((x) => x.id === id);
  if (!g) return '';
  return t(`utils.conditions.${id}.label`, undefined, locale);
}

/** Seller-facing definition of a grade. */
export function conditionDescription(id: ConditionGrade | null | undefined, locale?: TLocale): string {
  if (!id) return '';
  const g = CONDITION_GRADES.find((x) => x.id === id);
  if (!g) return '';
  return t(`utils.conditions.${id}.description`, undefined, locale);
}

