---
title: Engineering Operations
description: The supported engineering, validation, and deployment path for RELab.
owner: docs
status: reviewed
lastReviewed: '2026-04-15'
---

This page documents the supported engineering and delivery path for RELab as of 2026. The goal is a lean self-hosted platform that stays easy to understand and operate on one server.

## Delivery Model

- Docker Compose is the only supported runtime for staging and production.
- `compose.yml` is the shared base topology.
- `compose.dev.yml`, `compose.ci.yml`, and `compose.deploy.yml` are the supported environment overlays (dev, CI, long-lived deploys). `compose.e2e.yml` is a standalone full-stack E2E harness.
- A single `compose.deploy.yml` covers **both prod and staging**. The host's root `.env` decides which — see [the deploy runbook](#deploy-flow) below.
- Docker Compose on the server remains the source of truth for deploy and runtime operations.
- GitHub Actions currently handle validation, security checks, release management, and the backend performance baseline.

## Canonical Local Commands

Use the root `justfile` as the primary interface:

```bash
just setup
just ci
just test
just test-integration
just security
just docker-smoke
```

These commands are the supported local mirrors of CI behavior.
The configuration contract behind them is documented in [Engineering Configuration](../engineering-config/).

## CI and Release Lanes

- `Validate`: PR and push validation, Compose rendering checks, workflow linting, targeted subsystem tests, and full-stack E2E when backend or app changes justify it.
- `Security`: secret scanning, dependency audits, image scanning, and SBOM generation.
- `Release Please`: versioning, changelog updates, and release PR/tag management.
- `Ops`: backend performance baselines only.

## Deploy Flow

The supported deploy path is intentionally simple and applies to both staging and production.

**One command, one compose file, one checkout. The host's `.env` decides prod vs staging.**

### First-time host setup (common to prod and staging)

```bash
git clone git@github.com:CMLPlatform/relab.git
cd relab

# 1. Root .env — compose interpolation (tunnel token, backup paths, deploy target)
cp .env.example .env
$EDITOR .env

# 2. Backend runtime env — FastAPI settings, DB URLs, secrets
cp backend/.env.prod.example backend/.env.prod          # on a prod host
# OR
cp backend/.env.staging.example backend/.env.staging    # on a staging host
$EDITOR backend/.env.{prod,staging}
```

### On a prod VM

Leave the defaults in `.env`:

```bash
# .env contents:
#   TUNNEL_TOKEN=<prod cloudflared token>
#   (the staging block stays commented out)

just prod-up YES
# or equivalently:
#   docker compose -f compose.yml -f compose.deploy.yml up --build -d
```

Brings up project `relab_prod` with `ENVIRONMENT=prod` and `WEB_CONCURRENCY=4`. Then `just prod-migrate YES`, verify `/live` and `/health`, and use `just prod-logs` / `just prod-down YES` as needed.

### On a staging VM

Uncomment the staging block in `.env`:

```bash
# .env contents:
#   APP_ENV=staging
#   COMPOSE_PROJECT_NAME=relab_staging
#   WEB_CONCURRENCY=2
#   BUILD_MODE=staging
#   PUBLIC_SITE_URL=https://docs-test.cml-relab.org
#   CSP_API_ORIGIN=https://api-test.cml-relab.org
#   TUNNEL_TOKEN=<staging cloudflared token>

just prod-up YES
# same compose file, same command — the .env steers everything
```

Brings up project `relab_staging` with `ENVIRONMENT=staging` and `WEB_CONCURRENCY=2`. Then `just prod-migrate YES` (or the equivalent `staging-migrate` recipe if you prefer explicit naming), verify health, and iterate.

### Upgrading either host

```bash
git pull
just prod-up YES   # or: docker compose -f compose.yml -f compose.deploy.yml up --build -d
```

### Optional profiles

- Backups: append `--profile backups` to the `up` command (or use `just prod-backup-up YES`).
- Telemetry stack (otel-collector + jaeger): append `--profile telemetry`.

### Dev-laptop shortcut

The root `justfile` defines a `staging_compose` recipe that forces staging-shaped env vars inline, so a dev laptop with a prod-flavoured `.env` can still spin up a staging stack without touching `.env`. See `just --list` for the `staging-*` recipes.

## Secrets and Host Expectations

The server is expected to have:

- a checked-out copy of the RELab repo in the deployment directory you operate from
- Docker Compose available
- environment-specific `.env` files already provisioned outside the repository
- separate staging and production backend env files populated from `backend/.env.staging.example` and `backend/.env.prod.example`

## Maintainer Notes

Some internal `just` recipes still exist for occasional maintenance work such as backup profiles, smoke-test breakdowns, reset flows, or perf threshold refresh. They are intentionally hidden from the default interface and are not part of the supported day-to-day contributor or operator path.

## Backups and Recovery

- If you operate backup profiles on the server, treat them as explicit operational services rather than part of the default deploy path.
- Migrations are idempotent and should be run explicitly during deploys.
- Roll back application code by redeploying a prior known-good git ref or commit.
- Roll back schema only with a reviewed migration plan; do not assume every migration is safely reversible in production.
