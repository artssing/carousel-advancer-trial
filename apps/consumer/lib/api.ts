const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'authentik_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getToken(): string | null {
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

export const api = {
  register: (data: { email: string; password: string; displayName: string }) =>
    req<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    req<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  me: () => req<{ id: string; email: string; displayName: string; kycStatus: string }>('/me'),

  listings: {
    list: (category?: string) =>
      req<any[]>(`/listings${category ? `?category=${category}` : ''}`),
    get: (id: string) => req<any>(`/listings/${id}`),
    create: (data: {
      title: string;
      description: string;
      priceHKD: number;
      category: string;
    }) =>
      req<any>('/listings', { method: 'POST', body: JSON.stringify(data) }),
  },

  orders: {
    list: () => req<any[]>('/orders'),
    get: (id: string) => req<any>(`/orders/${id}`),
    create: (data: { listingId: string; authenticatorId?: string }) =>
      req<any>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  },

  payments: {
    confirm: (orderId: string) =>
      req<any>(`/payments/${orderId}/confirm`, { method: 'POST' }),
  },

  authenticators: {
    list: (category?: string) =>
      req<any[]>(`/authenticators${category ? `?category=${category}` : ''}`),
  },
};
