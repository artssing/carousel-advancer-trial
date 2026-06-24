export type CategoryId =
  | 'handbag'
  | 'iphone'
  | 'pokemon_card'
  | 'watch'
  | 'sneaker'
  | 'designer_toy'
  | 'other';

/**
 * ⚠️ THIS IS THE CANONICAL CATEGORY REGISTRY ⚠️
 *
 * Do NOT declare category lists, labels, or enum maps anywhere else in the
 * codebase. Every consumer page (sell / browse / home / top-nav) must import
 * `CATEGORIES` from here and derive what it needs via filter / map.
 *
 * If you need a new derived property of a category, add a field to
 * `CategoryConfig` below — do NOT hard-code it locally.
 *
 * Past failure modes this registry prevents:
 *   - Sell page showing fewer categories than browse → broken seller journey
 *   - Label inconsistency 「手袋」 vs 「奢侈品手袋」 vs 「奢侈品手袋 / 銀包」
 *   - Adding a new category requiring edits to 4+ files
 */
export interface CategoryConfig {
  id: CategoryId;
  /** Server-side Prisma enum value, e.g. 'HANDBAG' */
  apiEnum: string;
  /** Primary HK Chinese label — the one to show by default */
  labelZh: string;
  /** Short HK Chinese label for space-constrained UI (top-nav, chips) */
  shortLabel: string;
  labelEn: string;
  /** Emoji for category strips / sell dropdown icons */
  emoji: string;
  /** Show as chip / section on browse page + home page */
  enabledInBrowse: boolean;
  /** Allow seller to list a product in this category */
  enabledInSell: boolean;
  /** Onboarding default / AI monitoring baseline — NOT used at checkout */
  authFeeRate: number;
  authFeeMin: number;
  /** Free-text keywords that map a buyer search query to this category.
   *  Used by parseSearchQuery() (browse smart search) — match is
   *  case/diacritic-insensitive substring. Include zh-HK + en + common
   *  colloquial terms. NOT shown in UI. */
  searchKeywords?: string[];
}

export const CATEGORIES: Record<CategoryId, CategoryConfig> = {
  handbag: {
    id: 'handbag',
    apiEnum: 'HANDBAG',
    labelZh: '奢侈品手袋 / 銀包',
    shortLabel: '手袋',
    labelEn: 'Luxury Bags',
    emoji: '👜',
    enabledInBrowse: true,
    enabledInSell: true,
    authFeeRate: 0.07,
    authFeeMin: 200,
    searchKeywords: ['手袋', '袋', '手提包', '銀包', '銀夾', '錢包', 'bag', 'handbag', 'wallet', 'clutch', 'tote', 'purse'],
  },
  iphone: {
    id: 'iphone',
    apiEnum: 'IPHONE',
    labelZh: 'iPhone / iPad / MacBook',
    shortLabel: 'iPhone',
    labelEn: 'Apple Electronics',
    emoji: '📱',
    enabledInBrowse: true,
    enabledInSell: true,
    authFeeRate: 0.035,
    authFeeMin: 80,
    searchKeywords: ['iphone', 'ipad', 'macbook', 'apple', '蘋果', '手機', '電話', '平板', '筆電', 'mac'],
  },
  pokemon_card: {
    id: 'pokemon_card',
    apiEnum: 'POKEMON_CARD',
    labelZh: 'Pokemon Card / TCG',
    shortLabel: 'Pokemon Card',
    labelEn: 'Trading Cards',
    emoji: '🃏',
    enabledInBrowse: true,
    enabledInSell: true,
    authFeeRate: 0.06,
    authFeeMin: 100,
    searchKeywords: ['pokemon', 'pokémon', '寶可夢', '寵物小精靈', '比卡超', '卡', '咭', 'card', 'tcg', 'ptcg', '閃卡', '卡牌'],
  },
  watch: {
    id: 'watch',
    apiEnum: 'WATCH',
    labelZh: '名錶',
    shortLabel: '名錶',
    labelEn: 'Watches',
    emoji: '⌚',
    enabledInBrowse: true,
    enabledInSell: false, // 「即將推出」—— Browse 顯示但 sell 暫未開放
    authFeeRate: 0.08,
    authFeeMin: 500,
    searchKeywords: ['手錶', '錶', '腕錶', '機械錶', 'watch', 'chronograph'],
  },
  sneaker: {
    id: 'sneaker',
    apiEnum: 'SNEAKER',
    labelZh: '球鞋',
    shortLabel: '球鞋',
    labelEn: 'Sneakers',
    emoji: '👟',
    enabledInBrowse: true,
    enabledInSell: false,
    authFeeRate: 0.05,
    authFeeMin: 80,
    searchKeywords: ['波鞋', '球鞋', '波', '鞋', 'sneaker', 'sneakers', 'shoes', 'kicks'],
  },
  designer_toy: {
    id: 'designer_toy',
    apiEnum: 'DESIGNER_TOY',
    labelZh: '潮玩',
    shortLabel: '潮玩',
    labelEn: 'Designer Toys',
    emoji: '🧸',
    enabledInBrowse: true,
    enabledInSell: false,
    authFeeRate: 0.04,
    authFeeMin: 50,
    searchKeywords: ['潮玩', '公仔', '盲盒', '盲盒公仔', 'figure', 'toy', 'toys', 'blind box', 'blindbox', 'art toy'],
  },
  other: {
    id: 'other',
    apiEnum: 'OTHER',
    labelZh: '其他',
    shortLabel: '其他',
    labelEn: 'Other',
    emoji: '📦',
    enabledInBrowse: false, // 「其他」唔係 discovery category，只用於 sell fallback
    enabledInSell: true,
    authFeeRate: 0,
    authFeeMin: 0,
  },
};

