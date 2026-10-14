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

Before the window, pull one of the new images on the host
(`docker pull ghcr.io/cmlplatform/r9lab-backend:<tag>`) to prove the registry is reachable, and
check there is room for a second copy of the volumes (`docker system df -v`).

The window, staging first. Run every step from the checkout root. On a host with a dedicated
deploy user, steps 1 and 9 run from an account with sudo, and steps 2 to 7 run as the deploy user
(for example `sudo -u <deploy user> just ...`, and `docker` and `git` the same way), so the checkout
and `.env` keep their owner. Step 8 runs on the monitoring host. The helper containers in step 4
use the same pinned Alpine image as the backup scripts:

```bash
env=prod   # or staging
img="$(sed -n 's/^ALPINE_IMAGE="${ALPINE_IMAGE:-\(.*\)}"$/\1/p' scripts/backup_restic_ops.sh)"
```

1. Stop the scheduled jobs and wait until none is running:

   ```bash
   sudo systemctl disable --now "relab-backup@$env.timer" "relab-backup-maintenance@$env.timer" \
       "relab-watchdog@$env.timer" "relab-restore-check@$env.timer"
   systemctl list-units "relab-*@$env.service" --state=active   # wait until this lists nothing
   ```

1. Still on the old release: close traffic by stopping the tunnel, take a safety backup, record
   the row counts and the password type of each role, then stop the stack. With the tunnel down
   nothing writes, so the counts here are the ones step 5 compares against. A manual backup needs
   PostgreSQL running, so it comes before `down`. Never pass `-v` to `down`: the old volumes are
   the way back.

   ```bash
   docker stop "relab_$env-cloudflared-1"
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

1. Keep a copy of the old `.env` (`cp -p .env .env.pre-r9lab`), then check out the new release
   (`git pull --ff-only`). In the root `.env`, set `COMPOSE_PROJECT_NAME=r9lab_<env>` and rename any
   `RELAB_*` variable to `R9LAB_*`, keeping its value. Then pull the new images and write the tag:
   `just stack "$env" tag YES <tag>`. Until step 4 has created the new database and uploads
   volumes and the old stack is down, `up`, `migrate`, `rollback` and the backup recipes refuse to
   run, because the data is still in the `relab_<env>` project. After that they run, so start nothing but PostgreSQL until step 6.

1. Copy each old volume into a new one. The script refuses to run while any `relab_<env>`
   container runs, because a volume that is in use does not copy cleanly. It creates each new
   volume with the labels Compose puts on its own, so Compose adopts it without a warning, and it
   creates no containers that a later `up` would find stopped. The copy runs as root in a
   container, so ownership and modes come along; `restic_cache` is skipped because it rebuilds
   itself. The script stops at the first failure, and you can run it again: a second run copies
   over the first. It prints the file count, byte count and root ownership of each pair and exits
   non-zero when the two differ:

   ```bash
   env="$env" img="$img" bash -euo pipefail <<'EOF'
   running="$(docker ps -q --filter "name=^relab_${env}-")"
   test -z "$running" || { echo "relab_$env containers still run: stop them first" >&2; exit 1; }
   summary() {   # volume name
       docker run --rm -v "$1:/v:ro" "$img" sh -c \
           'echo "$(find /v | wc -l) files, $(find /v -type f -exec stat -c %s {} + | awk "{s+=\$1} END {print s+0}") bytes, root $(stat -c "%u:%g %a" /v), marker $(cat /v/.relab-volume 2>/dev/null)"'
   }
   for v in database_data user_uploads cache_data alloy_data clamav_db; do
       docker volume inspect "relab_${env}_$v" >/dev/null 2>&1 || continue
       docker volume create --label "com.docker.compose.project=r9lab_$env" \
           --label "com.docker.compose.volume=$v" "r9lab_${env}_$v" >/dev/null
       docker run --rm -v "relab_${env}_$v:/from:ro" -v "r9lab_${env}_$v:/to" "$img" cp -a /from/. /to/
       old="$(summary "relab_${env}_$v")"
       new="$(summary "r9lab_${env}_$v")"
       echo "$v: $new"
       test "$old" = "$new" || { echo "$v differs from the old volume: $old" >&2; exit 1; }
   done
   EOF
   ```

1. Start only PostgreSQL and rename the database and roles, before anything else starts:
   `up` creates any role it does not find, and would create empty `r9lab_*` roles next to the old
   ones. Each rename runs only if the old name still exists, so you can run the block again after
   a failure. Then compare the row counts with step 2's; the diff must print nothing.

   ```bash
   bash scripts/deploy_ops.sh stack "$env" compose up -d --wait postgres
   bash scripts/deploy_ops.sh stack "$env" compose exec -T postgres \
       sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<'SQL'
   DO $$
   DECLARE r text;
   BEGIN
       IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'relab_db') THEN
           ALTER DATABASE relab_db RENAME TO r9lab_db;
       END IF;
       FOREACH r IN ARRAY ARRAY['app', 'migrator', 'backup'] LOOP
           IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relab_' || r) THEN
               EXECUTE format('ALTER ROLE %I RENAME TO %I', 'relab_' || r, 'r9lab_' || r);
           END IF;
       END LOOP;
   END $$;
   SELECT count(*) AS old_roles_left FROM pg_roles WHERE rolname LIKE 'relab\_%';
   SQL
   count_rows "r9lab_$env-postgres-1" r9lab_db | diff "rows-before-$env.txt" -
   ```

   If the database rename reports other sessions, run it again. If step 2 showed `md5` for a
   role, the rename cleared its password: set it again from `secrets/<env>/` with
   `ALTER ROLE ... PASSWORD`. Roles showing `SCRAM` keep theirs.

1. Start the stack: `just stack "$env" up YES migrations`. This starts the tunnel too, so traffic
   reopens here.

1. Check right away: `docker compose ls` lists `r9lab_<env>` and no `relab_<env>`; an account
   created before the window signs in; an uploaded image loads; `just backup "$env" manual` logs
   that the uploads volume identity check passed; telemetry arrives under the new names.

1. On the monitoring host, in its checkout and as the user that owns it, remove `relab/<env>` from
   the `# COVERS:` line of `config/grafana/alerting/projects.yaml`, then run
   `HC_JOBS=watchdog ./bootstrap.sh r9lab <env>`. Keep the `PING_WATCHDOG` URL it prints for step
   9, and delete the old `relab-<env>-*` checks on healthchecks.io.

