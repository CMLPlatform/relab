/**
 * The demo chain, end to end: a seeded product → its components → one
 * component's recorded material quantity and the material's reference → the
 * photograph of that component → who recorded it.
 *
 * Every value asserted here comes from the seeded (illustrative) HP ProBook
 * 430 G2 record (backend/data/seed/dummy_data.json), not from a mock, so the
 * spec fails if either the seed or the mapping stops carrying materials
 * through.
 */

import { expect, type Page, test } from '@playwright/test';
import {
  openGalleryLightbox,
  openSeededProductFromProductsPage,
  reachProductsPage,
} from './helpers';

test.setTimeout(60_000);

const COMPONENT_DETAIL_URL_PATTERN = /components\/\d+/;
// The footer renders the label and the value as sibling nodes, so match the label.
const COMPONENT_ID_LABEL = 'Component ID:';
// The seeded display assembly, with one polycarbonate row in its bill of materials.
const SEEDED_SUBASSEMBLY = 'Display assembly';
const SEEDED_NESTED_PART = 'LCD panel';
const SEEDED_SUBASSEMBLY_TYPE = 'Display module';
// Only the type row's card shows the type's description, so it pins that row to
// the recorded type rather than a bundled-snapshot entry sharing its id.
const SEEDED_SUBASSEMBLY_TYPE_DESCRIPTION = 'A screen assembly supplied as one replaceable unit.';
// The seeded materials carry no reference, and the row says so rather than
// showing a placeholder URL.
const SEEDED_MATERIAL_REFERENCE = 'No reference recorded for this material.';

/**
 * The router keeps the product screen mounted behind the component screen, so
 * the product's own material rows are still in the DOM after navigating. Text
 * shared by both records has to be matched on the visible copy.
 */
function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true }).first();
}

/** The Materials heading and its muted "(n)" count, which sits beside it. */
async function expectMaterialsHeading(page: Page, count: number) {
  const materialsHeading = page
    .getByRole('heading', { name: 'Materials', exact: true, level: 3 })
    .filter({ visible: true })
    .first();
  await expect(materialsHeading).toBeVisible({ timeout: 15_000 });
  await expect(materialsHeading.locator('..')).toContainText(`(${count})`);
}

test.describe('Product → component → material → evidence', () => {
  test('walks from the seeded product to a material observation and its photograph', async ({
    page,
  }) => {
    await reachProductsPage(page);
    await openSeededProductFromProductsPage(page);

    // The base product's own bill of materials, in the Properties section.
    await expectMaterialsHeading(page, 2);
    await expect(page.getByText('0.5 kg', { exact: true })).toBeVisible();

    // One level of the tree opens inline, without leaving the product. Clicked
    // with Playwright's actionability checks, not `force`, so a covered or
    // still-moving expander fails here instead of clicking whatever is on top.
    const expander = page.getByRole('button', { name: `Show components of ${SEEDED_SUBASSEMBLY}` });
    await expect(expander).toBeEnabled({ timeout: 15_000 });
    await expander.click();
    await expect(page.getByText(SEEDED_NESTED_PART, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Tapping the row itself navigates to that component's own record. The row
    // is clicked as the button it is, without `force`: the lazy child fetch
    // reflows it, and skipping the stability wait clicks into the gap.
    await page
      .getByRole('button', { name: new RegExp(`^${SEEDED_SUBASSEMBLY}`) })
      .first()
      .click();
    await expect(page).toHaveURL(COMPONENT_DETAIL_URL_PATTERN, { timeout: 15_000 });
    // The component's own type line, which only its record renders.
    await expect(page.getByText(SEEDED_SUBASSEMBLY_TYPE, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(visibleText(page, SEEDED_SUBASSEMBLY_TYPE_DESCRIPTION)).toBeVisible();

    // The observation: how much of which material, and where the material's
    // reference data came from (not the quantity).
    await expectMaterialsHeading(page, 1);
    await expect(visibleText(page, 'Polycarbonate')).toBeVisible();
    await expect(visibleText(page, '0.05 kg')).toBeVisible();
    await expect(visibleText(page, SEEDED_MATERIAL_REFERENCE)).toBeVisible();

    // The photographic evidence for this node.
    await openGalleryLightbox(page);
    await page.getByLabel('Close lightbox').click();

    // Provenance of the record itself.
    await expect(page.getByRole('link', { name: 'bob' }).first()).toBeVisible();
    await expect(visibleText(page, COMPONENT_ID_LABEL)).toBeVisible();
  });
});
