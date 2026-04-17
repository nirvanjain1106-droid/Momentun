import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // We need to either log in or register. 
  // For a stable E2E setup, we try to log in, and then proceed.
  // Note: This assumes a test user exists or we can register one.
  
  await page.goto('/login');
  
  // Try to register first if login isn't guaranteed to have seeded data
  // But for this setup, we'll try to log in with a default test user.
  // If we need to dynamically create users, we'd use registration flow.
  
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard or onboarding
  await expect(page).toHaveURL(/.*(dashboard|onboarding)/);

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
});
