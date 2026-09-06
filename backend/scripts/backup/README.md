# Relab Backups

One restic-based workflow serves production and staging. The backup container creates:

- a logical PostgreSQL dump with `pg_dump` using `DATABASE_BACKUP_USER`
- a restic snapshot of that dump tagged `postgres`
- a restic snapshot of uploaded files tagged `user-uploads`

The restic repository is encrypted with `RESTIC_PASSWORD` / `RESTIC_PASSWORD_FILE`.

## Runtime

The deploy overlay exposes the `relab-backup` service behind the `backups` profile:

```bash
just prod-up YES backups
just staging-up YES backups
```

Backups are stored under:

```text
$BACKUP_HOST_DIR/restic
```

The Compose service reads `BACKUP_HOST_DIR` from the root `.env` (default `./backups`). Shell
helpers such as `just restore-check` read exported environment variables instead; export
`BACKUP_HOST_DIR` first for a non-default path. Never put real secrets under `deploy/`.

## Required Secrets

Run `just deploy-secrets-template prod` (or `staging`) to create the missing secret files, then
replace the placeholder values. `just deploy-secrets-check` verifies that rendered Compose secrets
point at the expected `secrets/<env>/` files.

## Restore Smoke Test

From the repo root, restore the latest database dump into a disposable Postgres container:

```bash
just restore-check prod
```

This restores the latest `postgres` snapshot with `pg_restore` and verifies `SELECT 1` plus the
`public.alembic_version` table.

## Optional Offsite Copy

The local restic repository is the primary restore point. Write one rclone remote into
`secrets/<env>/rclone.conf` and the maintenance run copies snapshots to `rclone:<remote>:`; on
demand:

```bash
just backup-offsite-copy staging
```

`RESTIC_OFFSITE_REPOSITORY` in the root `.env` overrides the derived target.

Do not mirror the raw repository directory with rsync or rclone. Use `restic copy`; rclone is only
restic's transport.
