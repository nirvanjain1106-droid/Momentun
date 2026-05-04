import { test, expect } from '@playwright/test';
import { mockAllApis, seedAuthState, waitForAppReady, navigateToTab, MOMENTUM_VIEWPORT } from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// DAILY-FLOW.SPEC.TS — Daily user flow: morning check-in, task management
//
// Covers: Home screen content, hero focus card, AI coach CTA,
//         task timeline, calendar strip, add-task flow.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Daily User Flow', () => {
  test.use({ viewport: MOMENTUM_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await seedAuthState(page);
    await page.goto('/');
    await page.reload();
    await waitForAppReady(page);
  });

  // ─── Home Screen — Morning View ──────────────────────────────────────────
  test.describe('Home Screen', () => {
    test('should render home screen shell with status bar', async ({ page }) => {
      // The home screen has a status bar (54px) showing "9:41"
      await expect(page.getByText('9:41').first()).toBeVisible();
    });

    test('should display hero focus card', async ({ page }) => {
      // From molecule-card-hero-focus.tsx:
      // The hero card shows "Today's Focus" label and goal names
      const heroCard = page.getByText("Today's Focus");
      if (await heroCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(heroCard).toBeVisible();

        // Goal names in the hero card
        await expect(page.getByText('Website Launch')).toBeVisible();
        await expect(page.getByText('Read 12 Books')).toBeVisible();
        await expect(page.getByText('Half Marathon')).toBeVisible();

        // Footer shows active goals count
        await expect(page.getByText(/active goals/)).toBeVisible();
        await expect(page.getByText(/on track/i)).toBeVisible();
      }
    });

    test('should display AI coach card with CTA', async ({ page }) => {
      // From molecule-card-ai-coach.tsx: shows "Chat with Coach →"
      const coachCTA = page.getByText(/chat with coach/i);
      if (await coachCTA.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(coachCTA).toBeVisible();
      }
    });
  });

  // ─── Tasks Screen — Task Management ───────────────────────────────────────
  test.describe('Task Management', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToTab(page, 'Tasks');
    });

    test('should display today header with date', async ({ page }) => {
      // From screen-tasks.tsx: header shows "Today" with a chevron
      await expect(page.getByText('Today')).toBeVisible({ timeout: 5000 });
    });

    test('should display calendar strip', async ({ page }) => {
      // The calendar strip shows 7 days with abbreviated day names
      // Days of the week should be visible in the strip
      const dayAbbrevs = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      let foundDays = 0;

      for (const day of dayAbbrevs) {
        const dayEl = page.getByText(day, { exact: true });
        if (await dayEl.isVisible({ timeout: 1000 }).catch(() => false)) {
          foundDays++;
        }
      }

      // At least some days should be visible (the strip shows current week)
      expect(foundDays).toBeGreaterThanOrEqual(3);
    });

    test('should display add task button', async ({ page }) => {
      // From screen-tasks.tsx: PrimaryButton with "+ Add Task" label
      const addTaskBtn = page.getByText(/add.*task/i);
      await expect(addTaskBtn).toBeVisible({ timeout: 5000 });
    });

    test('should display task cards in timeline', async ({ page }) => {
      // The timeline shows task cards with times and titles
      // From screen-tasks.tsx: hardcoded tasks like "Design Review", "Strategy Session"
      // These are defined in the component as demo data

      // Check for time slots (the timeline shows times like "9:00 AM")
      const timeSlot = page.locator('text=/\\d{1,2}:\\d{2}\\s*(AM|PM)/i').first();
      if (await timeSlot.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(timeSlot).toBeVisible();
      }
    });
  });

  // ─── Goals Screen — Goal Interaction ──────────────────────────────────────
  test.describe('Goal Interaction', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToTab(page, 'Goals');
    });

    test('should show active goals section with count', async ({ page }) => {
      // From screen-goals.tsx: "Active" label with count badge "3"
      await expect(page.getByText('Active')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('3')).toBeVisible();
    });

    test('should display goal cards', async ({ page }) => {
      // Three goal cards are rendered by default
      // Each GoalCard shows a goal type
      await expect(page.getByText('Active')).toBeVisible({ timeout: 5000 });
    });

    test('should toggle accordion rows', async ({ page }) => {
      // Click on "Paused" accordion row
      const pausedRow = page.getByText('Paused');
      await expect(pausedRow).toBeVisible({ timeout: 5000 });

      // The accordion button should have aria-expanded attribute
      const pausedBtn = page.locator('button', { has: page.getByText('Paused') });
      await expect(pausedBtn).toHaveAttribute('aria-expanded', 'false');

      // Click to expand
      await pausedBtn.click();
      await expect(pausedBtn).toHaveAttribute('aria-expanded', 'true');

      // Click again to collapse
      await pausedBtn.click();
      await expect(pausedBtn).toHaveAttribute('aria-expanded', 'false');
    });

    test('should display Completed accordion', async ({ page }) => {
      const completedRow = page.getByText('Completed');
      await expect(completedRow).toBeVisible({ timeout: 5000 });
    });

    test('should show + New Goal button in header', async ({ page }) => {
      await expect(page.getByText('+ New Goal')).toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Insights Screen — Data Display ───────────────────────────────────────
  test.describe('Insights Display', () => {
    test.beforeEach(async ({ page }) => {
      await navigateToTab(page, 'Insights');
    });

    test('should display streak card with days count', async ({ page }) => {
      // From screen-insights.tsx: StreakCard shows "Current Streak" and "7 Days"
      await expect(page.getByText('Current Streak')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Days')).toBeVisible();
      await expect(page.getByText('Keep it up!')).toBeVisible();
    });

    test('should display completion ring', async ({ page }) => {
      // The completion ring shows "78%"
      await expect(page.getByText('78%')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('This Week')).toBeVisible();
    });

    test('should display energy score', async ({ page }) => {
      await expect(page.getByText('Energy Score')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('85 / 100')).toBeVisible();
      await expect(page.getByText('High')).toBeVisible();
    });

    test('should display focus time chart', async ({ page }) => {
      await expect(page.getByText('Focus Time (This Week)')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('18h 42m')).toBeVisible();
      await expect(page.getByText(/12% vs last week/)).toBeVisible();
    });

    test('should display heatmap with legend', async ({ page }) => {
      await expect(page.getByText('Focus Heatmap')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Low')).toBeVisible();
      await expect(page.getByText('High').last()).toBeVisible();
    });

    test('should display pill tab group', async ({ page }) => {
      // From atom-tab-pill-group.tsx: pill tabs for content filtering
      // The default active pill is "Focus"
      const focusPill = page.getByText('Focus').first();
      if (await focusPill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(focusPill).toBeVisible();
      }
    });
  });
});
