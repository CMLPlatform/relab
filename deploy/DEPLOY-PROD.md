# Operating the production host

What is specific to the CML production host: one-time host setup, the routine release loop, and
recovery. The generic procedure (env files, secrets, first start, timers, offsite, telemetry) is the
install guide, `docs/src/content/docs/operations/install.md`; this file does not repeat it.

Staging equivalent: [DEPLOY-STAGING.md](DEPLOY-STAGING.md). Rehearse there first.

______________________________________________________________________

## Part 1: First-time host setup

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

Follow "First backup" in the install guide (`mkdir`/`chown 65532`, `just backup-init prod`,
`just backup prod`, `just restore-check prod`).

**The repository is never created automatically.** Create it once, before the first backup:

```bash
just backup-init prod
```

That also stamps the uploads volume with `.relab-volume`, naming its environment. A backup then
refuses to run if the marker is missing or wrong: a deleted volume returns silently empty and the
API refills it at startup, so existence alone proves nothing about the data inside. Do not re-run
`backup-init` to silence this — it fails against an existing repository.

**Marker missing, and the volume already has real uploads in it:** this host was deployed before
the marker existed. Rebuild first, then stamp, then take the first marked snapshot:

```bash
just stack prod build            # the guard ships inside the backup image, not the checkout
just backup-stamp-volume prod    # writes .relab-volume; safe to re-run, never overwrites
just backup prod                 # first snapshot carrying the marker
just timers-install prod         # re-render the units
```

`just backup` runs the script baked into `relab-backup:prod-local` (`backend/Dockerfile.backups`
copies it in), not the one in the checkout, and no backup recipe builds that image. Pull the new
code without rebuilding and the stamp lands while every guard stays inert: the run archives, the
snapshot carries the marker, and nothing checks it.

The rebuilt image says so in its own log. A guarded run reports each tag by name:

```text
postgres size 267556 bytes (100% of previous); archiving
user-uploads size 355234816 bytes (100% of previous); archiving
```

`Dump size ...` with no `user-uploads` line means the container is still on the old image; rebuild
and run it again.

`just backup` has to happen before the next `relab-restore-check@` fires — restore verification
enforces the marker strictly, so a check landing between the stamp and the first marked snapshot
fails against the pre-marker one. `systemctl list-timers relab-restore-check@prod` gives the slack.

**Marker missing, and the volume is genuinely empty:** the volume lost its contents or was
replaced. No `just` recipe restores uploads live (`restore-check` only targets a scratch directory;
`just restore` is Postgres-only), so restore by hand into the compose-managed volume
(`relab_prod_user_uploads`); restic's `--target` restores under the absolute backed-up path
(`/data/uploads`), hence the two-step copy below.

