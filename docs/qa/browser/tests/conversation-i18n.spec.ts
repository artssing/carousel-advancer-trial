import { test, expect } from './fixtures';
import {
  CONSUMER, AUTHENTICATOR, API, HAN,
  useEnglishAs, waitForEnglish, chineseOnScreen,
} from './i18n-helpers';

/**
 * IN-17 — the shared ConversationPane renders English in BOTH portals.
 * IN-20 — its dates and times follow the locale, not a hardcoded zh-HK.
 *
 * See docs/qa/scope/frontend/i18n.md. Why both portals: since b7e6aaa the two
 * portals share one component body but inject theme/deps through two different
 * adapters, so "consumer is fine" proves nothing about the authenticator —
 * measuring that is the whole point of the merge.
 */

/** Composer placeholder — `ui.conversation.composer.placeholder`. */
const COMPOSER_EN = 'Type a message…';
const COMPOSER_ZH = '輸入訊息…';

test.describe('IN-17 ConversationPane 兩個 portal 都轉英文', () => {
  test('IN-17a consumer — 對話 chrome 全英文', async ({ page, context }) => {
    await useEnglishAs(context, page, CONSUMER, 'qaBuyer');

    const res = await page.request.get(`${API}/listings?limit=1`);
    expect(res.ok(), 'could not list listings').toBeTruthy();
    const body = await res.json();
    const items = Array.isArray(body) ? body : body.items;
    expect(items?.length, 'no ACTIVE listing on UAT to open a conversation on').toBeTruthy();

    await page.goto(`/listing/${items[0].id}`);

    // The listing page itself must be in English before we trust anything else.
    await waitForEnglish(page, async () =>
      /Contact the seller/.test(await page.locator('body').innerText()));
    const contact = page.getByRole('button', { name: /Contact the seller/ }).first();
    await contact.scrollIntoViewIfNeeded();
    await contact.click();

    const composer = page.locator('textarea');
    await expect(composer).toBeVisible();
    await expect(composer).toHaveAttribute('placeholder', COMPOSER_EN);
    await expect(page.locator(`textarea[placeholder="${COMPOSER_ZH}"]`)).toHaveCount(0);

    // Role pills — `ui.conversation.role.*` + `header.meTag`.
    await expect(page.getByText(/^Buyer\b/).first()).toBeVisible();
    await expect(page.getByText('(You)').first()).toBeVisible();
  });

  test('IN-17b authenticator — 同一個 component，第二個 adapter', async ({ page, context }) => {
    await useEnglishAs(context, page, AUTHENTICATOR, 'authenticator');
    await page.goto(`${AUTHENTICATOR}/messages`);

    // Borrowed demo account: it may legitimately have no conversation. Skipping
    // loudly beats a green tick that proved nothing.
    const composer = page.locator('textarea');
    const empty = page.getByText(/No conversations yet|暫無對話/);
    await expect(composer.or(empty).first()).toBeVisible();
    if (await empty.count()) {
      test.skip(true, 'milan@authentik.hk has no conversation on this UAT — nothing to open');
    }

    await expect(composer.first()).toHaveAttribute('placeholder', COMPOSER_EN);
    await expect(page.locator(`textarea[placeholder="${COMPOSER_ZH}"]`)).toHaveCount(0);
  });
});

test('IN-20 date divider 同時間跟返 locale，唔係 zh-HK', async ({ page, context }) => {
  await useEnglishAs(context, page, CONSUMER, 'qaBuyer');

  const res = await page.request.get(`${API}/listings?limit=1`);
  const body = await res.json();
  const items = Array.isArray(body) ? body : body.items;
  expect(items?.length, 'no ACTIVE listing on UAT').toBeTruthy();

  await page.goto(`/listing/${items[0].id}`);
  await waitForEnglish(page, async () =>
    /Contact the seller/.test(await page.locator('body').innerText()));
  const contact = page.getByRole('button', { name: /Contact the seller/ }).first();
  await contact.scrollIntoViewIfNeeded();
  await contact.click();

  const composer = page.locator('textarea');
  await expect(composer).toHaveAttribute('placeholder', COMPOSER_EN);

  // formatDateDivider has four branches (today / yesterday / this week / older)
  // and only one of them runs on any given day — assert the shape, not one value.
  const divider = page.locator('div.my-3 span').first();
  await expect(divider).toBeVisible();
  const text = ((await divider.textContent()) ?? '').trim();

  expect(text, `date divider still Chinese: ${text}`).not.toMatch(HAN);
  expect(
    text,
    `date divider is neither an English keyword nor an en date: ${text}`,
  ).toMatch(/^(Today|Yesterday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|\d{1,2} \w+( \d{4})?|\w+ \d{1,2}(, \d{4})?)$/);

  // Message timestamps are 24h HH:MM in both locales; what must not appear is
  // a zh-HK rendering like 上午/下午.
  const chinese = await chineseOnScreen(page);
  const inPane = chinese.filter((l) => /上午|下午|年|月|日/.test(l));
  expect(inPane, `zh date/time formatting leaked: ${inPane.join(' | ')}`).toHaveLength(0);
});