1. From the sudo account. If the host also moves off the relab paths (`deploy/DEPLOY-PROD.md` 1.7),
   do that move first, so the scheduled jobs are installed once, from the moved checkout. Then
   install them (`just timers-install "$env"`, with the same `R9LAB_UNIT_USER` as before if you use
   one; see [Scheduling backups](#scheduling-backups)), set `PING_WATCHDOG` in
   `/etc/r9lab/r9lab.env` to the URL from step 8 (the watchdog reports the other jobs, so it is the
   only one needed), check `systemctl list-timers "r9lab-*@$env.timer"`, and remove the old unit
   files:

   ```bash
   sudo rm /etc/systemd/system/relab-{backup,backup-maintenance,watchdog,restore-check}@.{service,timer}
   sudo systemctl daemon-reload
   ```

1. Keep the `relab_<env>_*` volumes for two weeks, then remove them with `docker volume rm`.

**Rolling back.** Until `up` in step 6, nothing old was changed: stop the new stack with
`just stack "$env" down YES`, check out the commit before the rename, restore the old `.env`
(`cp -p .env.pre-r9lab .env`), re-enable the four `relab-*@<env>` timers, and
`just stack "$env" up YES` starts the old project on its untouched volumes and roles.

After `up`, traffic is open and the new project takes writes the old volumes never see. The same
steps still work within minutes of `up`, but lose everything written since. Later than that, fix
forward, or restore the new project from its backup.

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

The installer also seeds `/etc/r9lab/r9lab.env` with empty `PING_*` URLs. Fill in `PING_WATCHDOG`
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
