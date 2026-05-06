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

1. Configure the backend environment and local backend secrets.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   just deploy-secrets-template dev
   ```

   `backend/.env.dev` stores non-secret config. Replace values under `secrets/dev/` only when you need real local credentials for integrations such as OAuth or email.

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
   - Public DNS and Tunnel ingress are now represented in `infra/cloudflare/`.
     For an existing Cloudflare account, import the current resources before
     applying OpenTofu changes.

1. Copy `.env.example` to `.env` and fill in the operator checklist.

   ```bash
   cp .env.example .env
   ```

   The root `.env` holds host-local values that Compose must interpolate. It can contain two types of values:

   - **Non-secret** values, such as OAuth client IDs, email sender metadata, the initial superuser email/name, backup retention, and optional telemetry endpoints.
   - **Secret** values only when a host helper or Compose interpolation requires them, such as `CLOUDFLARE_TUNNEL_TOKEN` or optional authenticated telemetry URLs/headers.

   For prod or staging, fill the required non-secret backend deploy inputs in `.env`: `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`, `EMAIL_PROVIDER`, email sender fields, and `BOOTSTRAP_SUPERUSER_EMAIL`. Use the prod or staging Cloudflare tunnel token for `CLOUDFLARE_TUNNEL_TOKEN`. Compose requires the shared email identity values; backend startup validation enforces provider-specific settings. With `EMAIL_PROVIDER=smtp`, fill `SMTP_HOST`, `SMTP_USERNAME`, and `secrets/<env>/smtp_password`. With `EMAIL_PROVIDER=microsoft_graph`, fill the Microsoft Graph tenant/client/sender values and `secrets/<env>/microsoft_graph_client_secret`.

   Environment identity, public origins, and worker counts live in `deploy/env/prod.compose.env` and `deploy/env/staging.compose.env`. Each deploy env file defines the environment plus the four public service URLs once: `API_PUBLIC_URL`, `APP_PUBLIC_URL`, `SITE_PUBLIC_URL`, and `DOCS_PUBLIC_URL`.

1. Review the non-secret deploy settings for this host.

   Edit `deploy/env/prod.compose.env` or `deploy/env/staging.compose.env` only for committed public URL or worker-count changes. Keep application/runtime secrets out of `.env`; they belong under `secrets/<env>/`.
   To inspect the full repo-owned variable contract, run:

   ```bash
   just env-inventory
   ```

1. Create the host-local Compose secret files.

   ```bash
   just deploy-secrets-template prod
   ```

   Replace every placeholder value under `secrets/prod/`. Use `just deploy-secrets-template staging` for staging or `just deploy-secrets-template dev` for local development. Required secret filenames are declared by the rendered Compose overlays and the source-controlled inventory in `deploy/env/variables.toml`; `just deploy-secrets-check` verifies that every rendered secret points at the expected `secrets/<env>/` file. Existing database volumes must be dumped and recreated before the database role layout can take effect.

1. Validate the deployment configuration.

   ```bash
   just compose-config
   just deploy-secrets-check
   ```

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

1. For Cloudflare edge changes, plan from the repo checkout or an ops machine
   with OpenTofu and Cloudflare credentials.

   Set the credentials and Cloudflare identifiers in the shell before planning:

   ```bash
   export CLOUDFLARE_API_TOKEN='...'
   export TF_VAR_cloudflare_account_id='...'
   export TF_VAR_cloudflare_zone_id='...'
   export TF_VAR_cloudflare_zone_name='cml-relab.org'
   ```

   ```bash
   just cloudflare-check
   just cloudflare-plan staging
   just cloudflare-plan prod
   just cloudflare-apply staging YES
   just cloudflare-apply prod YES
   ```

   The same commands will work later if those values come from Bitwarden or
   another password manager. Keep prod and staging state separate. Do not commit
   Cloudflare tokens, tunnel tokens, or state files.

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

1. Export the offsite repository in the shell that runs the manual copy.

   ```sh
   export RESTIC_OFFSITE_REPOSITORY=rclone:relab-webdav:relab/staging/restic
   ```

1. Copy snapshots offsite after a local backup exists. The helper reads
   exported variables; Docker Compose continues to read root `.env` through
   its normal `--env-file` path.

   ```bash
   just backup-offsite-copy staging
   ```

### Optional: central telemetry

If you run a central monitoring stack (Grafana + Loki + Tempo + Prometheus), prod and staging can ship to it without any code changes:

1. Install the Loki Docker driver plugin on the host (once):

   ```bash
   docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
   ```

1. Set `LOKI_PUSH_URL` (and optionally `OTEL_EXPORTER_OTLP_ENDPOINT`) in the host's root `.env`. The `prod-up` / `staging-up` recipes auto-include `compose.logging.loki.yaml` when `LOKI_PUSH_URL` is non-empty. Hosts without the variable keep Docker's default `json-file` driver.

See [Deployment and operations](/operations/deployment/#telemetry) for the full flow.

## Raspberry Pi camera plugin

If you want camera-assisted capture, see the external plugin repository:

[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin)

The plugin uses **WebSocket relay** — the RPi connects outbound to the backend, so no public IP or port forwarding is needed. The quickest setup is **automatic pairing**: set `PAIRING_BACKEND_URL` on the RPi, boot it, and enter the displayed pairing code in the app. See the [plugin install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md) and the [platform camera guide](/user-guides/rpi-cam/) for details.
If the Pi is headless, you can read the pairing code either from its local `/setup` page or from the `PAIRING READY` log line over SSH, `docker compose logs`, or `journalctl`.

## Need help?

- Source code: [github.com/CMLPlatform/relab](https://github.com/CMLPlatform/relab)
- Contact: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
