import { test, expect } from './fixtures';
import { CONSUMER, AUTHENTICATOR, ADMIN, tokenFor, langCookie } from './i18n-helpers';

/**
 * IN-18 — the language switcher is reachable and actually switches, in all
 * three portals. See docs/qa/scope/frontend/i18n.md.
 *
 * This is not about how it looks (that is IN-19, manual). It is about the
 * control being clickable and the cookie changing — b7e6aaa changed the pill
 * from `bg-white` to `bg-transparent border-current/20`, i.e. from carrying its
 * own background to borrowing the host's, and a shared control that renders
 * invisible against its host theme is unclickable long before it is ugly.
 *
 * 2026-08-15: IN-18b moved off `/login`. Founder ruling 2026-08-12 relocated
 * the authenticator pill from a floating top-right chip into `/settings` (a
 * logged-in-only page) — the same call already made for the consumer portal.
 * The 2026-08-14 full run reported this as a mismatch against the old `/login`
 * target; confirmed stale (apps/authenticator/app/layout.tsx no longer imports
 * LanguageSwitcher at all). This retargets IN-18b at /settings, logged in as
 * milan (borrowed authenticator account, read-only — see runbook).
 */

/** Consumer mounts `variant="select"` in the footer; admin still gets the
 *  default pill, which is a plain <a> — zero JS, cannot fail to be clickable. */
test('IN-18a consumer footer select 揀 English → cookie 變 en', async ({ page, context }) => {
  await page.goto('/browse');

  const select = page.getByLabel('Language / 語言');
  await select.scrollIntoViewIfNeeded();
  await expect(select).toBeVisible();
  await expect(select).toHaveValue('zh');

  // The switcher navigates to /api/locale, which sets the cookie server-side
  // and 307s back. Waiting on the URL is not enough — it matches again the
  // moment we land, before the reloaded page has re-read the cookie.
  await select.selectOption('en');
  await expect
    .poll(() => langCookie(context, CONSUMER), { timeout: 15_000 })
    .toBe('en');

  // The switcher itself must come back reflecting the new state.
  await expect(page.getByLabel('Language / 語言')).toHaveValue('en');
});

test('IN-18b authenticator /settings select 揀 English → cookie 變 en', async ({ page, context }) => {
  const token = await tokenFor(page, 'authenticator');
  await page.addInitScript(
    ([k, t]) => window.localStorage.setItem(k as string, t as string),
    ['authentik_auth_token', token],
  );
  await page.goto(`${AUTHENTICATOR}/settings`);

  const select = page.getByLabel('Language / 語言');
  await select.scrollIntoViewIfNeeded();
  await expect(select).toBeVisible();
  await expect(select).toHaveValue('zh');

  await select.selectOption('en');
  await expect
    .poll(() => langCookie(context, AUTHENTICATOR), { timeout: 15_000 })
    .toBe('en');

  await expect(page.getByLabel('Language / 語言')).toHaveValue('en');
});

test('IN-18c admin pill 撳得到 → cookie 變 en', async ({ page, context }) => {
  await page.goto(`${ADMIN}/login`);

  const pill = page.getByTitle('Switch to English');
  await expect(pill).toBeVisible();

  // A transparent control that inherits `currentColor` can still be present
  // and invisible. Playwright's click fails on a zero-size or covered
  // element, which is the failure mode this case exists to catch.
  await pill.click();
  await page.waitForLoadState('domcontentloaded');

  expect(await langCookie(context, ADMIN)).toBe('en');
  await expect(page.getByTitle('切換至繁體中文')).toBeVisible();
});
