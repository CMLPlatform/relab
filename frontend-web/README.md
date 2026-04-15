# RELab Web

The `frontend-web` subrepo contains the public-facing Astro website.

## Quick Start

```bash
just install
just dev
```

The local dev server runs on <http://localhost:8081>. In the full Docker stack, the site is exposed on <http://localhost:8010>.

## Common Commands

```bash
just check      # Biome lint + Astro typecheck
just test       # Vitest unit tests
just test-ci    # unit tests with coverage
just test-e2e   # Playwright browser tests
just format     # format code
just size       # inspect built output size locally
```

## More

For local setup, testing patterns, and accessibility expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-development).

For a lightweight local performance budget, build the site and run `just size`. Treat unexpected jumps in built HTML, CSS, and image output as a regression worth reviewing.

## Repo Structure

- `src/layouts`: shared document shell and page chrome
- `src/components`: presentational Astro components
- `src/scripts`: small client-side DOM initializers
- `src/content`: structured metadata and page copy
- `src/styles`: layered CSS split by tokens, layout, header, forms, and shared components
- `e2e`: functional and visual Playwright coverage
