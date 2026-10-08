# R9lab Backups

One restic-based workflow serves production and staging. Each backup run creates:

- a logical PostgreSQL dump with `pg_dump`, as `DATABASE_BACKUP_USER`
- a restic snapshot of that dump, tagged `postgres`
- a restic snapshot of the uploaded files, tagged `user-uploads`

The restic repository lives under `$BACKUP_HOST_DIR/restic` and is encrypted with `RESTIC_PASSWORD`
or `RESTIC_PASSWORD_FILE`.

## Running backups

`just stack <env> up` does not start backups. The `backup` service in `compose.deploy.yaml` is a
one-shot container that a systemd timer runs every hour (`just timers-install <env>`). To run one
cycle now:

```bash
just backup prod
```

The Compose service reads `BACKUP_HOST_DIR` from the root `.env` (default `./backups`). Shell helpers
such as `just restore-check` read exported environment variables instead, so export
`BACKUP_HOST_DIR` first for a non-default path.

## Restore check

```bash
just restore-check prod
```

This restores the latest `postgres` snapshot into a disposable PostgreSQL container and checks that
it loads at the expected Alembic head. It also restores the latest `user-uploads` snapshot into a
scratch directory and checks that it holds files.

## Setup, secrets, and offsite copies

The install guide (`docs/src/content/docs/operations/install.md`) covers the first backup, the
secret files, the timers, and the optional offsite copy.
