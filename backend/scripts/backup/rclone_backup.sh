#!/bin/sh
### Rclone script to mirror a local backup directory to a remote server.
set -e

# Load root .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../../.env"

if [ -f "$ENV_FILE" ]; then
    . "$ENV_FILE"
    echo "[$(date)] Loaded env file: $ENV_FILE"
else
    echo "[$(date)] ERROR: Env file not found at $ENV_FILE. Aborting."
    exit 1
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backend/backups}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE?BACKUP_RCLONE_REMOTE not set}"  # e.g., "myremote:/backup/relab"
BACKUP_RCLONE_MULTI_THREAD_STREAMS="${BACKUP_RCLONE_MULTI_THREAD_STREAMS:-16}"

# Safety Check: If the local dir has 0 files AND the remote has more than 0 files, abort.
LOCAL_FILE_COUNT=$(find "$BACKUP_DIR" -type f | wc -l)
REMOTE_FILE_COUNT=$(rclone lsf "$BACKUP_RCLONE_REMOTE" --files-only 2>/dev/null | wc -l)

if [ "$LOCAL_FILE_COUNT" -eq 0 ] && [ "$REMOTE_FILE_COUNT" -gt 0 ]; then
    echo "[$(date)] ERROR: Local backup directory is empty, but remote is not. Aborting sync to prevent data loss."
    exit 1
fi

echo "[$(date)] Safety check passed. Syncing backups to $BACKUP_RCLONE_REMOTE..."
rclone sync "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" \
    --multi-thread-streams="$BACKUP_RCLONE_MULTI_THREAD_STREAMS" \
    --copy-links \
    --checksum \
    --transfers="$BACKUP_RCLONE_MULTI_THREAD_STREAMS" \
    --retries 3 \
    --low-level-retries 10 \
    --stats=30s \
    --stats-one-line

echo "[$(date)] Sync complete."