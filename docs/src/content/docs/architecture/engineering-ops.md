---
title: Engineering Operations
description: The supported engineering, validation, and deployment path for RELab.
owner: docs
status: reviewed
lastReviewed: '2026-04-23'
---

This page documents the supported engineering and delivery path for RELab as of 2026. The goal is a lean self-hosted platform that stays easy to understand and operate on one server.

## Delivery Model

- Docker Compose is the only supported runtime for staging and production.
- `compose.yaml` is the shared base topology.
- `compose.dev.yaml`, `compose.ci.yaml`, and `compose.deploy.yaml` are the supported environment overlays (dev, CI, long-lived deploys). `compose.e2e.yaml` is a standalone full-stack E2E harness.
- A single `compose.deploy.yaml` covers **both prod and staging**. The host-level root `.env` provides secrets and optional telemetry endpoints; the committed `.env.prod.compose` / `.env.staging.compose` files provide the non-secret environment selection and build/runtime knobs.
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

**One command, one compose file, one checkout. The host's root `.env` supplies secrets and optional telemetry; the committed `.env.<env>.compose` file supplies the environment shape.**

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

Use the prod compose env file alongside the host's root `.env`:

```bash
just prod-up YES
# or equivalently:
#   docker compose --env-file .env --env-file .env.prod.compose \
#     -f compose.yaml -f compose.deploy.yaml up --build -d
```

Brings up project `relab_prod` with `ENVIRONMENT=prod` and `WEB_CONCURRENCY=4`. Then `just prod-migrate YES`, verify `/live` and `/health`, and use `just prod-logs` / `just prod-down YES` as needed.

### On a staging VM

Use the staging compose env file alongside the same host-level `.env` pattern:

```bash
just staging-up YES
# or equivalently:
#   docker compose --env-file .env --env-file .env.staging.compose \
#     -f compose.yaml -f compose.deploy.yaml up --build -d
```

Brings up project `relab_staging` with `ENVIRONMENT=staging` and `WEB_CONCURRENCY=2`. Then `just staging-migrate YES`, verify health, and iterate.

### Upgrading either host

```bash
git pull
just prod-up YES      # prod host
just staging-up YES   # staging host
```

### Optional profiles

- Production backups: run `just prod-up YES backups` or `just _prod-backups-up YES`.
- Deploy migrations: run `just prod-up YES migrations` or `just staging-up YES migrations`.
- Telemetry: see [Telemetry](#telemetry) below.

## Telemetry

Logs, traces, and metrics from prod and staging ship to a **central monitoring stack** (Grafana + Loki + Tempo + Prometheus) that lives outside this repo. Dev and CI never ship telemetry. The host's root `.env` is the single place where operators set the Loki and OTLP connection settings used by deploys.

### Logs → Loki

Logs use the [Loki Docker log driver](https://grafana.com/docs/loki/latest/send-data/docker-driver/) rather than an in-cluster agent. To enable on a host:

1. Install the driver plugin (once per host):

   ```bash
   docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
   ```

1. Set `LOKI_URL` in the host's root `.env` (the push endpoint of your central Loki).

The root `justfile`'s `prod_compose` / `staging_compose` recipes auto-include [`compose.logging.loki.yaml`](../../../../../compose.logging.loki.yaml) when `LOKI_URL` is set. Hosts without `LOKI_URL` keep Docker's default `json-file` driver — no action required.

Logs carry labels for `service`, `env`, and `host`. Keep label cardinality low: use LogQL filters (`| json | user_id = "…"`) for high-cardinality fields rather than adding them as labels.

### Traces and metrics → OTLP

The FastAPI backend exports OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set in the host's root `.env`. Leave it unset to disable. If your collector requires auth, also set `OTEL_EXPORTER_OTLP_HEADERS` in that same root `.env`; `compose.deploy.yaml` passes the endpoint through to the backend container and the OTEL SDK reads the headers from the container environment.

### Hosting the monitoring stack

The central stack is maintained as its own project (see the monitoring repo). It's meant to be reachable from prod/staging hosts over a private network (Cloudflare Tunnel, Tailscale, WireGuard) — never over the public internet.

### Dev-laptop shortcut

The root `justfile` defines a `staging_compose` recipe that uses `--env-file .env.staging.compose` alongside the host's root `.env`, so a dev laptop can spin up a staging-shaped stack without rewriting `.env`. See `just --list` for the `staging-*` recipes.

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
