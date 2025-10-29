# ReLab Data Backups

Scripts for backing up ReLab data locally and syncing to remote storage.

## Overview

Two types of data are backed up:

- **PostgreSQL database**: Compressed SQL dumps
- **User uploads**: Compressed tarballs of product images and files

Backups are created locally first, then optionally synced to remote storage.

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
- `$BACKUP_DIR/user_upload_backups`: User upload backups

### Usage

**Manual backup:**

Run the backup scripts directly:

```bash
./backup_user_uploads.sh
```

```bash
./backup_postgres_database.sh
```

> 💡 **Note:** By default these scripts back up services running on the host, not processes inside Docker containers. To back up Dockerized services, configure the scripts to back up the docker volume (for user uploads) or connect to the database container (for database backups).

**Automated backup:**

From the repo root, start the stack with the `backups` profile:

```bash
docker compose -f compose.yml -f compose.prod.yml --profile backups up -d
```

This runs:

- `backend_user_upload_backups`: Scheduled user upload backups, backed up to `$BACKUP_DIR/user_upload_backups` directory
- `database_backups`: Scheduled PostgreSQL backups, backed up to `$BACKUP_DIR/postgres_db` directory

Backup schedules and retention policies are configured in [`compose.prod.yml`](../../../compose.prod.yml).

______________________________________________________________________

## Remote Backups

Optionally, you can sync local backups to remote storage using **rsync** (SSH/local network) or **rclone** (cloud/SFTP). Both scripts include safety checks to prevent data loss if the local directory is unexpectedly empty.

### Option 1: rsync (SSH/Local Network)

Ideal for fast local networks or SSH-accessible servers

#### Prerequisites

- SSH key-based authentication configured for the remote host
- `rsync` installed on both local and remote machines

#### Configuration

Add to root [`.env`](../../../.env) file:

```env
BACKUP_RSYNC_REMOTE_HOST=user@hostname
BACKUP_RSYNC_REMOTE_PATH=/path/to/remote/backup
```

#### Usage

**Manual sync:**

```bash
./backend/scripts/backup/rsync_backup.sh
```

**Automated sync (cron):**

```cron
# Daily at 3:30 AM
30 3 * * * /path/to/relab/backend/scripts/backup/rsync_backup.sh >> /var/log/relab/rsync_backup.log 2>&1
```

______________________________________________________________________

### Option 2: rclone (Cloud/SFTP)

Ideal for cloud storage (S3, SharePoint, Google Drive, etc.)

#### Prerequisites

- `rclone` installed
- Rclone remote configured with `rclone config` (SFTP, S3, SharePoint, etc.)

#### Configuration

Add to root [`.env`](../../../.env) file:

```env
BACKUP_RCLONE_REMOTE=myremote:/backup/relab
BACKUP_RCLONE_MULTI_THREAD_STREAMS=16  # Optional: adjust for network speed
```

#### Usage

**Manual sync:**

```bash
./backend/scripts/backup/rclone_backup.sh
```

**Automated sync (cron):**

```cron
# Daily at 3:30 AM
30 3 * * * /path/to/relab/backend/scripts/backup/rclone_backup.sh >> /var/log/relab/rclone_backup.log 2>&1
```
