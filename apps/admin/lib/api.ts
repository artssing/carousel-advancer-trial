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
};
