import { expect, Page, BrowserContext } from '@playwright/test';

/**
 * Helpers for the i18n browser cases (IN-03 / IN-17 / IN-18 / IN-20).
 *
 * The three portals are three origins, so anything origin-scoped — cookies
 * above all — has to be set per portal. `fixtures.ts` only knows the consumer.
 */

export const CONSUMER = process.env.QA_BASE_URL ?? 'https://uat.certifinehk.com';
export const AUTHENTICATOR = process.env.QA_AUTH_URL ?? 'https://uat-auth.certifinehk.com';
export const ADMIN = process.env.QA_ADMIN_URL ?? 'https://uat-admin.certifinehk.com';
export const API = process.env.QA_API_URL ?? 'https://uat-api.certifinehk.com/api';

/**
 * Each portal keeps its token under its own key — a shared one would mean
 * signing into the consumer app also signs you into admin. Seeding the wrong
 * key leaves the page silently logged out, which reads as "the screen is
 * broken" rather than "the test is wrong".
 */
const TOKEN_KEY: Record<string, string> = {
  [CONSUMER]: 'authentik_token',
  [AUTHENTICATOR]: 'authentik_auth_token',
  [ADMIN]: 'authentik_admin_token',
};

/**
 * Text that is Chinese on purpose and must never count as untranslated.
 * `繁體中文` is the language switcher's own option: a language picker names
 * each language in that language. Translating it to "Traditional Chinese"
 * would be the actual defect.
 */
export const INTENTIONAL_CHINESE = ['繁體中文'];

/** Any CJK ideograph, plus the full-width punctuation that sits outside that
 *  range — `。、：` are exactly what a codemod once left in the English build. */
export const HAN = /[一-鿿。、「」！？：；]/;

export const ACCOUNTS = {
  qaBuyer: { email: 'qa-buyer@demo.hk', password: 'password123' },
  qaSeller: { email: 'qa-seller@demo.hk', password: 'password123' },
  // Borrowed demo account. There is no QA authenticator — `qa-auth@authentik.hk`
  // is in the runbook but was never seeded (401). Founder ruled 2026-08-10 that
  // authenticator cases borrow milan, read-only. See docs/qa/runbook.md.
  authenticator: { email: 'milan@authentik.hk', password: 'password123' },
} as const;

export async function tokenFor(page: Page, who: keyof typeof ACCOUNTS): Promise<string> {
  const res = await page.request.post(`${API}/auth/login`, { data: ACCOUNTS[who] });
  expect(res.ok(), `login as ${who} failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const token = body.accessToken ?? body.token;
  expect(token, `login as ${who} carried no token`).toBeTruthy();
  return token;
}

/**
 * Put the portal into English and log in, before the first navigation.
 *
 * The cookie must exist on the *first* load: `getClientLocale()` reads it in a
 * useEffect, so a cookie set afterwards only takes effect on the next reload.
 */
export async function useEnglishAs(
  context: BrowserContext,
  page: Page,
  origin: string,
  who: keyof typeof ACCOUNTS,
) {
  const token = await tokenFor(page, who);
  const key = TOKEN_KEY[origin];
  expect(key, `no token key known for origin ${origin}`).toBeTruthy();
  await context.addCookies([{ name: 'lang', value: 'en', url: origin }]);
  await page.addInitScript(
    ([k, t]) => window.localStorage.setItem(k as string, t as string),
    [key, token],
  );
}

/**
 * Wait until the English dictionary has actually been applied.
 *
 * Non-negotiable for every assertion in this file. The server renders zh
 * regardless of the cookie (backlog §3.6, pinned by IN-16), so reading the DOM
 * on load is guaranteed to see Chinese and would report a mismatch that is not
 * real. We wait for a element that is known to be translated, not for a timer.
 */
export async function waitForEnglish(page: Page, probe: () => Promise<boolean>) {
  try {
    await expect.poll(probe, {
      // 20s, not 10: the dev-server target compiles routes on first request,
      // and a cold route is not a defect.
      timeout: 20_000,
      intervals: [200, 300, 500, 1000, 2000],
    }).toBe(true);
  } catch (e) {
    // A bare "never hydrated" says nothing about why. Show what was on screen
    // so the report can tell a redirect-to-login from a genuinely zh render.
    const seen = (await page.locator('body').innerText().catch(() => '<no body>'))
      .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12).join(' | ');
    throw new Error(`page never hydrated into English at ${page.url()}\n  on screen: ${seen}`);
  }
}

/** Chinese still on screen after hydration, as `snippet` lines for the report. */
export async function chineseOnScreen(page: Page): Promise<string[]> {
  const text = await page.locator('body').innerText();
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && HAN.test(l))
    .filter((l) => !INTENTIONAL_CHINESE.includes(l));
}

export async function langCookie(context: BrowserContext, origin: string): Promise<string | undefined> {
  const cookies = await context.cookies(origin);
  return cookies.find((c) => c.name === 'lang')?.value;
}
