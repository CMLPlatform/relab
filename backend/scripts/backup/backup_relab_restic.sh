#!/usr/bin/env bash
# Create encrypted restic backups for the PostgreSQL database and user uploads.

set -euo pipefail

log() {
    printf '[%s] %s\n' "$(date -Iseconds)" "$*"
}

# Extra tags applied to every snapshot this run creates. BACKUP_MANUAL=true marks a
# hand-run backup with `manual`, which the retention policy keeps unconditionally
# (--keep-tag=manual). Hourly retention keeps only the newest snapshot per hour and
# expires the rest after RESTIC_KEEP_HOURLY hours, so without this tag a backup taken
# before a risky operation is expired by the next scheduled run in the same hour.
BACKUP_TAG_ARGS=()
if [[ "${BACKUP_MANUAL:-false}" == "true" ]]; then
    BACKUP_TAG_ARGS=(--tag manual)
fi

# How long a snapshot waits for restic's lock. The daily maintenance run holds an
# exclusive lock while `forget --prune` repacks, and restic's default is to give up
# immediately.
RESTIC_RETRY_LOCK="${RESTIC_RETRY_LOCK:-30m}"

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
    # must fail loudly: re-initializing would start an empty repo that backs up nothing
    # while the real history is unreachable, and the run would still exit 0.
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

    assert_dump_not_collapsed "$dump_file"

    log "Backing up PostgreSQL dump to restic"
    restic backup "$dump_file" --retry-lock "$RESTIC_RETRY_LOCK" --tag postgres --tag relab "${BACKUP_TAG_ARGS[@]}"
    rm -f "$dump_file"
}

# Refuse to archive a dump that has collapsed against the newest stored one. An empty or
# truncated database dumps and uploads without error, and once it is the newest snapshot
# the retention policy starts ageing out the good copies behind it.
# Set RESTIC_MIN_DUMP_RATIO=0 to archive anyway (a deliberate mass deletion).
assert_dump_not_collapsed() {
    local dump_file="$1" ratio="${RESTIC_MIN_DUMP_RATIO:-50}" new_size prev_size pct
    [[ "$ratio" == 0 ]] && return 0

    new_size="$(stat -c %s "$dump_file")"
    # `restic stats --json` on the newest postgres snapshot, in the default restore-size
    # mode: that is the dump's own byte count, directly comparable to the new file.
    # (raw-data reports the packed size, a fraction of the file.)
    # Capture restic's exit separately from the sed: a failure here (lock held,
    # repository unreadable) must not read as "no previous snapshot" and fail open.
    local stats_json status=0
    stats_json="$(restic stats latest --tag postgres --json 2>&1)" || status=$?
    if [[ "$status" -ne 0 ]]; then
        log "ERROR: could not read the previous PostgreSQL snapshot size (restic exit ${status}): ${stats_json}"
        rm -f "$dump_file"
        exit 1
    fi
    # An empty repository is exit 0 with "snapshots_count":0, not an error.
    if grep -q '"snapshots_count":0[,}]' <<<"$stats_json"; then
        log "No previous PostgreSQL snapshot to compare against; archiving ${new_size} bytes"
        return 0
    fi
    prev_size="$(sed -n 's/.*"total_size":\([0-9]*\).*/\1/p' <<<"$stats_json")"
    if [[ -z "$prev_size" || "$prev_size" == 0 ]]; then
        log "ERROR: previous PostgreSQL snapshot reports no size; refusing to guess. Output: ${stats_json}"
        rm -f "$dump_file"
        exit 1
    fi

    pct=$((new_size * 100 / prev_size))
    if ((pct < ratio)); then
        log "ERROR: new dump is ${pct}% of the previous snapshot (${new_size} vs ${prev_size} bytes)."
        log "ERROR: refusing to archive it -- a collapsed dump would age out the good snapshots."
        log "ERROR: if this shrink is real, re-run with RESTIC_MIN_DUMP_RATIO=0."
        rm -f "$dump_file"
        exit 1
    fi
    log "Dump size ${new_size} bytes (${pct}% of previous); archiving"
}

