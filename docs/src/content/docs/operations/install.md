---
title: Installation and self-hosting
description: Run RELab locally or self-host the stack in production or staging.
---

## Hosted use

If you just want to use RELab, start here: [app.cml-relab.org](https://app.cml-relab.org).

No local setup is required.

## Self-hosting

Self-hosting makes sense for evaluation, institutional deployment, offline use, or local development. If your main goal is contributing code, [CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md) is the better starting point.

This page is about running the stack. For tooling policy and contributor workflow, use [CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md).

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [`just`](https://just.systems/man/en/) is optional but recommended

## Local Docker setup

1. Clone the repository.

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. Install local tooling if you plan to modify code.

   ```bash
   just setup
   ```

1. Configure the backend environment.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   ```

1. Run the first migration pass.

   ```bash
   just dev-migrate
   ```

   If you also need CPV or HS taxonomy seeding in the migration container:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true docker compose --profile migrations up --build migrator
   ```

1. Start the stack.

   ```bash
   just dev
   ```

   If you do not want file watching, use `just dev-up` instead.

1. Open the local services.

   - Platform: <http://127.0.0.1:8010>
   - API: <http://127.0.0.1:8011>
   - Docs: <http://127.0.0.1:8012>
   - App frontend: <http://127.0.0.1:8013>

1. Verify the backend is healthy.

   ```bash
   curl http://127.0.0.1:8011/health
   ```

1. Run checks if needed.

   ```bash
   just ci
   just test
   ```

## Production and staging deployment

Deploys use a single compose overlay, `compose.deploy.yaml`. Prod and staging are selected by committed non-secret Compose env files under `deploy/env/`, while each host keeps only host-local interpolation values in the gitignored root `.env`. Cloudflare Tunnel remains the supported ingress path. The current operational path is manual on the server: pull the repo, run the deploy stack, run migrations, verify health.

1. Configure a Cloudflare tunnel.

   - Set up a domain and a remotely managed tunnel in Cloudflare.
   - Forward traffic to `app:8081`, `www:8081`, `api:8000`, and `docs:8000`.

1. Copy `.env.example` to `.env` and fill in values.

   ```bash
   cp .env.example .env
   ```

   - **Prod host**: set `TUNNEL_TOKEN=<prod token>` plus optional telemetry and backup overrides.
   - **Staging host**: set `TUNNEL_TOKEN=<staging token>` plus optional telemetry and backup overrides.

   Environment identity, public URLs, worker counts, and build mode live in `deploy/env/prod.compose.env` and `deploy/env/staging.compose.env`; do not duplicate those values in the root `.env`.

1. Configure the backend runtime environment for this host.

   ```bash
   cp backend/.env.prod.example backend/.env.prod          # on a prod host
   # OR
   cp backend/.env.staging.example backend/.env.staging    # on a staging host
   ```

1. Create the host-local Compose secret files for database roles and backups.

   ```bash
   just deploy-secrets-template prod
   ```

   Replace every placeholder value under `secrets/prod/`. Use `just deploy-secrets-template staging` for staging. The required filenames for database, Redis, and restic credentials are tracked in `deploy/required-secret-files.txt`, and `just deploy-secrets-check` verifies that the manifest still matches Compose. Existing database volumes must be dumped and recreated before this role layout can take effect.

1. Start the stack.

   ```bash
   just prod-up YES
   ```

   For a local production-like backup rehearsal, prefer staging:

   ```bash
   just staging-up YES backups
   just staging-migrate YES
   just backup-restore-smoke staging
   ```

   In the current setup, deployment is done directly on the server.

1. Run migrations.

   ```bash
   just prod-migrate YES
   ```

   If you also need taxonomy seeding in the migration container:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true just prod-migrate YES
   ```

1. Manage the running stack.

   ```bash
   just prod-logs
   just prod-down YES
   ```

### Optional WebDAV offsite backups

The supported offsite path is a second restic repository copied from the local restic repository. WebDAV is handled through restic's rclone backend.

1. Create `secrets/<env>/rclone.conf` with a WebDAV remote.

1. Set the offsite repository in the host root `.env`.

   ```env
   RESTIC_OFFSITE_REPOSITORY=rclone:relab-webdav:relab/staging/restic
   ```

1. Copy snapshots offsite after a local backup exists.

   ```bash
   just backup-offsite-copy staging
   ```

### Optional: central telemetry

If you run a central monitoring stack (Grafana + Loki + Tempo + Prometheus), prod and staging can ship to it without any code changes:

1. Install the Loki Docker driver plugin on the host (once):

   ```bash
   docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
   ```

1. Set `LOKI_URL` (and optionally `OTEL_EXPORTER_OTLP_ENDPOINT`) in the host's root `.env`. The `prod-up` / `staging-up` recipes auto-include `compose.logging.loki.yaml` when `LOKI_URL` is non-empty. Hosts without the variable keep Docker's default `json-file` driver.

See [Deployment and operations](/operations/deployment/#telemetry) for the full flow.

## Raspberry Pi camera plugin

If you want camera-assisted capture, see the external plugin repository:

[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin)

The plugin uses **WebSocket relay** — the RPi connects outbound to the backend, so no public IP or port forwarding is needed. The quickest setup is **automatic pairing**: set `PAIRING_BACKEND_URL` on the RPi, boot it, and enter the displayed pairing code in the app. See the [plugin install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md) and the [platform camera guide](/user-guides/rpi-cam/) for details.
If the Pi is headless, you can read the pairing code either from its local `/setup` page or from the `PAIRING READY` log line over SSH, `docker compose logs`, or `journalctl`.

## Need help?

- Source code: [github.com/CMLPlatform/relab](https://github.com/CMLPlatform/relab)
- Contact: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
