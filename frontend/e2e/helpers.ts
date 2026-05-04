import { Page, Route, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers for Momentum E2E tests
// ─────────────────────────────────────────────────────────────────────────────

/** Seed localStorage with a logged-in auth state and reload */
export async function seedAuthState(page: Page) {
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
}

/** Clear all auth state from localStorage */
export async function clearAuthState(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('auth_state');
  });
}

/** Mock all standard API endpoints with happy-path responses */
export async function mockAllApis(page: Page) {
  // Auth refresh
  await page.route('**/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'e2e-mock-token' }),
    });
  });

  // Auth login
  await page.route('**/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-mock-token',
        user_id: 'e2e-user-001',
        name: 'Test User',
        onboarding_complete: true,
      }),
    });
  });

  // Auth register
  await page.route('**/auth/register', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-mock-token',
        user_id: 'e2e-user-002',
        name: 'New User',
        onboarding_complete: false,
      }),
    });
  });

  // Auth logout
  await page.route('**/auth/logout', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'ok' }),
    });
  });

  // User profile
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
          stats: {
            daysActive: 42,
            goalsCompleted: 7,
            avgFocusTime: '3.2h',
          },
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Day score
  await page.route('**/users/me/day-score', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ score: 78, label: 'Good', trend: 'up' }),
    });
  });

  // Schedule / tasks
  await page.route('**/schedule/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tasks: [], blocks: [] }),
    });
  });

  // Insights
  await page.route('**/insights/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

/**
 * Navigate to a specific screen in the SPA via BottomBar tap.
 * The app uses state-based routing, not URL routing.
 */
export async function navigateToTab(page: Page, tabName: 'Home' | 'Tasks' | 'Goals' | 'Insights') {
  const tab = page.getByRole('button', { name: tabName });
  await expect(tab).toBeVisible({ timeout: 5000 });
  await tab.click();
  // Small wait for screen transition
  await page.waitForTimeout(300);
}

/** Wait for the app to fully hydrate (past splash/loading) */
export async function waitForAppReady(page: Page) {
  // The app is ready when the BottomBar renders (authenticated)
  // or the login form renders (unauthenticated)
  const bottomBar = page.getByRole('button', { name: 'Home' });
  const loginForm = page.getByPlaceholder('Email address');

  await expect(bottomBar.or(loginForm)).toBeVisible({ timeout: 15000 });
}

/** Standard viewport for Momentum's mobile-first design */
export const MOMENTUM_VIEWPORT = { width: 390, height: 844 };
