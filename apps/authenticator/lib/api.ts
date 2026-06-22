const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'authentik_auth_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken() {
  return !!getToken();
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message ?? msg;
    } catch {}
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthenticatorProfile {
  id: string;
  displayName: string;
  storeName?: string;
  categories: string[];
  starRating: number;
  completedCount: number;
  disputeRate?: number;
  status: string;
  feeRatePct?: number;
  feeMinHKD?: number;
  bio?: string | null;
  yearsExperience?: number | null;
  locationAddress?: string | null;
  district?: string | null;
  businessHours?: string | null;
  acceptsMeetup?: boolean;
  eAndOInsuranceExpiresAt?: string | null;
}

export interface UpdateAuthenticatorInput {
  feeRatePct?: number;
  feeMinHKD?: number;
  bio?: string;
  yearsExperience?: number;
  locationAddress?: string;
  district?: string;
  businessHours?: string;
  acceptsMeetup?: boolean;
}

export interface Me {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  kycStatus: string;
  authenticator: AuthenticatorProfile | null;
}

export interface InboxOrder {
  id: string;
  status: string;
  salePriceHKD: number;
  authFeeHKD: number;
  authVerdict: string | null;
  authNotes: string | null;
  deliveryMethod: string | null;
  paymentMethod: string | null;
  meetupLocation: string | null;
  escrowHeld: boolean;
  createdAt: string;
  paidAt: string | null;
  shippedToAuthAt: string | null;
  receivedByAuthAt: string | null;
  listing: { id: string; title: string; category: string; images: string[] };
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
}

