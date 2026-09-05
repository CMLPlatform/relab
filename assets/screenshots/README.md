# Product screenshots

**These images show seeded demonstration records, not real teardowns.**

Everything visible here — "Dell XPS 13", "iPhone 12", their brands, dimensions, owners and
photos — comes from the test fixture at `backend/data/seed/dummy_data.json`, loaded into a
throwaway E2E database. The accounts (`relab_demo` / `e2e-admin@example.com`, `alice`, `bob`)
are test accounts. No record in these screenshots describes a product anyone actually
disassembled, weighed or measured.

Use them only to show what the interface looks like: READMEs, docs, slides about the software,
issue reports. **Never** use them as evidence of research output, dataset contents, coverage or
results, and never place them where a reader could reasonably take them for real data. If a
figure needs real teardown data, capture it from real records and say so.

Captured: **2026-08-18**.

## Files

20 PNGs, named `<surface>-<width>-<scheme>.png`:

| Surface               | What it shows                            |
| --------------------- | ---------------------------------------- |
| `products`            | The product list, welcome card dismissed |
| `product-detail`      | "Dell XPS 13" in view mode               |
| `product-detail-edit` | The same record with `?edit=1`           |
| `product-new`         | The capture screen at `/products/new`    |
| `account`             | The account screen                       |

Widths `390` (mobile, 390x844 viewport) and `1440` (desktop, 1440x900 viewport), each in
`light` and `dark`. Pages whose content is taller than the viewport were captured with the
viewport extended to the full content height, so those files are taller than 844/900 px.

`product-new` is a viewport-height capture: the screen fits without scrolling.

**What is here, and why only six.** These regenerate in one command (below), so the committed
set is deliberately small rather than a full matrix — every PNG is permanent weight in git
history. Six cover the ground that matters:

| File                        | Why it earns a place                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| `products-390-light`        | The app's home on the primary form factor                                      |
| `products-390-dark`         | Dark mode is a stated design principle, not an afterthought; this is the proof |
| `products-1440-light`       | The `lg` chrome swap — persistent top bar, multi-column grid                   |
| `product-detail-390-light`  | The Spec Row, the app's signature pattern                                      |
| `product-detail-1440-light` | The `lg` detail layout: section outline column instead of chips                |
| `product-new-390-light`     | The capture screen — the product's core act                                    |

Regenerate any other combination (account, edit mode, the 1440 dark variants) with the steps
below rather than committing them.

**Known limitation of tall captures.** Extending the viewport to content height moves anything
positioned fixed or sticky — the save FAB, the docked save bar, the offline banner — to the
bottom of the *expanded* frame rather than where a user would see it. If the position of floating
chrome matters, use a viewport-height capture.

**Two caveats about the seeded content.** "Dell XPS 13" has no photo in the fixture, so the detail
hero shows a placeholder; "iPhone 12" is the seeded record that has one. And the signed-in test
account owns nothing, so any account view reads `0 PRODUCTS / 0 PHOTOS`.

## Regenerating

From the repository root:

```bash
just _e2e-backend-up                 # Postgres + Redis + API, seeded from dummy_data.json
just app/build-web                   # static Expo web export into app/dist
cd app && pnpm exec serve dist -l 18011 --single --no-clipboard
```

Read the port from the server's own stdout — `serve` silently falls back to a random port when
it cannot bind. Use `localhost`, never `127.0.0.1`: the session cookie is `SameSite=Lax` and is
dropped cross-site (see `app/playwright.config.ts`).

Then drive Chromium with Playwright: sign in with the seeded credentials in `app/e2e/helpers.ts`,
dismiss the products welcome card, and screenshot each surface at both viewports with
`colorScheme` set to `light` and `dark` (the app's theme mode defaults to `auto`, which follows
`prefers-color-scheme`).

Tear the stack down when finished:

```bash
docker compose -p relab_e2e -f compose.e2e.yaml down -v --remove-orphans
```
