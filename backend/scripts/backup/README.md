# RELab Backups

RELab uses one restic-based backup workflow for production and staging.

The backup container creates:

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
$BACKUP_DIR/restic
```

`BACKUP_DIR` is configured in the host-local root `.env` file and defaults to `./backups`. Non-secret prod/staging Compose interpolation lives in `deploy/env/*.compose.env`; do not put real secrets under `deploy/`.

## Required Secrets

The required filename list lives in `deploy/required-secret-files.txt`. Use
`just deploy-secrets-template prod` or `just deploy-secrets-template staging` to
create missing files, then replace the placeholder values. `just deploy-secrets-check` verifies that the manifest and Compose overlay stay
aligned.

## Restore Smoke Test

From the repo root, restore the latest database dump into a disposable Postgres container:

```bash
just backup-restore-smoke prod
```

The smoke test restores the latest `postgres` snapshot, runs `pg_restore`, and verifies `SELECT 1` plus the `public.alembic_version` table.

## Optional Offsite Copy

Keep the local restic repository as the primary fast restore point. For offsite storage, copy restic snapshots to a second restic repository:

```bash
RESTIC_OFFSITE_REPOSITORY=rclone:relab-webdav:relab/staging/restic just backup-offsite-copy staging
```

For WebDAV, configure an rclone remote in:

```text
secrets/staging/rclone.conf
```

Production uses `secrets/prod/rclone.conf` and a separate repository path, for example:

```env
RESTIC_OFFSITE_REPOSITORY=rclone:relab-webdav:relab/prod/restic
```

Do not mirror the raw repository directory with separate rsync/rclone scripts. The supported offsite path is `restic copy`, with rclone acting only as restic's transport for WebDAV and other remotes.