export const api = {
  auth: {
    login: (data: { email: string; password: string }) =>
      req<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  me: () => req<Me>('/me'),

  updateMe: (data: UpdateAuthenticatorInput) =>
    req<AuthenticatorProfile>('/authenticators/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  branches: {
    list: () => req<Array<{
      id: string; name: string; fullAddress: string; districtKey: string;
      businessHours: string | null; notes: string | null;
      contactPhone: string | null; contactWhatsapp: string | null;
      isActive: boolean; isPrimary: boolean;
    }>>('/authenticators/me/branches'),
    create: (data: {
      name: string; fullAddress: string; districtKey: string;
      businessHours?: string; notes?: string;
      contactPhone?: string; contactWhatsapp?: string;
      isPrimary?: boolean;
    }) => req<any>('/authenticators/me/branches', { method: 'POST', body: JSON.stringify(data) }),
    update: (branchId: string, data: Partial<{
      name: string; fullAddress: string; districtKey: string;
      businessHours: string; notes: string;
      contactPhone: string; contactWhatsapp: string;
      isActive: boolean; isPrimary: boolean;
    }>) => req<any>(`/authenticators/me/branches/${branchId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (branchId: string) =>
      req<{ deleted: boolean }>(`/authenticators/me/branches/${branchId}`, { method: 'DELETE' }),
  },

  conversations: {
    list: () => req<any[]>('/conversations/list'),
    /** Fast search (counterparty / listing / brand / id prefix); auth-user scoped */
    search: (q: string) => req<any[]>(`/conversations/search?q=${encodeURIComponent(q)}`),
    forOrder: (orderId: string) => req<any>(`/conversations/order/${orderId}`),
    byId: (conversationId: string) => req<any>(`/conversations/by-id/${conversationId}`),
    unread: () => req<{ unread: number }>('/conversations/unread'),
  },

  users: {
    sellerProfile: (id: string) => req<{
      id: string;
      displayName: string;
      kycVerified: boolean;
      joinedAt: string;
      activeListingsCount: number;
      soldAsSellerCount: number;
      totalListings: number;
      authenticator: { id: string; storeName?: string; starRating: number; completedCount: number } | null;
      avgRating: number | null;
      reviewCount: number;
    }>(`/users/${id}/seller-profile`),
  },

  // ── Wallet / Cashout (CO Phase) ─────────────────────────────────────
  wallet: {
    balance: () => req<{
      lockedHKD: number;
      pendingHoldHKD: number;
      availableHKD: number;
      inFlightHKD: number;
      inFlightCount: number;
      grossEarnedHKD: number;
      cashedOutHKD: number;
      payoutFeeHKD: number;
      minHKD: number;
      maxHKD: number;
      hasAuthenticatorRole: boolean;
      breakdown: Array<{
        orderId: string; listingId: string; listingTitle: string;
        role: 'SELLER' | 'AUTHENTICATOR';
        amountHKD: number; bucket: 'LOCKED' | 'PENDING' | 'AVAILABLE';
        status: string; eligibleAt: string | null; completedAt: string | null;
      }>;
    }>('/wallet/balance'),
    methods: () => req<Array<{
      id: string; type: 'FPS_PHONE' | 'FPS_EMAIL' | 'FPS_ID' | 'BANK_LOCAL';
      accountIdentifier: string; bankCode: string | null; accountName: string;
      nameMatchesKyc: boolean; isDefault: boolean; isVerified: boolean;
      createdAt: string;
    }>>('/wallet/methods'),
    addMethod: (data: {
      type: 'FPS_PHONE' | 'FPS_EMAIL' | 'FPS_ID' | 'BANK_LOCAL';
      accountIdentifier: string; bankCode?: string; accountName: string;
      isDefault?: boolean;
    }) => req<any>('/wallet/methods', { method: 'POST', body: JSON.stringify(data) }),
    setDefault: (id: string) =>
      req<{ ok: boolean }>(`/wallet/methods/${id}/default`, { method: 'PATCH' }),
    deleteMethod: (id: string) =>
      req<{ ok: boolean }>(`/wallet/methods/${id}`, { method: 'DELETE' }),
    requests: () => req<Array<{
      id: string; amountHKD: number; feeHKD: number; netHKD: number;
      status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REVERSED';
      reference: string; failureReason: string | null;
      methodSnapshot: { type: string; displayLabel: string; accountName: string };
      processedAt: string | null; createdAt: string;
    }>>('/wallet/requests'),
    createRequest: (data: { payoutMethodId: string; amountHKD: number }) =>
      req<any>('/wallet/requests', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Read-only — authenticator may view offer history but typically can't act
  offers: {
    get: (id: string) => req<any>(`/offers/${id}`),
    create: (conversationId: string, priceHKD: number) =>
      req<any>('/offers', { method: 'POST', body: JSON.stringify({ conversationId, priceHKD }) }),
    accept: (id: string) => req<any>(`/offers/${id}/accept`, { method: 'POST' }),
    reject: (id: string) => req<any>(`/offers/${id}/reject`, { method: 'POST' }),
    counter: (id: string, priceHKD: number) =>
      req<any>(`/offers/${id}/counter`, { method: 'POST', body: JSON.stringify({ priceHKD }) }),
    withdraw: (id: string) => req<any>(`/offers/${id}/withdraw`, { method: 'POST' }),
    listForConversation: (conversationId: string) =>
      req<any[]>(`/offers/conversation/${conversationId}`),
  },

  orders: {
    inbox: () => req<InboxOrder[]>('/orders/authenticator-inbox'),
    /** Authenticator-scoped fast search; matches title / id-prefix / brand / party names */
    search: (q: string) => req<InboxOrder[]>(`/orders/authenticator-search?q=${encodeURIComponent(q)}`),
    get: (id: string) => req<any>(`/orders/${id}`),
    // v4: SHIP markReceived requires ≥3 unboxing photos
    markReceived: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/mark-received`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    submitVerdict: (orderId: string, verdict: 'PASSED' | 'FAILED' | 'INCONCLUSIVE', notes: string) =>
      req<any>(`/orders/${orderId}/verdict`, {
        method: 'PATCH',
        body: JSON.stringify({ verdict, notes }),
      }),
    startMeetupAuth: (orderId: string) =>
      req<any>(`/orders/${orderId}/start-meetup-auth`, { method: 'PATCH' }),
    // ── Dual-ack flow ──
    startMeetupHandover: (orderId: string) =>
      req<any>(`/orders/${orderId}/start-meetup-handover`, { method: 'PATCH' }),
    authReceiveAck: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/auth-receive-ack`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    submitVerdictMeetup: (orderId: string, verdict: string, notes?: string) =>
      req<any>(`/orders/${orderId}/submit-verdict-meetup`, {
        method: 'PATCH', body: JSON.stringify({ verdict, notes }),
      }),
    uploadReturnPhotos: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/upload-return-photos`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    authDeliveryAck: (orderId: string) =>
      req<any>(`/orders/${orderId}/auth-delivery-ack`, { method: 'PATCH' }),
    dispute: (orderId: string, reason: string) =>
      req<any>(`/orders/${orderId}/dispute`, {
        method: 'PATCH', body: JSON.stringify({ reason }),
      }),
  },
};
