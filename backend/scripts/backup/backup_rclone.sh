#!/bin/sh
### Rclone backup script for tarballs
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"

# Load root .env file
# NOTE: This is a bit ugly, but the docker compose files also need access to these vars so we keep them in the root .env file.
ENV_FILE="$REPO_ROOT/.env"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"


# Rclone configuration
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backend/backups}"
BACKUP_REMOTE="${REMOTE?RCLONE_REMOTE not set in .env file}"
BACKUP_LOGFILE="${LOGFILE:-/var/log/relab_rclone_backup.log}"

# Number of threads for rclone (default 16) - adjust based on your CPU and network
BACKUP_THREAD_COUNT="${BACKUP_THREAD_COUNT:-16}"

# Ensure log directory exists
mkdir -p "$(dirname "$BACKUP_LOGFILE")"

echo "[$(date)] Backing up from $BACKUP_DIR to remote $BACKUP_REMOTE"

# Run the backup
rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" --log-file="$BACKUP_LOGFILE" --log-level=INFO --multi-thread-streams="$BACKUP_THREAD_COUNT"
