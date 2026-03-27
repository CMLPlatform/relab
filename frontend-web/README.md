# RELab Web

The public-facing website: project overview, dataset access, and platform information. Built with [Astro](https://astro.build/) and linted/formatted with [Biome](https://biomejs.dev/).

## 🚀 Quick Start

```bash
juts install # install dependencies
just dev    # site at http://localhost:8081 (or http://localhost:8010 via Docker)
```

## Common Commands

```bash
just check        # Biome lint + Astro type check
just test         # Vitest unit tests
just test-e2e     # Playwright E2E (Chromium + Firefox)
just format       # auto-fix formatting
```

## Want to Know More?

Full setup, E2E test patterns, and accessibility testing are in [CONTRIBUTING.md](../CONTRIBUTING.md#frontend-development).
