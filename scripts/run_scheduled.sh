#!/usr/bin/env bash
# VENDORED from the CML monitoring repository at a pinned tag.
#
# Run one scheduled job and report the result to a dead man's switch (healthchecks.io).
# This is the one piece of monitoring that does not share fate with the observability
# stack: a push to an external endpoint still arrives when the telemetry pipeline is
# what broke, and its absence is the alarm.
#
# Usage: run_scheduled.sh <job> <env>
#   job: selects the `just` recipe and the PING_<JOB> URL variable.
#   env: passed through to the recipe.
#
# Ping URLs are capability URLs: they come from the host file the systemd units load,
# never from the repository. bootstrap.sh prints the PING_* block. An unset URL
# disables the ping for that job without failing it.
set -uo pipefail

job="${1:-}"
env_name="${2:-}"

if [[ -z "$job" || -z "$env_name" ]]; then
    echo "usage: $0 <job> <env>" >&2
    exit 2
fi
# Job and env become part of a variable name below; a stray character would look up
# the wrong variable and silently disable the ping.
if [[ ! "$job" =~ ^[A-Za-z0-9_-]+$ || ! "$env_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "error: job and env must match [A-Za-z0-9_-]+" >&2
    exit 2
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

JUST_BIN="${JUST_BIN:-just}"

# One recipe per job, named the same. Projects without `just` can point JUST_BIN at any
# runner with the same shape.
command=("$JUST_BIN" "$job" "$env_name")

# One URL per job: a shared one would let a frequent job's pings mask a rare one's silence.
url_var="PING_${job//-/_}"
url_var="${url_var^^}"
ping_url="${!url_var:-}"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

# The job's output is the failure body, so the alert carries the reason. This puts job
# output in a third party's hands; keep credentials out of it.
ping_fail() {
    curl -fsS -m 10 --retry 3 --data-binary "@${output_file}" "${ping_url}/fail" -o /dev/null \
        || echo "WARNING: failure ping to ${url_var} failed" >&2
}

# A killed job must still report: systemd's TimeoutStartSec TERMs the whole cgroup, and
# without this trap a hung job would send neither ping. The job runs in the background
# so `wait` can be interrupted; the child receives the same TERM from systemd.
# shellcheck disable=SC2329  # invoked via the TERM/INT traps below
on_terminate() {
    local sig="$1"
    echo "run_scheduled: received SIG${sig}; job killed (likely a systemd timeout)" >>"$output_file"
    cat "$output_file"
    if [[ -n "$ping_url" ]]; then
        ping_fail
    fi
    rm -f "$output_file"
    exit 143
}
trap 'on_terminate TERM' TERM
trap 'on_terminate INT' INT

status=0
"${command[@]}" >"$output_file" 2>&1 &
wait $! || status=$?
cat "$output_file"

if [[ -z "$ping_url" ]]; then
    exit "$status"
fi

if [[ "$status" -eq 0 ]]; then
    curl -fsS -m 10 --retry 3 "$ping_url" -o /dev/null \
        || echo "WARNING: success ping to ${url_var} failed" >&2
else
    ping_fail
fi

exit "$status"
