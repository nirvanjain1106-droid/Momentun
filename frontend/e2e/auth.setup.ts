import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

/**
 * Auth setup — seeds a logged-in session via API route interception.
 *
 * Strategy:
 *   1. Navigate to base URL (which renders the login screen for unauthenticated users)
 *   2. Intercept the /auth/login POST to simulate a successful login
 *   3. Inject auth_state into localStorage so the app hydrates as logged-in
 *   4. Save storage state for downstream specs
 *
 * This avoids needing a live backend and gives deterministic tests.
 */
setup('authenticate', async ({ page }) => {
  // 1. Intercept the login API call and return a mock success response
  await page.route('**/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-test-token-abc123',
        user_id: 'e2e-user-001',
        name: 'Test User',
        onboarding_complete: true,
      }),
    });
  });

  // 2. Intercept the /auth/refresh to keep the session alive
  await page.route('**/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'e2e-test-token-refreshed' }),
    });
  });

  // 3. Intercept /users/me for any profile fetches
  await page.route('**/users/me', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-user-001',
          name: 'Test User',
          email: 'test@example.com',
          user_type: 'professional',
          timezone: 'America/New_York',
          onboarding_complete: true,
          onboarding_step: 5,
          email_verified: true,
          is_paused: false,
          paused_reason: null,
          created_at: '2026-01-01T00:00:00Z',
        }),
      });
    } else {
      await route.continue();
    }
  });

  // 4. Navigate and inject localStorage auth state
  await page.goto('/');

  // Wait for the page to load
  await page.waitForLoadState('domcontentloaded');

  // Seed localStorage with auth state — this is what authStore.hydrate() reads
  await page.evaluate(() => {
    localStorage.setItem(
      'auth_state',
      JSON.stringify({
        userId: 'e2e-user-001',
        userName: 'Test User',
        onboardingComplete: true,
      })
    );
  });

  // 5. Reload so the app hydrates with the seeded auth state
  await page.reload();
  await page.waitForLoadState('networkidle');

  // 6. Verify we're past the login screen — the home screen should render
  //    The home screen has a BottomBar with navigation tabs
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible({ timeout: 10000 });

  // 7. Save the storage state for all authenticated specs
  await page.context().storageState({ path: authFile });
});