Put the scratch directory on the backup disk, not `/tmp` — a full restore there can fill the disk
Postgres and Docker use, and the watchdog only checks `BACKUP_HOST_DIR`. It must be writable by uid
65532 (the backup image's uid); `--no-lock` is required because the repository mounts read-only.

```bash
just stack prod down YES
SCRATCH="${BACKUP_HOST_DIR:-./backups}/uploads-restore"
mkdir -p "$SCRATCH"
docker run --rm -v "$SCRATCH:/restore" --entrypoint chown alpine:3.22 -R 65532:65532 /restore
docker run --rm \
  -v "${BACKUP_HOST_DIR:-./backups}/restic:/restic:ro" \
  -v "$(pwd)/secrets/prod/restic_password:/run/secrets/restic_password:ro" \
  -v "$SCRATCH:/restore" \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic_password \
  --entrypoint restic relab-backup:prod-local \
  restore --no-lock latest --repo /restic --tag user-uploads --target /restore
docker run --rm \
  -v relab_prod_user_uploads:/data/uploads \
  -v "$SCRATCH:/restore:ro" \
  --entrypoint sh relab-backup:prod-local -c \
  'rm -rf /data/uploads/* && cp -a /restore/data/uploads/. /data/uploads/'
docker run --rm -v "$SCRATCH:/restore" --entrypoint chown alpine:3.22 -R "$(id -u):$(id -g)" /restore
rm -rf "$SCRATCH"
just stack prod up YES
```

The restored tree carries the marker of whichever environment it was backed up from — `just
backup-stamp-volume prod` cannot fix that (it never overwrites), so rewrite it by hand if the source
snapshot was another environment's:

```bash
docker run --rm -v relab_prod_user_uploads:/data/uploads --entrypoint sh relab-backup:prod-local -c \
  'printf prod >/data/uploads/.relab-volume.tmp && mv /data/uploads/.relab-volume.tmp /data/uploads/.relab-volume'
```

**Marker present but names another environment:** the wrong volume is mounted, typically a mistyped
`-p`/compose project. Re-point the mount; restoring here would overwrite correct data with the
wrong environment's.

A missing repository fails the backup with restic exit 10 rather than creating one — on purpose.
An empty directory for the wrong reason (a wrong `BACKUP_HOST_DIR`, a swapped disk) looks just like
a first run; auto-creating there would exit 0 after backing up into an empty repo on the wrong
filesystem, leaving the real archive unreachable.

**If an existing host starts reporting that the repository is not readable, do not run
`backup-init`.** That message means a repository that was working no longer is, and initializing
over it replaces the problem with an empty archive that reports success. Check `findmnt -T
"$BACKUP_HOST_DIR"`, then `secrets/prod/restic_password`. `backup-init` is for a host that has never
had a backup.

`BACKUP_HOST_DIR` is one value shared by every stack on the host, so two environments on one machine
would share a restic directory. It fails closed, but only one of them gets backups. Give each host a
single environment.

**Before anything destructive, take a tagged backup:** `just backup prod manual`. Retention keeps
only the newest snapshot per calendar day once snapshots age, so an untagged safety copy can expire
the same day it was taken.

### 1.2 Scheduled jobs

```bash
just timers-install prod      # render, install, enable, start (prompts for sudo; not `sudo just`)
```

The units run as whoever runs that command. On a host with a dedicated, sudo-less deploy user,
run it from an account that has sudo and name the deploy user; the units then run as it, own
`/etc/relab/relab.env`, and find its per-user `uv` through the rendered `PATH`:

```bash
RELAB_UNIT_USER=relab just timers-install prod
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

**This does not give immutability.** restic must delete to prune, so no credential setup makes the
offsite copy append-only: a compromised share token can erase prod's off-host backups, leaving the
local repository the only copy. Real protection needs object-lock storage (B2, Wasabi, S3) or a
restic REST server with `--append-only` — WebDAV offers neither.

### 1.4 What the watchdog checks

`sudo -u relab just watchdog prod` runs hourly from the timer above; run it by hand after any
change, as the deploy user (1.6) so it sees the checkout the way the timer does. Its timer
checks read systemd's `Result` of each unit's **last run**, so after fixing a job, clear the alert by
running the unit (`sudo systemctl reset-failed relab-backup-maintenance@prod.service && sudo
systemctl start relab-backup-maintenance@prod.service`), not the `just` recipe, which systemd never
sees. `reset-failed` also lifts the start-rate limit that a few consecutive timer failures trip,
which otherwise refuses a manual start too.

That applies to a crash. Exit 3 differs: the unit refused to archive on purpose (an emptied uploads
volume, a collapsed dump, a missing or mismatched marker), and `RestartPreventExitStatus=3` stops
`relab-backup@.service` retrying. `reset-failed` clears the alert, not the cause — it refuses again
until the guard's trigger is fixed (see 1.1). It checks:

- every stack service (running, and healthy where a healthcheck exists)
- newest snapshot age
- free space on the filesystem holding the restic repository: alerts at 85% used
  (`BACKUP_DISK_ALERT_PCENT`) **or** under 25 GiB free (`BACKUP_DISK_MIN_FREE_GB`, 0 disables).
  Whichever threshold is crossed first triggers the alert — usually the percentage on a large disk;
  the floor covers a repository sharing a small filesystem with the database or the Docker data
  root.
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

### 1.6 A deploy user and a restricted key

The host runs prod from a checkout nobody edits, as a sudo-less account, and is only ever *reached*
from the dev host; agents, credentials and working trees stay on the dev host.

**Run recipes as that account: `sudo -u relab just <recipe> prod`.** Plain `sudo just` runs as root,
which git refuses against a checkout `relab` owns — the watchdog's drift check then reports the
directory as not a checkout at all. `just timers-install` is the one exception and inverts the rule:
it refuses to run as root and calls `sudo` itself, so run it from your own sudo-capable account as
`RELAB_UNIT_USER=relab just timers-install prod`. `sudo -u relab` fails there, because `relab` is a
system account with no password to answer that inner prompt.

```bash
sudo useradd --system --create-home --home-dir /var/lib/relab --shell /bin/bash --groups docker relab
sudo git clone https://github.com/CMLPlatform/relab.git /opt/relab
sudo chown -R relab:relab /opt/relab
sudo -u relab sh -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'   # ~/.local/bin/uv; `uv self update` to move it
sudo install -o relab -g relab -m 600 <old checkout>/.env /opt/relab/.env
sudo install -d -o relab -g relab -m 700 /opt/relab/secrets/prod
sudo install -o relab -g relab -m 644 <old checkout>/secrets/prod/* /opt/relab/secrets/prod/
RELAB_UNIT_USER=relab just timers-install prod                            # from /opt/relab, as the sudo account
```

Then one key pair on the dev host, used for nothing else, and one `authorized_keys` line for the
deploy user whose forced command is `scripts/remote_deploy.sh`. The script maps a short allow-list
onto the `just` recipes and refuses anything else, so the key cannot open a shell or read a secret:

```text
command="/opt/relab/scripts/remote_deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... devbox-deploy
```

The environment is the host's own root `.env`; it is never an argument. The repository is public,
so `git pull` over https needs no credential; a private repository would need a read-only GitHub
deploy key in `/var/lib/relab/.ssh` with the remote switched to ssh. The personal key stays on the
sudo account and never on the deploy user.

______________________________________________________________________

## Part 2: Routine release

Before you start: CI green on `main`, you know whether the release contains migrations
(`cd backend && uv run alembic history -r <current>:head`), and you have a fresh backup
(`just backup prod`).

From the dev host, over the restricted key (`relab-prod` here is an ssh config alias for the
deploy user on the prod host):

```bash
ssh relab-prod pull                 # git pull --ff-only of origin/main, prints the revision
ssh relab-prod build                # `build nocache` when only the edge or the featured product changed:
ssh relab-prod up migrations        # www bakes API data in at build time, and the layer cache would skip it
```

`ssh relab-prod` with no command prints the allow-list. On the host itself the same three steps
are `git pull --ff-only`, `just stack prod build`, `just stack prod up YES migrations` as the deploy user.

The `migrations` profile is the routine path: the API waits for the migrator to exit 0, so a failed
migration leaves the old API serving. Without it you get a two-step that briefly serves against the
old schema, acceptable during a planned outage, not for a routine release.

A migrator that stops on an unresolvable revision means the database's `alembic_version` predates
the 2026-09-08 flatten: nothing is corrupted, but the chain no longer contains that id. Bring the
host to `a9c2e4f60b18` on a release from before the flatten, or restore from backup, then re-run.

`up` adds the `scanning` profile itself unless `MALWARE_SCAN_ENABLED=false` in the root `.env`.

The migrator also completes any missing image thumbnails. That step is best-effort, so if its log
says the thumbnail backfill failed (or product lists are serving full-size originals as card
images), run the migrations profile again: `just stack <env> up YES migrations`. It resumes where
it stopped and is safe to run repeatedly. The maintenance scripts ship in the migrations image, not
the API one, so there is no `scripts/` to reach in a running `api` container.

The same step is what gives images uploaded before a new width its derivative: adding a width to
`THUMBNAIL_WIDTHS` leaves existing rows stamped, so clear the stamp on the rows that should gain it
before re-running.

```sql
UPDATE image SET thumbnails_generated_at = NULL WHERE width_px > 2560 OR width_px IS NULL;
```

`width_px` is nullable and `NULL > 2560` is not true, so without the second clause a row whose
width was never recorded is skipped without a word. Including rows that turn out to be narrower
costs nothing: the backfill selects on the stamp alone and re-reads each original's width from the
file, then stamps a row that needs no new derivative.

### Releases that need a window

Three things stretch a release beyond the time the commands take.

**A backfill migration holds the API down for its whole duration.** The `migrations` profile gates
the API on `service_completed_successfully`, so a release whose migrator backfills existing rows
(regenerating derivatives, recomputing a column) keeps `api` and the tunnel in `Created` until it
finishes, however long that is. Check for one before you start: run `alembic history` as above, and
read what the migrator does, not just whether it exists. Announce the window from what you find
there, not from the first 100% CPU reading during the release.

**A snapshot needs the stack up, and must precede the checkout.** `just backup <env> manual` runs
with `--no-deps` on purpose: the timer must never start postgres as a side effect. So the safety
snapshot cannot be taken after `down`. Any change to what the containers run as (a uid change, an
ownership change) takes effect the moment the checkout moves, because the Compose `user:` pin
overrides the image's own `USER`. Between checkout and the matching `chown`, every backup run
fails. Docker seeds a named volume's ownership only when it first creates the volume, so a volume
carried over from an earlier release keeps that release's uid however many times you rebuild. The
order that works:

```bash
env=prod                          # or staging
just stack "$env" build           # safe with the stack up; the snapshot then runs on the new image
# The restic repository is a host bind, so it can be chowned with the stack still up.
sudo chown -R 65532:65532 "${BACKUP_HOST_DIR:-./backups}"
just backup "$env" manual         # tagged, so retention cannot expire your rollback
just stack "$env" down YES
# The named volumes a running service would have been writing. Run as uid 0 inside the
# image so the host needs no knowledge of where Docker keeps the volume.
for volume in user_uploads restic_cache; do
    docker run --rm --user 0 -v "relab_${env}_${volume}:/mnt" \
        "relab-backend:${env}-local" chown -R 65532:65532 /mnt
done
just stack "$env" up YES migrations
```

`up` probes those three mounts as the services that write them before it starts anything, and
refuses to continue when one is unwritable, naming the volume and the command above. Reads and
`stat` succeed on a wrongly-owned volume, so without that probe the deploy reports success and
only uploads and backups fail.

**Restart every timer you stopped.** Stopping the backup and maintenance timers for a window means
stopping the watchdog too, or it pages mid-window. A stopped watchdog cannot then tell you the
others are still stopped. The dead man's switch is the backstop: with no ping, the external check
fires after its grace period. Do not rely on it. Run `systemctl is-active` on all three before you
close the window.

### Verify

```bash
ssh relab-prod watchdog
ssh relab-prod status
ssh relab-prod logs 10m     # non-following; `just stack prod logs` on the host follows
```

Then exercise by hand what automation cannot: one upload, one OAuth login, one product page.

______________________________________________________________________

## Part 3: Recovery

Migrations commit one revision at a time (`transaction_per_migration=True` in
`backend/alembic/env.py`), so a failed migrate leaves `alembic_version` at the last revision that
succeeded, and a re-run resumes from there. Fix forward where possible.

Every `just stack prod build` tags its images with the commit sha of the checkout it built (unrelated to
the alembic revision, which names the schema), so a release can be rolled back without a rebuild.
The newest five sha tags per image are kept; `KEEP_SHA_TAGS=<n>` on the build changes that.

```bash
docker images 'relab-backend' --format '{{.Tag}}' | grep prod-   # the shas available
just stack prod rollback YES <sha>                    # code only: the new schema still suits the old code
just stack prod rollback YES <sha> <alembic-revision> # also downgrade the schema to that revision
```

With a revision, the recipe first checks that no migration in the range dropped or rewrote data
(`scripts.maintenance.downgrade_safety`); a downgrade would re-create such objects empty, so it
refuses and points at the backup instead. Then it stops the API, runs `alembic downgrade`, retags,
and starts the stack. Find the revision with `cd backend && uv run alembic history`.

History was flattened at `a9c2e4f60b18` on 2026-09-08; revisions older than that no
longer resolve, so a schema rollback can only target that id or a newer one.

A migration whose destructive
statement is harmless declares `ROLLBACK_SAFE = True`; without it the check fails closed, including
on dynamic SQL it cannot read.

Otherwise the backup is the recovery path:

```bash
just restore-check prod    # proves the snapshot loads: DB into a scratch container, uploads into a scratch dir
```

For a real restore, pick the snapshot and restore it into the live database:

```bash
just snapshots prod           # read-only; ids, dates, and dump sizes
just restore prod YES <id>    # stops the api, restores, restarts it
```

These restore Postgres only. User uploads need a separate manual restore; see "Marker missing, and
the volume is genuinely empty" in 1.1.

Look at the sizes before choosing. `latest` is the default and is usually right, but it is wrong
when the most recent backup is the damage. `just restore` drops schema `public` and replaces it, so
it refuses to run without `YES`, and it asserts the restored database has rows and not merely tables
before reporting success. It then re-runs `deploy/postgres/initdb/provision.sh`, because the dump
does not carry back the default privileges that let `relab_app` read tables future migrations
create. (`just stack <env> up` runs the same script on every start, so a volume that predates a
change to it converges on the next release.)

Do not run `just cloudflare-apply prod` as part of a deploy. The edge is managed separately
(`infra/cloudflare/`, prod workspace adopted 2026-09-08); the tunnel's ingress rules live there,
so a renamed Compose service needs a plan and apply, not a dashboard edit.
