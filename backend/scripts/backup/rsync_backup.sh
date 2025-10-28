#!/bin/sh
### Rsync script to mirror a local backup directory to a remote server.
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
BACKUP_RSYNC_REMOTE_HOST="${BACKUP_RSYNC_REMOTE_HOST?BACKUP_RSYNC_REMOTE_HOST not set}"
BACKUP_RSYNC_REMOTE_DIR="${BACKUP_RSYNC_REMOTE_DIR?BACKUP_RSYNC_REMOTE_DIR not set}"

# Safety Check: If the local dir has 0 files AND the remote has more than 0 files, abort.
if [ "$(find "$BACKUP_DIR" -type f | wc -l)" -eq 0 ] && \
   [ "$(ssh "$BACKUP_RSYNC_REMOTE_HOST" "find '$BACKUP_RSYNC_REMOTE_DIR' -type f 2>/dev/null | wc -l")" -gt 0 ]; then
    echo "[$(date)] ERROR: Local backup directory is empty, but remote is not. Aborting sync to prevent data loss."
    exit 1
fi

BACKUP_REMOTE="$BACKUP_RSYNC_REMOTE_HOST:$BACKUP_RSYNC_REMOTE_DIR"

echo "[$(date)] Safety check passed. Mirroring backups to $BACKUP_REMOTE..."
rsync -avz --delete "$BACKUP_DIR"/ "$BACKUP_REMOTE"

echo "[$(date)] Mirroring complete."
