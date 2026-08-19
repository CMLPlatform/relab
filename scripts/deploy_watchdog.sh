#!/usr/bin/env bash
# Watchdog for a deployed stack: exits non-zero with a reason when the API is
# unhealthy or the newest restic snapshot is older than the allowed age.
# Intended to run from host cron; cron's MAILTO (or any wrapper) delivers alerts.
set -euo pipefail

# Reducer for check 2, in a variable so scripts/test_ops.sh can drive the real code
# instead of a copy. Both backup paths must be fresh: a succeeding database backup
# must not mask a failing upload one, so report the older of the two tags (tags per
# backend/scripts/backup/backup_relab_restic.sh).
SNAPSHOT_AGE_PY='
import datetime, json, re, sys

newest = {}
for snapshot in json.load(sys.stdin):
    # restic stamps nanosecond precision, which fromisoformat rejects.
    taken = int(datetime.datetime.fromisoformat(re.sub(r"\.\d+", "", snapshot["time"])).timestamp())
    for tag in snapshot.get("tags") or []:
        newest[tag] = max(newest.get(tag, 0), taken)

print(min(newest.get(tag, 0) for tag in ("postgres", "user-uploads")))
'

# Reducer for check 4, in a function so scripts/test_ops.sh can drive the real code.
# Prints one ALERT line per problem and returns how many it printed. Inputs are
# gathered from git below; keeping the decision separate is what makes it testable
# without a repository in a known state.
#
# `ahead` matters as much as `behind`: prod was once found carrying local commits that
# existed nowhere else, which is drift in the direction nobody looks for.
deployment_drift_alerts() {
    local env="$1" dirty="$2" upstream="$3" behind="$4" ahead="$5"
    local found=0

    if [[ "$dirty" == yes ]]; then
        echo "ALERT[$env]: deploy checkout has uncommitted changes" >&2
        found=$((found + 1))
    fi

    if [[ -z "$upstream" ]]; then
        # No upstream means drift cannot be measured at all. Staying quiet here would
        # be the same silence this check exists to remove.
        echo "ALERT[$env]: deploy checkout tracks no upstream branch; drift cannot be detected" >&2
        return $((found + 1))
    fi

    if ((behind > 0 && ahead > 0)); then
        echo "ALERT[$env]: deploy checkout has diverged from $upstream ($behind behind, $ahead ahead)" >&2
        found=$((found + 1))
    elif ((behind > 0)); then
        echo "ALERT[$env]: deploy checkout is $behind commits behind $upstream" >&2
        found=$((found + 1))
    elif ((ahead > 0)); then
        echo "ALERT[$env]: deploy checkout has $ahead commits that are not on $upstream" >&2
        found=$((found + 1))
    fi

    return "$found"
}

# Reducer for check 3, in a function so scripts/test_ops.sh can drive the real code
# (systemctl is not available in that harness, and would not be worth mocking).
# Prints one ALERT line per problem and returns how many it printed.
#
# `enabled` and `active` are separate facts and both must hold. `is-enabled` only
# reports the timers.target.wants symlink, so a timer enabled without --now, stopped
# for a maintenance window, or never re-armed after a daemon-reload still reads
# "enabled" while never firing again — backups would then stop with nothing said
# until check 2 notices the snapshot ageing out, a day later.
backup_timer_alerts() {
    local env="$1" timer="$2" enabled="$3" active="$4" failed="$5" result="$6"
    local found=0

    if [[ "$enabled" != "enabled" ]]; then
        echo "ALERT[$env]: $timer is '${enabled:-not installed}', not 'enabled'; backups are not scheduled" >&2
        found=$((found + 1))
    elif [[ "$active" != "active" ]]; then
        echo "ALERT[$env]: $timer is enabled but '${active:-inactive}'; it will not fire" >&2
        found=$((found + 1))
    fi

    # Independent of the timer state: the unit can be scheduled correctly and still
    # have failed last night.
    if [[ "$failed" == "yes" ]]; then
        echo "ALERT[$env]: last relab-backup@${env}.service run failed (Result=${result:-unknown}); see: journalctl -u relab-backup@${env}.service" >&2
        found=$((found + 1))
    fi

    return "$found"
}

# Sourcing this script (scripts/test_ops.sh) only wants SNAPSHOT_AGE_PY; the live
# checks below must not run.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -lt 1 ]]; then
    echo "usage: deploy_watchdog.sh <prod|staging> [max_backup_age_hours]" >&2
    exit 2
fi

env="$1"
max_age_hours="${2:-26}"

case "$env" in
    prod | staging) ;;
    *)
        echo "error: env must be 'prod' or 'staging', got '$env'" >&2
        exit 2
        ;;
esac

if [[ ! "$max_age_hours" =~ ^[0-9]+$ ]]; then
    echo "error: max_backup_age_hours must be a whole number, got '$max_age_hours'" >&2
    exit 2
fi

# deploy_ops.sh owns the compose plumbing (project name, env-file order, shell-env
# scrub, overlays), so reuse run_deploy_compose instead of rebuilding it here.
# shellcheck source=scripts/deploy_ops.sh
. scripts/deploy_ops.sh

failures=0

# Check 1: API container health. The api service is not port-published (traffic
# arrives through the tunnel), so Docker's healthcheck is the source of truth.
# Services have no container_name, so ask compose for the id instead of guessing it.
if ! api_id="$(run_deploy_compose "$env" ps -q api 2>&1)"; then
    # A stack that cannot even be resolved (missing .env value, no daemon) is its
    # own failure mode; reporting it as "api down" would send the operator hunting.
    echo "ALERT[$env]: cannot query the stack: $api_id" >&2
    failures=$((failures + 1))