// ─── Derived helpers — use these instead of inlining `.filter()` everywhere ─

/** Categories to surface on browse + home page chip strip */
export function browseCategories(): CategoryConfig[] {
  return Object.values(CATEGORIES).filter((c) => c.enabledInBrowse);
}

/** Categories the seller can choose when listing a product */
export function sellCategories(): CategoryConfig[] {
  return Object.values(CATEGORIES).filter((c) => c.enabledInSell);
}

/** Lookup by id with friendly fallback */
export function categoryById(id: string | null | undefined): CategoryConfig | null {
  if (!id) return null;
  return CATEGORIES[id as CategoryId] ?? null;
}

/** Lookup by API enum (e.g. 'HANDBAG' → handbag config) */
export function categoryByApiEnum(apiEnum: string | null | undefined): CategoryConfig | null {
  if (!apiEnum) return null;
  return Object.values(CATEGORIES).find((c) => c.apiEnum === apiEnum) ?? null;
}

export const PLATFORM_FEE_RATE = 0.015;

/**
 * @deprecated 收費政策已改為「鑑定師自訂」(見 calculateOrderFees)。
 * 此函式用品類統一 rate，僅作 onboarding 預設 / AI 監控基準參考。
 */
export function calculateFees(category: CategoryId, salePriceHKD: number) {
  const cfg = CATEGORIES[category];
  const authFee = Math.max(salePriceHKD * cfg.authFeeRate, cfg.authFeeMin);
  const platformFee = salePriceHKD * PLATFORM_FEE_RATE;
  return {
    authFee: Math.round(authFee),
    platformFee: Math.round(platformFee),
    sellerNet: Math.round(salePriceHKD - authFee - platformFee),
    total: Math.round(salePriceHKD),
  };
}

export interface AuthFeeQuote {
  /** 鑑定師自訂百分比，例 0.06 = 6% */
  feeRatePct: number;
  /** 鑑定師自訂最低收費 (HKD) */
  feeMinHKD: number;
}

/**
 * 計算訂單費用。鑑定費用所揀鑑定師嘅自訂 rate；無鑑定師則 authFee = 0。
 * 平台撮合費固定 PLATFORM_FEE_RATE (1.5%)。
 */
export function calculateOrderFees(salePriceHKD: number, authQuote?: AuthFeeQuote | null) {
  const authFee = authQuote
    ? Math.round(Math.max(salePriceHKD * authQuote.feeRatePct, authQuote.feeMinHKD))
    : 0;
  const platformFee = Math.round(salePriceHKD * PLATFORM_FEE_RATE);
  return {
    authFee,
    platformFee,
    sellerNet: salePriceHKD - authFee - platformFee,
    total: salePriceHKD,
  };
}

/** 預覽某鑑定師收呢件貨幾多（買家 checkout 用）。 */
export function quoteAuthFee(salePriceHKD: number, authQuote: AuthFeeQuote): number {
  return Math.round(Math.max(salePriceHKD * authQuote.feeRatePct, authQuote.feeMinHKD));
}
