# Operating the production host

Everything needed to run prod: one-time host setup, the routine release loop, and
recovery. Self-contained — nothing here depends on the cutover runbooks, which are
deleted once the MVP migration is done.

Staging equivalent: [DEPLOY-STAGING.md](DEPLOY-STAGING.md). Rehearse there first.

______________________________________________________________________

## Part 1 — First-time host setup

Once per machine, not per release. `just watchdog prod` reports each of these as a
distinct alert if it is missing, so an incomplete setup is not silent.

### 1.1 Backup repository

Create the bind-mount directory **before** first use. If Docker creates it, it comes
up root-owned and the backup container (uid 1001) cannot initialize the repository:

```bash
mkdir -p "${BACKUP_HOST_DIR:-./backups}/restic"
sudo chown -R 1001:1001 "${BACKUP_HOST_DIR:-./backups}"

just backup-run prod             # initializes the repo and takes the first snapshot
just backup-restore-smoke prod   # needs that snapshot to exist
```

The repository is encrypted with `secrets/prod/restic_password`. **Never rotate it** —
every later snapshot depends on it.

`BACKUP_HOST_DIR` is one value shared by every stack on the host, so two environments
co-located on one machine would share a restic directory. It fails closed rather than
corrupting, but only one of them gets backups. Give each host a single environment.

### 1.2 Scheduled jobs

Three jobs run on a schedule: the nightly backup, an hourly watchdog, and a monthly
restore verification. All three are systemd timers — one mechanism, one place to look
(`systemctl list-timers`), and catch-up after downtime where it matters.

```bash
just timers-render            # inspect what will be installed
just timers-install prod      # render, install, enable, start (needs sudo)
```

`docker compose up` does **not** start backups; the backup service is a one-shot that
the timer runs and that exits. The committed units carry placeholders — the installer
substitutes this checkout, the deploy user, and the `just` location, the last because
systemd runs without a login `PATH`.

| Job                        | When             | Catch-up                                                 |
| -------------------------- | ---------------- | -------------------------------------------------------- |
| `relab-backup@prod`        | 02:30 daily      | yes — a night missed while the host was off runs at boot |
| `relab-watchdog@prod`      | hourly           | no — a missed check self-heals within the hour           |
| `relab-restore-check@prod` | 03:40 on the 1st | yes — this is why it is a timer and not cron             |

That last row is the reason not to use cron here: a monthly job skipped because the host
was down on the 1st would not run again for two months, and it is the only check that
proves a snapshot actually restores rather than merely exists.

### How a failed job reaches you

The installer seeds `/etc/relab/relab.env` (mode 0600, never committed) with one
dead-man's-switch URL per job. Fill them in from healthchecks.io — one check per job,
because sharing a URL lets the hourly job's pings mask the monthly job's silence:

```ini
RELAB_PING_BACKUP=https://hc-ping.com/...          # period 1 day
RELAB_PING_WATCHDOG=https://hc-ping.com/...        # period 1 hour
RELAB_PING_RESTORE_CHECK=https://hc-ping.com/...   # period 35 days
```

Each job pings on success, and on failure pings `/fail` with its own output as the body,
so the alert carries the reason. An empty URL disables that job's ping without failing
the job.

**Why this exists when everything else goes to Grafana.** Every other signal — container
logs, host metrics, application traces — leaves this host through Alloy to the central
collector. That means a dead host, a dead collector, a broken tunnel and an expired token
all look identical from Grafana: silence. The ping is a push *from* the host *to* an
outside endpoint, so it is the one mechanism that still reports when the observability
pipeline is itself the thing that broke. Its absence is the alarm, which is the failure
mode neither `MAILTO` nor a dashboard can report.

Keep it minimal on purpose. It carries no credentials beyond the URL, has nothing to
operate, and is not a second monitoring system — it answers exactly one question: *did
this job run and succeed?* Everything else belongs in Grafana.

Note the failure body puts job output — hostnames, paths, restic summaries — in a third
party's hands. That is the deliberate trade for an alert that names its own cause.

The deploy user needs docker-group membership, which is root-equivalent: these units run
a writable git checkout as unattended, scheduled, root-level jobs. Treat that directory
as privileged.

### 1.3 Offsite copy

SURFdrive over WebDAV, reached with a **share-link credential scoped to one folder**,
not an account app password. App passwords grant whole-account access, so two of them
would give staging delete authority over production's only off-host copy. A share link
cannot leave its folder. Verified working on SURFdrive 2026-08-19.

In SURFdrive: create prod's folder, share it as a link with **edit** permission, set a
share password, leave expiry **off** (an expiring link stops backups silently). The
token is the last path segment of the share URL.

Then write `secrets/prod/rclone.conf` (`just deploy-secrets-template prod` seeds a
placeholder). The remote **must** be named `surfdrive_prod`:

```ini
[surfdrive_prod]
type = webdav
url = https://surfdrive.surf.nl/public.php/webdav
vendor = nextcloud
user = <share token — the token only, NOT the full share URL>
pass = <output of: rclone obscure '<share password>'>
```

Three details fail differently, and two fail **quietly**:

- `pass` must be obscured (`rclone obscure`), not plaintext. Fails loudly.
- `user` is the token alone. The full share URL gives a 401.
- `RESTIC_OFFSITE_REPOSITORY` is `rclone:surfdrive_prod:` with an **empty path**,
  because a share link's WebDAV root *is* the shared folder. Appending a path creates a
  second empty repository nested inside the real one and backs up into it — succeeding,
  and reporting success, while the real archive sits untouched one level up.

The remote *name* carries the environment because the path no longer can. If staging's
`rclone.conf` reaches this host, `rclone:surfdrive_prod:` fails with "remote not found"
instead of writing prod snapshots into staging's repository. The value is committed in
`deploy/env/prod.compose.env`; never set it in the root `.env`, which is shared by every
stack on the host.

