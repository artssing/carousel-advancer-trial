/**
 * Brand / sub-category SSOT.
 *
 * Every page that needs brand data — sell picker, browse filter, listing
 * card / detail — MUST import from here. Do NOT hardcode brand lists
 * elsewhere (lesson #8: catalogue SSOT violation).
 *
 * Phase 1: hardcoded. Phase 2 (when admin portal API lands) will migrate
 * to a DB-backed list + admin editor.
 *
 * Anti-AI-ambiguity rationale: storing canonical enum keys (e.g. "LV"
 * not "Louis Vuitton" / "lv" / "louisvuitton") so future vision-model
 * prompts can disambiguate brands reliably. Free-text fallback is allowed
 * for long-tail brands; AI can fuzzy-match later.
 */
import type { CategoryId } from './categories';

export interface BrandConfig {
  /** Canonical enum key. Stored in DB. Used by AI vision prompts. */
  id: string;
  /** User-visible label (zh-HK). */
  label: string;
  /** Display order — lower = shown first as quick-pick chip. */
  order: number;
  /** Extra match strings for matchBrandFromTitle() — abbreviations, alt
   *  spellings, iconic product lines. NOT shown in UI, only used for
   *  title-matching since `label` often carries a zh-HK suffix / slash
   *  variant that wouldn't appear verbatim in a real listing title. */
  aliases?: string[];
}

/** Per-category label override — "品牌" doesn't fit all categories. */
const FIELD_LABEL_OVERRIDE: Partial<Record<CategoryId, string>> = {
  pokemon_card: '系列',
  iphone: '型號',
  designer_toy: '品牌 / 系列',
};

