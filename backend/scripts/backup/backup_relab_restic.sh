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

# A guard refusing to archive is a permanent state a human has to clear, not a transient
# failure, so it is kept apart from a crash in two ways. It does not abort the run: the
# other half's snapshot, the retention pass, the integrity check and the offsite copy all
# still happen, and only the refused step is skipped. And it exits EXIT_REFUSED, which
# relab-backup@.service lists in RestartPreventExitStatus -- retrying it three times an
# hour only writes three more snapshots and sends three more alerts for the same
# unchanged problem.
EXIT_REFUSED=3
STEP_REFUSED=false
BACKUP_REFUSED=false
refuse() {
    STEP_REFUSED=true
    BACKUP_REFUSED=true
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
    # Never initializes. restic reports exit 10 both for a genuine first run and for a
    # directory that is empty for the wrong reason (wrong BACKUP_HOST_DIR, swapped disk),
    # so auto-init would quietly start a fresh empty archive that exits 0. Wrong password
    # and corruption fail here for the same reason. `just backup-init <env>` creates it.
    # The message omits that command on purpose: it also fires when a working repository
    # goes unreadable, which is when running init does the most damage.
    log "ERROR: restic repository at ${RESTIC_REPOSITORY} is not readable (restic exit ${status}); refusing to initialize. Check the volume mount, the backup disk, and RESTIC_PASSWORD. First run on a new host? See deploy/DEPLOY-PROD.md Part 1.1."
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

    if ! assert_not_collapsed postgres "$(stat -c %s "$dump_file")"; then
        rm -f "$dump_file"
        refuse
        return 0
    fi

    log "Backing up PostgreSQL dump to restic"
    restic backup "$dump_file" --retry-lock "$RESTIC_RETRY_LOCK" --tag postgres --tag relab "${BACKUP_TAG_ARGS[@]}"
    rm -f "$dump_file"
}

# Refuse to archive data that has collapsed against the newest stored snapshot of the
# same tag. A truncated database and an emptied uploads volume both archive without
# error, and once that is the newest snapshot the retention policy starts ageing out the
# good copies behind it. Set RESTIC_MIN_DUMP_RATIO=0 for a deliberate mass deletion.
# Returns 1 rather than exiting: the caller owns whatever it has to clean up.
assert_not_collapsed() {
    local tag="$1" new_size="$2" ratio="${RESTIC_MIN_DUMP_RATIO:-50}"
    local stats_json prev_size status=0 pct
    [[ "$ratio" == 0 ]] && return 0

    # `restic stats --json` in the default restore-size mode: the data's own byte count,
    # directly comparable to a local file or tree. (raw-data reports the packed size, a
    # fraction of that.) Capture restic's exit separately from the parse below: a failure
    # here (lock held, repository unreadable) must not read as "no previous snapshot"
    # and fail open.
    stats_json="$(restic stats latest --tag "$tag" --json 2>&1)" || status=$?
    if [[ "$status" -ne 0 ]]; then
        log "ERROR: could not read the previous ${tag} snapshot size (restic exit ${status}): ${stats_json}"
        return 1
    fi
    # An empty repository is exit 0 with "snapshots_count":0, not an error.
    if grep -q '"snapshots_count":0[,}]' <<<"$stats_json"; then
        log "No previous ${tag} snapshot to compare against; archiving ${new_size} bytes"
        return 0
    fi
    prev_size="$(sed -n 's/.*"total_size":\([0-9]*\).*/\1/p' <<<"$stats_json")"
    if [[ -z "$prev_size" || "$prev_size" == 0 ]]; then
        log "ERROR: previous ${tag} snapshot reports no size; refusing to guess. Output: ${stats_json}"
        return 1
    fi

    pct=$((new_size * 100 / prev_size))
    if ((pct < ratio)); then
        log "ERROR: new ${tag} data is ${pct}% of the previous snapshot (${new_size} vs ${prev_size} bytes)."
        log "ERROR: refusing to archive it -- a collapsed snapshot would age out the good ones."
        log "ERROR: if this shrink is real, re-run with RESTIC_MIN_DUMP_RATIO=0."
        return 1
    fi
    log "${tag} size ${new_size} bytes (${pct}% of previous); archiving"
}

# The uploads volume identifies itself, so that "populated" and "the right data" are not
# the same question. Docker recreates a missing named volume silently and empty, and the
# app then recreates files/ and images/ inside it at startup, so a directory check alone
# passes on a volume that has lost everything -- or on the wrong environment's volume
# after a mistyped `-p`. A size check cannot see that second case at all.
# Written once by `just backup-init <env>`. Unset RELAB_ENVIRONMENT (dev, CI) skips it.
UPLOADS_CANARY_NAME=".relab-volume"

