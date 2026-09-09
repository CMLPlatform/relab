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

# EXIT_REFUSED marks a permanent state (a human must clear it), not a crash: the run
# continues -- the other half's snapshot, retention, check and offsite copy all still
# happen -- and only the refused step is skipped. relab-backup@.service lists it in
# RestartPreventExitStatus, so systemd stops retrying an unchanged problem every hour.
#
# EXIT_STEP_ERROR is the opposite: the guard itself couldn't run (lock held, tree
# unwalkable), nothing proves the data is bad, and the next attempt may just work -- so
# it stays an ordinary retryable failure instead of borrowing EXIT_REFUSED.
EXIT_REFUSED=3
EXIT_STEP_ERROR=1

# Worst outcome any step reached this run; run_cycle's exit status.
CYCLE_STATUS=0
record_step_failure() {
    # A refusal repeats on retry; an error may clear, so it outranks a refusal.
    if [[ "$1" != "$EXIT_REFUSED" || "$CYCLE_STATUS" == 0 ]]; then
        CYCLE_STATUS="$1"
    fi
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
    # Never initializes: restic exit 10 also means "empty for the wrong reason" (wrong
    # BACKUP_HOST_DIR, swapped disk), which auto-init would quietly turn into a fresh empty
    # archive. Wrong password and corruption land here too. `just backup-init <env>`
    # creates the repo -- omitted from the message since this branch also fires on a
    # working repository gone unreadable, where init would do the most damage.
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

    local status=0
    assert_not_collapsed postgres "$(stat -c %s "$dump_file")" || status=$?
    if ((status != 0)); then
        rm -f "$dump_file"
        return "$status"
    fi

    log "Backing up PostgreSQL dump to restic"
    restic backup "$dump_file" --retry-lock "$RESTIC_RETRY_LOCK" --tag postgres --tag relab "${BACKUP_TAG_ARGS[@]}"
    rm -f "$dump_file"
}

# Refuse to archive data collapsed against the newest stored snapshot of the same tag: a
# truncated dump or emptied uploads volume archives without error, then ages out the good
# copies behind it once it's the newest one. RESTIC_MIN_DUMP_RATIO=0 allows a deliberate
# mass deletion. Returns rather than exits so the caller can clean up: EXIT_REFUSED for a
# real collapse, EXIT_STEP_ERROR (retryable, exempt from RestartPreventExitStatus) when
# the comparison itself couldn't be made.
assert_not_collapsed() {
    local tag="$1" new_size="$2" ratio="${RESTIC_MIN_DUMP_RATIO:-50}"
    local stats_json prev_size status=0 pct
    [[ "$ratio" == 0 ]] && return 0

    # `restic stats --json` (default restore-size mode) reports the data's own byte
    # count, comparable to a local file or tree -- raw-data would report the packed size
    # instead. Capture the exit separately from the parse: a failure here (lock held,
    # repo unreadable) must not read as "no previous snapshot" and fail open.
    # --retry-lock for the same reason `restic backup` carries it: the daily prune holds
    # the exclusive lock, and without the wait an ordinary 02:30-vs-03:00 collision reads
    # as a guard failure and skips the hour.
    stats_json="$(restic stats latest --tag "$tag" --retry-lock "$RESTIC_RETRY_LOCK" --json 2>&1)" || status=$?
    if [[ "$status" -ne 0 ]]; then
        log "ERROR: could not read the previous ${tag} snapshot size (restic exit ${status}): ${stats_json}"
        log "ERROR: skipping the ${tag} snapshot this run; the next scheduled run retries."
        return "$EXIT_STEP_ERROR"
    fi
    # An empty repository is exit 0 with "snapshots_count":0, not an error.
    if grep -q '"snapshots_count":0[,}]' <<<"$stats_json"; then
        log "No previous ${tag} snapshot to compare against; archiving ${new_size} bytes"
        return 0
    fi
    prev_size="$(sed -n 's/.*"total_size":\([0-9]*\).*/\1/p' <<<"$stats_json")"
    if [[ -z "$prev_size" || "$prev_size" == 0 ]]; then
        log "ERROR: previous ${tag} snapshot reports no size; refusing to guess. Output: ${stats_json}"
        return "$EXIT_STEP_ERROR"
    fi

    pct=$((new_size * 100 / prev_size))
    if ((pct < ratio)); then
        log "ERROR: new ${tag} data is ${pct}% of the previous snapshot (${new_size} vs ${prev_size} bytes)."
        log "ERROR: refusing to archive it -- a collapsed snapshot would age out the good ones."
        log "ERROR: if this shrink is real, re-run with RESTIC_MIN_DUMP_RATIO=0. See deploy/DEPLOY-PROD.md Part 1.1."
        return "$EXIT_REFUSED"
    fi
    log "${tag} size ${new_size} bytes (${pct}% of previous); archiving"
}

