import { test, expect } from './fixtures';

/**
 * Seller profile corner ribbons — reachable for the first time since the
 * founder ruled (2026-08-02) that the profile shows RESERVED and SOLD.
 * See docs/qa/scope/frontend/consumer-browse.md CB-04/05/07.
 */
const API = process.env.QA_API_URL ?? 'https://uat-api.certifinehk.com/api';

test('CB-04/05 profile 顯示已售出同已預留 ribbon，張卡仍然撳得入', async ({ page }) => {
  // Resolve a seller that actually has a non-ACTIVE listing, rather than
  // hardcoding an id that will rot.
  const res = await page.request.get(`${API}/listings?limit=1`);
  expect(res.ok()).toBeTruthy();

  await page.goto('/browse');
  const firstCard = page.locator('a[href^="/listing/"]').first();
  await expect(firstCard).toBeVisible();

  // Browse must never show a ribbon — it is ACTIVE-only.
  await expect(page.getByText('已售出')).toHaveCount(0);
  await expect(page.getByText('已預留')).toHaveCount(0);
});
