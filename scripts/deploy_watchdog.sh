#!/usr/bin/env bash
# Watchdog for a deployed stack: exits non-zero with a reason when any stack
# service is down or unhealthy, the newest restic snapshot is older than the
# allowed age, a scheduled-job timer is unwired, or the checkout has drifted.
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

# Reducer for check 5, in a function so scripts/test_ops.sh can drive the real code.
# Prints one ALERT line per problem and returns how many it printed.
#
# The two credentials on the telemetry path fail in different places: the edge key gets
# a request past Cloudflare's bot products, the bearer token gets it into the collector.
# The remedies live in different systems, so the alert has to say which failed.
# A challenged export is dropped silently — the SDK logs an export error and the
# application carries on. Relab's zone owns the skip rule for `otel.`, which the whole
# CML monitoring hub ships to, so a mismatch here is not only Relab's outage.
telemetry_ingress_alerts() {
    local env="$1" status="$2" cf_mitigated="$3" failures=0

    if [[ -n "$cf_mitigated" ]]; then
        echo "ALERT[$env]: telemetry exports are challenged at the edge (HTTP ${status}, cf-mitigated=${cf_mitigated}); the Cloudflare skip rule is missing or TELEMETRY_EDGE_KEY does not match TF_VAR_telemetry_edge_key" >&2
        return 1
    fi

    case "$status" in
        2*) ;;
        401 | 403)
            echo "ALERT[$env]: the telemetry collector rejected the bearer token (HTTP ${status}); OTLP_AUTH_TOKEN is stale or wrong" >&2
            failures=1
            ;;
        000 | "")
            echo "ALERT[$env]: telemetry endpoint unreachable" >&2
            failures=1
            ;;
        *)
            echo "ALERT[$env]: telemetry endpoint returned HTTP ${status}" >&2
            failures=1
            ;;
    esac
    return "$failures"
}

# Reducer for check 4, in a function so scripts/test_ops.sh can drive the real code
# without a repository in a known state. Prints one ALERT line per problem and returns
# how many it printed. Inputs are gathered from git below.
#
# `ahead` counts as drift too: prod has been found carrying local commits that existed
# nowhere else.
deployment_drift_alerts() {
    local env="$1" dirty="$2" upstream="$3" behind="$4" ahead="$5"
    local found=0

    if [[ "$dirty" == yes ]]; then
        echo "ALERT[$env]: deploy checkout has uncommitted changes" >&2
        found=$((found + 1))
    fi

    if [[ -z "$upstream" ]]; then
        # No upstream means drift cannot be measured at all.
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
# reports the timers.target.wants symlink, so a timer enabled without --now, stopped for
# a maintenance window, or never re-armed after a daemon-reload still reads "enabled"
# while never firing again.
backup_timer_alerts() {
    local env="$1" timer="$2" enabled="$3" active="$4" failed="$5" result="$6"
    # The service name follows from the timer name for every relab-*@ unit, so the
    # same reducer covers backup, watchdog and restore-check alike.
    local service="${timer%.timer}.service"
    local found=0

    if [[ "$enabled" != "enabled" ]]; then
        echo "ALERT[$env]: $timer is '${enabled:-not installed}', not 'enabled'; its job is not scheduled" >&2
        found=$((found + 1))
    elif [[ "$active" != "active" ]]; then
        echo "ALERT[$env]: $timer is enabled but '${active:-inactive}'; it will not fire" >&2
        found=$((found + 1))
    fi

    # Independent of the timer state: the unit can be scheduled correctly and still
    # have failed last night.
    if [[ "$failed" == "yes" ]]; then
        echo "ALERT[$env]: last $service run failed (Result=${result:-unknown}); see: journalctl -u $service" >&2
        found=$((found + 1))
    fi

    return "$found"
}

# Reducer for check 3's staleness half, in a function so scripts/test_ops.sh can drive
# the real code. Prints one ALERT line per problem and returns how many it printed.
#
# A timer can be enabled, active, and last have exited 0, and still not have run for
# months; systemd reports nothing wrong. That is the monthly restore-check's failure
# mode, and the restore check is the only proof a snapshot restores.
#
# `last_trigger` is systemd's LastTriggerUSec as epoch seconds; 0 means never fired,
# and "unparseable" means systemd printed a date that date(1) could not read.
timer_staleness_alerts() {
    local env="$1" timer="$2" last_trigger="$3" now="$4" max_age_hours="$5" age_hours

    if [[ "$last_trigger" == 0 ]]; then
        # Persistent=true units fire at boot if they missed a window, so "never" on an
        # installed timer means it has not yet reached its first window — not an error.
        return 0
    fi
    if [[ "$last_trigger" == unparseable ]]; then
        # An unparsed value switches this check off for every timer at once, so name
        # the cause rather than returning 0.
        echo "ALERT[$env]: cannot parse LastTriggerUSec for $timer; the staleness check is not running" >&2
        return 1
    fi

    age_hours=$(((now - last_trigger) / 3600))
    if ((age_hours > max_age_hours)); then
        echo "ALERT[$env]: $timer last ran ${age_hours}h ago, over its ${max_age_hours}h limit; it is scheduled but not firing" >&2
        return 1
    fi
    return 0
}

# Reducer for check 1, in a function so scripts/test_ops.sh can drive the real code.
# `state` is `docker inspect`'s status plus health ("running healthy"), bare status
# for services without a healthcheck, or "" when the container does not exist at all.
service_state_alerts() {
    local env="$1" service="$2" state="$3"
    case "$state" in
        "")
            echo "ALERT[$env]: $service container is not running" >&2
            return 1
            ;;
        running | "running healthy") ;;
        *)
            echo "ALERT[$env]: $service container state is '$state'" >&2
            return 1
            ;;
    esac
    return 0
}

