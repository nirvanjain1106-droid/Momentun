import { test, expect } from '@playwright/test';

test.describe('Goals Portfolio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/goals');
  });

  test('should display active goals', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Goals Portfolio');
    // Check if some active goals or the empty state message is visible
    const emptyState = page.locator('text=No active goals');
    const goalItems = page.locator('.surface-card');
    
    await expect(emptyState.or(goalItems).first()).toBeVisible();
  });

  test('should open new goal modal', async ({ page }) => {
    await page.click('button:has-text("New Goal")');
    // Assuming the modal title or some input is visible
    await expect(page.locator('text=Create New Goal').or(page.locator('text=New Target'))).toBeVisible();
  });

  test('should navigate to goal details', async ({ page }) => {
    // This depends on having an active goal.
    const firstGoalLink = page.locator('a[href^="/goals/"]').first();
    if (await firstGoalLink.isVisible()) {
        await firstGoalLink.click();
        await expect(page).toHaveURL(/.*\/goals\/.*/);
        await expect(page.locator('h1')).toBeVisible(); // Goal title usually
    }
  });
});
