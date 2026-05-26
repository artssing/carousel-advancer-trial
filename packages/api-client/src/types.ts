import type { CategoryId, AuthenticationTier } from '@authentik/utils';

export type UserRole = 'buyer' | 'seller' | 'authenticator' | 'ops_agent' | 'ops_admin' | 'super_admin';

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  kycStatus: 'pending' | 'verified' | 'rejected';
  createdAt: string;
}

export interface Listing {
  id: string;
  sellerId: string;
  category: CategoryId;
  title: string;
  description: string;
  priceHKD: number;
  tier: AuthenticationTier;
  images: string[];
  status: 'draft' | 'active' | 'reserved' | 'sold' | 'removed';
  createdAt: string;
}

export interface Authenticator {
  id: string;
  userId: string;
  displayName: string;
  storeName?: string;
  categories: CategoryId[];
  starRating: 1 | 2 | 3 | 4 | 5;
  completedCount: number;
  disputeRate: number;
  eAndOInsuranceExpiresAt: string | null;
  status: 'pending' | 'active' | 'suspended' | 'removed';
  publicProfileUrl: string;
}

export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'shipped_to_authenticator'
  | 'authenticating'
  | 'auth_passed'
  | 'auth_failed'
  | 'shipped_to_buyer'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'refunded';

export interface Order {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  authenticatorId: string | null;
  status: OrderStatus;
  totals: {
    salePriceHKD: number;
    authFeeHKD: number;
    platformFeeHKD: number;
    sellerNetHKD: number;
  };
  createdAt: string;
}

export interface AuthenticationReport {
  orderId: string;
  authenticatorId: string;
  verdict: 'authentic' | 'counterfeit' | 'inconclusive';
  notes: string;
  videoUrl: string;
  signedAt: string;
  signatureHash: string;
}
