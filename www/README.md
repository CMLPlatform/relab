# Relab Web

This subrepo contains the public website for Relab, built with Astro. It is the small, mostly static
front door for the project: the landing page, privacy page, and the links that point people toward
the app, docs, and source code.

The main application lives in [`app/`](../app/). This package is the website around the project, not
the research workflow UI.

## Quick start

Run commands from `www/`.

```bash
just install
pnpm run dev
```

The local dev server runs at <http://127.0.0.1:8013>. Use the numeric loopback
host when developing through VS Code Remote port forwarding; Firefox can be
unreliable with forwarded `localhost` URLs.

In the full Docker stack, the site is served behind Caddy at <http://127.0.0.1:8013>.

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

Use `just` for repo-standard tasks. `just build` loads `../deploy/env/prod.compose.env` so public
URLs come from there instead of values duplicated here; see
[Environment variables](#environment-variables) for how staging and production actually get their
values.

| Task                             | Command            |
| -------------------------------- | ------------------ |
| Install dependencies             | `just install`     |
| Start local dev server           | `pnpm run dev`     |
| Build production output          | `just build`       |
| Preview a build locally          | `pnpm run preview` |
| Lint and type-check              | `just check`       |
| Format files                     | `just format`      |
| Auto-fix Biome issues            | `just fix`         |
| Run unit tests                   | `just test`        |
| Run browser E2E tests            | `just test-e2e`    |
| Scan dependencies for CVEs       | `just audit`       |
| Run the full CI pipeline locally | `just ci`          |
| Regenerate the lockfile only     | `just lockfile`    |

## Development notes

- Astro does most of the work here. The site is light on client-side JavaScript.
- Biome handles linting and formatting.
- Vitest covers utilities and small DOM scripts.
- Playwright covers the browser flows and accessibility checks.
- Production output is served by Caddy from `dist/`.

### The landing hero's teardown photography

The hero schedule has two layouts and picks between them from the data, not from a flag. If any
part of the featured teardown has a photograph it renders as a grid of plates — one duotoned
cyanotype print per part, dealing out of the assembly on load. If none has one it stays the compact
list it has always been, so a product with no component photography never becomes a wall of empty
frames.

Every plate is live data: `thumbnail_url` off each node of
`/v1/products/{id}/components/tree`, which the build already fetches. Nothing is hand-authored, so
the hero re-shoots itself whenever `PUBLIC_FEATURED_PRODUCT_ID` changes. Individual parts with no
photo render as a blank lattice frame, which reads as an unexposed plate in the schedule.

Plates lay out near 180px, so the 200px `thumbnail_url` alone would be upscaled on any 2x screen.
Each read schema also carries `thumbnail_urls`, the API's pre-computed derivatives keyed by width
(`THUMBNAIL_WIDTHS` is 200/800/1600, generated at upload; widths at or above the original are
skipped, so the map is sparse). `toPhoto` turns those into a `srcset` and the component pairs it
with a `sizes` hint, letting the browser fetch the 200px file on a 1x screen and the 800px one on a
2x screen. One available width means no `srcset` at all rather than a one-candidate list.

Two editorial rules, both stated on the page rather than applied silently:

- **Parts are ranked by recorded mass, heaviest first**, not in the order the API returns them.
  Recording order is roughly disassembly order, which puts product 464's three screws ahead of its
  battery and scatters the share bars; ranked, the bars read as one descending distribution.
- **The hero shows six parts.** All twelve of product 464's made the panel more than twice the
  height of the pitch beside it, most of it below the fold. When parts are withheld the grid says
  so underneath (`Showing the 6 heaviest of 12 recorded parts`). Shares stay fractions of the whole
  product, so the truncated view still tells the truth about what it shows.

Two data quirks the hero handles, both first seen on product 464: masses under 10 g print to two
significant figures, because the grouped integer format turned a recorded 0.33 g screw into `0 g`
— which is what the em dash for *no recorded mass* already means. And a product type imported from
the CPV taxonomy carries its code in `name` and its label in `description`, so the tag shows
`Tablet computer`, never `CPV: 302132`; a code with no label drops the tag entirely.

Builds with no API access (CI, most local dev, the Playwright suite) fall back to
`src/data/landing-fixture.json`, whose `photo` fields are all `null` — so those builds show the
list, not the grid. To exercise the grid there, drop images into `public/images/teardown/` and
point the fixture's `photo` objects at them:

```jsonc
{ "name": "Battery pack", "weightG": 212,
  "photo": { "url": "/images/teardown/battery-pack.jpg",
             "alt": "Battery pack, photographed during disassembly" } }
```

Roughly 480×360 (4:3, `object-fit: cover`), and the top-level `photos` array takes the assembled
product the same way. Use photographs the project holds the rights to publish; contributor uploads
are governed by the ToS grant and are not automatically clear for marketing surfaces.

## Environment variables

Public variables are read through `import.meta.env` and used by
[src/config/public.ts](src/config/public.ts). Staging and production are built via Docker Compose
(`compose.deploy.yaml`), which passes `PUBLIC_*` values as build args itself; `just build` and
`just dev` are not part of that path. `just dev` falls back to hardcoded `127.0.0.1` dev-port
defaults (matching `compose.dev.yaml`), overridable via the root `.env`; there is no
`dev.compose.env`. `just build` is a local, non-Compose way to produce a production-mode build and
sources `../deploy/env/prod.compose.env` directly; it has no staging equivalent.

| Name                         | Required | Purpose                                                                                                                           |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_APP_URL`             | yes      | Canonical app URL                                                                                                                 |
| `PUBLIC_SITE_URL`            | yes      | Canonical site URL                                                                                                                |
| `PUBLIC_DOCS_URL`            | yes      | Canonical docs URL                                                                                                                |
| `PUBLIC_API_URL`             | no       | Backend base URL the homepage stats panel fetches from in the browser (panel stays hidden if unset/unreachable)                   |
| `PUBLIC_CONTACT_EMAIL`       | no       | Public contact address                                                                                                            |
| `PUBLIC_FEATURED_PRODUCT_ID` | no       | Product ID whose teardown is featured in the landing hero (falls back to `src/data/landing-fixture.json` if unset or unreachable) |

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

CI runs `just test-ci` (Vitest with coverage, gated at 80% statements); plain `just test` does not
evaluate that gate. `just ci` runs the full local CI pipeline (checks + `test-ci`), mirroring what
CI does.

E2E tests live in `e2e/`. By default, Playwright builds the site and starts a preview server when
`BASE_URL` is not set. To run against the Docker stack instead:

```bash
BASE_URL=http://127.0.0.1:8013 pnpm run test:e2e
```

## More context

For broader frontend conventions in this monorepo, see
[CONTRIBUTING.md](../.github/CONTRIBUTING.md#frontend-development).
