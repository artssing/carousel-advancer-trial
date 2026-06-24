const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'authentik_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export const AUTH_CHANGE_EVENT = 'authentik-auth-change';

function notifyAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  notifyAuthChange();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  notifyAuthChange();
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

export const api = {
  register: (data: { email: string; password: string; displayName: string }) =>
    req<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email?: string; identifier?: string; password: string }) =>
    req<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  phoneSendOtp: (phone: string, purpose: 'REGISTER_PHONE' | 'CHANGE_PHONE') =>
    req<{ expiresInSeconds: number }>('/auth/phone/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, purpose }),
    }),
  phoneVerifyOtp: (phone: string, code: string, purpose: 'REGISTER_PHONE' | 'CHANGE_PHONE') =>
    req<{ phone: string; phoneVerified: boolean }>('/auth/phone/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code, purpose }),
    }),
  me: () =>
    req<{
      id: string;
      email: string;
      displayName: string;
      avatarUrl: string | null;
      phone: string | null;
      phoneVerified: boolean;
      roles: string[];
      kycStatus: string;
      createdAt: string;
      authenticator: { id: string; displayName: string; status: string } | null;
    }>('/me'),

  updateMe: (data: { displayName?: string; avatarUrl?: string | null }) =>
    req<{ id: string; email: string; displayName: string; avatarUrl: string | null; roles: string[]; kycStatus: string; createdAt: string }>(
      '/me', { method: 'PATCH', body: JSON.stringify(data) },
    ),

  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/me/password', {
      method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }),
    }),

  listings: {
    list: (
      category?: string, limit = 24, offset = 0, q?: string,
      opts?: { minPrice?: number; maxPrice?: number; sort?: 'newest' | 'priceAsc' | 'priceDesc' | 'relevance'; excludeId?: string; brand?: string },
    ) => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (q) params.set('q', q);
      if (opts?.minPrice != null) params.set('minPrice', String(opts.minPrice));
      if (opts?.maxPrice != null) params.set('maxPrice', String(opts.maxPrice));
      if (opts?.sort) params.set('sort', opts.sort);
      if (opts?.excludeId) params.set('excludeId', opts.excludeId);
      if (opts?.brand) params.set('brand', opts.brand);
      return req<{ items: any[]; total: number; hasMore: boolean }>(
        `/listings?${params.toString()}`,
      );
    },
    get: (id: string) => req<any>(`/listings/${id}`),
    mine: () => req<any[]>('/listings/mine'),
    mineStats: () => req<{
      total: number; active: number; reserved: number; sold: number; removed: number;
      completedOrders: number; lifetimeEarnings: number; monthEarnings: number;
    }>('/listings/mine/stats'),
    create: (data: {
      title: string;
      description: string;
      priceHKD: number;
      category: string;
      brand?: string;
      images?: string[];
      allowedDeliveryMethods?: string[];
      sellerDistrict?: string;
    }) =>
      req<any>('/listings', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{
      title: string;
      description: string;
      priceHKD: number;
      category: string;
      brand: string;
      images: string[];
      allowedDeliveryMethods: string[];
      sellerDistrict: string;
    }>) => req<any>(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    activeOfferCount: (id: string) =>
      req<{ count: number }>(`/listings/${id}/active-offer-count`),
  },

  orders: {
    list: () => req<any[]>('/orders'),
    badgeCount: () => req<{ count: number }>('/orders/badge-count'),
    authenticatorInbox: () => req<any[]>('/orders/authenticator-inbox'),
    get: (id: string) => req<any>(`/orders/${id}`),
    create: (data: {
      listingId: string;
      authenticatorId?: string;
      deliveryMethod: string;
      paymentMethod: string;
      meetupLocation?: string;    // legacy
      meetupBranchId?: string;    // MEETUP_AUTH / MEETUP_3WAY
      meetupFreeText?: string;    // MEETUP_DIRECT
      offerId?: string;
    }) => req<any>('/orders', { method: 'POST', body: JSON.stringify(data) }),
    shipToAuthenticator: (orderId: string) =>
      req<any>(`/orders/${orderId}/ship-to-authenticator`, { method: 'PATCH' }),
    shipToBuyerDirect: (orderId: string) =>
      req<any>(`/orders/${orderId}/ship-to-buyer-direct`, { method: 'PATCH' }),
    shipToBuyer: (orderId: string) =>
      req<any>(`/orders/${orderId}/ship-to-buyer`, { method: 'PATCH' }),
    // v4: confirmDelivered requires ≥3 unboxing photos
    confirmDelivered: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/confirm-delivered`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    complete: (orderId: string) =>
      req<any>(`/orders/${orderId}/complete`, { method: 'PATCH' }),
    pay: (orderId: string) =>
      req<any>(`/orders/${orderId}/pay`, { method: 'PATCH' }),
    startMeetupAuth: (orderId: string) =>
      req<any>(`/orders/${orderId}/start-meetup-auth`, { method: 'PATCH' }),
    completeMeetup: (orderId: string) =>
      req<any>(`/orders/${orderId}/complete-meetup`, { method: 'PATCH' }),
    // ── Dual-ack flow ─────────────────────────────────────────
    startMeetupHandover: (orderId: string) =>
      req<any>(`/orders/${orderId}/start-meetup-handover`, { method: 'PATCH' }),
    authReceiveAck: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/auth-receive-ack`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    sellerHandoverAck: (orderId: string) =>
      req<any>(`/orders/${orderId}/seller-handover-ack`, { method: 'PATCH' }),
    submitVerdictMeetup: (orderId: string, verdict: string, notes?: string) =>
      req<any>(`/orders/${orderId}/submit-verdict-meetup`, {
        method: 'PATCH', body: JSON.stringify({ verdict, notes }),
      }),
    buyerReceiveAck: (orderId: string) =>
      req<any>(`/orders/${orderId}/buyer-receive-ack`, { method: 'PATCH' }),
    uploadReturnPhotos: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/upload-return-photos`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    sellerReturnAck: (orderId: string) =>
      req<any>(`/orders/${orderId}/seller-return-ack`, { method: 'PATCH' }),
    dispute: (orderId: string, reason: string) =>
      req<any>(`/orders/${orderId}/dispute`, {
        method: 'PATCH', body: JSON.stringify({ reason }),
      }),
    // Seller-only soft options (Phase A pre-custody)
    // New signature: structured presets + optional comment for re-photo
    requestRePhoto: (orderId: string, payload: { presets?: string[]; comment?: string }) =>
      req<any>(`/orders/${orderId}/request-rephoto`, {
        method: 'PATCH', body: JSON.stringify(payload),
      }),
    cancelHandover: (orderId: string, reason?: string) =>
      req<any>(`/orders/${orderId}/cancel-handover`, {
        method: 'PATCH', body: JSON.stringify({ reason }),
      }),
    // SHIP with photos
    markReceivedWithPhotos: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/mark-received`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    confirmDeliveredWithPhotos: (orderId: string, photos: string[]) =>
      req<any>(`/orders/${orderId}/confirm-delivered`, {
        method: 'PATCH', body: JSON.stringify({ photos }),
      }),
    authDeliveryAck: (orderId: string) =>
      req<any>(`/orders/${orderId}/auth-delivery-ack`, { method: 'PATCH' }),
    review: (orderId: string, data: { rating: number; comment?: string }) =>
      req<any>(`/orders/${orderId}/review`, { method: 'POST', body: JSON.stringify(data) }),
  },

  conversations: {
    list: () => req<any[]>('/conversations/list'),
    forOrder: (orderId: string) => req<any>(`/conversations/order/${orderId}`),
    forListing: (listingId: string) => req<any>(`/conversations/listing/${listingId}`),
    unread: () => req<{ unread: number }>('/conversations/unread'),
    /** Fast search across user's conversations (counterparty / listing / brand / id prefix) */
    search: (q: string) => req<any[]>(`/conversations/search?q=${encodeURIComponent(q)}`),
    /** Lazy-fetch private pair channel (BUYER_SELLER | BUYER_AUTH | SELLER_AUTH) */
    pair: (orderId: string, kind: 'BUYER_SELLER' | 'BUYER_AUTH' | 'SELLER_AUTH') =>
      req<any>(`/conversations/order/${orderId}/pair/${kind}`),
  },

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

  payments: {
    /** Step 1 — server creates Stripe PaymentIntent + Payment row */
    createIntent: (orderId: string) =>
      req<{ clientSecret: string; paymentId: string; amountHKD: number; mode: 'mock' | 'test' | 'live' }>(
        `/payments/${orderId}/create-intent`, { method: 'POST' },
      ),
    /** Step 2 (mock mode only) — simulate buyer card confirm + webhook in one call */
    confirmMock: (
      orderId: string,
      paymentId: string,
      testCard?: string,
      method?: 'CARD' | 'ALIPAY_HK' | 'WECHAT_HK' | 'FPS' | 'APPLE_PAY',
    ) =>
      req<{ ok: boolean; code?: string; message?: string; status?: string }>(
        `/payments/${orderId}/confirm-mock`,
        { method: 'POST', body: JSON.stringify({ paymentId, testCard, method }) },
      ),
    /** Cancel an active hold — buyer-initiated */
    cancelHold: (orderId: string) =>
      req<{ cancelled: boolean }>(`/payments/${orderId}/cancel-hold`, { method: 'POST' }),
    /** Polling endpoint for checkout page */
    status: (orderId: string) =>
      req<{
        orderId: string;
        orderStatus: string;
        escrowHeld: boolean;
        payment: null | {
          id: string; status: string; amountHKD: number; captureMode: string;
          holdExpiresAt: string | null; failureCode: string | null; failureMessage: string | null;
        };
        stripeMode: 'mock' | 'test' | 'live';
      }>(`/payments/${orderId}/status`),
  },

  authenticators: {
    list: (category?: string) =>
      req<any[]>(`/authenticators${category ? `?category=${category}` : ''}`),
    get: (id: string) => req<any>(`/authenticators/${id}`),
    /** Public active branches for buyer checkout picker */
    branches: (id: string) =>
      req<Array<{
        id: string; name: string; fullAddress: string; districtKey: string;
        businessHours: string | null; notes: string | null; isPrimary: boolean;
        contactPhone: string | null; contactWhatsapp: string | null;
      }>>(`/authenticators/${id}/branches`),
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
    sellerListings: (id: string, limit = 12, offset = 0) =>
      req<{ items: any[]; total: number; hasMore: boolean }>(
        `/users/${id}/listings?limit=${limit}&offset=${offset}`,
      ),
    reviews: (id: string) => req<{
      total: number; averageRating: number | null;
      items: { id: string; rating: number; comment: string | null; buyerName: string; createdAt: string }[];
    }>(`/users/${id}/reviews`),
    createSellerReview: (orderId: string, rating: number, comment?: string, isAnonymous = true) =>
      req<any>(`/orders/${orderId}/seller-review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment, isAnonymous }),
      }),
    buyerProfile: (id: string) => req<{
      id: string;
      displayName: string;
      kycVerified: boolean;
      joinedAt: string;
      completedBuyCount: number;
    }>(`/users/${id}/buyer-profile`),
  },

  // ── Wallet / Cashout (CO Phase) ──────────────────────────────────────
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
    getRequest: (id: string) => req<any>(`/wallet/requests/${id}`),
  },
};
