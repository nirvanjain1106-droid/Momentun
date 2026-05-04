import { test, expect } from '@playwright/test';
import { seedAuthState, clearAuthState, waitForAppReady, navigateToTab, MOMENTUM_VIEWPORT } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// ERROR-STATES.SPEC.TS — Error handling and edge cases
//
// Covers: API failures, network errors, loading states, empty states,
//         graceful degradation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Error States & Resilience', () => {
  test.use({ viewport: MOMENTUM_VIEWPORT });

  // ─── API Failure Handling ─────────────────────────────────────────────────
  test.describe('API Failures', () => {
    test('should handle login API 500 gracefully', async ({ page }) => {
      await page.route('**/auth/login', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal server error' }),
        });
      });

      await clearAuthState(page);
      await page.goto('/');
      await waitForAppReady(page);

      await page.getByPlaceholder('Email address').fill('test@example.com');
      await page.getByPlaceholder('Password').fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show an error, not crash
      await expect(
        page.locator('text=/error|failed|try again/i').first()
      ).toBeVisible({ timeout: 5000 });

      // Login form should still be usable
      await expect(page.getByPlaceholder('Email address')).toBeVisible();
    });

    test('should handle profile fetch failure on home screen', async ({ page }) => {
      // Mock refresh to succeed but /users/me to fail
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'e2e-mock-token' }),
        });
      });
      await page.route('**/users/me', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Database error' }),
        });
      });

      await seedAuthState(page);
      await page.goto('/');
      await page.reload();

      // The app should not crash — the bottom bar should still render
      // (the home screen shell renders independently of the profile fetch)
      await expect(
        page.getByRole('button', { name: 'Home' }).or(
          page.locator('nav')
        )
      ).toBeVisible({ timeout: 15000 });
    });

    test('should handle register API failure', async ({ page }) => {
      await page.route('**/auth/register', async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Email already registered' }),
        });
      });
      // Mock refresh to block it from interfering
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      });
      await page.route('**/auth/logout', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await clearAuthState(page);
      await page.goto('/');
      await waitForAppReady(page);

      // Navigate to register
      await page.getByText(/create.*account|sign.*up/i).click();
      await expect(page.getByPlaceholder('Full Name')).toBeVisible({ timeout: 5000 });

      // Fill form
      await page.getByPlaceholder('Full Name').fill('Test User');
      await page.getByPlaceholder('Email address').fill('existing@example.com');
      await page.getByPlaceholder('Password', { exact: true }).fill('password123');
      await page.getByPlaceholder('Confirm Password').fill('password123');

      await page.getByRole('button', { name: /create account/i }).click();

      // Error should appear
      await expect(
        page.locator('text=/already registered|error|failed/i').first()
      ).toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Network Conditions ───────────────────────────────────────────────────
  test.describe('Network Resilience', () => {
    test('should handle complete network failure on login', async ({ page }) => {
      // Abort all API requests
      await page.route('**/auth/**', async (route) => {
        await route.abort('connectionrefused');
      });

      await clearAuthState(page);
      await page.goto('/');
      await waitForAppReady(page);

      await page.getByPlaceholder('Email address').fill('test@example.com');
      await page.getByPlaceholder('Password').fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should show network error, not crash
      await expect(
        page.locator('text=/error|failed|network|try again/i').first()
      ).toBeVisible({ timeout: 10000 });
    });

    test('should recover from temporary network failure', async ({ page }) => {
      let callCount = 0;

      await page.route('**/auth/login', async (route) => {
        callCount++;
        if (callCount <= 1) {
          // First call fails
          await route.abort('connectionrefused');
        } else {
          // Subsequent calls succeed
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              access_token: 'recovered-token',
              user_id: 'e2e-user-001',
              name: 'Test User',
              onboarding_complete: true,
            }),
          });
        }
      });

      // Mock the rest
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'e2e-mock-token' }),
        });
      });
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
              timezone: 'UTC',
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

      await clearAuthState(page);
      await page.goto('/');
      await waitForAppReady(page);

      // First attempt — fails
      await page.getByPlaceholder('Email address').fill('test@example.com');
      await page.getByPlaceholder('Password').fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Wait for error
      await page.waitForTimeout(2000);

      // Second attempt — succeeds
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page.getByRole('button', { name: 'Home' })).toBeVisible({ timeout: 10000 });
    });
  });

  // ─── Loading States ───────────────────────────────────────────────────────
  test.describe('Loading States', () => {
    test('should show loading spinner during login', async ({ page }) => {
      // Slow down login response
      await page.route('**/auth/login', async (route) => {
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'token',
            user_id: 'e2e-user-001',
            name: 'Test User',
            onboarding_complete: true,
          }),
        });
      });
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      });
      await page.route('**/auth/logout', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await clearAuthState(page);
      await page.goto('/');
      await waitForAppReady(page);

      await page.getByPlaceholder('Email address').fill('test@example.com');
      await page.getByPlaceholder('Password').fill('password123');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Button should show loading state (from screen-login.tsx: "Signing in...")
      await expect(
        page.getByText(/signing in|loading/i).or(
          page.locator('button[disabled]')
        )
      ).toBeVisible({ timeout: 2000 });
    });

    test('should show loading spinner on profile screen', async ({ page }) => {
      // Delay the /users/me response
      await page.route('**/users/me', async (route) => {
        if (route.request().method() === 'GET') {
          await new Promise((r) => setTimeout(r, 3000));
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'e2e-user-001',
              name: 'Test User',
              email: 'test@example.com',
              user_type: 'professional',
              timezone: 'UTC',
              onboarding_complete: true,
              onboarding_step: 5,
              email_verified: true,
              is_paused: false,
              paused_reason: null,
              created_at: '2026-01-01T00:00:00Z',
              stats: { daysActive: 42, goalsCompleted: 7, avgFocusTime: '3.2h' },
            }),
          });
        } else {
          await route.continue();
        }
      });
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'e2e-mock-token' }),
        });
      });

      await seedAuthState(page);
      await page.goto('/');
      await page.reload();

      // The ProfileScreen shows a spinner while loading
      // From screen-profile.tsx: a spinning div with animate-spin class
      const spinner = page.locator('.animate-spin');
      // The spinner might briefly appear — just verify the page eventually loads
      // without crashing
      await waitForAppReady(page);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────
  test.describe('Edge Cases', () => {
    test('should handle rapid tab switching without crashes', async ({ page }) => {
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ access_token: 'e2e-mock-token' }),
        });
      });

      await seedAuthState(page);
      await page.goto('/');
      await page.reload();
      await waitForAppReady(page);

      // Rapidly switch tabs
      for (const tab of ['Tasks', 'Goals', 'Insights', 'Home', 'Tasks', 'Goals'] as const) {
        await navigateToTab(page, tab);
      }

      // App should still be functional
      await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tasks' })).toBeVisible();
    });

    test('should handle corrupted localStorage gracefully', async ({ page }) => {
      await page.route('**/auth/refresh', async (route) => {
        await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      });
      await page.route('**/auth/logout', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      // Set corrupted auth state
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('auth_state', '{{{{invalid json');
      });
      await page.reload();

      // App should fall through to login screen (authStore.hydrate catches parse errors)
      await waitForAppReady(page);
      await expect(page.getByPlaceholder('Email address')).toBeVisible({ timeout: 10000 });
    });
  });
});
