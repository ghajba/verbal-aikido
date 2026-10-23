import { test, expect } from '@playwright/test';

test('dynamic AI sparring flow launches and completes a turn', async ({ page }) => {
  await page.goto('./');

  // Verify AI Sparring section is present
  const aiSection = page.locator('[data-testid="ai-sparring-section"]');
  await expect(aiSection).toBeVisible();

  // Click on start AI sparring for Angry PM
  const startBtn = page.locator('[data-testid="start-scenario-scen_dynamic_angry_pm"]');
  await expect(startBtn).toBeVisible();
  await startBtn.click();

  // Verify BriefingScreen is loaded
  await expect(page.locator('[data-testid="briefing-screen"]')).toBeVisible();

  // Start scenario from briefing
  const launchBtn = page.locator('[data-testid="briefing-start-btn"]');
  await expect(launchBtn).toBeVisible();
  await launchBtn.click();

  // Verify GameScreen is loaded
  await expect(page.locator('[data-testid="game-screen"]')).toBeVisible({ timeout: 10000 });

  // Verify cards are visible
  const cards = page.locator('.card');
  await expect(cards.first()).toBeVisible();

  // Select first card
  await cards.first().click();

  // Commit via the preview apply button
  const applyBtn = page.locator('[data-testid="preview-apply-btn"]');
  await expect(applyBtn).toBeVisible({ timeout: 5000 });
  await applyBtn.click();

  // Wait for resolution and continue button to become enabled
  const continueBtn = page.locator('[data-testid="primary-continue-btn"]');
  await expect(continueBtn).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(350); // wait out input lock
  await continueBtn.click();

  // Game continues to next turn
  await expect(page.locator('[data-testid="game-screen"]')).toBeVisible();
});
