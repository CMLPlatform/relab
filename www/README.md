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