/** Brand registry. Top 10-15 per category. Empty list = no picker (e.g. OTHER). */
const BRANDS_BY_CATEGORY: Partial<Record<CategoryId, BrandConfig[]>> = {
  handbag: [
    { id: 'LV', label: 'Louis Vuitton', order: 1, aliases: ['lv', 'louis vuitton'] },
    { id: 'CHANEL', label: 'Chanel', order: 2 },
    { id: 'HERMES', label: 'Hermès', order: 3, aliases: ['hermes', 'birkin', 'kelly'] },
    { id: 'GUCCI', label: 'Gucci', order: 4 },
    { id: 'PRADA', label: 'Prada', order: 5 },
    { id: 'DIOR', label: 'Dior', order: 6 },
    { id: 'COACH', label: 'Coach', order: 7 },
    { id: 'BURBERRY', label: 'Burberry', order: 8 },
    { id: 'CELINE', label: 'Céline', order: 9, aliases: ['celine'] },
    { id: 'BALENCIAGA', label: 'Balenciaga', order: 10 },
    { id: 'YSL', label: 'YSL / Saint Laurent', order: 11, aliases: ['ysl', 'saint laurent', 'yves saint laurent'] },
    { id: 'BOTTEGA', label: 'Bottega Veneta', order: 12, aliases: ['bottega veneta', 'bottega', 'bv'] },
    { id: 'GOYARD', label: 'Goyard', order: 13 },
    { id: 'LOEWE', label: 'Loewe', order: 14 },
    { id: 'FENDI', label: 'Fendi', order: 15 },
  ],
  watch: [
    { id: 'ROLEX', label: 'Rolex', order: 1 },
    { id: 'OMEGA', label: 'Omega', order: 2 },
    { id: 'PATEK', label: 'Patek Philippe', order: 3, aliases: ['patek philippe', 'patek'] },
    { id: 'AP', label: 'Audemars Piguet', order: 4, aliases: ['audemars piguet', 'ap'] },
    { id: 'CARTIER', label: 'Cartier', order: 5 },
    { id: 'IWC', label: 'IWC', order: 6 },
    { id: 'TUDOR', label: 'Tudor', order: 7 },
    { id: 'HUBLOT', label: 'Hublot', order: 8 },
    { id: 'GRAND_SEIKO', label: 'Grand Seiko', order: 9, aliases: ['grand seiko'] },
    { id: 'SEIKO', label: 'Seiko', order: 10 },
    { id: 'BREITLING', label: 'Breitling', order: 11 },
    { id: 'PANERAI', label: 'Panerai', order: 12 },
    { id: 'JLC', label: 'Jaeger-LeCoultre', order: 13, aliases: ['jaeger-lecoultre', 'jaeger lecoultre', 'jlc'] },
    { id: 'VC', label: 'Vacheron Constantin', order: 14, aliases: ['vacheron constantin'] },
    { id: 'RM', label: 'Richard Mille', order: 15, aliases: ['richard mille'] },
  ],
  sneaker: [
    { id: 'NIKE', label: 'Nike', order: 1 },
    { id: 'JORDAN', label: 'Air Jordan', order: 2, aliases: ['air jordan', 'jordan', 'aj1', 'aj4'] },
    { id: 'ADIDAS', label: 'Adidas', order: 3 },
    { id: 'YEEZY', label: 'Yeezy', order: 4 },
    { id: 'NB', label: 'New Balance', order: 5, aliases: ['new balance'] },
    { id: 'ASICS', label: 'ASICS', order: 6 },
    { id: 'ONITSUKA', label: 'Onitsuka Tiger', order: 7, aliases: ['onitsuka tiger', 'onitsuka'] },
    { id: 'PUMA', label: 'Puma', order: 8 },
    { id: 'VANS', label: 'Vans', order: 9 },
    { id: 'CONVERSE', label: 'Converse', order: 10 },
    { id: 'SALOMON', label: 'Salomon', order: 11 },
    { id: 'HOKA', label: 'HOKA', order: 12 },
    { id: 'REEBOK', label: 'Reebok', order: 13 },
  ],
  iphone: [
    { id: 'IPHONE_16_PRO_MAX', label: 'iPhone 16 Pro Max', order: 1 },
    { id: 'IPHONE_16_PRO', label: 'iPhone 16 Pro', order: 2 },
    { id: 'IPHONE_16', label: 'iPhone 16', order: 3 },
    { id: 'IPHONE_15_PRO_MAX', label: 'iPhone 15 Pro Max', order: 4 },
    { id: 'IPHONE_15_PRO', label: 'iPhone 15 Pro', order: 5 },
    { id: 'IPHONE_15', label: 'iPhone 15', order: 6 },
    { id: 'IPHONE_14_PRO_MAX', label: 'iPhone 14 Pro Max', order: 7 },
    { id: 'IPHONE_14_PRO', label: 'iPhone 14 Pro', order: 8 },
    { id: 'IPHONE_14', label: 'iPhone 14', order: 9 },
    { id: 'IPHONE_13', label: 'iPhone 13 系列', order: 10, aliases: ['iPhone 13'] },
    { id: 'IPHONE_12', label: 'iPhone 12 系列', order: 11, aliases: ['iPhone 12'] },
    { id: 'IPHONE_SE', label: 'iPhone SE 系列', order: 12, aliases: ['iPhone SE'] },
  ],
  pokemon_card: [
    { id: 'SCARLET_VIOLET', label: '朱／紫 (Scarlet / Violet)', order: 1, aliases: ['scarlet', 'violet', '朱', '紫'] },
    { id: 'SWORD_SHIELD', label: '劍／盾 (Sword / Shield)', order: 2, aliases: ['sword', 'shield', '劍', '盾'] },
    { id: 'SUN_MOON', label: '太陽／月亮 (Sun / Moon)', order: 3, aliases: ['sun moon', '太陽', '月亮'] },
    { id: 'XY', label: 'XY 系列', order: 4, aliases: ['xy'] },
    { id: 'BW', label: 'Black & White', order: 5, aliases: ['black white', 'black & white'] },
    { id: 'DPP', label: '鑽石珍珠白金', order: 6, aliases: ['鑽石', '珍珠', '白金', 'diamond pearl', 'platinum'] },
    { id: 'EX_BASE', label: 'EX / 第一世代 (1996-1999)', order: 7, aliases: ['base set', '第一世代'] },
    { id: 'NEO', label: 'Neo 系列', order: 8, aliases: ['neo'] },
    { id: 'JAPAN_PROMO', label: '日版 Promo', order: 9, aliases: ['日版 promo'] },
    { id: 'TRAINER_PROMO', label: '訓練家 Promo', order: 10, aliases: ['訓練家 promo'] },
    { id: 'PSA_GRADED', label: 'PSA 鑑定卡', order: 11, aliases: ['psa', 'psa10', 'psa 10'] },
    { id: 'BGS_GRADED', label: 'BGS / Beckett 鑑定卡', order: 12, aliases: ['bgs', 'beckett'] },
  ],
  designer_toy: [
    { id: 'POPMART', label: '泡泡瑪特 (POP MART)', order: 1, aliases: ['泡泡瑪特', 'popmart', 'pop mart'] },
    { id: 'KAWS', label: 'KAWS', order: 2 },
    { id: 'BEARBRICK', label: 'BE@RBRICK / Medicom Toy', order: 3, aliases: ['bearbrick', 'be@rbrick', 'medicom'] },
    { id: 'BAPE', label: 'A Bathing Ape', order: 4, aliases: ['a bathing ape', 'bape'] },
    { id: 'HOW2WORK', label: 'How2work', order: 5, aliases: ['how2work'] },
    { id: 'SONNY_ANGEL', label: 'Sonny Angel', order: 6, aliases: ['sonny angel'] },
    { id: 'MOLLY', label: 'Molly', order: 7 },
    { id: 'LABUBU', label: 'Labubu (The Monsters)', order: 8, aliases: ['labubu', 'the monsters'] },
    { id: 'DIMOO', label: 'DIMOO', order: 9 },
    { id: 'SKULLPANDA', label: 'SKULLPANDA', order: 10, aliases: ['skull panda'] },
  ],
  // OTHER intentionally omitted — no brand picker rendered
};

