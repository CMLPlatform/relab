import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('homepage has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .include('main')
    .analyze();

  expect(results.violations).toEqual([]);
});

test('getting started guide has no serious accessibility violations', async ({ page }) => {
  await page.goto('/user-guides/getting-started/');

  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    .include('main')
    .analyze();

  expect(results.violations).toEqual([]);
});
