import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Momentum E2E tests.
 *
 * Key design decisions:
 *   1. Auth setup project seeds localStorage, not a live backend
 *   2. All spec files mock API calls to avoid backend dependency
 *   3. Mobile viewport (390×844) matches the design reference frame
 *   4. Visual regression tests create baselines on first run
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter configuration */
  reporter: [
    ['html', { outputFolder: 'e2e-report' }],
    ['list'],
  ],

  /* Shared settings for all projects */
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    /* Default viewport matching design spec */
    viewport: { width: 390, height: 844 },
  },

  /* Configure projects */
  projects: [
    /* Auth setup — seeds localStorage and saves storage state */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    /* Main test suite — all spec files use mocked APIs */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    /* Firefox — cross-browser validation */
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 390, height: 844 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    /* WebKit — Safari compatibility */
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 390, height: 844 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Run the dev server before starting tests */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      cwd: './',
    },
  ],
});
