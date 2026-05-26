export type AuthenticationTier = 1 | 2 | 3;

export const TIER_THRESHOLDS = {
  TIER_2_MIN: 1000,
  TIER_3_MIN: 10000,
} as const;

export function tierForPrice(priceHKD: number): AuthenticationTier {
  if (priceHKD >= TIER_THRESHOLDS.TIER_3_MIN) return 3;
  if (priceHKD >= TIER_THRESHOLDS.TIER_2_MIN) return 2;
  return 1;
}

export function isAuthenticationMandatory(priceHKD: number): boolean {
  return tierForPrice(priceHKD) === 3;
}

export function isAuthenticationOptional(priceHKD: number): boolean {
  const tier = tierForPrice(priceHKD);
  return tier === 1 || tier === 2;
}
