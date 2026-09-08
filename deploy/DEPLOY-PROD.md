# Operating the production host

What is specific to the CML production host: one-time host setup, the routine release loop, and
recovery. The generic procedure (env files, secrets, first start, timers, offsite, telemetry) is the
install guide, `docs/src/content/docs/operations/install.md`; this file does not repeat it.

Staging equivalent: [DEPLOY-STAGING.md](DEPLOY-STAGING.md). Rehearse there first.

______________________________________________________________________

## Part 1 — First-time host setup

Once per machine, not per release. `just watchdog prod` reports each missing piece as a distinct
alert.

### 1.0 Docker daemon log rotation (fallback)

The Compose files cap every stack service's logs (`max-size: 10m`, `max-file: 3`). Set the same
defaults host-wide so a container started outside the stack (a debug `docker run`, a second project)
cannot fill the disk either. Merge into `/etc/docker/daemon.json` (add the key to an existing
file, do not replace it), then restart dockerd in a maintenance moment. Daemon defaults apply only to containers created afterwards:

```json
"log-driver": "json-file",
"log-opts": { "max-size": "10m", "max-file": "3" }
```

Skipping this loses nothing for the stack itself; the compose caps stay authoritative.

### 1.1 Backup repository

Follow "First backup" in the install guide (`mkdir`/`chown 1001`, `just backup prod`,
`just restore-check prod`).

`BACKUP_HOST_DIR` is one value shared by every stack on the host, so two environments on one machine
would share a restic directory. It fails closed, but only one of them gets backups. Give each host a
single environment.

**Before anything destructive, take a tagged backup:** `just backup prod manual`. Retention keeps
only the newest snapshot per calendar day once snapshots age, so an untagged safety copy can expire
the same day it was taken.

### 1.2 Scheduled jobs

```bash
just timers-install prod      # render, install, enable, start (needs sudo)
```

| Job                             | When             | Catch-up                                                |
| ------------------------------- | ---------------- | ------------------------------------------------------- |
| `relab-backup@prod`             | hourly           | yes: an hour missed while the host was off runs at boot |
| `relab-backup-maintenance@prod` | 02:30 daily      | yes: a night missed while the host was off runs at boot |
| `relab-watchdog@prod`           | hourly           | no: a missed check self-heals within the hour           |
| `relab-restore-check@prod`      | 06:00 on the 1st | yes                                                     |

### How a failed job reaches you

The installer seeds `/etc/relab/relab.env` (mode 0600, never committed) with one dead-man's-switch
URL variable per job. Only `PING_WATCHDOG` has to be filled in: the hourly watchdog checks every
other job's timer state, last result and staleness, and puts a failing job's own output in the
alert body. The other three are optional; set one to give that job its own healthchecks.io check,
and never share a URL between jobs, or the hourly job's pings mask the monthly job's silence:

```ini
PING_WATCHDOG=https://hc-ping.com/...           # required; period 1 hour, grace 30 min
PING_BACKUP=                                    # optional; period 1 hour
PING_BACKUP_MAINTENANCE=                        # optional; period 1 day
PING_RESTORE_CHECK=                             # optional; period 35 days
```

Each job with a URL pings on success, and on failure pings `/fail` with its own output as the body,
so the alert carries the reason. An empty URL disables that job's ping without failing the job. The failure
body puts job output (hostnames, paths, restic summaries) in a third party's hands.

The deploy user needs docker-group membership, which is root-equivalent: these units run a writable
git checkout as unattended, scheduled, root-level jobs. Treat that directory as privileged.

### 1.3 Offsite copy

SURFdrive over WebDAV, reached with a **share-link credential scoped to one folder**, not an account
app password. App passwords grant whole-account access, so two of them would give staging delete
authority over production's only off-host copy. A share link cannot leave its folder.

In SURFdrive: create prod's folder, share it as a link with **edit** permission, set a share
password, leave expiry **off** (an expiring link stops backups silently). The token is the last path
segment of the share URL.

