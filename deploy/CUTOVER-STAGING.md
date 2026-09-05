# Staging cutover: `main` → the MVP release

The one-time migration of the **staging** host, and what is still owed on it.
Prod equivalent: [CUTOVER-PROD.md](CUTOVER-PROD.md). Standing setup and routine
releases live in [DEPLOY-STAGING.md](DEPLOY-STAGING.md), which outlives this file —
this one is deleted once the outstanding items below are done.

Staging is further along than prod — it already runs the release layout, so most of
CUTOVER-PROD's steps are done here. What remains is listed under **Outstanding**.
Staging shares `compose.deploy.yaml` with prod, so anything unfinished here is also
unrehearsed for prod.

State below verified **2026-08-19**. Re-check rather than trusting it.

## What is live

| Thing            | State                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Stack            | `api`, `www`, `docs`, `app`, `cloudflared`, `redis`, `postgres` running                              |
| Backups          | One-shot, driven by `relab-backup@staging.timer` — enabled and active                                |
| Backup container | None running, and that is correct: it is a one-shot, not a service                                   |
| Local repo       | `${BACKUP_HOST_DIR}/restic`, 18 snapshots after the first working prune                              |
| Offsite          | `rclone:surfdrive_staging:` — a SURFdrive share link scoped to staging's folder                      |
| Credential       | `secrets/staging/rclone.conf`, remote `surfdrive_staging` (share token, not an account app password) |
| Watchdog         | Host cron, daily at 08:30                                                                            |

The backup path was rebuilt on 2026-08-19 after a failed offsite copy put the old
long-running container into a 19-hour restart loop: it re-ran a full backup every
~15 s, and every monitor read green throughout because the only check was snapshot
*age*, which a crash loop makes look better than healthy. Backups are now a
systemd one-shot, so a failure is recorded rather than retried instantly.

## Outstanding

### 1. Install the scheduled-job timers

The host currently runs an older single backup unit plus a daily watchdog cron. Both are
superseded by three systemd timers — backup, watchdog, and monthly restore verification
— installed in one step:

```bash
just timers-install staging
```

Then fill in `/etc/relab/relab.env` with three healthchecks.io URLs (one per job; a
shared check cannot tell you which job went quiet), and **remove the old watchdog line
from `crontab -e`** — the timer replaces it, and leaving both means duplicate pings.

Verify:

```bash
systemctl list-timers 'relab-*@staging.timer' --all
just watchdog staging
```

### 2. Commit the working tree

`just watchdog staging` currently exits non-zero on `deploy checkout has uncommitted changes` — correctly. That alert stays red, and masks real ones, until the backup rework
is committed.

### 3. Prod's share-link credential

Staging now uses a SURFdrive share link scoped to its own folder, so staging cannot
reach prod's repository. Prod needs the same treatment before it deploys: its own
share link, remote named `surfdrive_prod`, per
[DEPLOY-PROD.md](DEPLOY-PROD.md) Part 1.3. `just deploy-secrets-check` reports it as
missing until then, and backups run local-only in the meantime.

### 4. Confirm a timer-driven run of each job

The backup timer has already fired successfully through systemd (`Result=success`).
The watchdog and restore-check timers are new and have not:

```bash
systemctl list-timers 'relab-*@staging.timer' --all
for j in backup watchdog restore-check; do
  printf '%s: %s\n' "$j" "$(systemctl show relab-$j@staging.service -p Result --value)"
done
```

## Not yet rehearsed

- **Prod runs on a different machine**, so nothing here exercises the prod half of
  CUTOVER-PROD. Every step verified on this host is verified for the *procedure*
  only; none of it has run against prod's data, volumes, or secrets.
- **`secrets/prod/rclone.conf` is still a placeholder.** `just deploy-secrets-check`
  reports it. Prod backups will run locally and skip the offsite copy with a warning
  until it is written — deliberately, so an unconfigured credential does not leave
  the alert permanently red.
- **A full rebuild from an empty volume** has not been done since the rework. See
  the last section of [DEPLOY-STAGING.md](DEPLOY-STAGING.md); staging is the only
  host where that test is cheap.
