# Operating the staging host

Everything needed to run staging. Self-contained — nothing here depends on the
cutover runbooks, which are deleted once the MVP migration is done.

Staging shares `compose.deploy.yaml` with production, so this doubles as the
rehearsal for [DEPLOY-PROD.md](DEPLOY-PROD.md): a step that has only ever run on prod
has never actually been tested.

______________________________________________________________________

## Part 1 — First-time host setup

Identical in shape to [DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1, with `staging`
substituted for `prod` throughout. Read that section for the reasoning — the failure
modes, the ownership traps, and the three quiet ways an offsite credential can be
wrong are the same. In short:

```bash
mkdir -p "${BACKUP_HOST_DIR:-./backups}/restic"
sudo chown -R 1001:1001 "${BACKUP_HOST_DIR:-./backups}"
just backup-run staging
just backup-restore-smoke staging

just timers-install staging   # backup + watchdog + restore-check timers
```

Then fill in `/etc/relab/relab.env` with staging's own healthchecks.io URLs. Do not
reuse prod's — a shared check cannot tell you which host went quiet. See
[DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1.2 for why the ping exists alongside Grafana.

Set telemetry the same way as prod ([DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1.5):
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLP_AUTH_TOKEN`, `TELEMETRY_EDGE_KEY` and
`OTEL_EXPORTER_OTLP_PROTOCOL` in the root `.env`. Staging and prod may share the collector; they are
separated by the `env` resource attribute, which Compose derives from `ENVIRONMENT`, so nothing
needs configuring for that beyond using the right host's `.env`.

Staging's offsite remote is named `surfdrive_staging` and its committed repository is
`rclone:surfdrive_staging:` — a SURFdrive share link scoped to staging's own folder, so
staging cannot reach prod's. The remote name is the only committed thing distinguishing
the two, which is what makes a misplaced `rclone.conf` fail loudly.

______________________________________________________________________

## Part 2 — Routine release

```bash
cd /path/to/relab
git fetch origin && git checkout main && git pull --ff-only

just staging-build
just staging-up YES scanning migrations
```

Add `scanning` only if `MALWARE_SCAN_ENABLED` is not `false` in the root `.env` —
`staging-up` refuses to start on the mismatch. Staging is also the reasonable place to
run *without* ClamAV if the host is short on RAM; it needs 3–4 GiB.

Backups are not started by `up`; they run from `relab-backup@staging.timer`.

### Verify

```bash
just watchdog staging
just staging-logs
```

______________________________________________________________________

## How staging differs from prod

These are the reasons the two documents are not one:

- **`just staging-migrate` seeds dummy data.** `prod-migrate` does not. Never point a
  staging recipe at prod.
- **No outage discipline.** Staging can be torn down and rebuilt at will; prod cannot.
- **The data is disposable, the procedure is not.** What is being rehearsed here is the
  sequence of commands, not the rows.
- **Cloudflare is adopted for staging** (prod was not, as of 2026-08-19). Edge changes
  go through `just cloudflare-plan staging` before apply, never as part of a deploy.
- **Backups still matter.** Staging's repository and offsite copy exist and are
  monitored. A backup path that only works in prod has not been rehearsed.

## Rebuilding from scratch

The one host where this is cheap, and the honest test of whether the deploy path works
on a clean machine:

```bash
just staging-down YES scanning
docker volume rm relab_staging_database_data   # destroys staging data — intended
just staging-up YES scanning migrations
```

If that needs an undocumented manual step, prod will need it too — write it into
[DEPLOY-PROD.md](DEPLOY-PROD.md) rather than remembering it.