/** Return brands available for picker, sorted by display order. Empty if no list. */
export function brandsForCategory(categoryId: CategoryId): BrandConfig[] {
  return [...(BRANDS_BY_CATEGORY[categoryId] ?? [])].sort((a, b) => a.order - b.order);
}

/** Whether to render the brand picker at all for this category. */
export function hasBrandPicker(categoryId: CategoryId): boolean {
  return (BRANDS_BY_CATEGORY[categoryId]?.length ?? 0) > 0;
}

/** UI field label, e.g. 「品牌」for HANDBAG, 「系列」for POKEMON_CARD. */
export function brandFieldLabel(categoryId: CategoryId): string {
  return FIELD_LABEL_OVERRIDE[categoryId] ?? '品牌';
}

/** Resolve a stored brand id back to its display label.
 *  Returns the raw value if it doesn't match a known enum (= free text). */
export function brandLabel(categoryId: CategoryId, brandId: string | null | undefined): string | null {
  if (!brandId) return null;
  const list = BRANDS_BY_CATEGORY[categoryId];
  const hit = list?.find((b) => b.id === brandId);
  return hit?.label ?? brandId;  // free-text falls through verbatim
}

/** Lowercase + strip diacritics so "Hermès" matches "hermes". Exported so the
 *  search-query parser (search.ts) shares the exact same normalization. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Core matcher — returns the winning brand AND the normalized length of the
 *  candidate that matched (so callers can arbitrate longest-wins across
 *  categories). `normTitle` must already be normalized via normalizeForMatch. */
function matchBrandWithLen(
  categoryId: CategoryId,
  normTitle: string,
): { brand: BrandConfig; len: number } | null {
  const list = BRANDS_BY_CATEGORY[categoryId];
  if (!list || list.length === 0 || !normTitle) return null;
  let best: { brand: BrandConfig; len: number } | null = null;
  for (const brand of list) {
    const candidates = [brand.label, ...(brand.aliases ?? [])];
    for (const cand of candidates) {
      const normCand = normalizeForMatch(cand);
      if (!normCand) continue;
      const isMatch =
        normCand.length <= 3
          ? new RegExp(`\\b${escapeRegExp(normCand)}\\b`).test(normTitle)
          : normTitle.includes(normCand);
      if (isMatch && (!best || normCand.length > best.len)) {
        best = { brand, len: normCand.length };
      }
    }
  }
  return best;
}

/**
 * Smart brand-from-title matching (task #47 — backlog).
 *
 * Scans `title` for the longest matching brand label/alias and returns that
 * brand, or null if nothing matches confidently. Longest-candidate-wins
 * naturally resolves overlapping cases (e.g. "Grand Seiko" beats "Seiko";
 * "iPhone 15 Pro Max" beats "iPhone 15"). Short candidates (≤3 normalized
 * chars, e.g. "AP", "NB", "BV") require a word-boundary match so they don't
 * false-positive inside unrelated words.
 *
 * Caller decides what to do with the result — typically pre-fill the brand
 * picker but only if the user hasn't already manually chosen one, and show
 * a dismissible "auto-detected" hint rather than silently overwriting.
 */
export function matchBrandFromTitle(categoryId: CategoryId, title: string): BrandConfig | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return matchBrandWithLen(categoryId, normalizeForMatch(trimmed))?.brand ?? null;
}

/**
 * Detect a brand when the category is unknown (buyer search). Runs the same
 * longest-wins matcher across every candidate category and returns both the
 * brand AND the category it belongs to — so a query like "Birkin 全新" resolves
 * to { categoryId: 'handbag', brand: HERMES } even though the buyer never typed
 * a category word. The globally-longest matching candidate wins, so a brand
 * name that's unambiguous (e.g. "Audemars Piguet") beats a coincidental short
 * alias hit in another category.
 */
export function matchBrandAcrossCategories(
  title: string,
  categoryIds: CategoryId[],
): { categoryId: CategoryId; brand: BrandConfig } | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const normTitle = normalizeForMatch(trimmed);
  let best: { categoryId: CategoryId; brand: BrandConfig; len: number } | null = null;
  for (const categoryId of categoryIds) {
    const hit = matchBrandWithLen(categoryId, normTitle);
    if (hit && (!best || hit.len > best.len)) {
      best = { categoryId, brand: hit.brand, len: hit.len };
    }
  }
  return best ? { categoryId: best.categoryId, brand: best.brand } : null;
}
