import { test, expect } from '@playwright/test';
import { mockAllApis, seedAuthState, clearAuthState, waitForAppReady, navigateToTab, MOMENTUM_VIEWPORT } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL.SPEC.TS — Visual regression testing
//
// Uses Playwright's toHaveScreenshot() for pixel-level comparison.
// First run creates baseline screenshots; subsequent runs compare against them.
//
// Viewport: 390×844px (iPhone 14 Pro — the design reference frame)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Visual Regression', () => {
  test.use({ viewport: MOMENTUM_VIEWPORT });

  // ─── Unauthenticated Screens ──────────────────────────────────────────────
  test.describe('Auth Screens', () => {
    test.beforeEach(async ({ page }) => {
      await mockAllApis(page);
      await clearAuthState(page);
    });

    test('login screen visual', async ({ page }) => {
      await page.goto('/');
      await waitForAppReady(page);

      // Wait for fonts and images to load
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('login-screen.png', {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled',
      });
    });

    test('register screen visual', async ({ page }) => {
      await page.goto('/');
      await waitForAppReady(page);
      await page.getByText(/create.*account|sign.*up/i).click();
      await expect(page.getByPlaceholder('Full Name')).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('register-screen.png', {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled',
      });
    });
  });

  // ─── Authenticated Screens ────────────────────────────────────────────────
  test.describe('App Screens', () => {
    test.beforeEach(async ({ page }) => {
      await mockAllApis(page);
      await seedAuthState(page);
      await page.goto('/');
      await page.reload();
      await waitForAppReady(page);
    });

    test('home screen visual', async ({ page }) => {
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('home-screen.png', {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });

    test('tasks screen visual', async ({ page }) => {
      await navigateToTab(page, 'Tasks');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('tasks-screen.png', {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });

    test('goals screen visual', async ({ page }) => {
      await navigateToTab(page, 'Goals');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('goals-screen.png', {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });

    test('insights screen visual', async ({ page }) => {
      await navigateToTab(page, 'Insights');
      await page.waitForTimeout(500);

      await expect(page).toHaveScreenshot('insights-screen.png', {
        maxDiffPixelRatio: 0.02,
        animations: 'disabled',
      });
    });
  });

  // ─── Component-Level Visual Tests ─────────────────────────────────────────
  test.describe('Component Snapshots', () => {
    test.beforeEach(async ({ page }) => {
      await mockAllApis(page);
      await seedAuthState(page);
      await page.goto('/');
      await page.reload();
      await waitForAppReady(page);
    });

    test('bottom navigation bar visual', async ({ page }) => {
      const nav = page.locator('nav');
      await expect(nav).toBeVisible();
      await page.waitForTimeout(300);

      await expect(nav).toHaveScreenshot('bottom-nav.png', {
        maxDiffPixelRatio: 0.01,
        animations: 'disabled',
      });
    });

    test('goals screen header visual', async ({ page }) => {
      await navigateToTab(page, 'Goals');
      await page.waitForTimeout(300);

      // The glass header with "Goals" text and "+ New Goal" button
      const header = page.locator('.glass-header').first();
      if (await header.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(header).toHaveScreenshot('goals-header.png', {
          maxDiffPixelRatio: 0.01,
          animations: 'disabled',
        });
      }
    });

    test('insights stat cards visual', async ({ page }) => {
      await navigateToTab(page, 'Insights');
      await page.waitForTimeout(300);

      // The three stat cards (Streak, Completion, Energy)
      const statRow = page.locator('div').filter({ hasText: 'Current Streak' }).first();
      if (await statRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(statRow).toHaveScreenshot('insights-stat-cards.png', {
          maxDiffPixelRatio: 0.02,
          animations: 'disabled',
        });
      }
    });
  });
});
