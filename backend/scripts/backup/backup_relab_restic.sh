#!/usr/bin/env bash
# Create encrypted restic backups for the PostgreSQL database and user uploads.

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
    local status=0
    restic cat config >/dev/null 2>&1 || status=$?
    if [[ "$status" -eq 0 ]]; then
        return 0
    fi
    # Auto-init ONLY when the repo genuinely does not exist:
    #  - restic exit 10 = "repository does not exist" (restic >= 0.17), or
    #  - a local filesystem repo with no config object yet (older restic / first run).
    # A present-but-unreadable repo (wrong RESTIC_PASSWORD, corruption, wrong path)
    # must fail loudly — re-initializing would silently start an empty repo that backs
    # up nothing while the real history is unreachable, and the run would still succeed.
    # NOTE: an unmounted local volume that presents as an empty dir is indistinguishable
    # from a first run here; Docker named volumes avoid that, but a bind mount could hit it.
    local repo="${RESTIC_REPOSITORY%/}"
    if [[ "$status" -eq 10 || ("$repo" != *:* && ! -e "${repo}/config") ]]; then
        log "Initializing restic repository at ${RESTIC_REPOSITORY}"
        restic init
        return 0
    fi
    log "ERROR: restic repository at ${RESTIC_REPOSITORY} is present but unreadable (restic exit ${status}); refusing to re-initialize. Check the volume mount and RESTIC_PASSWORD."
    exit 1
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

prune_repo() {
    # Apply the retention policy to a repository. Pass ``--repo <target>`` to prune
    # a non-default repo (the offsite one); no args prunes the default local repo.
    restic "$@" forget \
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
    # Apply retention to the offsite repo too — otherwise it grows without bound.
    log "Applying retention policy to offsite repository"
    prune_repo --repo "$RESTIC_OFFSITE_REPOSITORY"
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

    local did_backup=false
    if [[ "${SKIP_DATABASE_BACKUP:-false}" != "true" ]]; then
        backup_database
        did_backup=true
    fi
    if [[ "${SKIP_UPLOAD_BACKUP:-false}" != "true" ]]; then
        backup_uploads
        did_backup=true
    fi

    # Retention/prune is local maintenance for a real backup; a copy-only run
    # (both backups skipped) must not expire local snapshots as a side effect.
    if [[ "$did_backup" == "true" ]]; then
        log "Applying restic retention policy"
        prune_repo
        log "Checking restic repository integrity"
        restic check
    fi
    copy_to_offsite
    log "Backup run completed"
}

main "$@"
