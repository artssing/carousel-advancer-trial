import { t, type TLocale } from './locales';
import { CATEGORIES, categoryByApiEnum, type CategoryId } from '@certifine/domain';

/** Display copy for categories. The registry itself lives in @certifine/domain. */

export function categoryLabel(id: CategoryId | null | undefined, locale?: TLocale): string {
  if (!id || !CATEGORIES[id]) return '';
  return t(`utils.categories.${id}.label`, undefined, locale);
}

/** Short label for space-constrained UI (top-nav, chips, product cards). */
export function categoryShortLabel(id: CategoryId | null | undefined, locale?: TLocale): string {
  if (!id || !CATEGORIES[id]) return '';
  return t(`utils.categories.${id}.shortLabel`, undefined, locale);
}

/** Same, keyed by the Prisma enum value the API returns (e.g. 'HANDBAG'). */
export function categoryLabelByApiEnum(apiEnum: string | null | undefined, locale?: TLocale): string {
  const cfg = apiEnum ? categoryByApiEnum(apiEnum) : undefined;
  return cfg ? categoryLabel(cfg.id, locale) : (apiEnum ?? '');
}
