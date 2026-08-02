import { test, expect, loginAs, anyActiveListingId } from './fixtures';

/**
 * Share wizard — the interaction cases from
 * docs/qa/scope/frontend/consumer-share.md that curl cannot reach.
 */
test.describe('share wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'seller');
  });

  async function openWizard(page: import('@playwright/test').Page) {
    const id = await anyActiveListingId(page);
    await page.goto(`/listing/${id}`);
    await page.getByRole('button', { name: '分享' }).click();
    await expect(page.getByRole('heading', { name: '分享商品' })).toBeVisible();
  }

  test('SF-03 modal 開住嗰陣背景唔 scroll 到', async ({ page }) => {
    await openWizard(page);
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).toBe('hidden');
  });

  test('SF-04 撳 Esc 關到 modal', async ({ page }) => {
    await openWizard(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '分享商品' })).toBeHidden();
  });

  test('SF-22 關咗 modal 之後背景 scroll 返轉頭', async ({ page }) => {
    await openWizard(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: '分享商品' })).toBeHidden();
    const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflow).not.toBe('hidden');
  });

  test('SF-08 桌面唔出「分享圖片 + 文字」，但連結掣要出', async ({ page }) => {
    await openWizard(page);
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '生成預覽' }).click();
    await expect(page.getByRole('button', { name: 'WhatsApp' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Facebook' })).toBeVisible();
    // navigator.canShare with files is mobile-only; the button must not ship a
    // dead affordance on desktop.
    await expect(page.getByRole('button', { name: '分享圖片 + 文字' })).toHaveCount(0);
  });
});
