import { test as base, expect, Page } from '@playwright/test';

/**
 * Shared login for the browser lane.
 *
 * Logs in through the API and seeds the token into localStorage rather than
 * driving the login form — the form has its own case (browser lane, auth), and
 * every other test failing because login broke would just be noise hiding the
 * real signal.
 */
const API = process.env.QA_API_URL ?? 'https://uat-api.certifinehk.com/api';
const TOKEN_KEY = 'authentik_token';

export const ACCOUNTS = {
  buyer: { email: 'alice@demo.hk', password: 'password123' },
  seller: { email: 'tom@demo.hk', password: 'password123' },
} as const;

export async function loginAs(page: Page, who: keyof typeof ACCOUNTS) {
  const res = await page.request.post(`${API}/auth/login`, { data: ACCOUNTS[who] });
  expect(res.ok(), `login as ${who} failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const token = body.accessToken ?? body.token;
  expect(token, 'login response carried no token').toBeTruthy();
  await page.addInitScript(
    ([k, t]) => window.localStorage.setItem(k as string, t as string),
    [TOKEN_KEY, token],
  );
}

/** An ACTIVE listing id, resolved at run time — never hardcode ids in cases. */
export async function anyActiveListingId(page: Page): Promise<string> {
  const res = await page.request.get(`${API}/listings?limit=1`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const items = Array.isArray(body) ? body : body.items;
  expect(items?.length, 'no ACTIVE listing on UAT to test against').toBeTruthy();
  return items[0].id;
}

export const test = base;
export { expect };
