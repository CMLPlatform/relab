# Operating the staging host

Everything needed to run staging. Nothing here depends on the cutover runbooks.

Staging shares `compose.deploy.yaml` with production, so this doubles as the rehearsal for
[DEPLOY-PROD.md](DEPLOY-PROD.md): a step that has only ever run on prod has never been tested.

______________________________________________________________________

## Part 1 — First-time host setup

Same as [DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1 with `staging` substituted for `prod`: the
install guide's "First backup" and "Scheduling backups", then `just timers-install staging`.

Then fill in `PING_WATCHDOG` in `/etc/relab/relab.env` with staging's own healthchecks.io URL.
Do not reuse prod's: a shared check cannot tell you which host went quiet. See
[DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1.2.

Set telemetry the same way as prod ([DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1.5):
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLP_AUTH_TOKEN`, `TELEMETRY_EDGE_KEY` and
`OTEL_EXPORTER_OTLP_PROTOCOL` in the root `.env`. Staging and prod may share the collector; the
`env` resource attribute, which Compose derives from `ENVIRONMENT`, separates them.

Staging needs **its own** `./bootstrap.sh relab staging` run on the monitoring host. Prod's rule
matches `env="prod"` and will not notice staging going quiet. Run it in the same change that turns
telemetry on; this host cannot tell you the rule is missing.

Staging's `rclone.conf` defines one remote, `surfdrive_staging`, a SURFdrive share link scoped to
staging's own folder; the backup copies to `rclone:surfdrive_staging:`.

______________________________________________________________________

## Part 2 — Routine release

Existing hosts need the one-time `.env` edit described in [DEPLOY-PROD.md](DEPLOY-PROD.md) Part 2.

```bash
cd /path/to/relab
git fetch origin && git checkout main && git pull --ff-only

just staging-build
just staging-up YES migrations
```

ClamAV starts unless `MALWARE_SCAN_ENABLED=false` in the root `.env`. It needs 3–4 GiB; staging can
run without it if the host is short on RAM.

Backups are not started by `up`; they run from `relab-backup@staging.timer`.

### Verify

```bash
just watchdog staging
just staging-logs
```

______________________________________________________________________

## How staging differs from prod

- **`just staging-migrate` seeds dummy data.** `prod-migrate` does not. Never point a staging
  recipe at prod.
- **No outage discipline.** Staging can be torn down and rebuilt at will.
- **The data is disposable, the procedure is not.**
- **Cloudflare is managed by OpenTofu for staging** but not yet for prod. Edge changes go through
  `just cloudflare-plan staging` before apply, never as part of a deploy.
- **Backups still matter.** Staging's repository and offsite copy exist and are monitored.

## Rebuilding from scratch

The test of whether the deploy path works on a clean machine. It also rehearses the initdb path
(role creation on an empty volume), which prod's existing volume never runs.

```bash
just backup staging manual                     # tagged, so retention cannot expire it
just staging-down YES
docker volume rm relab_staging_database_data   # destroys staging data — intended
just staging-up YES migrations
```

If that needs an undocumented manual step, prod needs it too: write it into
[DEPLOY-PROD.md](DEPLOY-PROD.md).