```bash
just deploy-secrets-check   # reports if the remote is still undefined
```

Until the remote is defined, each run logs a loud WARNING, **skips the offsite copy and
still succeeds** — deliberately, so a missing credential does not leave the alert
permanently red, which is the same as no alert. For an on-demand copy outside the
nightly cycle: `just backup-offsite-copy prod`.

**This does not give immutability.** restic must delete in order to prune, so no
credential arrangement makes the offsite copy append-only. A compromised share token can
erase prod's off-host backups, leaving the local repository as the only copy. Object-lock
storage (B2, Wasabi, S3) or a restic REST server with `--append-only` is the only real
defence; WebDAV is neither.

### 1.4 What the watchdog checks

`just watchdog prod` — run hourly by the timer above, and worth running by hand after
any change — checks API container health, newest snapshot age, the backup timer
(installed, enabled, active, last run not failed), and deployment drift (uncommitted
changes, or commits that exist nowhere else). It exits non-zero with one `ALERT[...]`
line per problem.

Its exit code is what the hourly dead-man's switch reports, so a failing check surfaces
as a missed or failed ping rather than as a line nobody reads.

### 1.5 Telemetry

Set these three in the host's root `.env`, from the monitoring stack operator
(github.com/CMLPlatform/monitoring):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.cml-relab.org
OTLP_AUTH_TOKEN=<bearer token>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

The endpoint is the on/off switch for the whole telemetry path. Setting it turns on the
API's own OpenTelemetry exporter **and** auto-includes `compose.logging.alloy.yaml`, a
Grafana Alloy agent that ships two things the API cannot report about itself:

- **container stdout** from every other service — postgres, redis, cloudflared, the
  three frontends, the backup one-shot — as logs, labelled by Compose service name;
- **host metrics** — CPU, memory, load, disk, network, and `hwmon` temperatures and fan
  speeds. That last one is not decoration: the incident that produced these runbooks was
  a backup crash-looping for 19 hours, noticed by ear from fan noise while every monitor
  read green.

One token, two consumers: Compose folds it into the SDK's percent-encoded header format
for the API, and Alloy reads it directly. There is no separate Loki push hostname — the
monitoring stack does not publish one, because Loki has no authentication of its own.

Alloy mounts the Docker socket (read-only) to attach container names to log lines, and
the host's `/proc`, `/sys` and `/` (read-only) for node metrics. Both are real grants:
anything that can reach the Docker socket can start a privileged container, and `/rootfs`
exposes the host filesystem for reading. It is no more than a host-installed
node_exporter running as root already has, but it is worth knowing rather than
discovering. The hardening step, if it ever matters, is a docker-socket-proxy restricted
to the container endpoints.

On a host with an NVIDIA card, add `GPU_METRICS=1` as well. That is the entire GPU
setup: the deploy recipes then include `compose.gpu.yaml`, Alloy discovers the exporter
over the Compose network and scrapes it, and utilisation, VRAM, temperature, power,
throttle reasons and XID faults start arriving under the same `host_name`. Nothing else
changes — a GPU host is one extra overlay, not a different design.

Verify the whole path end to end with a real job, which is also the fastest way to prove
discovery, labelling and export at once:

```bash
just backup-run prod
```

Then look for `service.name=backup` and the line `Backup run completed` in Grafana.

______________________________________________________________________

## Part 2 — Routine release

```bash
cd /path/to/relab
git fetch origin && git checkout main && git pull --ff-only

just prod-build                        # add `scanning` if ClamAV is enabled
just prod-up YES scanning migrations   # migrator runs, THEN the API starts
```

Before you start: CI green on `main`, you know whether the release contains migrations
(`cd backend && uv run alembic history -r <current>:head`), and you have a fresh backup
(`just backup-run prod`).

The `migrations` profile is the routine path: the API waits for the migrator to exit 0,
so a failed migration leaves the old API serving rather than starting a new one against
a schema that never changed. Without it you get a two-step that briefly serves against
the old schema — acceptable during a planned outage, not for a routine release.

Drop `scanning` only if `MALWARE_SCAN_ENABLED=false` in the root `.env`; `prod-up`
refuses to start on the mismatch rather than failing uploads closed at runtime.

### Verify

```bash
just watchdog prod
just prod-logs        # ^C once it looks clean
```

Then exercise by hand what automation cannot: one upload, one OAuth login, one product
page. Those three cover the paths most likely to break silently.

______________________________________________________________________

## Part 3 — Recovery

Migrations run in a single transaction, so a failed migrate leaves the schema untouched
at its previous revision. Fix forward where possible.

Code-only rollback, when the release added no migrations (or the new schema still suits
the old code). Every `just prod-build` also tags the result with the commit sha, so
rolling back is a `docker tag` rather than a rebuild:

```bash
docker images 'relab-*' --format '{{.Repository}}:{{.Tag}}' | grep prod-   # find the sha
for svc in backend www docs app; do
  docker tag "relab-$svc:prod-<sha>" "relab-$svc:prod-local"
done
just prod-up YES scanning
```

Or rebuild from the previous source, which is slower but needs no tag bookkeeping:

```bash
git checkout <previous-tag>
just prod-build && just prod-up YES scanning
```

Otherwise the backup is the recovery path:

```bash
just backup-restore-smoke prod    # proves the snapshot loads, into a scratch DB
```

For a real restore, stop the stack, restore the dump into the live database, and bring
it back up — rehearse this before you need it, using the smoke test as the template.

Do not run `just cloudflare-apply prod` as part of a deploy. The edge is managed
separately, and prod's adoption state is its own decision.
