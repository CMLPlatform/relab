#!/usr/bin/env bash
# Watchdog for a deployed stack: exits non-zero with a reason when the API is
# unhealthy or the newest restic snapshot is older than the allowed age.
# Intended to run from host cron; cron's MAILTO (or any wrapper) delivers alerts.
set -euo pipefail

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
# scrub, overlays), so reuse run_deploy_compose instead of rebuilding it here. It
# runs main "$@" on load, hence the sourcing args: `require-confirm ... YES` is its
# only subcommand that does nothing and returns 0.
# shellcheck source=scripts/deploy_ops.sh
. scripts/deploy_ops.sh require-confirm watchdog-load watchdog-load watchdog-load YES

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
stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

newest_epoch=0
snapshot_error=""
if ! snapshots_json="$(
    run_deploy_compose "$env" --profile backups run --rm --no-deps -T --entrypoint restic backup \
        snapshots --json --no-lock 2>"$stderr_file"
)"; then
    snapshot_error="$(tr '\n' ' ' <"$stderr_file")"
elif ! newest_epoch="$(printf '%s' "$snapshots_json" | python3 -c '
import datetime, json, re, sys

# Both backup paths must be fresh: a succeeding database backup must not mask a
# failing upload one, so report the older of the two tags (tags per
# backend/scripts/backup/backup_relab_restic.sh).
newest = {}
for snapshot in json.load(sys.stdin):
    # restic stamps nanosecond precision, which fromisoformat rejects.
    taken = int(datetime.datetime.fromisoformat(re.sub(r"\.\d+", "", snapshot["time"])).timestamp())
    for tag in snapshot.get("tags") or []:
        newest[tag] = max(newest.get(tag, 0), taken)

print(min(newest.get(tag, 0) for tag in ("postgres", "user-uploads")))
' 2>"$stderr_file")"; then
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

exit "$failures"