# Reducers for check 3b, in functions so scripts/test_ops.sh can drive the real code.
#
# ping_url_value resolves one PING_* value the way the running unit sees it: from the
# host env file when it is readable, otherwise from this process's own environment.
# systemd reads EnvironmentFile= as root, so a root-owned 0600 file still delivers its
# values to the unit while being unreadable here. Returns 1 when neither source answers.
ping_url_value() {
    local host_env_file="$1" ping_var="$2"
    if [[ -r "$host_env_file" ]]; then
        # Last assignment wins, matching how systemd loads EnvironmentFile=.
        sed -n "s/^${ping_var}=//p" "$host_env_file" | tail -n 1
        return 0
    fi
    if [[ -n "${!ping_var+set}" ]]; then
        printf '%s' "${!ping_var}"
        return 0
    fi
    return 1
}

# An empty or whitespace-only URL means run_scheduled.sh treats pinging as
# deliberately off, so that job's failures never leave this host.
ping_url_alerts() {
    local env="$1" ping_var="$2" host_env_file="$3" value="$4"
    if [[ -z "${value//[[:space:]]/}" ]]; then
        echo "ALERT[$env]: ${ping_var} is empty in ${host_env_file}; that job's failures are invisible outside this host" >&2
        return 1
    fi
    return 0
}

