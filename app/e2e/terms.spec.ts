/**
 * Contributor-terms prompt, against the real backend.
 *
 * Accounts created programmatically — which is every seeded account, and every
 * account that predates acceptance tracking in production — record no terms
 * acceptance, because stamping one would fabricate evidence of a licence grant
 * nobody made. This is the flow that lets those accounts grant it.
 *
 * The acceptance test uses `bob`, who no other spec touches: accepting is a real,
 * persistent write, so a shared account would leak state into whatever ran next.
 * Every other authenticated spec suppresses the prompt via `suppressTermsPrompt`
 * before it can render, which is why both tests here log in directly.
 *
 * It is also one-shot per database, by design: there is deliberately no endpoint
 * that un-accepts, since retracting evidence of a licence grant is not something
 * an API should offer. `just test-e2e-full-stack` recreates the volumes on every
 * run, so this only bites when re-running `just test-e2e` by hand against a stack
 * left up — reset it with `just _e2e-backend-down` first.
 */

import { expect, test } from '@playwright/test';
import { EMAIL, finishOnboardingIfVisible, PASSWORD } from './helpers';

const BOB = { login: 'bob@example.com', password: 'fake_password_2' };
const DECLINE_IS_FREE = /Nothing changes if you decline/;

test.setTimeout(60_000);

test.describe('Contributor terms prompt', () => {
  test('an account that never accepted is asked, and the grant persists', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(BOB.login);
    await page.getByLabel('Password', { exact: true }).fill(BOB.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The prompt is modal, so it arrives over whatever the login lands on.
    const accept = page.getByRole('button', { name: 'Accept' });
    await expect(
      accept,
      'bob has already accepted — this test needs a fresh database. Run ' +
        '`just _e2e-backend-down` and bring the stack back up, or use ' +
        '`just test-e2e-full-stack`, which recreates the volumes itself.',
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(DECLINE_IS_FREE)).toBeVisible();

    await accept.click();
    await expect(accept).toBeHidden({ timeout: 15_000 });

    // The grant is server-side, so it has to survive a reload rather than living
    // in the dismissal store — that is the whole difference between accepting
    // and pressing "Not now".
    await page.reload();
    await expect(page.getByRole('button', { name: 'Accept' })).toBeHidden({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Not now' })).toBeHidden();
  });
});

test.describe('Dismissing the prompt', () => {
  test('"Not now" clears the way and is not re-asked on reload', async ({ page }) => {
    // A direct login, not loginAndReachProducts: that helper suppresses the
    // prompt outright, which is what every other authenticated spec wants and
    // exactly what this test must not do.
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const notNow = page.getByRole('button', { name: 'Not now' });
    await expect(notNow).toBeVisible({ timeout: 30_000 });
    await notNow.click();
    await expect(notNow).toBeHidden({ timeout: 15_000 });

    // The modal is genuinely gone, not merely hidden: interacting with what it
    // covered is the only assertion that distinguishes the two, since
    // `toBeVisible` does not account for occlusion.
    await finishOnboardingIfVisible(page);
    const search = page.getByPlaceholder('Search products');
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('drill');
    await expect(search).toHaveValue('drill');

    // Session-scoped: a reload must not re-ask. Being re-prompted on every
    // refresh is nagging rather than asking, and it blocked every authenticated
    // spec that navigates with a full page load.
    await page.reload();
    await expect(page.getByPlaceholder('Search products')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Not now' })).toBeHidden();

    // Dismissal records nothing, so the account still owes acceptance: the
    // account screen keeps offering the way back.
    await page.goto('/account');
    await expect(page.getByText('Contributor terms')).toBeVisible({ timeout: 30_000 });
  });
});
