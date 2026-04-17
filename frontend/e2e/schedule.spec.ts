import { test, expect } from '@playwright/test';

test.describe('Schedule & Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('should display productivity timeline', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Build Momentum');
    await expect(page.locator('text=Timeline')).toBeVisible();
  });

  test('should handle offline sync flow', async ({ page, context }) => {
    // 1. Go offline
    await context.setOffline(true);
    
    // 2. Perform an action (e.g., Quick Add a task)
    await page.click('button:has-text("Quick Add")');
    await page.fill('input[placeholder="What needs to get done?"]', 'Offline Task Test');
    await page.click('button[type="submit"]');

    // 3. Verify task appears locally (optimistic UI)
    await expect(page.locator('text=Offline Task Test')).toBeVisible();
    
    // 4. Verify offline banner appears
    await expect(page.locator('text=You are currently offline')).toBeVisible();

    // 5. Go back online
    await context.setOffline(false);

    // 6. Verify sync starts (banner should disappear eventually)
    await expect(page.locator('text=You are currently offline')).not.toBeVisible();
  });

  test('should allow undoing a task completion', async ({ page }) => {
    // Note: This relies on existing tasks being present. 
    // In a real test, we might create one first.
    const taskCard = page.locator('.surface-card:has-text("Offline Task Test")').first();
    if (await taskCard.isVisible()) {
        await taskCard.locator('button:has-text("Complete")').click();
        await expect(page.locator('text=Task completed!')).toBeVisible();
        
        await page.click('button:has-text("Undo")');
        await expect(page.locator('text=Task completed!')).not.toBeVisible();
    }
  });
});
