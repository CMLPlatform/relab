---
title: Installation and self-hosting
description: Run Relab locally or self-host the stack in production or staging.
---

## Hosted use

To use Relab without any local setup, open [app.cml-relab.org](https://app.cml-relab.org).

## Self-hosting

This page covers running the stack yourself: for evaluation, institutional deployment, offline
use, or local development. For contributor workflow and tooling policy, see
[CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md).

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [`just`](https://just.systems/man/en/) is optional but recommended
- Contributing code additionally requires [`uv`](https://docs.astral.sh/uv/), Node and pnpm at the
  versions pinned in `.node-version` and `package.json`. See step 2 below and
  [CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md)
- PostgreSQL 18 when using an external database; the bundled compose stack ships it.

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

The stack runs on one host behind a Cloudflare Tunnel, so the host needs no public ports. Deploys
are three commands on the server: pull the repo, build, start the stack. They can be run there, or
sent from another machine over an ssh key whose forced command is `scripts/remote_deploy.sh`, which
allows exactly those steps and nothing else (see `deploy/DEPLOY-PROD.md` Part 1.6). Every command
runs as `just stack <prod|staging> <command>`, and a state-changing command takes `YES` to confirm
which host it acts on. [Deployment and operations](/operations/deployment/) describes
the topology these steps produce.

1. Create a Cloudflare Tunnel, one of two ways.

   - **By hand:** in the Cloudflare dashboard, create a remotely managed tunnel and add a public
     hostname per service, forwarding to `app:8081`, `www:8081`, `api:8000`, and `docs:8000`.

   - **With OpenTofu:** `infra/cloudflare/` manages the DNS records, the tunnels, and the ingress
     rules. Export the credentials, then plan and apply per environment:

     ```bash
     export CLOUDFLARE_API_TOKEN='...'
     export TF_VAR_cloudflare_account_id='...'
     export TF_VAR_cloudflare_zone_id='...'
     export TF_VAR_cloudflare_zone_name='example.org'
     just cloudflare-check
     just cloudflare-plan prod
     just cloudflare-apply prod       # plans and saves it; review the diff
     just cloudflare-apply prod YES   # applies the plan you just reviewed
     ```

     :::danger
     Only apply against a greenfield zone, or after importing the existing DNS records, tunnels,
     and rulesets into OpenTofu state. Applying against a hand-configured zone duplicates DNS
     records, creates a second tunnel whose token does not match `CLOUDFLARE_TUNNEL_TOKEN`, and
     can overwrite existing rulesets, since each Cloudflare phase allows one ruleset per zone.
     :::

     Keep prod and staging state separate. Do not commit Cloudflare tokens, tunnel tokens, or
     state files.

   Either way, copy the tunnel token for the next step.

1. Copy `.env.example` to `.env` and fill it in.

   ```bash
   cp .env.example .env
   ```

   The root `.env` is gitignored and holds every host-local value Compose interpolates. One host
   serves one environment. Every key is described in `.env.example`. The required ones:

   - `ENVIRONMENT`: `prod` or `staging`. `just stack` refuses to run against a host whose `.env`
     says otherwise.
   - `API_PUBLIC_URL`, `APP_PUBLIC_URL`, `SITE_PUBLIC_URL`, `DOCS_PUBLIC_URL`: the four public
     origins on your domain.
   - `CLOUDFLARE_TUNNEL_TOKEN`: the tunnel token from the previous step.
   - `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`: OAuth client IDs for social login.
   - `EMAIL_PROVIDER` and the sender fields. With `smtp`, also fill `SMTP_HOST`, `SMTP_USERNAME`,
     and `secrets/<env>/smtp_password`. With `microsoft_graph`, fill the tenant, client, and sender
     values and `secrets/<env>/microsoft_graph_client_secret`. Backend startup validates whichever
     provider you chose.
   - `BOOTSTRAP_SUPERUSER_EMAIL`: the first admin account. The migrator creates it with the password
     in `secrets/<env>/bootstrap_superuser_password`.
   - `MALWARE_SCAN_ENABLED`: `true` starts ClamAV with the stack, see step 6.

   Upload quotas: `MAX_UPLOAD_FILES_PER_USER` and `MAX_UPLOAD_BYTES_PER_USER_MB` cap `contributor`
   accounts; the `*_LAB_USER*` pair caps `lab` accounts and must not be lower. The quota counts
   existing rows, so on a host with existing data raise the limits before the first start; an owner
   already above the limit cannot upload at all. Every account starts as `contributor`; a superuser
   promotes lab members with
   `PUT /v1/admin/users/{user_id}/role` and body `{"role": "lab"}`.

1. Create the runtime secret files.

   ```bash
   just deploy-secrets-template prod
   ```

   Replace every placeholder under `secrets/prod/`. Runtime secrets (database passwords, the auth
   token secret, the restic password, provider secrets) live only there, never in `.env`.
   `deploy/env/variables.toml` is the inventory; `just env-inventory` prints it.

1. Validate the configuration.

   ```bash
   just compose-config         # the Compose overlays render for every environment
   just deploy-secrets-check   # every secret file exists, has mode 0644 in a 0700 dir, and is not a placeholder
   ```

1. Start the stack.

   The `migrations` profile runs the migrator first and starts the API only after it exits 0, so
   use it on every start that may carry schema changes, including the first.

   ClamAV upload scanning is on by default (`MALWARE_SCAN_ENABLED=true` in `.env.example`), and
   `up` starts the scanner whenever that setting is not `false`. ClamAV needs roughly 3-4 GiB of
   extra RAM. Its signature database persists in the `clamav_db` volume; the first boot with an
   empty volume takes several minutes to download it.

   ```bash
   just stack prod up YES migrations
   ```

   To run without scanning, set `MALWARE_SCAN_ENABLED=false`. Uploads are then stored unscanned;
   treat this as a temporary, accepted risk.

   To also seed the CPV or HS taxonomies, run the migrator once by itself:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true just stack prod migrate YES
   ```

1. Verify.

   `/live` on the API is the shallow process check Compose uses; `/health` also checks PostgreSQL
   and Redis. Then log in as the bootstrap superuser and try one upload.

   ```bash
   just stack prod logs
   ```

1. Upgrade later with the same commands: pull a known-good revision, `just stack prod build`, then
   `just stack prod up YES migrations`. A failed migration leaves the old API serving. If the
   migrator stops on an unresolvable revision, the database's `alembic_version` predates the
   2026-09-08 flatten: bring the host to `a9c2e4f60b18` on a release from before the flatten, or
   restore from backup, before continuing. To return to
   the previous release, `just stack prod rollback YES <sha>` retags the images that build produced;
   add the previous alembic revision to downgrade the schema too
   (revisions before `a9c2e4f60b18` were flattened away and cannot be targeted), which the recipe
   allows only when no migration in between dropped or rewrote data. `just stack prod down YES` stops
   the stack.

   `up` first probes, as the services that write them, the three mounts the stack writes to: the
   `user_uploads` and `restic_cache` volumes and the restic bind mount. It refuses to start when one
   is not writable by UID 65532, because reads and `stat` still succeed on a wrongly-owned mount and
   only the writes fail. Docker sets a named volume's ownership when it first creates the volume and
   never again, so a host whose volumes were created by a release that ran as a different UID needs a
   one-time chown, with the stack down:

   ```bash
   env=prod                        # or staging
   just stack "$env" down YES
   sudo chown -R 65532:65532 "${BACKUP_HOST_DIR:-./backups}"
   for volume in user_uploads restic_cache; do
       docker run --rm --user 0 -v "relab_${env}_${volume}:/mnt" \
           "relab-backend:${env}-local" chown -R 65532:65532 /mnt
   done
   just stack "$env" up YES migrations
   ```

### First backup

The backup container runs as UID 65532. Create the restic directory before the first backup; Docker
creates missing bind-mount directories root-owned, and the container then cannot initialize the
repository:

```bash
mkdir -p "${BACKUP_HOST_DIR:-./backups}/restic"
sudo chown -R 65532:65532 "${BACKUP_HOST_DIR:-./backups}"
just backup prod          # initializes the repository and takes the first snapshot
just restore-check prod   # restores that snapshot into a scratch container
```

The repository is encrypted with `secrets/prod/restic_password`. Never rotate it: every later
snapshot depends on it. Before anything destructive, take a tagged backup with
`just backup prod manual`; the `manual` tag is exempt from retention.

### Scheduling backups

Starting the stack does **not** schedule backups. A systemd timer on the host runs the one-shot
backup service every hour; a second daily timer does repository upkeep (retention, integrity check,
offsite copy). Install all four scheduled jobs (backup, backup-maintenance, watchdog, restore-check)
once per environment. The installer renders the committed units with this host's checkout path,
deploy user, and `just` location, then enables the timers:

```bash
just timers-render                        # inspect what will be installed
just timers-install staging               # renders, installs, enables (prompts for sudo; not `sudo just`)
systemctl list-timers 'relab-*@staging.timer'   # confirm NEXT times are scheduled
```

The installer also seeds `/etc/relab/relab.env` with empty `PING_*` URLs. Fill in `PING_WATCHDOG`
with a [healthchecks.io](https://healthchecks.io) check URL; the hourly watchdog reports every other
job's state through it, and the other three are optional per-job checks. Until you do, job failures
are invisible outside the host, and `just watchdog <env>` keeps saying so. With a dedicated deploy
user, run the installer from an account with sudo as `RELAB_UNIT_USER=<user> just timers-install <env>`.

Without the timers there are no recurring backups; `just watchdog <env>` reports that.

### Optional WebDAV offsite backups

The offsite path is a second restic repository copied from the local one, over restic's rclone
backend.

1. Write `secrets/<env>/rclone.conf` with exactly one WebDAV remote. The remote's root is the
   repository; the backup uses it as `rclone:<remote>:` with no path. `just deploy-secrets-check`
   warns while the file still holds the placeholder.

   The daily maintenance job then copies snapshots offsite, initializing the offsite repository on
   first run.

1. To copy snapshots on demand, for example right after a one-off local backup:

   ```bash
   just backup-offsite-copy staging
   ```

### Optional: central telemetry

Prod and staging can ship to a central monitoring stack (Grafana + Loki + Tempo + Prometheus):

1. Set `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLP_AUTH_TOKEN` and `TELEMETRY_EDGE_KEY` in the host's root
   `.env`; your monitoring operator supplies them (`.env.example` describes each). This turns on
   the backend's OpenTelemetry exporter and a Grafana Alloy agent that forwards every other
   container's stdout over the same OTLP endpoint.

1. `just stack <env> up` includes `compose.telemetry.yml` when the endpoint is non-empty. Hosts
   without it ship nothing; `docker logs` stays the only log path.

See [Deployment and operations](/operations/deployment/#telemetry) for what each variable does
and how Alloy is sandboxed.

## Raspberry Pi camera plugin

For camera-assisted capture, install the
[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

The RPi connects outbound to the backend over a WebSocket relay, so it needs no public IP or port
forwarding. To pair automatically, set `PAIRING_BACKEND_URL` on the RPi, boot it, and enter the
displayed pairing code in the app. On a headless Pi, read the code from its local `/setup` page or
from the `PAIRING READY` log line over SSH, `docker compose logs`, or `journalctl`. See the
[plugin install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md),
the [platform camera guide](/user-guides/rpi-cam/), and the [API reference](/api-reference/).

## Need help?

- Source code: [github.com/CMLPlatform/relab](https://github.com/CMLPlatform/relab)
- Contact: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