Then write `secrets/prod/rclone.conf` (`just deploy-secrets-template prod` seeds a placeholder). The
remote **must** be named `surfdrive_prod`:

```ini
[surfdrive_prod]
type = webdav
url = https://surfdrive.surf.nl/public.php/webdav
vendor = nextcloud
user = <share token — the token only, NOT the full share URL>
pass = <output of: rclone obscure '<share password>'>
```

Two details fail differently:

- `pass` must be obscured (`rclone obscure`), not plaintext. Fails loudly.
- `user` is the token alone. The full share URL gives a 401.

The backup copies to `rclone:surfdrive_prod:`, the file's one remote with an empty path, because a
share link's WebDAV root *is* the shared folder, and a path appended to it would create a second,
empty repository nested inside the real one. There is no override: the conf's one remote is the
offsite target.

```bash
just deploy-secrets-check   # reports if the remote is still undefined
```

> If you add periodic `restic check --read-data-subset`: there is **no official cadence
> recommendation** for it. The commonly repeated "1/12 monthly" is forum folklore, not upstream
> guidance. Pick a cadence and write down why.

**This does not give immutability.** restic must delete in order to prune, so no credential
arrangement makes the offsite copy append-only. A compromised share token can erase prod's off-host
backups, leaving the local repository as the only copy. Object-lock storage (B2, Wasabi, S3) or a
restic REST server with `--append-only` is the only real defence; WebDAV is neither.

### 1.4 What the watchdog checks

`just watchdog prod` runs hourly from the timer above; run it by hand after any change. It checks:

- every stack service (running, and healthy where a healthcheck exists)
- newest snapshot age
- free space on the filesystem holding the restic repository (alerts at 85% used;
  `BACKUP_DISK_ALERT_PCENT` overrides)
- all four scheduled-job timers (installed, enabled, active, last run not failed, last trigger not
  overdue)
- that `PING_WATCHDOG` is filled in
- deployment drift (uncommitted changes, or commits that exist nowhere else)
- that telemetry exports reach the collector

It exits non-zero with one `ALERT[...]` line per problem. The hourly dead-man's switch reports that
exit code, so a failing check surfaces as a missed or failed ping.

The telemetry check probes from inside the api container, so it tests the credentials that container
ships with. It separates two failure modes fixed in different systems: a `cf-mitigated` response
means Cloudflare challenged the export (the skip rule is missing, or the two halves of the edge key
disagree, §1.5); a 401/403 without it means the collector rejected the bearer token. Both are
otherwise silent: the SDK logs an export error and the application carries on serving traffic.

**Do not delete the service-health, snapshot-age or timer checks until the central monitoring
stack's `ProjectTelemetrySilent` and container-lifecycle rules are live and verified for this
environment.** Live means bootstrap has been run for it (§1.5), not merely that the stack has the
rules. Until then this script is the only detector for those failures. See CMLPlatform/monitoring,
ADR 0002.

### 1.5 Telemetry

Set these four in the host's root `.env`. The endpoint and token come from the monitoring stack
operator (github.com/CMLPlatform/monitoring); the edge key is shared with whoever runs
`infra/cloudflare-zone` (`TF_VAR_telemetry_edge_key` must carry the same value):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.cml-relab.org
OTLP_AUTH_TOKEN=<bearer token>
TELEMETRY_EDGE_KEY=<edge key>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

`TELEMETRY_EDGE_KEY` is shared by every CML project shipping to `otel.`, so rotate it together with
`TF_VAR_telemetry_edge_key` in `infra/cloudflare-zone` and every other spoke's `.env`. The
symptom of a mismatch: every export 403s with a `cf-mitigated` header.

