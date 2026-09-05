import { expect, test } from '@playwright/test';
import { expectCanonicalUrl, expectContentPage } from './helpers.ts';

const ACCESSIBILITY_TITLE = /Accessibility/;
const PARTIAL_CONFORMANCE_TEXT = /partially conformant/i;

test('accessibility statement renders', async ({ page }) => {
  await page.goto('/accessibility');
  await expect(page).toHaveTitle(ACCESSIBILITY_TITLE);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'How accessible Relab is',
    'What we check',
    'What we have not checked',
    'Tell us what does not work',
  ]);
  await expectContentPage(page);
  // The statement's whole point is that it does not overclaim. If someone
  // upgrades this to a bare conformance claim, this fails.
  await expect(page.getByText(PARTIAL_CONFORMANCE_TEXT)).toBeVisible();
  // The feedback address comes from site config, so it must actually resolve.
  await expect(page.getByRole('link', { name: /@/ }).first()).toHaveAttribute(
    'href',
    /^mailto:.+@.+/,
  );
  await expectCanonicalUrl(page, '/accessibility/');
});
