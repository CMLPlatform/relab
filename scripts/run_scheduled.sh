#!/usr/bin/env bash
# VENDORED from the central monitoring repo at a pinned tag. Generic: nothing here
# names a project or a job list.
#
# Run one scheduled job and report the result to a dead-man's switch.
#
# Usage: run_scheduled.sh <job> <env>
#   job  — any name; it selects the ping URL variable and the command below.
#   env  — the deployment environment, passed through to the command.
#
# Called by this host's systemd units. This is the ONE piece of monitoring
# that does not share fate with the observability stack, and that is its whole reason to
# exist. Everything else — logs, traces, host metrics — flows through Alloy to the
# department collector, so a dead host, a dead collector, a broken tunnel or an expired
# token all look identical from Grafana: silence. A push from the host to an external
# endpoint is the one signal that still arrives when that pipeline is the thing that
# broke, and its absence is itself the alarm.
#
# The ping lives here rather than in each unit so the reporting is written once.
#
# Ping URLs come from the host file loaded by the units, never from the repository —
# they are capability URLs. bootstrap.sh on the central host prints the PING_* block. An unset URL disables the ping
# for that job without failing it, so a host that has not been wired up yet still runs
# its jobs.
set -uo pipefail

job="${1:-}"
env_name="${2:-}"

if [[ -z "$job" || -z "$env_name" ]]; then
    echo "usage: $0 <job> <env>" >&2
    exit 2
fi
# Job and env become part of an environment-variable name below, so keep them to
# characters that can appear in one — a stray character would silently look up the
# wrong variable and disable the ping rather than fail.
if [[ ! "$job" =~ ^[A-Za-z0-9_-]+$ || ! "$env_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "error: job and env must match [A-Za-z0-9_-]+" >&2
    exit 2
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

# `just` is resolved at unit-render time and passed in; fall back to PATH for manual runs.
JUST_BIN="${JUST_BIN:-just}"

# One `just` recipe per job, named the same as the job — that identity is the contract,
# which is why there is no mapping table here. Projects that do not use `just` can point
# JUST_BIN at any runner with the same shape.
command=("$JUST_BIN" "$job" "$env_name")

# One variable per job, so each gets its own check. Sharing a URL would let a frequent
# job's pings mask a rare one's silence — exactly the failure the rare job exists to catch.
url_var="PING_${job//-/_}"
url_var="${url_var^^}"
ping_url="${!url_var:-}"

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

# A killed job must still report. systemd's TimeoutStartSec TERMs the whole cgroup:
# the job dies, and without this trap bash would die too — before the ping block —
# so a HUNG job would send neither success nor failure and its captured output would
# be lost. The job runs in the background so `wait` can be interrupted by the signal;
# the child has already received the same TERM from systemd (KillMode=control-group).
# shellcheck disable=SC2329  # invoked via the TERM/INT traps below
on_terminate() {
    local sig="$1"
    echo "run_scheduled: received SIG${sig}; job killed (likely a systemd timeout)" >>"$output_file"
    cat "$output_file"
    if [[ -n "$ping_url" ]]; then
        curl -fsS -m 10 --retry 3 --data-binary "@${output_file}" "${ping_url}/fail" -o /dev/null \
            || echo "WARNING: failure ping to ${url_var} failed" >&2
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
    # Send the job's own output as the failure body: the alert then carries the reason,
    # instead of only saying that something went wrong. Note this puts job output —
    # hostnames, paths, restic summaries — in a third party's hands; it is why the ping
    # carries no credentials and why the URL itself is the only secret.
    curl -fsS -m 10 --retry 3 --data-binary "@${output_file}" "${ping_url}/fail" -o /dev/null \
        || echo "WARNING: failure ping to ${url_var} failed" >&2
fi

exit "$status"
