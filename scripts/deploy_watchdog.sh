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
# starting postgres, and --no-build makes a missing image an alert instead of a
# build kicked off by cron.
newest_epoch="$(
    run_deploy_compose "$env" --profile backups run --rm --no-deps --no-build --entrypoint restic backup \
        snapshots --latest 1 --json --no-lock 2>/dev/null \
        | python3 -c '
import datetime, json, re, sys

snapshots = json.load(sys.stdin)
if not snapshots:
    print(0)
else:
    # restic stamps nanosecond precision, which fromisoformat rejects.
    print(int(datetime.datetime.fromisoformat(re.sub(r"\.\d+", "", snapshots[-1]["time"])).timestamp()))
' 2>/dev/null || echo 0
)"
[[ "$newest_epoch" =~ ^[0-9]+$ ]] || newest_epoch=0
now="$(date +%s)"
if ((newest_epoch == 0 || now - newest_epoch > max_age_hours * 3600)); then
    echo "ALERT[$env]: newest restic snapshot is missing or older than ${max_age_hours}h" >&2
    failures=$((failures + 1))
fi

exit "$failures"
