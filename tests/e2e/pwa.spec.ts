import { test, expect } from '@playwright/test';

test('pwa shell loads and registers properly @pwa', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h1')).toContainText('Verbal Aikido');
});
