#!/usr/bin/env bash
# Run one scheduled Relab job and report the result to a dead-man's switch.
#
# Usage: run_scheduled.sh <backup|watchdog|restore-check> <prod|staging>
#
# Called by the systemd units in deploy/systemd/. This is the ONE piece of monitoring
# that does not share fate with the observability stack, and that is its whole reason to
# exist. Everything else — logs, traces, host metrics — flows through Alloy to the
# department collector, so a dead host, a dead collector, a broken tunnel or an expired
# token all look identical from Grafana: silence. A push from the host to an external
# endpoint is the one signal that still arrives when that pipeline is the thing that
# broke, and its absence is itself the alarm.
#
# The ping lives here rather than in each unit so the reporting is written once.
#
# Ping URLs come from the host file loaded by the units (default /etc/relab/relab.env),
# never from the repository — they are capability URLs. An unset URL disables the ping
# for that job without failing it, so a host that has not been wired up yet still runs
# its jobs.
set -uo pipefail

job="${1:-}"
env_name="${2:-}"

case "$job" in
    backup | watchdog | restore-check) ;;
    *)
        echo "usage: $0 <backup|watchdog|restore-check> <prod|staging>" >&2
        exit 2
        ;;
esac
case "$env_name" in
    prod | staging) ;;
    *)
        echo "error: env must be 'prod' or 'staging', got '${env_name}'" >&2
        exit 2
        ;;
esac

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

# `just` is resolved at unit-render time and passed in; fall back to PATH for manual runs.
JUST_BIN="${JUST_BIN:-just}"

case "$job" in
    backup) command=("$JUST_BIN" backup-run "$env_name") ;;
    watchdog) command=("$JUST_BIN" watchdog "$env_name") ;;
    restore-check) command=("$JUST_BIN" backup-restore-smoke "$env_name") ;;
esac

# One variable per job, so each gets its own check. Sharing a URL would let a frequent
# job's pings mask a rare one's silence — exactly the failure the rare job exists to catch.
url_var="RELAB_PING_${job//-/_}"
url_var="${url_var^^}"
ping_url="${!url_var:-}"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

status=0
"${command[@]}" >"$output_file" 2>&1 || status=$?
cat "$output_file"

if [[ -z "$ping_url" ]]; then
    exit "$status"
fi

if [[ "$status" -eq 0 ]]; then
    curl -fsS -m 10 --retry 3 "$ping_url" -o /dev/null \
        || echo "WARNING: success ping to ${url_var} failed" >&2
else
    # Send the job's own output as the failure body: the alert then carries the reason,
    # instead of only saying that something went wrong. Note this puts job output —
    # hostnames, paths, restic summaries — in a third party's hands; it is why the ping
    # carries no credentials and why the URL itself is the only secret.
    curl -fsS -m 10 --retry 3 --data-binary "@${output_file}" "${ping_url}/fail" -o /dev/null \
        || echo "WARNING: failure ping to ${url_var} failed" >&2
fi

exit "$status"
