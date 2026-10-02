# Relab Web

The public website for Relab, built with Astro: the landing page, privacy page, and links to the
app, docs, and source code. The research workflow UI lives in [`app/`](../app/).

## Quick start

Run commands from `www/`.

```bash
just install
just dev
```

The dev server runs at <http://127.0.0.1:8013>, standalone or in the full Docker dev stack. Use the
numeric loopback host through VS Code Remote port forwarding; Firefox can be unreliable with
forwarded `localhost` URLs.

## What is here

- `src/pages` for route-level Astro pages
- `src/components` for shared UI building blocks
- `src/layouts` for the document shell
- `src/scripts` for the small amount of client-side JavaScript
- `src/lib` for shared helpers used by those scripts
- `src/copy` for site copy kept as structured data
- `src/config` for environment handling and shared config helpers
- `src/styles` for the CSS layers and design tokens
- `e2e` for Playwright browser tests

## Common commands

| Task                             | Command                          |
| -------------------------------- | -------------------------------- |
| Install dependencies             | `just install`                   |
| Start local dev server           | `just dev`                       |
| Build production output          | `just build`                     |
| Preview a build locally          | `pnpm run preview`               |
| Lint and type-check              | `just check`                     |
| Format and auto-fix Biome issues | `just fix`                       |
| Run unit tests                   | `just test`                      |
| Run browser E2E tests            | `just test-e2e`                  |
| Scan dependencies for CVEs       | `just audit` (root)              |
| Run the full CI pipeline locally | `just check` then `just test-ci` |

## Development notes

- The site is light on client-side JavaScript.
- Biome handles linting and formatting.
- Vitest covers utilities and small DOM scripts.
- Playwright covers the browser flows and accessibility checks.
- Production output in `dist/` is deployed to Cloudflare Workers static assets
  (`.github/workflows/deploy-sites.yml`). `src/integrations/security-headers.ts` writes the
  `_headers` file that sets its security and cache headers.

### The landing hero's teardown photography

The hero picks its layout from the data. If any part of the featured teardown has a photograph, it
renders a grid of plates, one duotoned print per part; otherwise it stays a compact list. Parts
without a photo render as a blank frame.

Plates come from `thumbnail_url` on each node of `/v1/products/{id}/components/tree`, which the
build already fetches, so the hero follows `PUBLIC_FEATURED_PRODUCT_ID`. Plates lay out near 180px,
so the 200px `thumbnail_url` alone would upscale on a 2x screen. Each read schema also carries
`thumbnail_urls`, the API's derivatives keyed by width (`THUMBNAIL_WIDTHS` is 200/800/1600,
generated at upload; widths at or above the original are skipped, so the map is sparse). `toPhoto`
turns those into a `srcset`, paired with a `sizes` hint. One available width means no `srcset`.

Two editorial rules, both stated on the page:

- **Parts are ranked by recorded mass, heaviest first**, not in API order (which is roughly
  disassembly order and scatters the share bars).
- **The hero shows six parts.** When parts are withheld the grid says so underneath
  (`Showing the 6 heaviest of 12 recorded parts`). Shares stay fractions of the whole product.

Two data quirks: masses under 10 g print to two significant figures, so a 0.33 g screw does not
become `0 g` (the em dash already means *no recorded mass*). A product type imported from the CPV
taxonomy carries its code in `name` and its label in `description`, so the tag shows
`Tablet computer`, never `CPV: 302132`; a code with no label drops the tag.

Builds with no API access (CI, most local dev, the Playwright suite) fall back to
`src/data/landing-fixture.json`, which carries a lab-shot photograph per part in
`public/images/teardown/`. The Playwright suite asserts the plates decode, which catches a fixture
pointing at a file that never shipped. The masses are illustrative and the page says so; the
photographs are real.

Fixture photos are 800×600 WebP (4:3, `object-fit: cover`), matching the API's 800px derivative so
a plate never upscales on a 2× screen. Downscale with a good filter and a ~0.5px blur: the duotone
blend amplifies aliasing on fine repeating detail such as a keyboard.

```jsonc
{ "name": "Bottom cover", "weightG": 156,
  "photo": { "url": "/images/teardown/bottom_cover.webp", "srcset": "",
             "alt": "Photographed during disassembly" } }
```

`srcset` is `""` because the fixture ships one width per photo, so the fixture lane cannot cover
the responsive path. `just test-e2e-live` covers it: it builds against the running
`compose.e2e.yaml` backend (`PUBLIC_FEATURED_PRODUCT_ID=2`, the seeded HP ProBook 430 G2) and runs
[e2e/landing-live.spec.ts](e2e/landing-live.spec.ts), which asserts the page shows a live record and
that every plate carries a two-candidate `srcset` plus `sizes`. The root `just test-e2e-full-stack`
runs it before the app's lane, on the same stack.

The top-level `photos` array takes the assembled product the same way. The fixture is also
production's fallback when the API is unreachable at build time, so anything in it can end up on the
live site. Use only photographs the project holds the rights to publish; contributor uploads are
governed by the ToS grant and are not automatically clear for marketing surfaces.

## Environment variables

[src/config/public.ts](src/config/public.ts) reads public variables through `import.meta.env`.
The Deploy Sites workflow (`.github/workflows/deploy-sites.yml`) builds staging and production with
the `PUBLIC_*` values from each GitHub Environment. `just dev` defaults them to the `127.0.0.1` dev
ports; export a `PUBLIC_*` variable to override one. `just build` is a local production-mode build
against the reference deployment's origins; export `API_PUBLIC_URL` and friends to override them.

| Name                         | Required | Purpose                                                                                                                           |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_APP_URL`             | yes      | Canonical app URL                                                                                                                 |
| `PUBLIC_SITE_URL`            | yes      | Canonical site URL                                                                                                                |
| `PUBLIC_DOCS_URL`            | yes      | Canonical docs URL                                                                                                                |
| `PUBLIC_API_URL`             | no       | Backend base URL the homepage stats panel fetches from in the browser (panel stays hidden if unset/unreachable)                   |
| `PUBLIC_CONTACT_EMAIL`       | no       | Public contact address                                                                                                            |
| `PUBLIC_FEATURED_PRODUCT_ID` | no       | Product ID whose teardown is featured in the landing hero (falls back to `src/data/landing-fixture.json` if unset or unreachable) |
| `LANDING_REQUIRE_LIVE`       | no       | `1` fails the build instead of falling back when the featured product cannot be fetched; Deploy Sites sets it |

Tooling also reads two environment variables in [playwright.config.ts](playwright.config.ts).

| Name       | Purpose                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `BASE_URL` | Run Playwright against an existing site instead of spinning up a local preview |
| `CI`       | Tightens Playwright reporting and retry behavior in CI                         |

## Testing

Unit tests live next to the code they cover as `*.test.ts`.

```bash
pnpm vitest run src/scripts/theme.test.ts
pnpm vitest
```

CI runs `just test-ci` (Vitest with coverage, gated at 80% statements); plain `just test` skips
that gate. Run `just check` then `just test-ci` to cover both.

E2E tests live in `e2e/`. Without `BASE_URL`, Playwright builds the site and starts a preview
server. To run against the Docker stack instead:

```bash
BASE_URL=http://127.0.0.1:8013 pnpm run test:e2e
```

## More context

For broader frontend conventions in this monorepo, see
[CONTRIBUTING.md](../.github/CONTRIBUTING.md#frontend-development).
