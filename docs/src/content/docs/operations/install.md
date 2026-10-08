---
title: Installation and self-hosting
description: Run Relab locally or self-host the stack in production or staging.
---

## Hosted use

To use Relab without any local setup, open [app.r9lab.io](https://app.r9lab.io).

## Self-hosting

This page covers running the stack yourself: for evaluation, institutional deployment, offline
use, or local development. For contributor workflow and tooling, see
[CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md).

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [`just`](https://just.systems/man/en/), optional but recommended
- To change code: [`uv`](https://docs.astral.sh/uv/), and Node and pnpm at the versions pinned in
  `.node-version` and `package.json`
- PostgreSQL 18, only for an external database; the bundled Compose stack includes it

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

   Runtime secrets live in the gitignored `secrets/dev/`; replace a value there only when you need
   a real credential for an integration. For backend-only overrides such as OAuth, email, or the
   bootstrap superuser, create `backend/.env.dev`:

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

1. Start the database and cache, then run the migrations.

   ```bash
   just dev-db
   just dev-migrate
   ```

   To seed sample data, run `SEED_DUMMY_DATA=true just dev-migrate`. To seed the CPV or HS
   taxonomies too:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true just dev-migrate
   ```

1. Start the stack.

   ```bash
   just dev
   ```

   `just dev-up` starts the stack without file watching.

1. Open the local services.

   - API: <http://127.0.0.1:8010>
   - App frontend: <http://127.0.0.1:8011>
   - Docs: <http://127.0.0.1:8012>
   - Landing site: <http://127.0.0.1:8013>

1. Verify the backend is healthy.

   ```bash
   curl http://127.0.0.1:8010/health
   ```

1. To run the checks:

   ```bash
   just ci
   ```

## Production and staging deployment

The stack runs on one host behind a Cloudflare Tunnel, so the host needs no public ports. A deploy
is three commands on the server: pull the repository, pick a published image tag, start the stack.
You can also send them from another machine over an ssh key whose forced command is
`scripts/remote_deploy.sh`, which allows those steps and nothing else (see `deploy/DEPLOY-PROD.md`
Part 1.6). Every command runs as `just stack <prod|staging> <command>`. A command that changes state
takes `YES` to confirm which host it acts on. [Deployment and operations](/operations/deployment/)
describes the topology these steps produce.

1. Create a Cloudflare Tunnel, one of two ways.

   - **By hand:** in the Cloudflare dashboard, create a remotely managed tunnel and add a public
     hostname per service, forwarding to `app:8081` and `api:8000`. The landing page and docs
     hostnames are Workers Custom Domains instead (step 5).

   - **With OpenTofu:** `infra/cloudflare/` manages the DNS records, the tunnels, and the ingress
     rules. Its
     [README](https://github.com/CMLPlatform/relab/blob/main/infra/cloudflare/README.md) lists the
     credentials, the API token scopes, and the state encryption passphrase. With those exported,
     plan and apply per environment:

     ```bash
     just cloudflare-check
     just cloudflare-plan prod
     just cloudflare-apply prod       # plans and saves it; review the diff
     just cloudflare-apply prod YES   # applies the plan you just reviewed
     ```

     :::danger
     Apply only against a new zone, or after you import the existing DNS records, tunnels, and
     rulesets into OpenTofu state (see the README's import workflow). Otherwise the apply
     duplicates DNS records and creates a second tunnel whose token does not match
     `secrets/<env>/cloudflare_tunnel_token`. It can also overwrite existing rulesets, because each Cloudflare
     phase allows one ruleset per zone.
     :::

   Either way, copy the tunnel token: step 3 puts it in a secret file.

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
   - `IMAGE_TAG`: the published image tag to run, see step 5. Set `IMAGE_REGISTRY` too when the
     images come from your own fork.
   - `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`: OAuth client IDs for social login.
   - `EMAIL_PROVIDER` and the sender fields. With `smtp`, also fill `SMTP_HOST`, `SMTP_USERNAME`,
     and `secrets/<env>/smtp_password`. With `microsoft_graph`, fill the tenant, client, and sender
     values and `secrets/<env>/microsoft_graph_client_secret`. Backend startup validates whichever
     provider you chose.
   - `BOOTSTRAP_SUPERUSER_EMAIL`: the first admin account. The migrator creates it with the password
     in `secrets/<env>/bootstrap_superuser_password`.
   - `MALWARE_SCAN_ENABLED`: `true` starts ClamAV with the stack, see step 6.

   Upload quotas: `MAX_UPLOAD_FILES_PER_USER` and `MAX_UPLOAD_BYTES_PER_USER_MB` cap `contributor`
   accounts. The `*_LAB_USER*` pair caps `lab` accounts and must not be lower. The quota counts
   existing rows, so on a host with existing data, raise the limits before the first start: an
   owner already above the limit cannot upload at all. Every account starts as `contributor`. A
   superuser promotes lab members with `PUT /v1/admin/users/{user_id}/role` and the body
   `{"role": "lab"}`.

   Per-image caps: `MAX_IMAGE_UPLOAD_SIZE_MB` and `MAX_IMAGE_UPLOAD_PIXELS` cap `contributor`
   images (10 MB, 12.6 MP); `MAX_IMAGE_UPLOAD_SIZE_LAB_MB` and `MAX_IMAGE_UPLOAD_PIXELS_LAB` cap
   `lab` images (20 MB, 24 MP). No pixel cap may exceed 50 MP. An image takes about 6 bytes per
   pixel of memory while it is processed (about 145 MB at 24 MP), so size `IMAGE_RESIZE_WORKERS`
   x `WEB_CONCURRENCY` against the backend's memory limit before raising a pixel cap.

1. Create the runtime secret files.

   ```bash
   just deploy-secrets-template prod
   ```

   Replace every placeholder under `secrets/prod/`, and paste the tunnel token from step 1 into
   `secrets/prod/cloudflare_tunnel_token`. Runtime secrets (database passwords, the auth token
   secret, the restic password, the tunnel token, provider secrets) live only there, never in
   `.env`.
   `deploy/env/variables.toml` is the inventory; `just env-inventory` prints it.

1. Validate the configuration.

   ```bash
   just compose-config         # the Compose overlays render for every environment
   just deploy-secrets-check   # every secret file exists, has mode 0644 in a 0700 dir, and is not a placeholder
   ```

1. Publish the images.

   The hosts pull their images from GHCR instead of building them, and Cloudflare Workers serve
   the landing page and docs. The backend images work for any deployment. The app, landing page,
   and docs bake their public URLs in at build time, so a deployment on another domain publishes
   its own from a fork:

   - In the fork's settings, create a GitHub Environment named `prod` (and `staging` if you run
     one) with the variables `API_PUBLIC_URL`, `APP_PUBLIC_URL`, `SITE_PUBLIC_URL` and
     `DOCS_PUBLIC_URL`, plus the optional `FEATURED_PRODUCT_ID` for the landing page hero. If you
     run `infra/cloudflare` for your edge, it creates the Environment and the four URLs for you,
     along with the Worker names and your Cloudflare account ID.
   - Add a `CLOUDFLARE_API_TOKEN` secret to each Environment: an account API token with
     **Workers Scripts: Edit** and nothing else. A token granted on all Workers is not scoped to one
     environment, so give both Environments a required reviewer (`infra/cloudflare` does, and
     refuses to apply without one). In prod the reviewer is also the release gate.
   - Run the Deploy Sites workflow for each environment before the `infra/cloudflare` apply that
     gives the Workers their hostnames; `infra/cloudflare/README.md` lists the order.
   - Without Cloudflare, `pnpm run build` in `www/` and `docs/` gives a static `dist/` for any
     static host. Its security headers are in `dist/_headers`, which your host has to apply.
   - Run the Publish Images workflow. A manual run publishes the commit as `sha-<short sha>`; a
     release published by `release.yml` uses its version (`0.4.0`).
   - Make the packages public in the fork's package settings, or log the host in to GHCR.
   - Set `IMAGE_REGISTRY=ghcr.io/<your-account>` in `.env`, then pull the tag:

   ```bash
   just stack prod tag YES <tag>   # pulls every image, then writes IMAGE_TAG to .env
   ```

   To check first that the tag was built by your fork's workflow, run
   `GITHUB_REPOSITORY=<your-account>/relab IMAGE_REGISTRY=ghcr.io/<your-account> just images-verify prod <tag>`
   from a machine with `gh` logged in.

1. Start the stack.

   The `migrations` profile runs the migrator first and starts the API only after it exits 0. Use
   it on every start that may carry schema changes, including the first.

   ClamAV upload scanning is on by default (`MALWARE_SCAN_ENABLED=true` in `.env.example`): `up`
   starts the scanner unless that setting is `false`. ClamAV needs about 3–4 GiB of extra RAM. Its
   signature database persists in the `clamav_db` volume; the first boot with an empty volume takes
   several minutes to download it.

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

   `/live` on the API is the shallow process check that Compose uses; `/health` also checks
   PostgreSQL and Redis. Log in as the bootstrap superuser and enrol two-factor authentication in
   the account settings: the `/admin` routes refuse a superuser without it. Then try one upload.

   ```bash
   just stack prod logs
   ```

1. Upgrade later with the same commands: pull a known-good revision, run
   `just stack prod tag YES <tag>`, then `just stack prod up YES migrations`.

   A failed migration does not leave the old API serving. `up` exits non-zero and names the
   migrator; the new API is either not started or running on the unfinished schema. Fix forward or
   roll back:

   ```bash
   just stack prod rollback YES <tag>              # earlier release's images, current schema
   just stack prod rollback YES <tag> <revision>   # also downgrade the schema to <revision>
   ```

   The schema downgrade runs only when no migration in the range dropped or rewrote data. The
   migration history was flattened into `a9c2e4f60b18` on 2026-09-08, so older revisions cannot be
   targeted. If the migrator stops on an unresolvable revision, the database predates that flatten:
   bring it to `a9c2e4f60b18` on a release from before the flatten, or restore from backup.
   `deploy/DEPLOY-PROD.md` Part 3 covers recovery in detail. `just stack prod down YES` stops the
   stack.

   Before it starts anything, `up` checks that UID 65532 can write the three mounts the stack
   writes to: the `user_uploads` and `restic_cache` volumes and the restic bind mount. Reads and
   `stat` still succeed on a wrongly-owned mount, so without this check only uploads and backups
   would fail. Docker sets a named volume's ownership only when it creates the volume. A host whose
   volumes were created by a release that ran as a different UID needs a one-time chown.

   Take the safety backup before `down`: a manual backup does not start PostgreSQL. Switch the tag
   first, so the backup runs on the new image:

   ```bash
   env=prod                          # or staging
   just stack "$env" tag YES <tag>
   sudo chown -R 65532:65532 "${BACKUP_HOST_DIR:-./backups}"   # a host bind: safe with the stack up
   just backup "$env" manual         # tagged, so retention cannot expire it
   just stack "$env" down YES
   # Run as uid 0 in a container, so the host needs no knowledge of where Docker keeps volumes.
   for volume in user_uploads restic_cache; do
       docker run --rm --user 0 -v "relab_${env}_${volume}:/mnt" \
           busybox chown -R 65532:65532 /mnt
   done
   just stack "$env" up YES migrations
   ```

### First backup

The backup container runs as UID 65532. Create the restic directory before the first backup. The
service refuses to start without it (`create_host_path: false`), so Docker cannot create an empty
directory that looks like a real mount.

Creating the restic repository is a separate, one-time step: backup runs never create one.
"Backup repository" in `deploy/DEPLOY-PROD.md` explains why. Do not run `backup-init` on a host that
already has backups.

```bash
mkdir -p "${BACKUP_HOST_DIR:-./backups}/restic"
sudo chown -R 65532:65532 "${BACKUP_HOST_DIR:-./backups}"
just backup-init prod     # one time only: creates the repository, marks the uploads volume
just backup prod          # takes the first snapshot
just restore-check prod   # restores that snapshot: DB into a scratch container, uploads into a scratch dir
```

The repository is encrypted with `secrets/prod/restic_password`. Never rotate it: every later
snapshot depends on it.

Before anything destructive, take a tagged backup with `just backup prod manual`. The `manual` tag
is exempt from retention. An untagged copy is not safe: as snapshots age, retention keeps only the
newest one per calendar day, so it can expire the same day.

### Scheduling backups

Starting the stack does **not** schedule backups. A systemd timer on the host runs the one-shot
backup service every hour. A second, daily timer does repository upkeep: retention, the integrity
check, and the offsite copy. Install all four scheduled jobs (backup, backup-maintenance, watchdog,
restore-check) once per environment. The installer renders the committed units with this host's
checkout path, deploy user, and `just` location, then enables the timers:

```bash
just timers-render                        # inspect what will be installed
just timers-install staging               # renders, installs, enables (prompts for sudo; not `sudo just`)
systemctl list-timers 'relab-*@staging.timer'   # confirm NEXT times are scheduled
```

The installer also seeds `/etc/relab/relab.env` with empty `PING_*` URLs. Fill in `PING_WATCHDOG`
with a [healthchecks.io](https://healthchecks.io) check URL. The hourly watchdog reports every other
job's state through it; the other three URLs are optional per-job checks. Until you fill it in, job
failures are invisible outside the host, and `just watchdog <env>` reports that. So does a host
without the timers.

With a dedicated deploy user, run the installer from an account with sudo:
`RELAB_UNIT_USER=<user> just timers-install <env>`.

### Optional WebDAV offsite backups

The offsite copy is a second restic repository, copied from the local one over restic's rclone
backend. Do not mirror the repository directory with rsync or rclone yourself.

1. Write `secrets/<env>/rclone.conf` with exactly one WebDAV remote. The remote's root is the
   repository: the backup uses it as `rclone:<remote>:`, with no path. `just deploy-secrets-check`
   warns while the file still holds the placeholder.

   The daily maintenance job then copies snapshots offsite. It creates the offsite repository on
   its first run.

1. To copy snapshots on demand, for example right after a one-off local backup:

   ```bash
   just backup-offsite-copy staging
   ```

### Optional: central telemetry

Prod and staging can ship to a central monitoring stack (Grafana, Loki, Tempo, and Prometheus).
Set `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLP_AUTH_TOKEN`, and `TELEMETRY_EDGE_KEY` in the host's root
`.env`; your monitoring operator supplies them. `just stack <env> up` then includes
`compose.telemetry.yml`. Hosts without the endpoint ship nothing, and `docker logs` stays the only
log path.

[Deployment and operations](/operations/deployment/#telemetry) describes each variable and how the
Alloy agent is sandboxed.

## Raspberry Pi camera plugin

For camera-assisted capture, install the
[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin) with its
[install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md). The
Pi connects outbound to the backend over a WebSocket relay, so it needs no public IP or port
forwarding. Set `PAIRING_BACKEND_URL` on the Pi, then pair it as the
[platform camera guide](/user-guides/rpi-cam/) describes.

## Need help?

- Source code: [github.com/CMLPlatform/relab](https://github.com/CMLPlatform/relab)
- Contact: [info@r9lab.io](mailto:info@r9lab.io)
