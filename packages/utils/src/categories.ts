export type CategoryId =
  | 'handbag'
  | 'iphone'
  | 'pokemon_card'
  | 'watch'
  | 'sneaker'
  | 'designer_toy'
  | 'other';

export interface CategoryConfig {
  id: CategoryId;
  labelZh: string;
  labelEn: string;
  authFeeRate: number;
  authFeeMin: number;
  enabledInMvp: boolean;
}

export const CATEGORIES: Record<CategoryId, CategoryConfig> = {
  handbag: {
    id: 'handbag',
    labelZh: '奢侈品手袋 / 銀包',
    labelEn: 'Luxury Bags',
    authFeeRate: 0.07,
    authFeeMin: 200,
    enabledInMvp: true,
  },
  iphone: {
    id: 'iphone',
    labelZh: 'iPhone / iPad / MacBook',
    labelEn: 'Apple Electronics',
    authFeeRate: 0.035,
    authFeeMin: 80,
    enabledInMvp: true,
  },
  pokemon_card: {
    id: 'pokemon_card',
    labelZh: 'Pokemon Card / TCG',
    labelEn: 'Trading Cards',
    authFeeRate: 0.06,
    authFeeMin: 100,
    enabledInMvp: true,
  },
  watch: {
    id: 'watch',
    labelZh: '名錶',
    labelEn: 'Watches',
    authFeeRate: 0.08,
    authFeeMin: 500,
    enabledInMvp: false,
  },
  sneaker: {
    id: 'sneaker',
    labelZh: '球鞋',
    labelEn: 'Sneakers',
    authFeeRate: 0.05,
    authFeeMin: 80,
    enabledInMvp: false,
  },
  designer_toy: {
    id: 'designer_toy',
    labelZh: '潮玩',
    labelEn: 'Designer Toys',
    authFeeRate: 0.04,
    authFeeMin: 50,
    enabledInMvp: false,
  },
  other: {
    id: 'other',
    labelZh: '其他',
    labelEn: 'Other',
    authFeeRate: 0,
    authFeeMin: 0,
    enabledInMvp: true,
  },
};

export const PLATFORM_FEE_RATE = 0.015;

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