elif [[ -z "$api_id" ]]; then
    echo "ALERT[$env]: api container is not running" >&2
    failures=$((failures + 1))
else
    api_health="$(docker inspect --format '{{.State.Health.Status}}' "$api_id" 2>/dev/null || echo unknown)"
    if [[ "$api_health" != "healthy" ]]; then
        echo "ALERT[$env]: api container health is '$api_health'" >&2
        failures=$((failures + 1))
    fi
fi

# Check 2: newest restic snapshot age, read through the backup image because the
# host has no restic. The backup service sits in the `backups` profile, so pass it
# explicitly the way `stack ... migrate` does. --no-deps keeps the watchdog from
# starting postgres; a missing image fails the run, which is itself an alert.
# Compose writes progress to stderr, so keep stderr in a file instead of merging
# it into the JSON — a swallowed error here would alert on every healthy stack.
# `timeout` wraps it because a hung docker or restic would otherwise park this cron
# job forever and silently stop watching. compose_args is used directly instead of
# run_deploy_compose so `timeout` can prefix the real command.
stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

mapfile -t snapshot_command < <(compose_args "$env")

newest_epoch=0
snapshot_error=""
snapshot_status=0
snapshots_json="$(
    # --foreground keeps the child in our process group so a tty (interactive
    # cron test, manual run) doesn't SIGTTIN it on stdin access; the tradeoff is
    # timeout only kills the direct child on expiry, not the whole group — fine
    # here since `compose run --rm` cleans up its own container regardless.
    # < /dev/null makes this hang-proof independent of process-group games and
    # matches cron reality, where there is no tty to attach to.
    timeout --foreground 600 "${snapshot_command[@]}" --profile backups run --rm --no-deps -T --entrypoint restic backup \
        snapshots --json --no-lock 2>"$stderr_file" </dev/null
)" || snapshot_status=$?
if ((snapshot_status == 124)); then
    snapshot_error="timed out after 600s (hung docker or restic)"
elif ((snapshot_status != 0)); then
    snapshot_error="$(tr '\n' ' ' <"$stderr_file")"
elif ! newest_epoch="$(printf '%s' "$snapshots_json" | python3 -c "$SNAPSHOT_AGE_PY" 2>"$stderr_file")"; then
    snapshot_error="$(tr '\n' ' ' <"$stderr_file")"
    newest_epoch=0
fi
[[ "$newest_epoch" =~ ^[0-9]+$ ]] || newest_epoch=0

now="$(date +%s)"
if ((newest_epoch == 0 || now - newest_epoch > max_age_hours * 3600)); then
    reason="newest postgres/user-uploads snapshot is missing or older than ${max_age_hours}h"
    if [[ -n "$snapshot_error" ]]; then
        reason="$reason (snapshot query failed: $snapshot_error)"
    fi
    echo "ALERT[$env]: $reason" >&2
    failures=$((failures + 1))
fi

# Check 3: the backup timer. Check 2 proves a recent snapshot exists — that some run
# produced output. This proves the job is still scheduled and that its last run did
# not fail, neither of which snapshot age can show: a backup that stopped being
# scheduled looks perfectly healthy until the newest snapshot ages past the
# threshold a day later, and a run that failed after writing its snapshot (a failed
# offsite copy, say) leaves a fresh snapshot behind and reads as success.
backup_timer="relab-backup@${env}.timer"

if ! command -v systemctl >/dev/null 2>&1; then
    echo "ALERT[$env]: systemctl not found; cannot verify the backup timer" >&2
    failures=$((failures + 1))
else
    # All read-only queries; none need privilege. `|| true` because each of these
    # exits non-zero to *report* a state rather than to signal an error.
    timer_enabled="$(systemctl is-enabled "$backup_timer" 2>/dev/null || true)"
    timer_active="$(systemctl is-active "$backup_timer" 2>/dev/null || true)"
    backup_result="$(systemctl show "relab-backup@${env}.service" -p Result --value 2>/dev/null || true)"
    backup_failed=no
    if systemctl is-failed --quiet "relab-backup@${env}.service" 2>/dev/null; then
        backup_failed=yes
    fi

    backup_timer_alerts "$env" "$backup_timer" "$timer_enabled" "$timer_active" \
        "$backup_failed" "$backup_result" || failures=$((failures + $?))
fi

# Check 4: deployment drift. Everything above proves the stack is running; none of it
# proves it is running the code you think. A deploy host quietly sitting months behind
# origin is otherwise only discovered by hand, which is exactly the
# kind of thing a watchdog should be saying out loud.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "ALERT[$env]: deploy directory is not a git checkout" >&2
    failures=$((failures + 1))
else
    # Remote-tracking refs go stale without this, and a stale ref reports "no drift"
    # forever. A fetch failure is itself reportable: it means the answer is unknown.
    if ! timeout 60 git fetch --quiet origin 2>/dev/null; then
        echo "ALERT[$env]: cannot fetch origin; drift is measured against stale refs" >&2
        failures=$((failures + 1))
    fi

    drift_dirty=no
    [[ -n "$(git status --porcelain 2>/dev/null)" ]] && drift_dirty=yes

    drift_upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
    drift_behind=0
    drift_ahead=0
    if [[ -n "$drift_upstream" ]]; then
        # --left-right counts both sides in one pass: left is upstream-only (behind),
        # right is local-only (ahead).
        read -r drift_behind drift_ahead < <(git rev-list --left-right --count "$drift_upstream...HEAD" 2>/dev/null || echo "0 0")
    fi

    deployment_drift_alerts "$env" "$drift_dirty" "$drift_upstream" "$drift_behind" "$drift_ahead" || failures=$((failures + $?))
fi

exit "$failures"
