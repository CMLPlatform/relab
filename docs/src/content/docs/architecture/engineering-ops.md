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
- `compose.dev.yml`, `compose.test.yml`, `compose.staging.yml`, and `compose.prod.yml` are the supported environment overlays.
- Docker Compose on the server remains the source of truth for deploy and runtime operations.
- GitHub Actions currently handle validation, security checks, release management, and the backend performance baseline.

## Canonical Local Commands

Use the root `justfile` as the primary interface:

```bash
just setup
just validate
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

### Staging

1. Pull the repo on the staging server.
1. Run `just staging-up YES`.
1. Run `just staging-migrate YES`.
1. Verify backend health, frontend reachability, and migrations.
1. Use `just staging-logs` or `just staging-down YES` as needed.

### Production

1. Merge to `main`.
1. Let Release Please update the changelog and release state for `main`.
1. Pull the repo on the production server.
1. Run `just prod-up YES`.
1. Run `just prod-migrate YES`.
1. Verify backend health, frontend reachability, and migrations.
1. Use `just prod-logs` or `just prod-down YES` as needed.

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
