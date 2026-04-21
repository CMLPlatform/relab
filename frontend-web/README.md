# RELab Web

The `frontend-web` subrepo contains the public-facing Astro website.

## Quick Start

```bash
just install
pnpm run dev
```

The dev server runs on <http://localhost:8081>. In the full Docker stack, the site is served on <http://localhost:8010> behind Caddy.

## Commands

Composite workflows live in the [justfile](./justfile); day-to-day commands are in [package.json](./package.json). Use whichever surface you prefer.

| Task | just | pnpm |
| --- | --- | --- |
| Start dev server | — | `pnpm run dev` |
| Build (prod) | — | `pnpm run build` |
| Preview build | — | `pnpm run preview` |
| Lint + typecheck | `just check` | `pnpm run check` |
| Format | `just format` | `pnpm run format` |
| Unit tests | `just test` | `pnpm run test` |
| Unit tests + coverage | `just test-cov` | `pnpm run test:coverage` |
| E2E (Playwright) | `just test-e2e` | `pnpm run test:e2e` |
| All tests | `just test-all` | `pnpm run test:all` |
| Full CI pipeline | `just ci` | — |
| Output size budget | `just size` | — |

## Architecture

- **Astro 6** static site with a small amount of client-side JS (`src/scripts/*`) wired up on hydrateable islands.
- **Caddy** serves the built output (`dist/`) in production; see the [Caddyfile](./Caddyfile). SPA routing is handled server-side so client navigations and 404s both work.
- **Biome** is the single tool for linting and formatting — no ESLint or Prettier.
- **Playwright** drives browser e2e tests (functional + visual). Axe-core runs a11y scans in the suite.
- **Vitest** (happy-dom) covers pure utilities and DOM scripts.

## Testing

Unit tests live beside the code they cover (`*.test.ts`). Run a single file with `pnpm vitest run src/scripts/theme.test.ts`, or watch with `pnpm vitest`.

E2E tests in [e2e/](./e2e) assume the dev server is running *or* a preview build is served. Playwright's [config](./playwright.config.ts) will spin up `pnpm run preview` automatically when `BASE_URL` is unset; set `BASE_URL=http://localhost:8010` to run against the Docker stack instead. Open the interactive runner with `pnpm run test:e2e:ui`.

## Environment variables

Public (baked into the build via `import.meta.env`, read by [src/config/public.ts](./src/config/public.ts)):

| Name | Required | Notes |
| --- | --- | --- |
| `PUBLIC_API_URL` | yes | Backend API base URL |
| `PUBLIC_APP_URL` | yes | Canonical app URL |
| `PUBLIC_SITE_URL` | yes | Canonical site URL for sitemap/OG tags |
| `PUBLIC_DOCS_URL` | yes | Docs site URL |
| `PUBLIC_LINKEDIN_URL` | no | LinkedIn group, rendered in footer when set |
| `PUBLIC_CONTACT_EMAIL` | no | Falls back to `relab@cml.leidenuniv.nl` |

Runtime (tooling only, read by [config/runtime.ts](./config/runtime.ts)):

| Name | Notes |
| --- | --- |
| `BASE_URL` | If set, Playwright runs against it instead of starting a preview |
| `CI` | Set by CI; tightens Playwright reporter + retries |

## Repo structure

- `src/layouts` — shared document shell and page chrome
- `src/components` — presentational Astro components
- `src/scripts` — small client-side DOM initializers
- `src/content` — structured metadata and page copy
- `src/config` — public-env and shared helpers
- `src/styles` — layered CSS (tokens, layout, header, forms, components)
- `e2e` — functional and visual Playwright coverage

## More

For local setup, testing patterns, and accessibility expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-development). For a lightweight performance budget, build the site and run `just size` — unexpected jumps in built HTML/CSS/image output are worth reviewing.
