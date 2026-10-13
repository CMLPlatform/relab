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
    docker run --rm --user 0 -v "relab_${env}_${volume}:/mnt" \
        busybox chown -R 65532:65532 /mnt
done
just stack "$env" up YES migrations
```

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
systemctl list-timers 'relab-*@staging.timer'   # confirm NEXT times are scheduled
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
`RELAB_UNIT_USER=<user> just timers-install <env>`.

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
