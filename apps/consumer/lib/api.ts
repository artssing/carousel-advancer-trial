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
  register: (data: {
    email: string;
    password: string;
    displayName: string;
    /** Register v2 — server verifies + marks emailVerified=true. */
    emailOtp?: string;
    /** Register v2 — optional user-chosen handle; auto-generated if omitted. */
    username?: string;
    /** Register v2 — Category enum values, seed for homepage personalisation. */
    interests?: string[];
  }) =>
    req<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  /** Send 6-digit code to email. Dev mode fixed 888888 (see auth.service.ts). */
  emailSendOtp: (email: string, purpose: 'REGISTER_EMAIL' | 'VERIFY_EMAIL' = 'REGISTER_EMAIL') =>
    req<{ expiresInSeconds: number }>('/auth/email/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, purpose }),
    }),
  /** VERIFY_EMAIL flow (authenticated). REGISTER_EMAIL consumed inline via register(). */
  emailVerifyOtp: (email: string, code: string) =>
    req<{ emailVerified: boolean }>('/auth/email/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code, purpose: 'VERIFY_EMAIL' }),
    }),
  /** Public — availability check for `/@handle` URL. */
  checkUsername: (username: string) =>
    req<{ available: boolean; reason?: string }>(
      `/auth/username/check?username=${encodeURIComponent(username)}`,
    ),
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
      avatarOriginalUrl: string | null;
      avatarCropZoom: number | null;
      avatarCropX: number | null;
      avatarCropY: number | null;
      phone: string | null;
      phoneVerified: boolean;
      roles: string[];
      kycStatus: string;
      createdAt: string;
      authenticator: { id: string; displayName: string; status: string } | null;
    }>('/me'),

  updateMe: (data: {
    displayName?: string;
    avatarUrl?: string | null;
    avatarOriginalUrl?: string | null;
    avatarCropZoom?: number | null;
    avatarCropX?: number | null;
    avatarCropY?: number | null;
    interests?: string[];
  }) =>
    req<{
      id: string; email: string; displayName: string;
      avatarUrl: string | null;
      avatarOriginalUrl: string | null;
      avatarCropZoom: number | null;
      avatarCropX: number | null;
      avatarCropY: number | null;
      roles: string[]; kycStatus: string; createdAt: string;
    }>(
      '/me', { method: 'PATCH', body: JSON.stringify(data) },
    ),

  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/me/password', {
      method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }),
    }),

  listings: {
    list: (
      category?: string, limit = 24, offset = 0, q?: string,
      /** `brand` supports multi-select: comma-separated ids, e.g. "chanel,gucci" (OR match). */
      opts?: { minPrice?: number; maxPrice?: number; sort?: 'newest' | 'priceAsc' | 'priceDesc' | 'relevance'; excludeId?: string; brand?: string; conditionMin?: string },
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
      if (opts?.conditionMin) params.set('conditionMin', opts.conditionMin);
      return req<{ items: any[]; total: number; hasMore: boolean }>(
        `/listings?${params.toString()}`,
      );
    },
    get: (id: string) => req<any>(`/listings/${id}`),
    mine: () => req<any[]>('/listings/mine'),
    // Soft delete own listing（founder 2026-07-10：customer 刪除永遠 soft，可還原）
    softDelete: (id: string) => req<any>(`/listings/${id}`, { method: 'DELETE' }),
    restoreOwn: (id: string) => req<any>(`/listings/${id}/restore`, { method: 'PATCH' }),
    mineStats: () => req<{
      total: number; active: number; reserved: number; sold: number; removed: number;
      completedOrders: number; lifetimeEarnings: number; monthEarnings: number;
    }>('/listings/mine/stats'),
    create: (data: {
      title: string;
      description: string;
      priceHKD: number;
      category: string;
      condition: string;
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
      condition: string;
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
    /** Public — most recent AUTH_PASSED / DELIVERED / COMPLETED orders. */
    recentPassed: () => req<Array<{
      key: string;
      title: string;
      category: string;
      brand: string | null;
      authenticatorName: string;
      passedAt: string;
    }>>('/public/orders/recent-passed'),
    authenticatorInbox: () => req<any[]>('/orders/authenticator-inbox'),
    get: (id: string) => req<any>(`/orders/${id}`),
    /** Review step 確認 → server 設 30 分鐘付款時限（idempotent，重 call 唔 reset） */
    confirmReview: (id: string) =>
      req<{ paymentDeadlineAt: string }>(`/orders/${id}/confirm-review`, { method: 'PATCH' }),
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
    // Ack v2: ship steps require SF tracking number — no bare button
    shipToAuthenticator: (orderId: string, trackingNo: string) =>
      req<any>(`/orders/${orderId}/ship-to-authenticator`, { method: 'PATCH', body: JSON.stringify({ trackingNo }) }),
    shipToBuyerDirect: (orderId: string, trackingNo: string) =>
      req<any>(`/orders/${orderId}/ship-to-buyer-direct`, { method: 'PATCH', body: JSON.stringify({ trackingNo }) }),
    shipToBuyer: (orderId: string, trackingNo: string) =>
      req<any>(`/orders/${orderId}/ship-to-buyer`, { method: 'PATCH', body: JSON.stringify({ trackingNo }) }),
    // Ack v2: QR 交收 token（買家取貨 / 賣家到店交貨）
    handoverToken: (orderId: string) =>
      req<{ token: string; expiresAt: string; role: string }>(`/orders/${orderId}/handover-token`),
    // Ack v2: 買家喺 T+3 窗口內提出爭議（停 auto-complete）
    disputeShip: (orderId: string, reason: string) =>
      req<any>(`/orders/${orderId}/dispute-ship`, { method: 'POST', body: JSON.stringify({ reason }) }),
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
      req<{ clientSecret: string; paymentId: string; amountHKD: number; mode: 'mock' | 'test' | 'live'; gatewayUrl: string | null }>(
        `/payments/${orderId}/create-intent`, { method: 'POST' },
      ),
    /** Step 2 (test mode w/ mock gateway) — browser confirms DIRECTLY against
     *  the gateway (stand-in for stripe.js confirmPayment); result lands via
     *  signed webhook → poll status() until PAID / FAILED. */
    confirmViaGateway: async (gatewayUrl: string, clientSecret: string, testCard?: string) => {
      const res = await fetch(`${gatewayUrl}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_secret: clientSecret, test_card: testCard }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? `Gateway error ${res.status}`);
      return data as { status: string; error?: { code: string; message: string } };
    },
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
    /** Audit the chosen channel (gateway path) — fire-and-forget */
    logMethod: (orderId: string, method: 'CARD' | 'ALIPAY_HK' | 'WECHAT_HK' | 'FPS' | 'APPLE_PAY') =>
      req<{ ok: boolean }>(`/payments/${orderId}/log-method`, {
        method: 'POST', body: JSON.stringify({ method }),
      }),
    /** Cancel an active hold — buyer-initiated */
    cancelHold: (orderId: string) =>
      req<{ cancelled: boolean }>(`/payments/${orderId}/cancel-hold`, { method: 'POST' }),
    /** Polling endpoint for checkout page */
    status: (orderId: string) =>
      req<{
        orderId: string;
        orderStatus: string;
        escrowHeld: boolean;
        paymentDeadlineAt: string | null;
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
    sellerListings: (id: string, limit = 12, offset = 0, q?: string) =>
      req<{ items: any[]; total: number; hasMore: boolean }>(
        `/users/${id}/listings?limit=${limit}&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
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
    // 2FA（founder 2026-07-13）: add-method + withdrawal are both step-up
    // gated — initiate（server 發 email OTP）→ confirm（帶 code）。
    initiateAddMethod: (data: {
      type: 'FPS_PHONE' | 'FPS_EMAIL' | 'FPS_ID' | 'BANK_LOCAL';
      accountIdentifier: string; bankCode?: string; accountName: string;
      isDefault?: boolean;
    }) => req<{ intentId: string; channel: 'EMAIL'; maskedTarget: string; otpExpiresInSeconds: number }>(
      '/wallet/methods/initiate', { method: 'POST', body: JSON.stringify(data) }),
    confirmAddMethod: (data: { intentId: string; code: string }) =>
      req<any>('/wallet/methods/confirm', { method: 'POST', body: JSON.stringify(data) }),
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
    initiatePayout: (data: { payoutMethodId: string; amountHKD: number }) =>
      req<{ intentId: string; channel: 'EMAIL'; maskedTarget: string; otpExpiresInSeconds: number }>(
        '/wallet/requests/initiate', { method: 'POST', body: JSON.stringify(data) }),
    confirmPayout: (data: { intentId: string; code: string }) =>
      req<any>('/wallet/requests/confirm', { method: 'POST', body: JSON.stringify(data) }),
    getRequest: (id: string) => req<any>(`/wallet/requests/${id}`),
  },

  // ── Emergency banners (public GET, no auth) ──────────────────────────
  banners: {
    list: (audience: 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS' | 'ALL' = 'BUYERS') =>
      req<Array<{
        id: string;
        message: string;
        severity: 'INFO' | 'WARNING' | 'CRITICAL';
        audience: 'ALL' | 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS';
        dismissible: boolean;
        priority: number;
        createdAt: string;
      }>>(`/banners?audience=${audience}`),
  },

  // ── Public platform-config feature toggles (no auth) ──────────────────
  config: {
    /** Read a boolean feature-toggle by key. Missing / off → false. */
    flag: (key: string) =>
      req<{ key: string; value: { enabled?: boolean } | null }>(`/platform-config/${key}`)
        .then((r) => !!r.value?.enabled)
        .catch(() => false),
  },
};
