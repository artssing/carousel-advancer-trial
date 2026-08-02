import { test, expect } from './fixtures';

/**
 * CB-10 — the mobile regressions that keep coming back (docs/lessons.md).
 * Runs under the `mobile` project (iPhone 13 viewport).
 */
test('CB-10 mobile 漢堡選單見到，橫向唔會 overflow', async ({ page }) => {
  await page.goto('/browse');
  // Accessible name comes from layout.nav.openMenu — 開啟主目錄 (zh) /
  // "Open menu" (en). Match both so the case does not break on locale.
  const menu = page.getByRole('button', { name: /開啟主目錄|Open menu/i });
  await expect(menu.first()).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows, 'page scrolls horizontally on mobile').toBeFalsy();
});