# The uploads volume identifies itself: Docker recreates a missing named volume silently
# and empty, and the app refills files/ and images/ at startup, so a directory check
# alone passes on a volume that lost everything -- or on the wrong environment's volume
# after a mistyped `-p`, which a size check can't catch at all. Written once by
# `just backup-init <env>`; unset RELAB_ENVIRONMENT (dev, CI) skips the check.
UPLOADS_CANARY_NAME=".relab-volume"

assert_uploads_volume_identity() {
    local canary="${UPLOADS_DIR}/${UPLOADS_CANARY_NAME}" found
    # NOTE: unset means off, so a hand-rolled `docker run` outside compose.deploy.yaml
    # gets no identity check. Deliberate -- dev, CI, and the image smoke run that way.
    if [[ -z "${RELAB_ENVIRONMENT:-}" ]]; then
        log "RELAB_ENVIRONMENT is unset; skipping the uploads volume identity check"
        return 0
    fi

    if [[ ! -f "$canary" ]]; then
        log "ERROR: ${canary} is missing, so this is not the ${RELAB_ENVIRONMENT} uploads volume or it has been emptied."
        log "ERROR: refusing to archive it -- an empty snapshot would age out the good ones. See deploy/DEPLOY-PROD.md Part 1.1 before running backup-stamp-volume."
        return "$EXIT_REFUSED"
    fi
    # Checked separately: an unreadable marker would abort under `set -e` with a bare
    # "Permission denied" instead of a diagnostic -- the uploads tree has carried the
    # wrong ownership before.
    if [[ ! -r "$canary" ]]; then
        log "ERROR: ${canary} is not readable by this run (uid $(id -u)); fix its ownership before archiving."
        return "$EXIT_REFUSED"
    fi
    found="$(tr -d '[:space:]' <"$canary")"
    if [[ "$found" != "$RELAB_ENVIRONMENT" ]]; then
        log "ERROR: ${canary} says '${found}' but this run is '${RELAB_ENVIRONMENT}'; refusing to archive another environment's uploads. See deploy/DEPLOY-PROD.md Part 1.1."
        return "$EXIT_REFUSED"
    fi
}

# File-node bytes only, matching `restic stats` in restore-size mode: `du -sb` would add
# each directory's own 4096 bytes, letting a tree that lost every file but kept its
# skeleton pass the collapse guard. Prints nothing and returns 1 if the tree can't be
# walked; the caller logs that.
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
    assert_uploads_volume_identity || return $?
    if ! new_size="$(uploads_size)"; then
        log "ERROR: could not size the uploads tree at ${UPLOADS_DIR}; skipping the snapshot rather than archiving a total that may be short."
        return "$EXIT_STEP_ERROR"
    fi
    assert_not_collapsed user-uploads "$new_size" || return $?

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
    # Exit 10 is actionable here, unlike above: a remote path can't be an empty directory
    # left by a failed mount, so auto-init is safe.
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
    CYCLE_STATUS=0
    if [[ "$maintenance" != "only" ]]; then
        # Tested rather than left to `set -e`: one failing step must not stop the other
        # half, and a failed step took no snapshot, so it must not set did_backup and
        # pull the prune forward on a run that archived nothing.
        if [[ "${SKIP_DATABASE_BACKUP:-false}" != "true" ]]; then
            if backup_database; then did_backup=true; else record_step_failure "$?"; fi
        fi
        if [[ "${SKIP_UPLOAD_BACKUP:-false}" != "true" ]]; then
            if backup_uploads; then did_backup=true; else record_step_failure "$?"; fi
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

    if ((CYCLE_STATUS == EXIT_REFUSED)); then
        log "ERROR: a backup step refused to archive (see above). Maintenance still ran, but this run did not archive everything it should have."
    elif ((CYCLE_STATUS != 0)); then
        log "ERROR: a backup step could not complete (see above). Maintenance still ran; the next scheduled run retries."
    fi
    return "$CYCLE_STATUS"
}

# Sourced by scripts/test_ops.sh to exercise run_cycle with stubs; only run main
# when executed directly.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
