import { defineConfig, devices } from '@playwright/test';

const base = process.env.VITE_BASE || '/';
const normalizedBase = base.endsWith('/') ? base : `${base}/`;
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || `http://localhost:4173${normalizedBase}`;

export default defineConfig({
  testDir: './tests/e2e',
  globalTimeout: 60000,
  timeout: 10000,
  expect: {
    timeout: 3000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/report.json' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'], locale: 'hu-HU' },
    },
    {
      name: 'chromium-mobile-en',
      use: { ...devices['Pixel 5'], locale: 'en-US' },
    },
    {
      name: 'chromium-mobile-de',
      use: { ...devices['Pixel 5'], locale: 'de-DE' },
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'chromium-desktop',
      grep: /@desktop/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'firefox-desktop',
      grep: /@desktop/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'pwa',
      grep: /@pwa/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