assert_uploads_volume_identity() {
    local canary="${UPLOADS_DIR}/${UPLOADS_CANARY_NAME}" found
    # NOTE: unset means off, so any run of this image that does not go through
    # compose.deploy.yaml (a hand-rolled `docker run` against a prod volume, say) has no
    # identity check at all. Deliberate -- dev, CI and the image smoke all run that way.
    if [[ -z "${RELAB_ENVIRONMENT:-}" ]]; then
        log "RELAB_ENVIRONMENT is unset; skipping the uploads volume identity check"
        return 0
    fi

    if [[ ! -f "$canary" ]]; then
        log "ERROR: ${canary} is missing, so this is not the ${RELAB_ENVIRONMENT} uploads volume or it has been emptied."
        log "ERROR: refusing to archive it -- an empty snapshot would age out the good ones. See deploy/DEPLOY-PROD.md Part 1.1 before running backup-stamp-volume."
        return 1
    fi
    # Checked separately: an unreadable marker would otherwise abort the redirection
    # below under `set -e` and the operator would get a bare "Permission denied" instead
    # of any of this function's diagnostics. Live risk here -- the uploads tree has
    # carried the wrong ownership before.
    if [[ ! -r "$canary" ]]; then
        log "ERROR: ${canary} is not readable by this run (uid $(id -u)); fix its ownership before archiving."
        return 1
    fi
    found="$(tr -d '[:space:]' <"$canary")"
    if [[ "$found" != "$RELAB_ENVIRONMENT" ]]; then
        log "ERROR: ${canary} says '${found}' but this run is '${RELAB_ENVIRONMENT}'; refusing to archive another environment's uploads."
        return 1
    fi
}

# File-node bytes only, which is what `restic stats` reports in restore-size mode: it
# counts files, and directories are size 0. `du -sb` would add each directory's own 4096
# bytes on top, so a tree that lost every file but kept a large directory skeleton would
# still measure close enough to the previous snapshot to pass the collapse guard.
# Prints nothing and returns 1 when the tree cannot be walked; the caller logs that.
uploads_size() {
    local sizes
    sizes="$(find "$UPLOADS_DIR" -type f -printf '%s\n')" || return 1
    awk '{s+=$1} END {print s+0}' <<<"$sizes"
}

backup_uploads() {
    local new_size
    if [[ ! -d "$UPLOADS_DIR" ]]; then
        log "ERROR: UPLOADS_DIR does not exist or is not a directory: ${UPLOADS_DIR}"
        exit 1
    fi
    if ! assert_uploads_volume_identity; then
        refuse
        return 0
    fi
    if ! new_size="$(uploads_size)"; then
        log "ERROR: could not size the uploads tree at ${UPLOADS_DIR}; refusing to archive a total that may be short."
        refuse
        return 0
    fi
    if ! assert_not_collapsed user-uploads "$new_size"; then
        refuse
        return 0
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

# The offsite repository is the one remote in RCLONE_CONFIG, with an empty path: a
# share link's WebDAV root is the shared folder, and a path appended to it would create
# a second, empty repository nested inside the real one. Prints nothing when the config is absent, has no remote (the placeholder), or more
# than one.
derive_offsite_repository() {
    [[ -n "${RCLONE_CONFIG:-}" && -f "${RCLONE_CONFIG}" ]] || return 0
    local -a remotes=()
    mapfile -t remotes < <(sed -n 's/\r$//; s/^\[\([^]]*\)\]$/\1/p' "$RCLONE_CONFIG")
    [[ "${#remotes[@]}" -eq 1 ]] && printf 'rclone:%s:' "${remotes[0]}"
    return 0
}

# True when an explicit offsite target names an rclone remote that RCLONE_CONFIG does
# not define. Skip the copy in that state rather than failing the run every night.
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
    # Exit 10 is actionable here, unlike the local repository above: a remote path cannot
    # be an empty directory left by a failed mount, so auto-init is safe. Differs on purpose.
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
        if [[ -n "${RCLONE_CONFIG:-}" && -f "${RCLONE_CONFIG}" ]]; then
            log "WARNING: offsite copy SKIPPED — ${RCLONE_CONFIG} does not define exactly one remote. Backups are LOCAL ONLY. See deploy/DEPLOY-PROD.md Part 1.3."
        fi
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

    export RESTIC_OFFSITE_REPOSITORY
    RESTIC_OFFSITE_REPOSITORY="${RESTIC_OFFSITE_REPOSITORY:-$(derive_offsite_repository)}"

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
    BACKUP_REFUSED=false
    if [[ "$maintenance" != "only" ]]; then
        # STEP_REFUSED is reset per step: a step that refused took no snapshot, so it
        # must not make did_backup true and pull the prune forward on a run that
        # archived nothing.
        if [[ "${SKIP_DATABASE_BACKUP:-false}" != "true" ]]; then
            STEP_REFUSED=false
            backup_database
            [[ "$STEP_REFUSED" == true ]] || did_backup=true
        fi
        if [[ "${SKIP_UPLOAD_BACKUP:-false}" != "true" ]]; then
            STEP_REFUSED=false
            backup_uploads
            [[ "$STEP_REFUSED" == true ]] || did_backup=true
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

    if [[ "$BACKUP_REFUSED" == true ]]; then
        log "ERROR: a backup step refused to archive (see above). Maintenance still ran, but this run did not archive everything it should have."
        return "$EXIT_REFUSED"
    fi
}

# Sourced by scripts/test_ops.sh to exercise run_cycle with stubs; only run main
# when executed directly.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
