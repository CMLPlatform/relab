#!/usr/bin/env bash
# Run RELab restic backups once or on a simple interval.

# spell-checker: ignore gosu

set -euo pipefail

BACKUP_USER="${BACKUP_USER:-backupuser}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-./backup_relab_restic.sh}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/restic}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/tmp/relab-backups}"

mkdir -p "$RESTIC_REPOSITORY" "$BACKUP_WORK_DIR"
chown -R "$BACKUP_USER:$BACKUP_USER" "$RESTIC_REPOSITORY" "$BACKUP_WORK_DIR"

prepare_readable_file_env() {
    local env_name="$1"
    local target_name="$2"
    local source_file="${!env_name:-}"
    local target_dir target_file

    if [[ -z "$source_file" ]]; then
        return
    fi
    if [[ ! -f "$source_file" ]]; then
        echo "[$(date -Iseconds)] ERROR: file configured by $env_name does not exist: $source_file"
        exit 1
    fi

    target_dir="$BACKUP_WORK_DIR/secrets"
    target_file="$target_dir/$target_name"
    mkdir -p "$target_dir"
    install -m 0400 -o "$BACKUP_USER" -g "$BACKUP_USER" "$source_file" "$target_file"
    export "$env_name=$target_file"
}

prepare_readable_file_env DATABASE_BACKUP_PASSWORD_FILE database_backup_password
prepare_readable_file_env RESTIC_PASSWORD_FILE restic_password
prepare_readable_file_env RCLONE_CONFIG rclone.conf

run_backup() {
    gosu "$BACKUP_USER" "$BACKUP_SCRIPT"
}

if [[ "${BACKUP_ON_START:-true}" == "true" ]]; then
    run_backup
fi

if [[ "${BACKUP_RUN_ONCE:-false}" == "true" ]]; then
    exit 0
fi

echo "[$(date -Iseconds)] RELab backup service started. Interval: ${BACKUP_INTERVAL_SECONDS}s"

while true; do
    sleep "$BACKUP_INTERVAL_SECONDS"
    run_backup
done
