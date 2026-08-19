#!/usr/bin/env bash
# Prepare the mounted secrets, then run one Relab restic backup and exit.
# Scheduling is a systemd timer on the host (deploy/systemd/); a non-zero exit here
# is recorded by systemd and reported by `just watchdog <env>`.

set -euo pipefail

BACKUP_SCRIPT="${BACKUP_SCRIPT:-./backup_relab_restic.sh}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/restic}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/tmp/relab-backups}"

mkdir -p "$RESTIC_REPOSITORY" "$BACKUP_WORK_DIR"

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
    install -m 0400 "$source_file" "$target_file"
    export "$env_name=$target_file"
}

prepare_readable_file_env DATABASE_BACKUP_PASSWORD_FILE database_backup_password
prepare_readable_file_env RESTIC_PASSWORD_FILE restic_password
prepare_readable_file_env RCLONE_CONFIG rclone.conf

exec "$BACKUP_SCRIPT"
