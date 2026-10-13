---
title: Upgrade and backup
description: Upgrade a self-hosted R9lab stack, roll it back, and set up its backups.
---

## Upgrade

An upgrade uses the same commands as [Deploy](/operations/deploy/): pull a known-good revision,
run `just stack prod tag YES <tag>`, then `just stack prod up YES migrations`.

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
    docker run --rm --user 0 -v "r9lab_${env}_${volume}:/mnt" \
        busybox chown -R 65532:65532 /mnt
done
just stack "$env" up YES migrations
```

## Upgrading across the R9lab rename

One release renames the deployment identifiers from `relab` to `r9lab`: the Compose project
(`r9lab_<env>`, so every volume and network name), the database and its roles (`r9lab_db`,
`r9lab_app`, `r9lab_migrator`, `r9lab_backup`), the images (`ghcr.io/cmlplatform/r9lab-*`), the
scheduled jobs (`r9lab-*@<env>`), the `RELAB_*` variables (`R9LAB_*`) and the telemetry service
name (`r9lab-api`). A plain `tag` and `up` would start an empty second stack next to the old one,
so this upgrade is a short window with its own steps. Allow about an hour; copying the volumes
takes most of it.

Before the window:

- Pull one of the new images on the host (`docker pull ghcr.io/cmlplatform/r9lab-backend:<tag>`)
  to prove the registry is reachable, and check there is room for a second copy of the volumes
  (`docker system df -v`).
- Update monitoring that matches `project="relab"` or the service `relab-api`, so it covers the new
  names before they appear.

The window, staging first. Run every step from the checkout root:

1. Stop the scheduled jobs and wait until none is running:

   ```bash
   env=prod   # or staging
   sudo systemctl disable --now "relab-backup@$env.timer" "relab-backup-maintenance@$env.timer" \
       "relab-watchdog@$env.timer" "relab-restore-check@$env.timer"
   systemctl list-units "relab-*@$env.service" --state=active   # wait until this lists nothing
   ```

1. Still on the old release: take a safety backup, record the row counts and the password type of
   each role, then stop the stack. A manual backup needs PostgreSQL running, so it comes before
   `down`. Never pass `-v` to `down`: the old volumes are the way back.

   ```bash
   just backup "$env" manual
   count_rows() {   # container name, database name
       docker exec -i "$1" sh -c "psql -U \"\$POSTGRES_USER\" -d $2 -At" <<'SQL'
   SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
   FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;
   SQL
   }
   count_rows "relab_$env-postgres-1" relab_db >"rows-before-$env.txt"
   docker exec -i "relab_$env-postgres-1" sh -c 'psql -U "$POSTGRES_USER" -d postgres -At' <<'SQL'
   SELECT rolname, left(rolpassword, 5) FROM pg_authid WHERE rolname LIKE 'relab\_%';
   SQL
   just stack "$env" down YES
   ```

1. Check out the new release (`git pull --ff-only`). In the root `.env`, set
   `COMPOSE_PROJECT_NAME=r9lab_<env>` and rename any `RELAB_*` variable to `R9LAB_*`, keeping its
   value. Then pull the new images and write the tag: `just stack "$env" tag YES <tag>`.

1. Create the new project's volumes, then copy each old volume into its new one. The copy runs as
   root in a container, so ownership and modes come along; `restic_cache` is skipped because it
   rebuilds itself:

   ```bash
   bash scripts/deploy_ops.sh stack "$env" compose --profile migrations --profile backups --profile scanning create
   volumes="database_data user_uploads cache_data alloy_data clamav_db"
   for v in $volumes; do
       docker volume inspect "relab_${env}_$v" >/dev/null 2>&1 || continue
       docker run --rm -v "relab_${env}_$v:/from:ro" -v "r9lab_${env}_$v:/to" busybox cp -a /from/. /to/
   done
   for v in $volumes; do   # each pair of lines must match
       for p in relab r9lab; do
           docker volume inspect "${p}_${env}_$v" >/dev/null 2>&1 || continue
           docker run --rm -v "${p}_${env}_$v:/v:ro" busybox sh -c \
               'echo "$(find /v | wc -l) files, $(find /v -type f -exec stat -c %s {} + | awk "{s+=\$1} END {print s+0}") bytes, root $(stat -c "%u:%g %a" /v), marker $(cat /v/.relab-volume 2>/dev/null)"'
       done
   done
   ```

1. Start only PostgreSQL and rename the database and roles, before anything else starts:
   `up` creates any role it does not find, and would create empty `r9lab_*` roles next to the old
   ones.

   ```bash
   bash scripts/deploy_ops.sh stack "$env" compose up -d --wait postgres
   bash scripts/deploy_ops.sh stack "$env" compose exec -T postgres \
       sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<'SQL'
   ALTER DATABASE relab_db RENAME TO r9lab_db;
   ALTER ROLE relab_app RENAME TO r9lab_app;
   ALTER ROLE relab_migrator RENAME TO r9lab_migrator;
   ALTER ROLE relab_backup RENAME TO r9lab_backup;
   SELECT count(*) AS old_roles_left FROM pg_roles WHERE rolname LIKE 'relab\_%';
   SQL
   ```

   If the database rename reports other sessions, run it again. If step 2 showed `md5` for a
   role, the rename cleared its password: set it again from `secrets/<env>/` with
   `ALTER ROLE ... PASSWORD`. Roles showing `SCRAM` keep theirs.

1. Start the stack: `just stack "$env" up YES migrations`.

1. Before you reopen traffic, check: `docker compose ls` lists `r9lab_<env>` and no `relab_<env>`;
   `count_rows "r9lab_$env-postgres-1" r9lab_db | diff "rows-before-$env.txt" -` prints nothing; an
   account created before the window signs in; an uploaded image loads; `just backup "$env"
   manual` logs that the uploads volume identity check passed; telemetry arrives under the new
   names.

1. Install the new scheduled jobs (`just timers-install "$env"`, with the same `R9LAB_UNIT_USER`
   as before if you use one; see [Scheduling backups](#scheduling-backups)), check `systemctl list-timers "r9lab-*@$env.timer"`,
   and remove the old unit files:

   ```bash
   sudo rm /etc/systemd/system/relab-{backup,backup-maintenance,watchdog,restore-check}@.{service,timer}
   sudo systemctl daemon-reload
   ```

1. Keep the `relab_<env>_*` volumes for two weeks, then remove them with `docker volume rm`.

**Rolling back.** Until traffic reopens in step 7, nothing old was changed: stop the new stack with
`just stack "$env" down YES`, check out the commit before the rename, restore the old `.env`,
re-enable the four `relab-*@<env>` timers, and `just stack "$env" up YES` starts the old project on
its untouched volumes and roles. After traffic reopens, the old volumes miss everything written
since: fix forward, or restore the new project from its backup.

Rolling back to any release from before the rename later on also needs that older checkout, not
only its tag: the current scripts look for `r9lab-*` images, and the older release's scripts and
`images-verify` know its `relab-*` image names.

## First backup

The backup container runs as UID 65532. Create the restic directory before the first backup. The
service refuses to start without it (`create_host_path: false`), so Docker cannot create an empty
directory that looks like a real mount.

Creating the restic repository is a separate, one-time step: backup runs never create one.
"Backup repository" in `deploy/DEPLOY-PROD.md` explains why.

:::caution[One time only]
Do not run `backup-init` on a host that already has backups.
:::

```bash
mkdir -p "${BACKUP_HOST_DIR:-./backups}/restic"
sudo chown -R 65532:65532 "${BACKUP_HOST_DIR:-./backups}"
just backup-init prod     # creates the repository, marks the uploads volume
just backup prod          # takes the first snapshot
just restore-check prod   # restores that snapshot: DB into a scratch container, uploads into a scratch dir
```

The repository is encrypted with `secrets/prod/restic_password`. Never rotate it: every later
snapshot depends on it.

Before anything destructive, take a tagged backup with `just backup prod manual`. The `manual` tag
is exempt from retention. An untagged copy is not safe: as snapshots age, retention keeps only the
newest one per calendar day, so it can expire the same day.

## Scheduling backups

Starting the stack does **not** schedule backups. A systemd timer on the host runs the one-shot
backup service every hour. A second, daily timer does repository upkeep: retention, the integrity
check, and the offsite copy. Install all four scheduled jobs (backup, backup-maintenance, watchdog,
restore-check) once per environment. The installer renders the committed units with this host's
checkout path, deploy user, and `just` location, then enables the timers:

```bash
just timers-render                        # inspect what will be installed
just timers-install staging               # renders, installs, enables
systemctl list-timers 'r9lab-*@staging.timer'   # confirm NEXT times are scheduled
```

:::caution
Run `just timers-install` as yourself, not as `sudo just`: the installer prompts for sudo itself.
:::

The installer also seeds `/etc/relab/relab.env` with empty `PING_*` URLs. Fill in `PING_WATCHDOG`
with a [healthchecks.io](https://healthchecks.io) check URL. The hourly watchdog reports every other
job's state through it; the other three URLs are optional per-job checks. Until you fill it in, job
failures are invisible outside the host, and `just watchdog <env>` reports that. So does a host
without the timers.

With a dedicated deploy user, run the installer from an account with sudo:
`R9LAB_UNIT_USER=<user> just timers-install <env>`.

## Optional WebDAV offsite backups

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
