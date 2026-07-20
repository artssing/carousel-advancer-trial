/**
 * Smart buyer search-query parser (browse page).
 *
 * Turns a single free-text query — e.g. "Chanel 手袋 全新" or "Birkin 9成新" —
 * into structured search intent so the buyer can type everything at once:
 *
 *   { categoryId, conditionMin, terms, raw }
 *
 * Design decisions (founder 2026-06-24, extended 2026-07-07):
 *  • CATEGORY is auto-applied as a hard filter (surfaced as a removable chip
 *    on /browse — transparent + reversible). Detected from category keywords
 *    (categories.ts `searchKeywords`) OR, when no category word is typed,
 *    inferred from a detected brand (so "Birkin" alone → handbag).
 *  • BRAND is NOT turned into a hard `brand=` filter — that would zero-out
 *    results whenever a listing's structured brand field happens to be empty.
 *    Instead the brand words stay in `terms` and are matched/ranked against
 *    title + description + brand. The dedicated brand sub-filter remains for
 *    manual narrowing.
 *  • CONDITION (全新 / 9成新 / 二手 …) IS auto-applied as `conditionMin` filter
 *    (added 2026-07-07 — was previously text-only). Semantic = "min or newer",
 *    matching the sidebar dropdown behaviour. Detection = explicit lookup
 *    table (curated for high-frequency HK phrases) + regex fallback for
 *    `N成新` / `NN新` patterns. Blacklist covers `新款` / `翻新` etc. where
 *    the character-substring overlaps but the meaning is orthogonal to wear.
 *    Chip label renders the CANONICAL grade ("幾乎全新 或以上"), NOT the raw
 *    colloquial the user typed — so users can trust "how the filter behaves"
 *    matches "what the chip says". Details in `matchConditionMin()` below.
 *
 * `terms` = the query tokens with the matched category keyword(s) AND matched
 * condition token(s) removed (both are already applied as filters, requiring
 * them as text terms too would over-restrict). Everything else — brand,
 * model, colour — is kept for tokenized AND-matching + relevance ranking.
 *
 * SSOT: this is the single place query→intent parsing lives. Do NOT re-derive
 * category/brand/condition from a query string anywhere else (lesson #8).
 */
import { CategoryId, browseCategories } from './categories';
import { matchBrandAcrossCategories, normalizeForMatch } from './brands';
import { ConditionGrade } from './conditions';

export interface ParsedSearchQuery {
  /** Detected category to auto-apply as a filter, or null if none inferred. */
  categoryId: CategoryId | null;
  /** Detected condition "min or newer" grade to auto-apply, or null if none. */
  conditionMin: ConditionGrade | null;
  /** Residual free-text tokens to match (title/description/brand) + rank by. */
  terms: string[];
  /** The original trimmed query, unchanged (for display / fallback). */
  raw: string;
}

// ── Condition auto-detection (2026-07-07) ────────────────────────────────
// Blacklist: substrings that contain condition-adjacent characters but mean
// something orthogonal. Never auto-map when a query contains any of these.
// - 新款/新品/新品發售/炒新: product release-recency talk, not physical wear
// - 翻新: refurbished — implies prior repair, semantically opposite to "new"
// - 開封新: opened-but-unused — ambiguous vs BRAND_NEW's "unopened" framing
const CONDITION_BLACKLIST: readonly string[] = [
  '新款', '新品', '新品發售', '炒新', '翻新', '開封新',
];

// Explicit lookup: curated highest-frequency HK phrases → canonical grade.
// Longest-first ordering matters: 「9成新」 must be tried before 「新」.
// Entries sorted by length desc (see match loop).
interface ConditionEntry { phrase: string; grade: ConditionGrade; }
const CONDITION_TABLE: readonly ConditionEntry[] = [
  // BRAND_NEW
  { phrase: '全新未用', grade: 'BRAND_NEW' },
  { phrase: '未拆封',   grade: 'BRAND_NEW' },
  { phrase: '未使用',   grade: 'BRAND_NEW' },
  { phrase: '全新',     grade: 'BRAND_NEW' },
  // NEARLY_NEW
  { phrase: '幾乎全新', grade: 'NEARLY_NEW' },
  { phrase: '9.5成新',  grade: 'NEARLY_NEW' },
  { phrase: '9成新',    grade: 'NEARLY_NEW' },
  { phrase: '99新',     grade: 'NEARLY_NEW' },
  { phrase: '95新',     grade: 'NEARLY_NEW' },
  { phrase: '新淨',     grade: 'NEARLY_NEW' },
  // GOOD
  { phrase: '狀況良好', grade: 'GOOD' },
  { phrase: '8成新',    grade: 'GOOD' },
  { phrase: '85新',     grade: 'GOOD' },
  // LIGHT_USE
  { phrase: '輕度使用', grade: 'LIGHT_USE' },
  { phrase: '7成新',    grade: 'LIGHT_USE' },
  { phrase: '75新',     grade: 'LIGHT_USE' },
  // FAIR (loosest — regex fallback also lands here for ≤6成)
  { phrase: '狀況尚可', grade: 'FAIR' },
];