backup_uploads() {
    if [[ ! -d "$UPLOADS_DIR" ]]; then
        log "ERROR: UPLOADS_DIR does not exist or is not a directory: ${UPLOADS_DIR}"
        exit 1
    fi

    log "Backing up user uploads to restic: ${UPLOADS_DIR}"
    restic backup "$UPLOADS_DIR" --retry-lock "$RESTIC_RETRY_LOCK" --tag user-uploads --tag relab "${BACKUP_TAG_ARGS[@]}"
}

prune_repo() {
    # Apply the retention policy to a repository. Pass ``--repo <target>`` to prune
    # a non-default repo (the offsite one); no args prunes the default local repo.
    # Group by tags only, never by host. Each run is a fresh `compose run --rm` container
    # with a new random hostname, so grouping by host puts every run in its own group,
    # and a one-snapshot group is retained by every keep-* rule. `hostname:` is pinned on
    # the service (compose.deploy.yaml), but retention must not depend on that.
    restic "$@" forget \
        --prune \
        --keep-tag=manual \
        --keep-hourly="${RESTIC_KEEP_HOURLY:-24}" \
        --keep-daily="${RESTIC_KEEP_DAILY:-14}" \
        --keep-weekly="${RESTIC_KEEP_WEEKLY:-8}" \
        --keep-monthly="${RESTIC_KEEP_MONTHLY:-12}" \
        --group-by=tags
}

# True when the offsite target needs an rclone remote that RCLONE_CONFIG does not
# define. The repository path is committed per environment, but the credential is a
# hand-written secret, so a host can be configured to copy offsite without being able
# to. Skip the copy in that state rather than failing the run every night.
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
    # Only restic exit 10 means "repository does not exist". An expired credential, a
    # renamed remote, a typo'd path or a 5xx would otherwise init a fresh repository,
    # copy one day into it, and exit 0 while the real archive is orphaned.
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
    # (`just backup-offsite-copy`, which skips both backups) is what an operator runs
    # when the local repo is already lost, and pruning offsite would then expire the
    # only surviving archive.
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

    # BACKUP_MAINTENANCE splits the hourly snapshot from the daily upkeep.
    #   auto (default) — snapshot, then prune/check/copy. A hand-run `just backup <env>`.
    #   skip           — snapshot only. The hourly timer.
    #   only           — prune/check/copy, no new snapshot. The daily maintenance timer.
    local maintenance="${BACKUP_MAINTENANCE:-auto}"
    case "$maintenance" in
        auto | skip | only) ;;
        *)
            log "ERROR: BACKUP_MAINTENANCE must be auto, skip or only; got '${maintenance}'"
            exit 2
            ;;
    esac

    run_cycle "$maintenance"
    log "Backup run completed"
}

# The whole hourly-vs-daily split, in one function so scripts/test_ops.sh can drive it
# with the steps stubbed. Args: <auto|skip|only>.
run_cycle() {
    local maintenance="$1" did_backup=false
    if [[ "$maintenance" != "only" ]]; then
        if [[ "${SKIP_DATABASE_BACKUP:-false}" != "true" ]]; then
            backup_database
            did_backup=true
        fi
        if [[ "${SKIP_UPLOAD_BACKUP:-false}" != "true" ]]; then
            backup_uploads
            did_backup=true
        fi
    fi

    # Retention/prune is local maintenance for a real backup; a copy-only run (both
    # backups skipped) must not expire local snapshots as a side effect. `only` is the
    # maintenance timer, whose whole job is this upkeep.
    if [[ "$maintenance" == "only" || ("$maintenance" == "auto" && "$did_backup" == "true") ]]; then
        log "Applying restic retention policy"
        prune_repo
        log "Checking restic repository integrity"
        restic check
        copy_to_offsite true
    elif [[ "$maintenance" == "auto" ]]; then
        copy_to_offsite "$did_backup"
    else
        log "Maintenance skipped (BACKUP_MAINTENANCE=skip); prune, check and offsite copy run on the daily maintenance timer"
    fi
}

# Sourced by scripts/test_ops.sh to exercise run_cycle with stubs; only run main
# when executed directly.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