# Reducer for check 2b. `pcent` is df's used percentage for the filesystem holding
# the restic repository, as a bare number; "" means df could not read it.
disk_usage_alerts() {
    local env="$1" path="$2" pcent="$3" threshold="$4"
    if [[ ! "$pcent" =~ ^[0-9]+$ ]]; then
        echo "ALERT[$env]: cannot read free space for the backup directory $path" >&2
        return 1
    fi
    if ((pcent >= threshold)); then
        echo "ALERT[$env]: the filesystem holding $path is ${pcent}% full (limit ${threshold}%); hourly snapshots will fill it" >&2
        return 1
    fi
    return 0
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

mapfile -t compose_command < <(compose_args "$env")

# Check 1: every long-lived service in the stack. A dead cloudflared makes the site
# publicly unreachable while the api reads healthy, and cloudflared, the frontends and
# postgres have no other local check. The expected set comes from compose itself
# (`config --services` lists no profiled services), so overlay-added services are covered
# on the hosts that run them and profile-gated one-shots (backup, migrator, clamav) are
# not demanded. Every docker call is time-bounded so a wedged dockerd produces an alert
# instead of parking this job until systemd kills it without a ping.
stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

# Stderr stays out of the captured value even on success: Compose writes warnings
# there (an unset ${VAR}, a deprecation), and merged into the list they would
# word-split into bogus service names that all read "not running".
if ! expected_services="$(timeout 60 "${compose_command[@]}" config --services 2>"$stderr_file")"; then
    # A stack that cannot be resolved (missing .env value, no daemon) is its own
    # failure mode, distinct from "api down".
    echo "ALERT[$env]: cannot resolve the stack: $(tr '\n' ' ' <"$stderr_file")" >&2
    failures=$((failures + 1))
    expected_services=""
fi

for service in $expected_services; do
    # Compose writes warnings to stderr; merged into the id they turn a healthy stack
    # into a false alarm. A resolve failure is already reported above, and an empty id
    # is an alert regardless of the cause.
    service_id="$(timeout 60 "${compose_command[@]}" ps -q "$service" 2>/dev/null || true)"
    service_state=""
    if [[ -n "$service_id" ]]; then
        service_state="$(timeout 60 docker inspect \
            --format '{{.State.Status}}{{if .State.Health}} {{.State.Health.Status}}{{end}}' \
            "$service_id" 2>/dev/null || echo unknown)"
    fi
    service_state_alerts "$env" "$service" "$service_state" || failures=$((failures + 1))
done

# Check 2: newest restic snapshot age, read through the backup image because the host
# has no restic. The backup service sits in the `backups` profile, so pass it explicitly
# the way `stack ... migrate` does. --no-deps keeps the watchdog from starting postgres;
# a missing image fails the run, which is itself an alert.
# Compose writes progress to stderr, so keep stderr in a file rather than merging it into
# the JSON. `timeout` bounds a hung docker or restic. compose_args is used directly
# instead of run_deploy_compose so `timeout` can prefix the real command.
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
    timeout --foreground 600 "${compose_command[@]}" --profile backups run --rm --no-deps -T --entrypoint restic backup \
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

# Check 2b: free space where the restic repository lives. Hourly snapshots of compressed
# dumps deduplicate poorly and retention is applied once a day, so the repository grows
# in steps. It shares the host disk with postgres, so a full disk takes the database down
# with the backups.
backup_host_dir="${BACKUP_HOST_DIR:-}"
[[ -n "$backup_host_dir" ]] || backup_host_dir="$(
    set -a
    # shellcheck source=/dev/null
    [[ -f .env ]] && . ./.env >/dev/null 2>&1
    printf '%s' "${BACKUP_HOST_DIR:-./backups}"
)"
disk_pcent="$(timeout 30 df --output=pcent "$backup_host_dir" 2>/dev/null | tail -n1 | tr -dc '0-9' || true)"
disk_usage_alerts "$env" "$backup_host_dir" "$disk_pcent" "${BACKUP_DISK_ALERT_PCENT:-85}" || failures=$((failures + 1))

# Check 3: all four scheduled-job timers. Check 2 proves a recent snapshot exists, i.e.
# that some run produced output. This proves each job is still scheduled and that its
# last run did not fail. A timer that stopped being scheduled reads healthy until its
# output ages out (35+ days for restore-check), and a run that failed after producing
# output (a failed offsite copy) reads as success.
if ! command -v systemctl >/dev/null 2>&1; then
    echo "ALERT[$env]: systemctl not found; cannot verify the scheduled-job timers" >&2
    failures=$((failures + 1))
else
    # Per-job staleness limits: multiples of each period, so a reboot or a skipped
    # window does not alert. The two hourly jobs carry no RandomizedDelaySec, so one
    # missed cycle of slack is enough; the daily and monthly ones jitter and get more.
    # Keys are QUOTED deliberately: an unquoted associative-array subscript is an
    # arithmetic context, so `[relab-backup]` is read as a subtraction and shfmt
    # reformats it to `[relab - backup]`. Every key then evaluates to 0 and every
    # lookup fails under `set -u`.
    declare -A job_max_age_hours=(
        ["relab-backup"]=2
        ["relab-backup-maintenance"]=26
        ["relab-watchdog"]=2
        ["relab-restore-check"]=960
    )
    now_epoch="$(date +%s)"

    for job in relab-backup relab-backup-maintenance relab-watchdog relab-restore-check; do
        unit_timer="${job}@${env}.timer"
        unit_service="${job}@${env}.service"
        # All read-only queries; none need privilege. `|| true` because each of these
        # exits non-zero to *report* a state rather than to signal an error.
        timer_enabled="$(systemctl is-enabled "$unit_timer" 2>/dev/null || true)"
        timer_active="$(systemctl is-active "$unit_timer" 2>/dev/null || true)"
        unit_result="$(systemctl show "$unit_service" -p Result --value 2>/dev/null || true)"
        unit_failed=no
        if systemctl is-failed --quiet "$unit_service" 2>/dev/null; then
            unit_failed=yes
        fi

        backup_timer_alerts "$env" "$unit_timer" "$timer_enabled" "$timer_active" \
            "$unit_failed" "$unit_result" || failures=$((failures + $?))

        # LastTriggerUSec is a human date; ask date(1) to parse it back, under LC_ALL=C
        # so a locale in the unit environment cannot change the format. "n/a" (never
        # fired) becomes 0; anything else date(1) rejects is reported, because a parser
        # broken by a format change has silently disabled this check for every timer.
        last_trigger_raw="$(LC_ALL=C systemctl show "$unit_timer" -p LastTriggerUSec --value 2>/dev/null || true)"
        if [[ -z "$last_trigger_raw" || "$last_trigger_raw" == "n/a" ]]; then
            last_trigger_epoch=0
        else
            last_trigger_epoch="$(LC_ALL=C date -d "$last_trigger_raw" +%s 2>/dev/null || echo unparseable)"
        fi
        timer_staleness_alerts "$env" "$unit_timer" "$last_trigger_epoch" "$now_epoch" \
            "${job_max_age_hours[$job]}" || failures=$((failures + $?))
    done
