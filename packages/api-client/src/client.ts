import type { Listing, Order, Authenticator, User } from './types';

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => string | null | Promise<string | null>;
}

export class ApiClient {
  constructor(private cfg: ApiClientConfig) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.cfg.getAuthToken ? await this.cfg.getAuthToken() : null;
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  listings = {
    list: () => this.req<Listing[]>('/api/listings'),
    get: (id: string) => this.req<Listing>(`/api/listings/${id}`),
    create: (data: Partial<Listing>) =>
      this.req<Listing>('/api/listings', { method: 'POST', body: JSON.stringify(data) }),
  };

  orders = {
    list: () => this.req<Order[]>('/api/orders'),
    get: (id: string) => this.req<Order>(`/api/orders/${id}`),
  };

  authenticators = {
    list: () => this.req<Authenticator[]>('/api/authenticators'),
    listByCategory: (cat: string) =>
      this.req<Authenticator[]>(`/api/authenticators?category=${cat}`),
  };

  me = () => this.req<User>('/api/me');
}
