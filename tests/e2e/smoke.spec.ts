import { test, expect } from '@playwright/test';

test('app shell loads and displays title', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h1')).toHaveText(/Verb(al|ális|ales) Aikid[oó]/i);
});

test('desktop viewport displays app shell and sponsor button @desktop', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h1')).toHaveText(/Verb(al|ális|ales) Aikid[oó]/i);
  await expect(page.locator('.sponsor-button')).toBeVisible();
});
