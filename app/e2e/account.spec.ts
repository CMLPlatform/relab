/**
 * Account screen E2E tests: section navigation and dialog keyboard a11y.
 *
 * The account screen (src/components/profile/AccountScreen.tsx) reuses the
 * same anchored-scroll document pattern as the product detail screen
 * (SectionNavLayout + useAnchoredSectionNav) — see e2e/product-detail.spec.ts
 * for the origin of the chip-click regression net this file mirrors.
 */

import { expect, test } from '@playwright/test';
import { loginAndGoToProfile } from './helpers';

test.setTimeout(60_000);

// ─── Section nav anchors (phone) ───────────────────────────────────────────
// Same regression net as product-detail.spec.ts: Section registers its
// onLayout y relative to its parent View, not the scroll content, so a chip
// tap can land short of the section it targets.
test.describe('Account: section navigation', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('clicking the Security & sessions chip scrolls that section to the top of the viewport', async ({
    page,
  }) => {
    await loginAndGoToProfile(page);

    // Phone viewport renders chips (SectionNavLayout), not the lg outline.
    await expect(page.getByTestId('section-nav-chips')).toBeVisible();
    await page.getByRole('button', { name: 'Security & sessions' }).click();

    // The chip and the Section heading share the same text; the Section
    // heading is the last match in DOM order (nav renders first).
    const heading = page.getByText('Security & sessions', { exact: true }).last();
    await expect(heading).toBeVisible({ timeout: 5_000 });
    await expect
      .poll(async () => (await heading.boundingBox())?.y ?? Number.POSITIVE_INFINITY, {
        timeout: 5_000,
      })
      .toBeLessThan(200);
  });
});

// ─── Dialog keyboard a11y ───────────────────────────────────────────────────
// The edit-username dialog (src/components/profile/Dialogs.tsx) is built on
// React Native's core Modal, which react-native-web backs with its own focus
// trap and Escape → onRequestClose (no react-native-paper involved here
// anymore — see DialogProvider.tsx for the rationale). Verify both against
// the account screen's edit-username dialog.
test.describe('Account: dialog keyboard a11y', () => {
  test('focus stays trapped inside the edit-username dialog and Escape closes it', async ({
    page,
  }) => {
    await loginAndGoToProfile(page);

    const hiText = page.getByText('Hi,');
    await expect(hiText).toBeVisible();
    await hiText.locator('xpath=following-sibling::*[1]').click();
    await expect(page.getByText('Edit username')).toBeVisible({ timeout: 3_000 });

    // react-native-web's core Modal marks its root role="dialog" while active.
    // Tab well past the dialog's three focusables (username input, Cancel,
    // Save) — every stop must stay inside the dialog's DOM subtree.
    const dialogRoot = page.getByRole('dialog');
    for (let i = 0; i < 6; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential — each Tab must land before the next is pressed.
      await page.keyboard.press('Tab');
      const insideDialog = await dialogRoot.evaluate((root) =>
        Boolean(document.activeElement && root.contains(document.activeElement)),
      );
      expect(insideDialog).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.getByText('Edit username')).not.toBeVisible({ timeout: 3_000 });
  });
});
