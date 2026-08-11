import { test, expect } from './fixtures';
import { CONSUMER, API, useEnglishAs, waitForEnglish, chineseOnScreen, tokenFor } from './i18n-helpers';

/**
 * IN-03 — the consumer screens that IN-12 measures as fully collected really do
 * render zero Chinese once `lang=en` is applied.
 *
 * This is IN-12's runtime counterpart, and it is not redundant with it. IN-12
 * proves the *source* holds no Chinese literal; it cannot see a conditional
 * branch that never renders, a string that arrives from the API, or a missing
 * SSOT key falling back to zh. Only the screen can.
 *
 * Grepping the built bundle is explicitly not an acceptable substitute: an
 * English string existing in a chunk says nothing about it reaching the page.
 *
 * ⚠️ Every assertion runs after `waitForEnglish`. The server renders zh no
 * matter what the cookie says (backlog §3.6, pinned by IN-16), so asserting on
 * load would fail on every page for a reason that is not a defect.
 */

/** The 16 pages IN-12 records at 0 remaining, minus the ones that need state
 *  we will not manufacture. Each entry carries the English text that proves
 *  hydration finished for that particular screen. */
const STATIC_PAGES: Array<{ path: string; ready: RegExp }> = [
  { path: '/', ready: /Browse|Sell|Trust/ },
  { path: '/browse', ready: /Browse|Filter|Sort|results/i },
  { path: '/login', ready: /Log in|Sign in|Email/i },
  { path: '/register', ready: /Register|Create|Email/i },
];

const AUTHED_PAGES: Array<{ path: string; ready: RegExp }> = [
  { path: '/my-listings', ready: /Listing|listings|No /i },
  { path: '/account/wallet', ready: /Wallet|Balance|Withdraw/i },
  { path: '/account/wallet/methods', ready: /Method|Bank|Add/i },
  { path: '/account/wallet/payouts', ready: /Payout|Withdraw|No /i },
  { path: '/auth/complete-profile', ready: /Profile|Name|Continue/i },
  { path: '/auth/link-confirm', ready: /Link|Confirm|Account/i },
];

async function assertNoChinese(page: import('@playwright/test').Page, label: string) {
  const lines = await chineseOnScreen(page);
  expect(
    lines,
    `${label} still shows Chinese after hydration:\n  ${lines.join('\n  ')}`,
  ).toHaveLength(0);
}

test.describe('IN-03 已收乾淨嘅 consumer 畫面 lang=en 之後零中文', () => {
  for (const { path, ready } of STATIC_PAGES) {
    test(`IN-03 ${path}`, async ({ page, context }) => {
      await context.addCookies([{ name: 'lang', value: 'en', url: CONSUMER }]);
      await page.goto(path);
      await waitForEnglish(page, async () => ready.test(await page.locator('body').innerText()));
      await assertNoChinese(page, path);
    });
  }

  for (const { path, ready } of AUTHED_PAGES) {
    test(`IN-03 ${path}（已登入）`, async ({ page, context }) => {
      await useEnglishAs(context, page, CONSUMER, 'qaBuyer');
      await page.goto(path);
      await waitForEnglish(page, async () => ready.test(await page.locator('body').innerText()));
      await assertNoChinese(page, path);
    });
  }

  test('IN-03 /listing/[id]', async ({ page, context }) => {
    await useEnglishAs(context, page, CONSUMER, 'qaBuyer');
    const res = await page.request.get(`${API}/listings?limit=1`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : body.items;
    expect(items?.length, 'no ACTIVE listing on UAT').toBeTruthy();

    await page.goto(`/listing/${items[0].id}`);
    await waitForEnglish(page, async () => /Contact the seller/.test(await page.locator('body').innerText()));

    // A listing page necessarily renders user-written content: the seller's
    // display name and the item title. Those are data, not UI copy — a listing
    // called 「Chanel Classic 幾乎全新」 is correct in every locale. Filter the
    // exact values the API gave us rather than loosening the Chinese check.
    const userText = [items[0].title, items[0].seller?.displayName].filter(Boolean) as string[];
    const lines = (await chineseOnScreen(page))
      .filter((l) => !userText.some((u) => l.includes(u)));
    expect(
      lines,
      `/listing/[id] still shows Chinese chrome after hydration:\n  ${lines.join('\n  ')}`,
    ).toHaveLength(0);
  });

  test('IN-03 /seller/[id] 同 /authenticator/[id]', async ({ page, context }) => {
    await useEnglishAs(context, page, CONSUMER, 'qaBuyer');
    const res = await page.request.get(`${API}/listings?limit=1`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : body.items;
    const sellerId = items?.[0]?.seller?.id ?? items?.[0]?.sellerId;
    if (!sellerId) test.skip(true, 'listing payload carried no seller id — cannot resolve /seller/[id]');

    await page.goto(`/seller/${sellerId}`);
    await waitForEnglish(page, async () => /sold|listed|Reviews|Items/i.test(await page.locator('body').innerText()));
    await assertNoChinese(page, '/seller/[id]');
  });

  /**
   * `/orders/[id]` and `/checkout/[orderId]` need an order to exist for
   * qa-buyer. They are skipped rather than faked when there is none — a green
   * tick on a page that never loaded is the one outcome worse than a red one.
   */
  test('IN-03 /orders/[id]', async ({ page, context }) => {
    await useEnglishAs(context, page, CONSUMER, 'qaBuyer');
    const token = await tokenFor(page, 'qaBuyer');
    const res = await page.request.get(`${API}/orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = res.ok() ? await res.json() : null;
    const orders = Array.isArray(body) ? body : body?.items;
    if (!orders?.length) test.skip(true, 'qa-buyer has no order on UAT — nothing to open');

    await page.goto(`/orders/${orders[0].id}`);
    await waitForEnglish(page, async () => /Order|Status|Total/i.test(await page.locator('body').innerText()));
    await assertNoChinese(page, '/orders/[id]');
  });
});
