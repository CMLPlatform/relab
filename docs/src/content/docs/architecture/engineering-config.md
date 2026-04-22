---
title: Engineering Configuration
description: Version policy, manifest ownership, and configuration rules for the RELab repo.
owner: docs
status: reviewed
lastReviewed: '2026-04-15'
---

This page documents the supported configuration contract for RELab itself: runtime versions, manifest ownership, environment files, task runners, and the review rules for infra/meta changes.

## Version Policy

- Python: `3.14` is the supported repo-wide version.
- Node.js: `22.x` is the supported repo-wide version.
- pnpm: `10.x` is the supported package-manager contract for frontend projects.
- `uv` is the supported Python package and environment manager.

The source-of-truth files are:

- root `pyproject.toml`
- root `.python-version`
- per-project manifests in `backend/`, `docs/`, `frontend-app/`, and `frontend-web/`

## Manifest Ownership

- Root `justfile`: repo-wide orchestration and cross-project workflows.
- Per-project `justfile`: local adapter for one subproject only.
- `pyproject.toml`: Python dependencies, dependency groups, and Python tool configuration.
- `package.json`: frontend dependencies, runtime/tooling engine policy, and thin script wrappers.
- Env files: runtime and build-time configuration only. They should not carry procedural logic.
- GitHub workflow YAML: CI/CD wiring only. If logic is complex, move it to a versioned script or reusable action.

## Environment Model

RELab uses four distinct configuration surfaces:

- root `.env`: host and operations settings used by Compose overlays, backups, and ingress
- backend `.env.{dev,staging,prod,test}`: backend runtime settings
- `frontend-app/.env.*`: build-time public Expo settings
- `frontend-web/.env.*`: build-time public Astro settings

Rules:

- committed `*.example` files are the authoritative templates for human-managed environments
- committed test env files are allowed only when their values are intentionally non-secret
- production/staging examples must leave secret values blank
- Compose may override hostnames such as `DATABASE_HOST` or `REDIS_HOST`, but the variables still belong in the backend contract
- public frontend variables must stay framework-native: `EXPO_PUBLIC_*` for Expo and `PUBLIC_*` for Astro

## Local Workflow

Preferred path:

```bash
cp .env.example .env
cp backend/.env.dev.example backend/.env.dev
just setup
just dev
just ci
```

Focused work is still supported from subproject directories, but the root `justfile` is the primary interface and the root full-stack devcontainer is the primary onboarding path.

## Pre-commit vs CI

Keep in pre-commit:

- formatting and policy checks that are fast and deterministic
- lockfile integrity checks
- secret scanning and obvious file hygiene issues

Keep in CI:

- multi-project validation
- Compose rendering
- environment contract auditing
- browser E2E and container/image checks
- expensive audits or checks that require broader system context

## Infra Review Checklist

Before merging an infra/meta change, check:

- does this add a new config surface that could live in an existing manifest instead?
- does this duplicate an existing `just`, `package.json`, or workflow contract?
- does this introduce environment-specific drift across dev/staging/prod/test?
- does it keep the single-server Compose deployment model understandable?
- if it changes env vars, are the example files, docs, and validation rules updated together?
