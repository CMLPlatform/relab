# RELab Backups

These scripts back up RELab data locally and can optionally sync it to remote storage.

Two kinds of data are covered:

- PostgreSQL backups
- uploaded files and images

## Important Note

By default, these scripts target services reachable from the host. If your stack runs in Docker, make sure the scripts point at the right database host and upload storage path. Do not assume the defaults match your deployment.

## Local Backups

Set the root backup directory in the root `.env` file:

```env
BACKUP_DIR=/path/to/local/backups
```

The scripts create:

- `$BACKUP_DIR/postgres_db`
- `$BACKUP_DIR/user_upload_backups`

### Manual Use

Run from `backend/scripts/backup/`:

```bash
./backup_user_uploads.sh
./backup_pg_database.sh
```

### Automated Use

From the repo root:

```bash
docker compose -f compose.yml -f compose.prod.yml --profile backups up -d
```

This starts:

- `uploads-backup` for user uploads
- `postgres-backup` for PostgreSQL dumps

Schedules and retention settings live in [compose.prod.yml](../../../compose.prod.yml).

## Remote Sync

You can sync local backups to remote storage with either `rsync` or `rclone`. Both sync scripts include safety checks to reduce the chance of pushing an empty local directory over a valid remote backup set.

### rsync

Use this for SSH-accessible servers or local-network targets.

Add to the root `.env`:

```env
BACKUP_RSYNC_REMOTE_HOST=user@hostname
BACKUP_RSYNC_REMOTE_PATH=/path/to/remote/backup
```

Manual run:

```bash
./backend/scripts/backup/rsync_backup.sh
```

### rclone

Use this for cloud or remote object storage.

Add to the root `.env`:

```env
BACKUP_RCLONE_REMOTE=myremote:/backup/relab
BACKUP_RCLONE_MULTI_THREAD_STREAMS=16
```

Manual run:

```bash
./backend/scripts/backup/rclone_backup.sh
```

## Cron Examples

```cron
30 3 * * * /path/to/relab/backend/scripts/backup/rsync_backup.sh >> /var/log/relab/rsync_backup.log 2>&1
30 3 * * * /path/to/relab/backend/scripts/backup/rclone_backup.sh >> /var/log/relab/rclone_backup.log 2>&1
```
