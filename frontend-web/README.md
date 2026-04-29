# RELab Web

This subrepo contains the public website for RELab, built with Astro. It is the small, mostly static front door for the project: the landing page, privacy page, and the links that point people toward the app, docs, and backend services.

If you are looking for the main application itself, that lives elsewhere in the monorepo. This package is the website around the project, not the research workflow UI.

## Quick start

Run commands from `frontend-web/`.

```bash
just install
pnpm run dev
```

The local dev server runs at <http://localhost:8081>.

In the full Docker stack, the site is served behind Caddy at <http://localhost:8010>.

## What is here

- `src/pages` for route-level Astro pages
- `src/components` for shared UI building blocks
- `src/layouts` for the document shell
- `src/scripts` for the small amount of client-side JavaScript
- `src/content` for site copy and structured content
- `src/config` for environment handling and shared config helpers
- `src/styles` for the CSS layers and design tokens
- `e2e` for Playwright browser tests

## Common commands

Use `just` if you want the repo-standard task runner, or `pnpm run` if you prefer package scripts.

| Task                    | Command            |
| ----------------------- | ------------------ |
| Install dependencies    | `just install`     |
| Start local dev server  | `pnpm run dev`     |
| Build production output | `pnpm run build`   |
| Preview a build locally | `pnpm run preview` |
| Lint and type-check     | `just check`       |
| Format files            | `just format`      |
| Auto-fix Biome issues   | `just fix`         |
| Run unit tests          | `just test`        |
| Run browser E2E tests   | `just test-e2e`    |

## Development notes

- Astro does most of the work here. The site is intentionally light on client-side JavaScript.
- Biome handles linting and formatting.
- Vitest covers utilities and small DOM scripts.
- Playwright covers the browser flows and accessibility checks.
- Production output is served by Caddy from `dist/`.

## Environment variables

Public variables are read through `import.meta.env` and used by [src/config/public.ts](src/config/public.ts).

| Name                   | Required | Purpose                            |
| ---------------------- | -------- | ---------------------------------- |
| `PUBLIC_API_URL`       | yes      | Backend API base URL               |
| `PUBLIC_APP_URL`       | yes      | Canonical app URL                  |
| `PUBLIC_SITE_URL`      | yes      | Canonical site URL                 |
| `PUBLIC_DOCS_URL`      | yes      | Canonical docs URL                 |
| `PUBLIC_LINKEDIN_URL`  | no       | LinkedIn group link for the footer |
| `PUBLIC_CONTACT_EMAIL` | no       | Public contact address             |

Tooling also reads a small runtime config surface from [config/runtime.ts](config/runtime.ts).

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

E2E tests live in `e2e/`. By default, Playwright builds the site and starts a preview server when `BASE_URL` is not set. To run against the Docker stack instead:

```bash
BASE_URL=http://localhost:8010 pnpm run test:e2e
```

## More context

For broader frontend conventions in this monorepo, see [CONTRIBUTING.md](../.github/CONTRIBUTING.md#frontend-development).
