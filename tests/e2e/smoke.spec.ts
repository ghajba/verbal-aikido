import { test, expect } from '@playwright/test';

test('app shell loads and displays title', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h1')).toContainText('Verbal Aikido');
});

test('desktop viewport displays app shell and sponsor button @desktop', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h1')).toContainText('Verbal Aikido');
  await expect(page.locator('.sponsor-button')).toBeVisible();
});
