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
```

## More

For local setup, testing patterns, and accessibility expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-development).
