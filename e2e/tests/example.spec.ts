import { expect, test } from '@playwright/test';

test('has the application title', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('frontend');
});
