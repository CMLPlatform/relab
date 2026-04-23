# RELab Docs

Standalone Astro Starlight documentation app for the RELab platform.

## Quick Start

```bash
fnm use 24 || nvm use 24
just install
just dev
```

The docs site runs on <http://localhost:8000>.

The docs app targets Node `24.x` and `pnpm 10.x`.

## Common Commands

```bash
just build
just check
just test-e2e
just format
just audit
```

## Canonical Sources

- Product, platform, and architecture docs live in this app.
- Repo onboarding remains in [../README.md](../README.md) and [../.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md). Install and self-hosting steps now live at [architecture/install](src/content/docs/architecture/install.md).
- Interactive API reference remains canonical at <https://api.cml-relab.org/docs>.
