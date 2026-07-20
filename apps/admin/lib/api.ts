const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'authentik_admin_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }
export function hasToken() { return !!getToken(); }

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
    try { const body = await res.json(); msg = body.message ?? msg; } catch {}
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    req<{ accessToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req<{
    id: string; email: string; displayName: string; roles: string[]; kycStatus: string;
  }>('/me'),
  admin: {
    overview: () => req<{ users: number; listings: number; orders: number; disputes: number; kycPending: number; sellerReviews: number }>('/admin/overview'),
    disputes: () => req<any[]>('/admin/disputes'),
    kycQueue: () => req<any[]>('/admin/kyc-queue'),
    approveKyc: (userId: string) => req<any>(`/admin/kyc/${userId}/approve`, { method: 'PATCH' }),
    rejectKyc: (userId: string) => req<any>(`/admin/kyc/${userId}/reject`, { method: 'PATCH' }),
    users: () => req<any[]>('/admin/users'),
    userDetail: (id: string) => req<any>(`/admin/users/${id}`),
    suspendUser: (id: string, reason: string) =>
      req<any>(`/admin/users/${id}/suspend`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    unsuspendUser: (id: string) =>
      req<any>(`/admin/users/${id}/unsuspend`, { method: 'PATCH' }),
    setKyc: (id: string, status: 'PENDING' | 'VERIFIED' | 'REJECTED', reason?: string) =>
      req<any>(`/admin/users/${id}/kyc`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
    setRoles: (id: string, roles: string[]) =>
      req<any>(`/admin/users/${id}/roles`, { method: 'PATCH', body: JSON.stringify({ roles }) }),
    setEmailVerified: (id: string, value: boolean, reason?: string) =>
      req<any>(`/admin/users/${id}/email-verified`, { method: 'PATCH', body: JSON.stringify({ value, reason }) }),
    resetPassword: (id: string) =>
      req<{ tempPassword: string; warning: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),
    addNote: (id: string, bodyText: string) =>
      req<any>(`/admin/users/${id}/notes`, { method: 'POST', body: JSON.stringify({ body: bodyText }) }),
    listNotes: (id: string) =>
      req<any[]>(`/admin/users/${id}/notes`),
    overrideDisplayName: (id: string, displayName: string, reason: string) =>
      req<any>(`/admin/users/${id}/display-name`, { method: 'PATCH', body: JSON.stringify({ displayName, reason }) }),
    listPlatformConfig: () =>
      req<Array<{ key: string; value: any; updatedAt: string }>>('/admin/platform-config'),
    setPlatformConfig: (key: string, value: any) =>
      req<any>(`/admin/platform-config/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
    financeSummary: () => req<{
      lifetimeRevenueHKD: number; lifetimeOrders: number;
      mtdRevenueHKD: number; mtdOrders: number; mtdMonth: string;
      escrowHeldHKD: number; pendingPayoutsHKD: number;
      offlineCashCompletedCount: number; note: string;
    }>('/admin/finance/summary'),
    listPriceChanges: (params: {
      status?: 'PENDING' | 'APPLIED' | 'CANCELLED' | 'DIRECT_EDIT';
      sellerEmail?: string;
      from?: string; to?: string;
      suspicious?: boolean;
      limit?: number; offset?: number;
    } = {}) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.sellerEmail) qs.set('sellerEmail', params.sellerEmail);
      if (params.from) qs.set('from', params.from);
      if (params.to) qs.set('to', params.to);
      if (params.suspicious) qs.set('suspicious', '1');
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.offset != null) qs.set('offset', String(params.offset));
      const q = qs.toString();
      return req<{
        items: Array<{
          id: string;
          listingId: string; listingTitle: string; listingStatus: string | null;
          sellerId: string; sellerEmail: string; sellerDisplayName: string | null;
          oldPriceHKD: number; newPriceHKD: number;
          deltaHKD: number; deltaPct: number;
          status: 'PENDING' | 'APPLIED' | 'CANCELLED' | 'DIRECT_EDIT';
          requestedAt: string; effectiveAt: string | null; appliedAt: string | null;
          cancelledAt: string | null; cancelReason: string | null;
          suspicious: boolean; suspiciousReasons: string[];
        }>;
        total: number; limit: number; offset: number; hasMore: boolean;
      }>(`/admin/price-changes${q ? `?${q}` : ''}`);
    },
    // ── P0: orders / disputes / payouts / listings ──
    orders: (params: { status?: string; q?: string; limit?: number; offset?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.q) qs.set('q', params.q);
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.offset != null) qs.set('offset', String(params.offset));
      const q = qs.toString();
      return req<{ items: any[]; total: number; hasMore: boolean }>(`/admin/orders${q ? `?${q}` : ''}`);
    },
    orderDetail: (id: string) => req<any>(`/admin/orders/${id}`),
    forceRefund: (id: string, reason: string) =>
      req<any>(`/admin/orders/${id}/force-refund`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    releaseEscrow: (id: string, reason: string) =>
      req<any>(`/admin/orders/${id}/release-escrow`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    resolveDispute: (id: string, resolution: 'REFUND_BUYER' | 'RELEASE_SELLER', note: string) =>
      req<any>(`/admin/disputes/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({ resolution, note }) }),
    payouts: (status?: string) =>
      req<any[]>(`/admin/finance/payouts${status ? `?status=${status}` : ''}`),
    setPayoutStatus: (id: string, status: string, failureReason?: string) =>
      req<any>(`/admin/finance/payouts/${id}`, { method: 'PATCH', body: JSON.stringify({ status, failureReason }) }),
    listings: (params: { status?: string; q?: string; limit?: number; offset?: number } = {}) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.q) qs.set('q', params.q);
      if (params.limit != null) qs.set('limit', String(params.limit));
      if (params.offset != null) qs.set('offset', String(params.offset));
      const q = qs.toString();
      return req<{ items: any[]; total: number; hasMore: boolean }>(`/admin/listings${q ? `?${q}` : ''}`);
    },
    removeListing: (id: string, reason: string) =>
      req<any>(`/admin/listings/${id}/remove`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    restoreListing: (id: string, reason: string) =>
      req<any>(`/admin/listings/${id}/restore`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    // ── Authenticator lifecycle（founder 2026-07-13 MVP）──
    authApplications: (status?: string) =>
      req<any[]>(`/admin/authenticator-applications${status ? `?status=${status}` : ''}`),
    approveAuthApplication: (id: string) =>
      req<any>(`/admin/authenticator-applications/${id}/approve`, { method: 'PATCH' }),
    rejectAuthApplication: (id: string, reason: string, needsMoreInfo?: boolean) =>
      req<any>(`/admin/authenticator-applications/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason, needsMoreInfo }) }),
    authenticators: (params: { status?: string; q?: string } = {}) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.q) qs.set('q', params.q);
      const s = qs.toString();
      return req<any[]>(`/admin/authenticators${s ? `?${s}` : ''}`);
    },
    setAuthenticatorStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED', reason?: string) =>
      req<any>(`/admin/authenticators/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  },
  banners: {
    listAll: () => req<Array<{
      id: string; message: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      audience: 'ALL' | 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS';
      isActive: boolean; startsAt: string | null; endsAt: string | null;
      dismissible: boolean; priority: number;
      createdBy: string; createdAt: string; updatedAt: string;
    }>>('/admin/banners'),
    create: (data: {
      message: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      audience?: 'ALL' | 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS';
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
      dismissible?: boolean;
      priority?: number;
    }) => req<any>('/admin/banners', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{
      message: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      audience: 'ALL' | 'BUYERS' | 'SELLERS' | 'AUTHENTICATORS';
      isActive: boolean;
      startsAt: string | null;
      endsAt: string | null;
      dismissible: boolean;
      priority: number;
    }>) => req<any>(`/admin/banners/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id: string) =>
      req<{ ok: boolean }>(`/admin/banners/${id}`, { method: 'DELETE' }),
  },

  // ── Analytics（docs/proposals/analytics-tagging-spec.md MVP）──────────
  analytics: {
    overview: () => req<{
      membersOnline: number; guestsOnline: number; authenticatorsOnline: number; asOf: string;
    }>('/analytics/admin/overview'),
    guestMemberSplit: (days = 7) =>
      req<{ days: number; guest: number; member: number }>(`/analytics/admin/guest-member-split?days=${days}`),
    topSearches: (days = 7, zeroOnly = false) =>
      req<Array<{ query: string; count: number; avgResults: number; zeroCount: number }>>(
        `/analytics/admin/top-searches?days=${days}${zeroOnly ? '&zeroOnly=1' : ''}`),
    purchaseFunnel: (days = 7) =>
      req<{ days: number; steps: Array<{ name: string; label: string; count: number }> }>(
        `/analytics/admin/funnel/purchase?days=${days}`),
    events: (q: string) =>
      req<Array<{
        id: string; eventName: string; occurredAt: string; portal: string;
        anonymousId: string; userId: string | null; role: string; sessionId: string;
        pagePath: string; properties: Record<string, unknown>;
      }>>(`/analytics/admin/events?q=${encodeURIComponent(q)}`),
    timeseries: (interval: 'hour' | 'minute', minutes: number, event: string) =>
      req<{ interval: string; eventName: string; buckets: Array<{ t: string; count: number }> }>(
        `/analytics/admin/timeseries?interval=${interval}&minutes=${minutes}&event=${event}`),
    listingStats: (days = 7) =>
      req<Array<{
        listingId: string; title: string; priceHKD: number | null; status: string | null;
        views: number; uniqueViewers: number; avgDwellSeconds: number | null;
        orders: number; conversionRate: number | null;
      }>>(`/analytics/admin/listings?days=${days}`),
    orderOutcomes: (days = 7) =>
      req<{ days: number; buckets: Array<{ name: string; label: string; count: number }> }>(
        `/analytics/admin/order-outcomes?days=${days}`),
    purchaseFunnelByTier: (days = 7) =>
      req<{ days: number; tiers: Array<{ tier: number; steps: Array<{ name: string; count: number }> }> }>(
        `/analytics/admin/funnel/purchase-by-tier?days=${days}`),
    northStar: () =>
      req<{
        mau: number; gmvHKD: number; authPassRate: number | null;
        slaMetRate: number | null; disputeRate: number | null; takeRate: number | null;
      }>('/analytics/admin/north-star'),
    slaHealth: (days = 30) =>
      req<Array<{ name: string; jobs: number; avgHours: number; breaches: number }>>(
        `/analytics/admin/sla-health?days=${days}`),
    zeroResultTrend: (days = 14) =>
      req<{ days: string[]; series: Array<{ query: string; counts: number[] }> }>(
        `/analytics/admin/zero-result-trend?days=${days}`),
  },
};
