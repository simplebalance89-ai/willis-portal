// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: false, // Sequential for EnPro testing
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for sequential testing
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'results/test-results.json' }],
    ['list']
  ],
  use: {
    baseURL: process.env.ENPRO_URL || 'https://enpro-fm-portal.onrender.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'results/',
});