fi

# Check 3b: the dead-man's-switch wiring itself. run_scheduled.sh treats an empty URL as
# "pinging off", so a host where timers-install seeded the file but nobody filled it in
# fails silently with every other check green. Only checked when the host file exists: a
# missing file means this machine runs no timers.
#
# Only PING_WATCHDOG is required; the other jobs report through the watchdog.
host_env_file="${RELAB_HOST_ENV:-/etc/relab/relab.env}"
if [[ -f "$host_env_file" ]]; then
    ping_var=PING_WATCHDOG
    if ping_value="$(ping_url_value "$host_env_file" "$ping_var")"; then
        ping_url_alerts "$env" "$ping_var" "$host_env_file" "$ping_value" || failures=$((failures + 1))
    else
        echo "ALERT[$env]: cannot read ${host_env_file} and ${ping_var} is not in the environment; re-run 'just timers-install $env' to fix the file's ownership" >&2
        failures=$((failures + 1))
    fi
fi

# Check 4: deployment drift. Everything above proves the stack is running, not that it
# runs the expected code. A deploy host sitting months behind origin is otherwise only
# found by hand.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "ALERT[$env]: deploy directory is not a git checkout" >&2
    failures=$((failures + 1))
else
    # Remote-tracking refs go stale without this, and a stale ref reports "no drift"
    # forever. A fetch failure is reportable too: the answer is then unknown.
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

# Check 5: telemetry actually reaches the collector. No other check here covers
# observability, and the failure is silent. Probed from inside the api container so the
# credentials tested are the ones it ships with, not a re-derivation from .env. The
# request body is empty: the collector accepts it as a no-op export, so this writes no
# spans.
# The probe speaks OTLP/HTTP and is skipped when the container exports over gRPC
# (OTEL_EXPORTER_OTLP_PROTOCOL is an operator input): a POST at a gRPC listener is a
# permanent false alarm.
telemetry_container="relab_${env}-api-1"
telemetry_env="$(docker inspect "$telemetry_container" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true)"
if [[ "$(docker inspect -f '{{.State.Running}}' "$telemetry_container" 2>/dev/null)" == "true" ]] \
    && grep -q '^OTEL_EXPORTER_OTLP_ENDPOINT=.' <<<"$telemetry_env" \
    && ! grep -q '^OTEL_EXPORTER_OTLP_PROTOCOL=grpc' <<<"$telemetry_env"; then
    # Prints "<status> <cf-mitigated>" and nothing else: the credentials must not reach
    # the watchdog's output, which goes to cron mail and the ntfy relay.
    telemetry_probe="$(
        timeout 60 docker exec -i "$telemetry_container" python3 - <<'PY' 2>/dev/null || true
import os, urllib.request, urllib.parse, urllib.error

headers = {}
for pair in os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "").split(","):
    if "=" in pair:
        key, value = pair.split("=", 1)
        headers[key] = urllib.parse.unquote(value)
headers["Content-Type"] = "application/x-protobuf"

url = os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"].rstrip("/") + "/v1/traces"
try:
    response = urllib.request.urlopen(
        urllib.request.Request(url, data=b"", method="POST", headers=headers), timeout=20
    )
    status, received = response.status, response.headers
except urllib.error.HTTPError as exc:
    status, received = exc.code, exc.headers
except Exception:
    # Unreachable, DNS failure, TLS error: report it as a status the reducer knows.
    print("000 ")
    raise SystemExit(0)
print(status, received.get("cf-mitigated", ""))
PY
    )"
    telemetry_status="$(printf '%s' "$telemetry_probe" | awk '{print $1}')"
    telemetry_mitigated="$(printf '%s' "$telemetry_probe" | awk '{print $2}')"
    telemetry_ingress_alerts "$env" "${telemetry_status:-000}" "$telemetry_mitigated" \
        || failures=$((failures + $?))
fi

exit "$failures"
