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
    # Group by tags ONLY, never by host. Each run is a fresh `compose run --rm`
    # container with a new random hostname, so grouping by host would put every
    # single run in its own group — and a one-snapshot group is retained by every
    # keep-* rule, making this prune a permanent no-op and growing both repos
    # without bound. `hostname:` is pinned on the service too (compose.deploy.yaml)
    # so restic can find a parent snapshot, but retention must not depend on that.
    restic "$@" forget \
        --prune \
        --keep-hourly="${RESTIC_KEEP_HOURLY:-24}" \
        --keep-daily="${RESTIC_KEEP_DAILY:-14}" \
        --keep-weekly="${RESTIC_KEEP_WEEKLY:-8}" \
        --keep-monthly="${RESTIC_KEEP_MONTHLY:-12}" \
        --group-by=tags
}

# True when the offsite target needs an rclone remote that RCLONE_CONFIG does not
# define. The repository path is committed per environment, but the credential is a
# hand-written secret — so "configured to copy offsite" and "able to copy offsite"
# are separate facts, and a host that has the first without the second must skip the
# copy rather than fail every single night. A permanently red alert is no alert.
offsite_remote_missing() {
    local repo="${1:-}" remote
    [[ "$repo" == rclone:* ]] || return 1
    remote="${repo#rclone:}"
    remote="${remote%%:*}"
    [[ -n "${RCLONE_CONFIG:-}" && -f "${RCLONE_CONFIG}" ]] || return 0
    ! grep -q "^\[${remote}\]" "${RCLONE_CONFIG}"
}

ensure_offsite_repository() {
    if [[ -z "${RESTIC_OFFSITE_REPOSITORY:-}" ]]; then
        return 0
    fi

    export RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
    local status=0
    restic --repo "$RESTIC_OFFSITE_REPOSITORY" snapshots --no-lock >/dev/null 2>&1 || status=$?
    if [[ "$status" -eq 0 ]]; then
        return 0
    fi
    # Only restic exit 10 means "repository does not exist". Treating every failure
    # as first-run — an expired credential, a renamed remote, a typo'd path, a 5xx —
    # would silently init a fresh repository, copy one day into it, and exit 0 while
    # the real archive is orphaned and every monitor reads green. Same reasoning as
    # ensure_restic_repository above; the offsite path needs it more, not less,
    # because nobody ever looks at the offsite repo directly.
    if [[ "$status" -ne 10 ]]; then
        log "ERROR: offsite repository ${RESTIC_OFFSITE_REPOSITORY} is unreachable or unreadable (restic exit ${status}); refusing to initialize over it. Check the rclone remote, the path, and RESTIC_PASSWORD."
        return 1
    fi
    log "Initializing offsite restic repository at ${RESTIC_OFFSITE_REPOSITORY}"
    restic --repo "$RESTIC_OFFSITE_REPOSITORY" init \
        --from-repo "$RESTIC_REPOSITORY" \
        --copy-chunker-params
}

copy_to_offsite() {
    # $1 is did_backup: "true" only when this run actually created snapshots.
    local did_backup="${1:-false}"

    if [[ -z "${RESTIC_OFFSITE_REPOSITORY:-}" ]]; then
        return 0
    fi
    if offsite_remote_missing "$RESTIC_OFFSITE_REPOSITORY"; then
        log "WARNING: offsite copy SKIPPED — ${RESTIC_OFFSITE_REPOSITORY} needs an rclone remote that ${RCLONE_CONFIG:-<RCLONE_CONFIG unset>} does not define. Backups are LOCAL ONLY until the real rclone config is written. See deploy/DEPLOY-PROD.md Part 1.3."
        return 0
    fi

    ensure_offsite_repository
    export RESTIC_FROM_PASSWORD="$RESTIC_PASSWORD"
    log "Copying local restic snapshots to offsite repository: ${RESTIC_OFFSITE_REPOSITORY}"
    restic --repo "$RESTIC_OFFSITE_REPOSITORY" copy --from-repo "$RESTIC_REPOSITORY"

    # Retention offsite is gated the same way the local prune is. A copy-only run
    # (`just backup-offsite-copy`, which skips both backups) is what an operator
    # reaches for when the LOCAL repo is already lost — pruning the offsite copy in
    # that moment would expire the only surviving archive.
    if [[ "$did_backup" != "true" ]]; then
        log "Copy-only run: skipping offsite retention and integrity check"
        return 0
    fi
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
    copy_to_offsite "$did_backup"
    log "Backup run completed"
}

main "$@"