**Then run `./bootstrap.sh <project> <env>` on the monitoring host, in the same change.** Setting
the endpoint starts telemetry flowing; bootstrap creates the rule that notices when it *stops*.
Nothing on this host can tell you that rule is missing. The arguments must match `PROJECT` and
`ENVIRONMENT`, which the deploy recipes set (`relab` and the recipe's environment); those are the
label values the rule matches on.
Bootstrap also prints the `.env` block and the commands that vendor the agent files at a pinned tag.

CML hosts with an NVIDIA card set `GPU_METRICS=1`.

Verify the whole path end to end with a real job:

```bash
just backup prod
```

Then look for `service.name=backup` and the line `Backup run completed` in Grafana.

______________________________________________________________________

## Part 2 — Routine release

Hosts set up before 2026-09-07 need a one-time `.env` edit before the next release: add
`ENVIRONMENT`, the four `*_PUBLIC_URL`s, and `FEATURED_PRODUCT_ID` (values were in the deleted
`deploy/env/<env>.compose.env`), and drop `RESTIC_OFFSITE_REPOSITORY` (retired 2026-09-08; the
offsite target is the one remote in `secrets/<env>/rclone.conf`). Until then every
`just prod-*` recipe and the backup timers exit 2.

Before you start: CI green on `main`, you know whether the release contains migrations
(`cd backend && uv run alembic history -r <current>:head`), and you have a fresh backup
(`just backup prod`).

```bash
cd /path/to/relab
git fetch origin && git checkout main && git pull --ff-only

just prod-build
just prod-up YES migrations   # migrator runs, THEN the API starts
```

The `migrations` profile is the routine path: the API waits for the migrator to exit 0, so a failed
migration leaves the old API serving. Without it you get a two-step that briefly serves against the
old schema, acceptable during a planned outage, not for a routine release.

`up` adds the `scanning` profile itself unless `MALWARE_SCAN_ENABLED=false` in the root `.env`.

### Verify

```bash
just watchdog prod
just prod-logs        # ^C once it looks clean
```

Then exercise by hand what automation cannot: one upload, one OAuth login, one product page.

______________________________________________________________________

## Part 3 — Recovery

Migrations commit one revision at a time (`transaction_per_migration=True` in
`backend/alembic/env.py`), so a failed migrate leaves `alembic_version` at the last revision that
succeeded, and a re-run resumes from there. Fix forward where possible.

Every `just prod-build` tags its images with the commit sha of the checkout it built (unrelated to
the alembic revision, which names the schema), so a release can be rolled back without a rebuild.
The newest five sha tags per image are kept; `KEEP_SHA_TAGS=<n>` on the build changes that.

```bash
docker images 'relab-backend' --format '{{.Tag}}' | grep prod-   # the shas available
just prod-rollback YES <sha>                    # code only: the new schema still suits the old code
just prod-rollback YES <sha> <alembic-revision> # also downgrade the schema to that revision
```

With a revision, the recipe first checks that no migration in the range dropped or rewrote data
(`scripts.maintenance.downgrade_safety`); a downgrade would re-create such objects empty, so it
refuses and points at the backup instead. Then it stops the API, runs `alembic downgrade`, retags,
and starts the stack. Find the revision with `cd backend && uv run alembic history`. A migration whose destructive
statement is harmless declares `ROLLBACK_SAFE = True`; without it the check fails closed, including
on dynamic SQL it cannot read.

Otherwise the backup is the recovery path:

```bash
just restore-check prod    # proves the snapshot loads, into a scratch DB
```

For a real restore, pick the snapshot and restore it into the live database:

```bash
just snapshots prod           # read-only; ids, dates, and dump sizes
just restore prod YES <id>    # stops the api, restores, restarts it
```

Look at the sizes before choosing. `latest` is the default and is usually right, but it is wrong
when the most recent backup is the damage. `just restore` drops schema `public` and replaces it, so
it refuses to run without `YES`, and it asserts the restored database has rows and not merely tables
before reporting success. It then re-runs `deploy/postgres/initdb/provision.sh`, because the dump
does not carry back the default privileges that let `relab_app` read tables future migrations
create. (`prod-up` runs the same script on every start, so a volume that predates a change to it
converges on the next release.)

Do not run `just cloudflare-apply prod` as part of a deploy. The edge is managed separately, and
prod's adoption state is its own decision.