/** Digit-成新 fallback ("6成新", "5.5成新") — buckets 9+→NEARLY_NEW … ≤6→FAIR. */
const REGEX_CHENG_XIN = /(\d)(?:\.\d)?成新/;
/** Digit-digit-新 fallback ("95新", "80新") — same bucketing ÷ 10. */
const REGEX_NN_XIN = /(?<!\d)(\d{2})新/;

function bucketByPercent(digit: number): ConditionGrade {
  if (digit >= 9) return 'NEARLY_NEW';
  if (digit === 8) return 'GOOD';
  if (digit === 7) return 'LIGHT_USE';
  return 'FAIR';
}

/**
 * Detect a condition min-grade from the raw query. Returns null if nothing
 * matches or if the query hits the blacklist.
 *
 * Also reports the matched phrase(s) so the caller can strip them from
 * residual `terms` (mirrors category token-consumption pattern).
 */
export function matchConditionMin(raw: string): {
  grade: ConditionGrade;
  consumed: string[];
} | null {
  const q = raw.trim();
  if (!q) return null;
  // Blacklist gate — check first so 翻新 / 新款 etc. never fall into a match.
  for (const bl of CONDITION_BLACKLIST) {
    if (q.includes(bl)) return null;
  }
  // 1. Explicit table lookup — longest-first (table is pre-sorted).
  const sorted = [...CONDITION_TABLE].sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, grade } of sorted) {
    if (q.includes(phrase)) return { grade, consumed: [phrase] };
  }
  // 2. Regex fallback — `N成新` / `NN新` shorthand.
  const cheng = q.match(REGEX_CHENG_XIN);
  if (cheng) {
    const digit = Number(cheng[1]);
    if (Number.isFinite(digit) && digit >= 1 && digit <= 10) {
      return { grade: bucketByPercent(digit), consumed: [cheng[0]] };
    }
  }
  const nn = q.match(REGEX_NN_XIN);
  if (nn) {
    const percent = Number(nn[1]);
    if (Number.isFinite(percent) && percent >= 10 && percent <= 100) {
      // Bucket by leading digit — 95→NEARLY_NEW, 85→GOOD, 75→LIGHT_USE, ≤65→FAIR.
      return { grade: bucketByPercent(Math.floor(percent / 10)), consumed: [nn[0]] };
    }
  }
  return null;
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
 * Returns category + conditionMin to auto-apply + residual terms.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { categoryId: null, conditionMin: null, terms: [], raw: '' };

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

  // 3. Condition (first-match-wins on colloquial phrases + regex fallback).
  const condHit = matchConditionMin(trimmed);
  const conditionMin: ConditionGrade | null = condHit?.grade ?? null;

  // 4. Residual terms — drop matched category keyword(s) AND matched condition
  //    phrase(s). Both are already applied as filters; requiring them as text
  //    terms too would over-restrict. Brand / model / colour all stay.
  const catConsumed = catHit ? [catHit.norm] : [];
  const condConsumed = condHit?.consumed ?? [];

  // For condition: strip the matched phrase from the raw query FIRST (may span
  // multiple tokens since colloquial phrases include no whitespace), then split.
  let residual = trimmed;
  for (const phrase of condConsumed) {
    residual = residual.split(phrase).join(' ');
  }

  const terms = residual
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((tok) => {
      const n = normalizeForMatch(tok);
      if (!n) return false;
      // Drop a token if it IS (or is wholly inside) the consumed category keyword.
      return !catConsumed.some((c) => c === n || c.includes(n));
    });

  return { categoryId, conditionMin, terms, raw: trimmed };
}
