#!/usr/bin/env bash
# Create encrypted restic backups for the PostgreSQL database and user uploads.

# spell-checker: ignore chunker

set -euo pipefail

log() {
    printf '[%s] %s\n' "$(date -Iseconds)" "$*"
}

read_secret() {
    local name="$1"
    local file_name="${name}_FILE"
    local value="${!name:-}"
    local file_value="${!file_name:-}"

    if [[ -n "$value" && -n "$file_value" ]]; then
        log "ERROR: both $name and $file_name are set; use only one"
        exit 1
    fi
    if [[ -n "$file_value" ]]; then
        if [[ ! -f "$file_value" ]]; then
            log "ERROR: secret file for $name does not exist: $file_value"
            exit 1
        fi
        value="$(<"$file_value")"
    fi
    if [[ -z "$value" ]]; then
        log "ERROR: $name must be set"
        exit 1
    fi
    printf '%s' "$value"
}

ensure_restic_repository() {
    if ! restic snapshots --no-lock >/dev/null 2>&1; then
        log "Initializing restic repository at ${RESTIC_REPOSITORY}"
        restic init
    fi
}

backup_database() {
    local timestamp dump_file
    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    dump_file="${BACKUP_WORK_DIR}/${POSTGRES_DB}-${timestamp}.dump"

    log "Creating PostgreSQL logical dump: ${dump_file}"
    PGPASSWORD="$(read_secret DATABASE_BACKUP_PASSWORD)" pg_dump \
        --host="${DATABASE_HOST:-postgres}" \
        --port="${DATABASE_PORT:-5432}" \
        --username="${DATABASE_BACKUP_USER:?DATABASE_BACKUP_USER must be set}" \
        --dbname="${POSTGRES_DB:?POSTGRES_DB must be set}" \
        --format=custom \
        --compress="${POSTGRES_COMPRESSION:-zstd:3}" \
        --schema="${POSTGRES_SCHEMA:-public}" \
        --file="$dump_file"

    log "Backing up PostgreSQL dump to restic"
    restic backup "$dump_file" --tag postgres --tag relab
    rm -f "$dump_file"
}

backup_uploads() {
    if [[ ! -d "$UPLOADS_DIR" ]]; then
        log "ERROR: UPLOADS_DIR does not exist or is not a directory: ${UPLOADS_DIR}"
        exit 1
    fi

    log "Backing up user uploads to restic: ${UPLOADS_DIR}"
    restic backup "$UPLOADS_DIR" --tag user-uploads --tag relab
}

prune_repository() {
    log "Applying restic retention policy"
    restic forget \
        --prune \
        --keep-hourly="${RESTIC_KEEP_HOURLY:-24}" \
        --keep-daily="${RESTIC_KEEP_DAILY:-14}" \
        --keep-weekly="${RESTIC_KEEP_WEEKLY:-8}" \
        --keep-monthly="${RESTIC_KEEP_MONTHLY:-12}" \
        --group-by=host,tags
}

ensure_offsite_repository() {
    if [[ -z "${RESTIC_OFFSITE_REPOSITORY:-}" ]]; then
        return 0
    fi

    export RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
    if ! restic --repo "$RESTIC_OFFSITE_REPOSITORY" snapshots --no-lock >/dev/null 2>&1; then
        log "Initializing offsite restic repository at ${RESTIC_OFFSITE_REPOSITORY}"
        restic --repo "$RESTIC_OFFSITE_REPOSITORY" init \
            --from-repo "$RESTIC_REPOSITORY" \
            --copy-chunker-params
    fi
}

copy_to_offsite() {
    if [[ -z "${RESTIC_OFFSITE_REPOSITORY:-}" ]]; then
        return 0
    fi

    ensure_offsite_repository
    export RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
    log "Copying local restic snapshots to offsite repository: ${RESTIC_OFFSITE_REPOSITORY}"
    restic --repo "$RESTIC_OFFSITE_REPOSITORY" copy --from-repo "$RESTIC_REPOSITORY"
    log "Checking offsite restic repository integrity"
    restic --repo "$RESTIC_OFFSITE_REPOSITORY" check
}

main() {
    export RESTIC_PASSWORD RESTIC_REPOSITORY
    RESTIC_PASSWORD="$(read_secret RESTIC_PASSWORD)"
    RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/restic}"
    BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/tmp/relab-backups}"
    UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"

    mkdir -p "$BACKUP_WORK_DIR"

    ensure_restic_repository

    if [[ "${SKIP_DATABASE_BACKUP:-false}" != "true" ]]; then
        backup_database
    fi
    if [[ "${SKIP_UPLOAD_BACKUP:-false}" != "true" ]]; then
        backup_uploads
    fi

    prune_repository
    log "Checking restic repository integrity"
    restic check
    copy_to_offsite
    log "Backup run completed"
}

main "$@"
