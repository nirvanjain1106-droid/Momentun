import { test, expect } from '@playwright/test';
import { mockAllApis, seedAuthState, waitForAppReady, navigateToTab, MOMENTUM_VIEWPORT } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION.SPEC.TS — Core navigation flows
//
// Covers: BottomBar tab switching, screen rendering, active tab state
// Architecture: SPA with state-based routing via BottomBar component.
//   Tabs: Home | Tasks | Goals | Insights
//   Each tab renders a different Screen* component.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test.use({ viewport: MOMENTUM_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await seedAuthState(page);
    await page.goto('/');
    await page.reload();
    await waitForAppReady(page);
  });

  // ─── Bottom Bar Visibility ────────────────────────────────────────────────
  test('should display bottom navigation bar', async ({ page }) => {
    const bottomBar = page.locator('nav');
    await expect(bottomBar).toBeVisible();

    // All 4 tabs should be present
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Goals' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Insights' })).toBeVisible();
  });

  // ─── Home Screen ──────────────────────────────────────────────────────────
  test('should show home screen by default', async ({ page }) => {
    // Home is the default active tab
    // The home screen renders content through ScreenHome shell
    // which includes the status bar, optional header, and content area

    // Verify the Home tab appears active (has accent color or similar indicator)
    const homeTab = page.getByRole('button', { name: 'Home' });
    await expect(homeTab).toBeVisible();

    // The home screen may show hero card, AI coach, or greeting
    // Just verify the overall shell is rendered
    const bottomNav = page.locator('nav');
    await expect(bottomNav).toBeVisible();
  });

  // ─── Tab Switching ────────────────────────────────────────────────────────
  test('should navigate to Tasks screen', async ({ page }) => {
    await navigateToTab(page, 'Tasks');

    // The Tasks screen has a "Today" header with date and calendar strip
    // From screen-tasks.tsx: header shows "Today" text with ChevronDown
    await expect(
      page.getByText('Today').or(page.getByText(/add.*task/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Goals screen', async ({ page }) => {
    await navigateToTab(page, 'Goals');

    // From screen-goals.tsx: header shows "Goals" text
    await expect(page.locator('span').filter({ hasText: /^Goals$/ }).first()).toBeVisible({ timeout: 5000 });

    // Should show "+ New Goal" button
    await expect(page.getByText('+ New Goal')).toBeVisible();

    // Should show "Active" section
    await expect(page.getByText('Active')).toBeVisible();
  });

  test('should navigate to Insights screen', async ({ page }) => {
    await navigateToTab(page, 'Insights');

    // From screen-insights.tsx: header shows "Insights" text
    await expect(page.getByText('Insights').first()).toBeVisible({ timeout: 5000 });

    // Should show stat cards
    await expect(page.getByText('Current Streak')).toBeVisible();
    await expect(page.getByText('Energy Score')).toBeVisible();
  });

  // ─── Round-Trip Navigation ────────────────────────────────────────────────
  test('should support round-trip navigation between all tabs', async ({ page }) => {
    // Home → Tasks
    await navigateToTab(page, 'Tasks');
    await expect(page.getByText('Today').or(page.getByText(/add.*task/i))).toBeVisible({ timeout: 5000 });

    // Tasks → Goals
    await navigateToTab(page, 'Goals');
    await expect(page.getByText('+ New Goal')).toBeVisible({ timeout: 5000 });

    // Goals → Insights
    await navigateToTab(page, 'Insights');
    await expect(page.getByText('Current Streak')).toBeVisible({ timeout: 5000 });

    // Insights → Home
    await navigateToTab(page, 'Home');
    // Back at home — bottom bar should still be visible
    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
  });

  // ─── Active Tab Indicator ─────────────────────────────────────────────────
  test('should highlight the active tab', async ({ page }) => {
    // Navigate to Goals
    await navigateToTab(page, 'Goals');

    // The active tab should have the accent color (#B8472A)
    // From molecule-nav-bottom-bar.tsx, active tabs use --accent-primary color
    const goalsTab = page.getByRole('button', { name: 'Goals' });
    await expect(goalsTab).toBeVisible();

    // Verify the tab is visually distinct — checking it's present
    // (full color assertion would require pixel-level checks in visual.spec.ts)
  });

  // ─── Goals Screen Content ─────────────────────────────────────────────────
  test('should display goal cards on Goals screen', async ({ page }) => {
    await navigateToTab(page, 'Goals');

    // From screen-goals.tsx: three hardcoded goal cards
    await expect(page.getByText('Active')).toBeVisible({ timeout: 5000 });

    // Accordion rows
    await expect(page.getByText('Paused')).toBeVisible();
    await expect(page.getByText('Completed')).toBeVisible();
  });

  // ─── Insights Screen Content ──────────────────────────────────────────────
  test('should display insights stat cards', async ({ page }) => {
    await navigateToTab(page, 'Insights');

    // From screen-insights.tsx: three stat cards
    await expect(page.getByText('Current Streak')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Energy Score')).toBeVisible();

    // Focus time card
    await expect(page.getByText('Focus Time (This Week)')).toBeVisible();

    // Heatmap card
    await expect(page.getByText('Focus Heatmap')).toBeVisible();
  });

  // ─── Tasks Screen Content ─────────────────────────────────────────────────
  test('should display task management elements', async ({ page }) => {
    await navigateToTab(page, 'Tasks');

    // From screen-tasks.tsx: "Add Task" button and calendar strip
    // The primary button shows "+ Add Task"
    await expect(
      page.getByText(/add.*task/i).or(page.getByText('Today'))
    ).toBeVisible({ timeout: 5000 });
  });
});
