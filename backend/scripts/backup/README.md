# RELab Data Backups

Scripts for backing up RELab data locally and syncing to remote storage.

## Overview

Two types of data are backed up:

- **PostgreSQL database:** compressed SQL dumps
- **User uploads:** compressed tarballs of product images and files

Backups are created locally first, then optionally synced to remote storage.

> ⚠️ **Docker note:** By default these scripts back up services running on the host, not processes inside Docker containers. To back up Dockerized services, configure the scripts to connect to the database container (for database backups) or back up the Docker volume directly (for user uploads).

______________________________________________________________________

## Local Backups

### Configuration

In the root [`.env`](../../../.env) file, set where backups are stored:

```env
BACKUP_DIR=/path/to/local/backups
```

Ensure the directory exists and is writable by the Docker user.

The backup scripts create subdirectories:

- `$BACKUP_DIR/postgres_db`: PostgreSQL backups
- `$BACKUP_DIR/user_upload_backups`: user upload backups

### Usage

**Manual backup:**

```bash
./backup_user_uploads.sh
./backup_postgres_database.sh
```

**Automated backup:**

From the repo root, start the stack with the `backups` profile:

```bash
docker compose -f compose.yml -f compose.prod.yml --profile backups up -d
```

This runs:

- `backend-user-upload-backups`: scheduled user upload backups to `$BACKUP_DIR/user_upload_backups`
- `database-backups`: scheduled PostgreSQL backup to `$BACKUP_DIR/postgres_db`

Backup schedules and retention policies are configured in [`compose.prod.yml`](../../../compose.prod.yml).

______________________________________________________________________

## Remote Backups

Optionally sync local backups to remote storage using **rsync** (SSH/local network) or **rclone** (cloud/SFTP). Both scripts include safety checks to prevent data loss if the local directory is unexpectedly empty.

### Option 1: rsync (SSH/Local Network)

Ideal for fast local networks or SSH-accessible servers.

**Prerequisites:** SSH key-based authentication configured for the remote host, and `rsync` installed on both machines.

**Configuration**: add to root [`.env`](../../../.env):

```env
BACKUP_RSYNC_REMOTE_HOST=user@hostname
BACKUP_RSYNC_REMOTE_PATH=/path/to/remote/backup
```

**Manual sync:**

```bash
./backend/scripts/backup/rsync_backup.sh
```

**Automated sync (cron):**

```cron
# Daily at 3:30 AM: update the path to match your installation
30 3 * * * /path/to/relab/backend/scripts/backup/rsync_backup.sh >> /var/log/relab/rsync_backup.log 2>&1
```

______________________________________________________________________

### Option 2: rclone (Cloud/SFTP)

Ideal for cloud storage (S3, SharePoint, Google Drive, etc.)

**Prerequisites:** `rclone` installed and a remote configured via `rclone config` (SFTP, S3, SharePoint, etc.).

**Configuration:** add to root [`.env`](../../../.env):

```env
BACKUP_RCLONE_REMOTE=myremote:/backup/relab
BACKUP_RCLONE_MULTI_THREAD_STREAMS=16  # Optional: adjust for network speed
```

**Manual sync:**

```bash
./backend/scripts/backup/rclone_backup.sh
```

**Automated sync (cron):**

```cron
# Daily at 3:30 AM: update the path to match your installation
30 3 * * * /path/to/relab/backend/scripts/backup/rclone_backup.sh >> /var/log/relab/rclone_backup.log 2>&1
```
