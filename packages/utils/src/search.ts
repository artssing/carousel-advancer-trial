/**
 * Smart buyer search-query parser (browse page).
 *
 * Turns a single free-text query — e.g. "Chanel 手袋 全新" or "Birkin 二手" —
 * into structured search intent so the buyer can type everything at once:
 *
 *   { categoryId, terms, raw }
 *
 * Design decisions (founder 2026-06-24):
 *  • CATEGORY is the only thing auto-applied as a hard filter (surfaced as a
 *    removable chip on /browse — transparent + reversible). The category is
 *    detected from category keywords (categories.ts `searchKeywords`) OR, when
 *    no category word is typed, inferred from a detected brand (so "Birkin"
 *    alone → handbag).
 *  • BRAND is NOT turned into a hard `brand=` filter — that would zero-out
 *    results whenever a listing's structured brand field happens to be empty.
 *    Instead the brand words stay in `terms` and are matched/ranked against
 *    title + description + brand. The dedicated brand sub-filter remains for
 *    manual narrowing.
 *  • CONDITION (全新 / 9成新 / 二手 …) has no structured column, so those words
 *    simply remain as `terms` and match against title + description text.
 *
 * `terms` = the query tokens with the matched category keyword(s) removed
 * (the category is already applied as a filter, so requiring that word as a
 * text term too would over-restrict). Everything else — brand, model, colour,
 * condition — is kept for tokenized AND-matching + relevance ranking server-side.
 *
 * SSOT: this is the single place query→intent parsing lives. Do NOT re-derive
 * category/brand from a query string anywhere else (lesson #8).
 */
import { CategoryId, browseCategories } from './categories';
import { matchBrandAcrossCategories, normalizeForMatch } from './brands';

export interface ParsedSearchQuery {
  /** Detected category to auto-apply as a filter, or null if none inferred. */
  categoryId: CategoryId | null;
  /** Residual free-text tokens to match (title/description/brand) + rank by. */
  terms: string[];
  /** The original trimmed query, unchanged (for display / fallback). */
  raw: string;
}

/** A category keyword candidate paired with its owning category. */
interface KeywordHit {
  categoryId: CategoryId;
  /** normalized keyword string that matched */
  norm: string;
}

function isShortAscii(s: string): boolean {
  return s.length <= 3 && /^[a-z0-9]+$/.test(s);
}

/** Does `normHaystack` contain `normNeedle`? Short ASCII needles require a word
 *  boundary (so "mac" doesn't fire inside "machine"); CJK / longer needles use
 *  plain substring (CJK has no word boundaries). */
function containsKeyword(normHaystack: string, normNeedle: string): boolean {
  if (!normNeedle) return false;
  if (isShortAscii(normNeedle)) {
    return new RegExp(`\\b${normNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normHaystack);
  }
  return normHaystack.includes(normNeedle);
}

/** Build the category-keyword lookup once (browse categories only). */
function categoryKeywords(): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const cat of browseCategories()) {
    const words = [
      ...(cat.searchKeywords ?? []),
      cat.shortLabel,
      cat.labelEn,
    ];
    for (const w of words) {
      const norm = normalizeForMatch(w);
      if (norm) hits.push({ categoryId: cat.id, norm });
    }
  }
  return hits;
}

/**
 * Parse a buyer's free-text search query into structured intent.
 * Returns category to auto-apply + residual terms (longest keyword wins).
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { categoryId: null, terms: [], raw: '' };

  const normQuery = normalizeForMatch(trimmed);

  // 1. Category by keyword — longest matching keyword wins.
  let catHit: KeywordHit | null = null;
  for (const kw of categoryKeywords()) {
    if (containsKeyword(normQuery, kw.norm) && (!catHit || kw.norm.length > catHit.norm.length)) {
      catHit = kw;
    }
  }

  let categoryId: CategoryId | null = catHit?.categoryId ?? null;

  // 2. No category word? Infer it from a detected brand (e.g. "Birkin" → handbag).
  if (!categoryId) {
    const brandHit = matchBrandAcrossCategories(
      trimmed,
      browseCategories().map((c) => c.id),
    );
    if (brandHit) categoryId = brandHit.categoryId;
  }

  // 3. Residual terms — drop only the matched category keyword token(s); the
  //    category is already a filter, so keeping that word as a required text
  //    term would over-restrict. Brand / model / colour / condition all stay.
  const consumed = catHit ? [catHit.norm] : [];
  const terms = trimmed
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((tok) => {
      const n = normalizeForMatch(tok);
      if (!n) return false;
      // Drop a token if it IS (or is wholly inside) the consumed category keyword.
      return !consumed.some((c) => c === n || c.includes(n));
    });

  return { categoryId, terms, raw: trimmed };
}
