---
title: Installation and self-hosting
description: Run Relab locally or self-host the stack in production or staging.
---

## Hosted use

If you just want to use Relab, start here: [app.cml-relab.org](https://app.cml-relab.org).

No local setup is required.

## Self-hosting

Self-hosting makes sense for evaluation, institutional deployment, offline use, or local
development. This page is about running the stack. If your main goal is contributing code,
[CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md) covers
tooling policy and contributor workflow.

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [`just`](https://just.systems/man/en/) is optional but recommended
- Contributing code additionally requires [`uv`](https://docs.astral.sh/uv/), Node 26.x, and pnpm
  11.x. See step 2 below and
  [CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md)

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

1. Create local backend secrets.

   ```bash
   just deploy-secrets-template dev
   ```

   Create `backend/.env.dev` only when you need backend-only local overrides such as OAuth, email,
   or bootstrap settings. Replace values under `secrets/dev/` only when you need real local
   credentials for integrations.

   ```text title="backend/.env.dev"
   GOOGLE_OAUTH_CLIENT_ID=google-oauth-client-id
   GITHUB_OAUTH_CLIENT_ID=github-oauth-client-id
   EMAIL_PROVIDER=smtp
   SMTP_HOST=smtp.example.com
   SMTP_USERNAME=you@example.com
   EMAIL_FROM=Your Name <you@example.com>
   EMAIL_REPLY_TO=you@example.com
   BOOTSTRAP_SUPERUSER_EMAIL=you@example.com
   ```

1. Start the containerized database/cache and run the first migration pass.

   ```bash
   just dev-db
   just dev-migrate
   ```

   To seed sample data during migrations, run `SEED_DUMMY_DATA=true just dev-migrate`.

   If you also need CPV or HS taxonomy seeding in the migration container:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true just dev-migrate
   ```

1. Start the stack.

   ```bash
   just dev
   ```

   If you do not want file watching, use `just dev-up` instead.

1. Open the local services.

   - API: <http://127.0.0.1:8010>
   - App frontend: <http://127.0.0.1:8011>
   - Docs: <http://127.0.0.1:8012>
   - Landing site: <http://127.0.0.1:8013>

1. Verify the backend is healthy.

   ```bash
   curl http://127.0.0.1:8010/health
   ```

1. Run checks if needed.

   ```bash
   just ci
   just test
   ```

## Production and staging deployment

Deploys use a single compose overlay, `compose.deploy.yaml`. Prod and staging are selected by
committed non-secret Compose env files under `deploy/env/`, while each host keeps host-local
interpolation values in the gitignored root `.env`. Cloudflare Tunnel remains the supported ingress
path. The operational path is manual on the server: pull the repo, run the deploy stack, run
migrations, verify health.

1. Configure a Cloudflare tunnel.

   - Set up a domain and a remotely managed tunnel in Cloudflare.
   - Forward traffic to `app:8081`, `www:8081`, `api:8000`, and `docs:8000`.
   - Public DNS and Tunnel ingress are managed in `infra/cloudflare/`.
     For an existing Cloudflare account, import the current resources before
     applying OpenTofu changes.

1. Copy `.env.example` to `.env` and fill in the operator checklist.

   ```bash
   cp .env.example .env
   ```

   The root `.env` holds host-local values that Compose must interpolate. It can contain two types
   of values:

   - **Non-secret** values, such as OAuth client IDs, email sender metadata, the initial superuser
     email, the backup host directory, and optional telemetry endpoints.
   - **Secret** values only when a host helper or Compose interpolation requires them, such as
     `CLOUDFLARE_TUNNEL_TOKEN` or optional authenticated telemetry URLs/headers.

   For prod or staging, fill the required non-secret backend deploy inputs in `.env`:
   `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`, `EMAIL_PROVIDER`, email sender fields, and
   `BOOTSTRAP_SUPERUSER_EMAIL`. Use the prod or staging Cloudflare tunnel token for
   `CLOUDFLARE_TUNNEL_TOKEN`. Compose requires the shared email identity values; backend startup
   validation enforces provider-specific settings. With `EMAIL_PROVIDER=smtp`, fill `SMTP_HOST`,
   `SMTP_USERNAME`, and `secrets/<env>/smtp_password`. With `EMAIL_PROVIDER=microsoft_graph`, fill
   the Microsoft Graph tenant/client/sender values and
   `secrets/<env>/microsoft_graph_client_secret`.

   Also review the per-user upload ceiling and scanning inputs: `MAX_UPLOAD_FILES_PER_USER` and
   `MAX_UPLOAD_BYTES_PER_USER_MB` cap how many files and how much storage each account can use. The
   quota ledger counts existing rows, so raise these limits before the first start on a host with a
   large existing dataset. Otherwise, an owner whose existing uploads already exceed the new limit
   is blocked from uploading entirely. `MALWARE_SCAN_ENABLED` controls ClamAV upload scanning and
   must agree with whether the stack starts with the `scanning` Compose profile. See the two modes
   in the "Start the stack" step below.

   Environment identity and public origins live in `deploy/env/prod.compose.env` and
   `deploy/env/staging.compose.env`. Each deploy env file defines the environment plus the four
   public service URLs once: `API_PUBLIC_URL`, `APP_PUBLIC_URL`, `SITE_PUBLIC_URL`, and
   `DOCS_PUBLIC_URL`.

1. Review the non-secret deploy settings for this host.

   Edit `deploy/env/prod.compose.env` or `deploy/env/staging.compose.env` only for committed public
   URL changes. Keep application/runtime secrets out of `.env`; they belong under `secrets/<env>/`.
   To inspect the runtime secret inventory, run:

   ```bash
   just env-inventory
   ```

1. Create the host-local Compose secret files.

   ```bash
   just deploy-secrets-template prod
   ```

   Replace every placeholder value under `secrets/prod/`. Use `just deploy-secrets-template staging`
   for staging or `just deploy-secrets-template dev` for local development. Required secret
   filenames are declared by the rendered Compose overlays and the runtime secret inventory in
   `deploy/env/variables.toml`; `just deploy-secrets-check` verifies that every rendered secret
   points at the expected `secrets/<env>/` file, that the directory and file modes are correct
   (directory `0700`, files `0644`, with remediation printed on mismatch), and that no secret is
   left at a placeholder value. Existing database volumes must be dumped and recreated before the
   database role layout can take effect.

1. Validate the deployment configuration.

   ```bash
   just compose-config
   just deploy-secrets-check
   ```

1. Start the stack.

   ClamAV upload scanning is enabled by default: `.env.example` ships `MALWARE_SCAN_ENABLED=true`,
   and `deploy_ops.sh` refuses to bring the stack `up` when that flag is anything but `false` unless
   the `scanning` profile is also passed. Passing any profile replaces the `backups` default, so
   list `backups` explicitly whenever you pass `scanning`.

   - **With scanning (default):** keep `MALWARE_SCAN_ENABLED=true` in the root `.env` and pass the
     `scanning` profile on every up/down. Budget roughly 3-4 GiB of extra RAM for ClamAV.

     ```bash
     just prod-up YES backups scanning
     ```

   - **Without scanning:** set `MALWARE_SCAN_ENABLED=false` in the root `.env` and start without
     the `scanning` profile. Uploads are accepted unscanned; treat this as an explicit, temporary
     accepted risk, not a default to keep long-term.

     ```bash
     just prod-up YES
     ```

   Leaving `MALWARE_SCAN_ENABLED=true` without the `scanning` profile fails all uploads closed.

   For a local production-like backup rehearsal, prefer staging:

   ```bash
   just staging-up YES backups
   just staging-migrate YES
   just backup-restore-smoke staging
   ```

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
   ```

   :::danger
   Only run `cloudflare-apply` against a greenfield Cloudflare zone, or after importing the
   existing DNS records, tunnels, and rulesets into OpenTofu state. Applying against a
   hand-configured zone tries to create everything from scratch: it duplicates DNS records,
   creates a new tunnel whose id will not match the live `CLOUDFLARE_TUNNEL_TOKEN` (breaking
   ingress), and can overwrite existing rulesets, since each Cloudflare phase allows only one
   ruleset per zone (source: `deploy/CUTOVER.md` §11).
   :::

   ```bash
   just cloudflare-apply staging YES
   just cloudflare-apply prod YES
   ```

   These commands also work with credentials from Bitwarden or another password
   manager. Keep prod and staging state separate. Do not commit Cloudflare
   tokens, tunnel tokens, or state files.

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

The supported offsite path is a second restic repository copied from the local restic repository.
WebDAV is handled through restic's rclone backend.

1. Create `secrets/<env>/rclone.conf` with a WebDAV remote.

1. Set `RESTIC_OFFSITE_REPOSITORY` in the host's root `.env`:

   ```ini
   RESTIC_OFFSITE_REPOSITORY=rclone:relab-webdav:relab/staging/restic
   ```

   Once set, the scheduled `backups` service copies snapshots offsite automatically at the end of
   every backup cycle. No further action is needed for ongoing offsite copies.

1. To copy snapshots on demand outside the scheduled cycle (for example, right after a one-off
   local backup), export the same variable in the shell that runs the manual helper. The helper
   reads exported variables; Docker Compose continues to read root `.env` through its normal
   `--env-file` path.

   ```sh
   export RESTIC_OFFSITE_REPOSITORY=rclone:relab-webdav:relab/staging/restic
   ```

   ```bash
   just backup-offsite-copy staging
   ```

### Optional: central telemetry

If you run a central monitoring stack (Grafana + Loki + Tempo + Prometheus), prod and staging can
ship to it without any code changes:

1. Install the Loki Docker driver plugin on the host (once):

   ```bash
   docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
   ```

1. Set `LOKI_PUSH_URL` (and optionally `OTEL_EXPORTER_OTLP_ENDPOINT`) in the host's root `.env`. The
   `prod-up` / `staging-up` recipes auto-include `compose.logging.loki.yaml` when `LOKI_PUSH_URL` is
   non-empty. Hosts without the variable keep Docker's default `json-file` driver.

See [Deployment and operations](/operations/deployment/#telemetry) for the full flow.

## Raspberry Pi camera plugin

If you want camera-assisted capture, see the external plugin repository:

[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin)

The plugin uses a **WebSocket relay**: the RPi connects outbound to the backend, so no public IP or
port forwarding is needed. The quickest setup is **automatic pairing**: set `PAIRING_BACKEND_URL` on
the RPi, boot it, and enter the displayed pairing code in the app. See the
[plugin install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md),
the [platform camera guide](/user-guides/rpi-cam/), and the
[API reference overview](/api-reference/) for endpoint details. If the Pi is headless, you can read
the pairing code either from its local `/setup` page or from the `PAIRING READY` log line over SSH,
`docker compose logs`, or `journalctl`.

## Need help?

- Source code: [github.com/CMLPlatform/relab](https://github.com/CMLPlatform/relab)
- Contact: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
