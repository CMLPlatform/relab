#!/usr/bin/env bash
# Unit tests for the pure decision logic in scripts/deploy_ops.sh and
# scripts/deploy_watchdog.sh: no docker, no network, no writes outside mktemp.
# Compose rendering itself is covered by `just compose-config` and the CI smoke legs.
# Run with: bash scripts/test_ops.sh
set -uo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." || exit 1

# shellcheck source=/dev/null
. scripts/deploy_ops.sh
# shellcheck source=/dev/null
. scripts/deploy_watchdog.sh # returns after defining SNAPSHOT_AGE_PY

# The sourced scripts turn on errexit; the harness must survive a failing assert.
set +e

checks=0
failures=0

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    checks=$((checks + 1))
    [[ "$expected" == "$actual" ]] && return 0
    failures=$((failures + 1))
    printf 'FAIL: %s\n  expected: %s\n  actual:   %s\n' "$label" "$expected" "$actual"
}

# ---------------------------------------------------------------------------
# `stack ENV up` malware-scan guard: how the .env value is read decides whether
# uploads fail closed against a missing clamav container. Exercised through
# stack_command itself, which reaches require_confirmation (exit 1) when the guard
# passes and exits 2 when it blocks — neither path runs docker.
# ---------------------------------------------------------------------------
scan_guard() {
    local env_line="$1"
    shift
    local dir out status
    dir="$(mktemp -d)"
    [[ "$env_line" == "__no_env_file__" ]] || printf '%s\n' "$env_line" >"$dir/.env"
    out="$(cd "$dir" && FORCE='' stack_command prod up "$@" 2>&1)"
    status=$?
    rm -rf "$dir"
    case "$status" in
        2) [[ "$out" == *"MALWARE_SCAN_ENABLED is not 'false'"* ]] && echo blocked || echo "unexpected: $out" ;;
        1) [[ "$out" == *"Refusing to start"* ]] && echo allowed || echo "unexpected: $out" ;;
        *) echo "unexpected status $status: $out" ;;
    esac
}

assert_eq "scan guard: bare false" allowed "$(scan_guard 'MALWARE_SCAN_ENABLED=false')"
assert_eq 'scan guard: double-quoted false' allowed "$(scan_guard 'MALWARE_SCAN_ENABLED="false"')"
assert_eq "scan guard: single-quoted false" allowed "$(scan_guard "MALWARE_SCAN_ENABLED='false'")"
assert_eq "scan guard: quoted false with inline comment" allowed "$(scan_guard 'MALWARE_SCAN_ENABLED="false"  # scanning off')"
assert_eq "scan guard: true blocks" blocked "$(scan_guard 'MALWARE_SCAN_ENABLED=true')"
assert_eq "scan guard: unbalanced quote fails closed" blocked "$(scan_guard 'MALWARE_SCAN_ENABLED="false')"
assert_eq "scan guard: empty value fails closed" blocked "$(scan_guard 'MALWARE_SCAN_ENABLED=')"
assert_eq "scan guard: missing .env fails closed" blocked "$(scan_guard __no_env_file__)"
assert_eq "scan guard: last assignment wins" blocked \
    "$(scan_guard 'MALWARE_SCAN_ENABLED=false
MALWARE_SCAN_ENABLED=true')"
assert_eq "scan guard: scanning profile allows true" allowed "$(scan_guard 'MALWARE_SCAN_ENABLED=true' scanning)"

# ---------------------------------------------------------------------------
# Secret templating: what each secret class is seeded with.
# ---------------------------------------------------------------------------
oauth_secret="$(deploy_secret_template_value prod google_oauth_client_secret)"
assert_eq "oauth client secret templates empty" "" "$oauth_secret"
assert_eq "graph client secret templates empty" "" "$(deploy_secret_template_value prod microsoft_graph_client_secret)"

rclone_conf="$(deploy_secret_template_value prod rclone.conf)"
assert_eq "rclone.conf is non-empty" 0 "$([[ -n "$rclone_conf" ]] && echo 0 || echo 1)"
assert_eq "rclone.conf is comments only" "" "$(grep -v '^#' <<<"$rclone_conf")"
assert_eq "rclone.conf carries no placeholder marker" "" "$(grep -o 'replace-me-' <<<"$rclone_conf")"

key="$(deploy_secret_template_value prod data_encryption_key)"
assert_eq "data_encryption_key is unpadded 32-byte base64url" ok \
    "$([[ "$key" =~ ^[A-Za-z0-9_-]{43}$ ]] && echo ok || echo "got '$key'")"

token_a="$(deploy_secret_template_value prod auth_token_secret)"
token_b="$(deploy_secret_template_value prod auth_token_secret)"
assert_eq "generated secrets are random" different \
    "$([[ "$token_a" != "$token_b" && -n "$token_a" ]] && echo different || echo same)"
assert_eq "generated secrets carry no placeholder marker" ok \
    "$([[ "$token_a" != replace-me-* && "$token_a" != placeholder-* ]] && echo ok || echo "got '$token_a'")"

# ---------------------------------------------------------------------------
# Small deploy decisions.
# ---------------------------------------------------------------------------
assert_eq "compose env file for prod" "deploy/env/prod.compose.env" "$(compose_env_file prod)"
assert_eq "compose env file for staging" "deploy/env/staging.compose.env" "$(compose_env_file staging)"
# These exit rather than return, so run them in a subshell and read its status.
status=0
(parse_profiles prod "migrations backups" bogus) >/dev/null 2>&1 || status=$?
assert_eq "unknown profile is rejected" 1 "$status"

status=0
(FORCE=1 require_confirmation "start the prod stack" example force-example) >/dev/null 2>&1 || status=$?
assert_eq "FORCE=1 satisfies confirmation" 0 "$status"

status=0
(FORCE='' DEPLOY_CONFIRMED=false require_confirmation "start the prod stack" example force-example) >/dev/null 2>&1 || status=$?
assert_eq "unconfirmed action is refused" 1 "$status"

# ---------------------------------------------------------------------------
# Watchdog snapshot age: the reducer must report the OLDER of the two backup tags,
# and 0 (which the caller turns into an alert) whenever a tag is missing.
# ---------------------------------------------------------------------------
older="$(date -u -d '2026-08-01T00:00:00+00:00' +%s)"
newer="$(date -u -d '2026-08-02T03:04:05+00:00' +%s)"

snapshot_age() {
    local out status
    out="$(printf '%s' "$1" | python3 -c "$SNAPSHOT_AGE_PY" 2>/dev/null)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "no snapshots reports 0" "0|0" "$(snapshot_age '[]')"
assert_eq "only postgres tagged reports 0" "0|0" \
    "$(snapshot_age '[{"time":"2026-08-02T03:04:05.123456789+00:00","tags":["postgres"]}]')"
assert_eq "both tags report the older one" "0|$older" "$(snapshot_age '[
  {"time":"2026-08-02T03:04:05.123456789+00:00","tags":["postgres"]},
  {"time":"2026-08-01T00:00:00.000000001+00:00","tags":["user-uploads"]}
]')"
# Out of order on purpose: each tag keeps its newest snapshot, not the last one seen.
assert_eq "newest per tag wins before the min" "0|$newer" "$(snapshot_age '[
  {"time":"2026-08-02T03:04:05.123456789+00:00","tags":["postgres","user-uploads"]},
  {"time":"2026-07-01T00:00:00.1+00:00","tags":["postgres"]}
]')"
assert_eq "malformed JSON exits non-zero" "1|" "$(snapshot_age 'not json')"
assert_eq "snapshot without tags exits 0 with 0" "0|0" \
    "$(snapshot_age '[{"time":"2026-08-02T03:04:05.1+00:00"}]')"

# ---------------------------------------------------------------------------
# Watchdog deployment drift: a deploy host silently behind origin is the failure
# this check exists to name, and "no upstream" must not read as "no drift".
# ---------------------------------------------------------------------------
drift() {
    local out status
    out="$(deployment_drift_alerts prod "$1" "$2" "$3" "$4" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "in sync and clean is silent" "0|" "$(drift no origin/main 0 0)"
assert_eq "behind is reported" "1|ALERT[prod]: deploy checkout is 27 commits behind origin/main" \
    "$(drift no origin/main 27 0)"
assert_eq "ahead is reported too" "1|ALERT[prod]: deploy checkout has 6 commits that are not on origin/main" \
    "$(drift no origin/main 0 6)"
assert_eq "diverged reports both sides" "1|ALERT[prod]: deploy checkout has diverged from origin/main (3 behind, 2 ahead)" \
    "$(drift no origin/main 3 2)"
assert_eq "missing upstream is itself an alert" \
    "1|ALERT[prod]: deploy checkout tracks no upstream branch; drift cannot be detected" \
    "$(drift no '' 0 0)"
# A dirty tree and a stale checkout are independent problems; reporting one must not
# swallow the other.
assert_eq "dirty and behind both count" "2|ALERT[prod]: deploy checkout has uncommitted changes
ALERT[prod]: deploy checkout is 4 commits behind origin/main" \
    "$(drift yes origin/main 4 0)"
assert_eq "dirty counts even with no upstream" "2|ALERT[prod]: deploy checkout has uncommitted changes
ALERT[prod]: deploy checkout tracks no upstream branch; drift cannot be detected" \
    "$(drift yes '' 0 0)"

# ---------------------------------------------------------------------------
# deploy_watchdog.sh check 3: backup timer state
# ---------------------------------------------------------------------------
timer() {
    local out status
    out="$(backup_timer_alerts prod relab-backup@prod.timer "$1" "$2" "$3" "$4" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "scheduled and last run fine is silent" "0|" "$(timer enabled active no success)"
assert_eq "disabled timer is reported" \
    "1|ALERT[prod]: relab-backup@prod.timer is 'disabled', not 'enabled'; its job is not scheduled" \
    "$(timer disabled inactive no success)"
# The unit files were never installed at all.
assert_eq "absent timer reads as not installed" \
    "1|ALERT[prod]: relab-backup@prod.timer is 'not installed', not 'enabled'; its job is not scheduled" \
    "$(timer '' '' no '')"
# The reducer derives the service from the timer name, so the same code covers all
# three scheduled jobs — restore-check is the one whose silent loss goes unnoticed
# longest (35+ day check period).
restore_timer() {
    local out status
    out="$(backup_timer_alerts prod relab-restore-check@prod.timer "$1" "$2" "$3" "$4" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}
assert_eq "restore-check timer uses its own service name" \
    "1|ALERT[prod]: last relab-restore-check@prod.service run failed (Result=timeout); see: journalctl -u relab-restore-check@prod.service" \
    "$(restore_timer enabled active yes timeout)"
# The gap this check exists to close: `enable` without `--now`, or a timer stopped
# by hand, leaves is-enabled saying "enabled" while it never fires again.
assert_eq "enabled but stopped is reported" \
    "1|ALERT[prod]: relab-backup@prod.timer is enabled but 'inactive'; it will not fire" \
    "$(timer enabled inactive no success)"
assert_eq "failed last run is reported" \
    "1|ALERT[prod]: last relab-backup@prod.service run failed (Result=exit-code); see: journalctl -u relab-backup@prod.service" \
    "$(timer enabled active yes exit-code)"
# Scheduling and last-run health are independent; one must not mask the other.
assert_eq "stopped timer and failed run both count" \
    "2|ALERT[prod]: relab-backup@prod.timer is enabled but 'inactive'; it will not fire
ALERT[prod]: last relab-backup@prod.service run failed (Result=timeout); see: journalctl -u relab-backup@prod.service" \
    "$(timer enabled inactive yes timeout)"
assert_eq "unknown Result still reports the failure" \
    "1|ALERT[prod]: last relab-backup@prod.service run failed (Result=unknown); see: journalctl -u relab-backup@prod.service" \
    "$(timer enabled active yes '')"

# ---------------------------------------------------------------------------
# deploy_watchdog.sh check 1: container state classification
# ---------------------------------------------------------------------------
state() {
    local out status
    out="$(service_state_alerts prod api "$1" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "running without healthcheck is silent" "0|" "$(state running)"
assert_eq "running and healthy is silent" "0|" "$(state 'running healthy')"
assert_eq "missing container is reported" "1|ALERT[prod]: api container is not running" "$(state '')"
assert_eq "unhealthy container is reported" "1|ALERT[prod]: api container state is 'running unhealthy'" \
    "$(state 'running unhealthy')"
assert_eq "restarting container is reported" "1|ALERT[prod]: api container state is 'restarting'" \
    "$(state restarting)"

# ---------------------------------------------------------------------------
# deploy_watchdog.sh check 3b: dead-man's-switch wiring. The regression that
# matters most: a root-owned 0600 host env file with the URL filled in must NOT
# read as "empty" — systemd already delivered the value into the unit's
# environment, and judging the unreadable file used to alert forever.
# ---------------------------------------------------------------------------
value_of() {
    local out status
    out="$(ping_url_value "$1" "$2" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

ping_env="$(mktemp)"
printf 'PING_BACKUP=https://hc.example/first\nPING_BACKUP=https://hc.example/ping\n' >"$ping_env"

assert_eq "readable file answers with its value" "0|https://hc.example/ping" \
    "$(value_of "$ping_env" PING_BACKUP)"
assert_eq "variable absent from the file resolves empty" "0|" \
    "$(value_of "$ping_env" PING_WATCHDOG)"

chmod 000 "$ping_env"
assert_eq "unreadable file falls back to the unit environment" "0|https://hc.example/ping" \
    "$(PING_BACKUP=https://hc.example/ping value_of "$ping_env" PING_BACKUP)"
# Root reads through mode 000, so this branch is only reachable unprivileged.
if [[ ! -r "$ping_env" ]]; then
    assert_eq "no readable source is unresolvable, not empty" "1|" \
        "$(value_of "$ping_env" PING_BACKUP)"
fi
rm -f "$ping_env"

ping_alert() {
    local out status
    out="$(ping_url_alerts prod PING_BACKUP /etc/relab/relab.env "$1" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "filled ping URL is silent" "0|" "$(ping_alert https://hc.example/ping)"
assert_eq "empty ping URL is reported" \
    "1|ALERT[prod]: PING_BACKUP is empty in /etc/relab/relab.env; that job's failures are invisible outside this host" \
    "$(ping_alert '')"
assert_eq "whitespace-only ping URL reads as empty" \
    "1|ALERT[prod]: PING_BACKUP is empty in /etc/relab/relab.env; that job's failures are invisible outside this host" \
    "$(ping_alert ' ')"

# ---------------------------------------------------------------------------
# secrets-restore: the parsed key becomes a filename under secrets/<env>/, so a
# key carrying a path traversal must be rejected rather than written outside
# that directory.
# ---------------------------------------------------------------------------
restore_key() {
    local key_line="$1"
    local dir out status
    dir="$(mktemp -d)"
    printf '%s\n' "$key_line" >"$dir/input"
    out="$(cd "$dir" && deploy_secrets_restore dev input 2>&1)"
    status=$?
    local escaped_root
    # A real escape from cwd=$dir writes secrets/dev/../../x, i.e. $dir/x — probe
    # there, not at $dir/../../x (which resolves to /x and can never exist).
    [[ -e "$dir/x" ]] && escaped_root=yes || escaped_root=no
    rm -f "$dir/x" 2>/dev/null
    rm -rf "$dir"
    printf '%s|%s|%s' "$status" "$escaped_root" "$out"
}

assert_eq "traversal key is rejected" "1|no|error: refusing to restore invalid secret key '../../x'" \
    "$(restore_key '../../x=y')"
assert_eq "valid key still restores" 0 "$(
    cd "$(mktemp -d)" && printf 'foo=bar\n' >input && deploy_secrets_restore dev input >/dev/null 2>&1
    echo $?
)"

# ---------------------------------------------------------------------------
# run_scheduled.sh resolves <job> to a `just` recipe of the same name. That coupling
# is invisible from either side: rename a recipe and the nightly unit starts failing
# with "Justfile does not contain recipe", which nothing here would otherwise catch.
# JUST_BIN=echo turns the invocation into observable output without running anything.
# ---------------------------------------------------------------------------
scheduled_cmd() {
    local out status
    out="$(env -u PING_BACKUP -u PING_WATCHDOG -u PING_RESTORE_CHECK \
        JUST_BIN=echo bash scripts/run_scheduled.sh "$1" "$2" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$(printf '%s' "$out" | head -n1)"
}

assert_eq "job name is the recipe name" "0|backup prod" "$(scheduled_cmd backup prod)"
assert_eq "hyphenated job passes through unchanged" "0|restore-check staging" \
    "$(scheduled_cmd restore-check staging)"
assert_eq "missing arguments are rejected" "2|usage: scripts/run_scheduled.sh <job> <env>" \
    "$(scheduled_cmd backup '')"
assert_eq "a job name that cannot be an env var suffix is rejected" \
    "2|error: job and env must match [A-Za-z0-9_-]+" "$(scheduled_cmd 'back;up' prod)"

# Every job the systemd units invoke must therefore exist as a recipe.
# shellcheck disable=SC2013 # the sed capture is [a-z-]+, so word splitting is exact;
# a `while read` loop would run the body in a subshell and lose the failure counter.
for unit_job in $(sed -n 's|.*run_scheduled\.sh \([a-z-]*\) %i.*|\1|p' deploy/systemd/*.service); do
    assert_eq "just recipe '${unit_job}' exists for the systemd unit" 0 "$(
        just --show "$unit_job" >/dev/null 2>&1
        echo $?
    )"
done

# ---------------------------------------------------------------------------
# The collapsed-dump guard in backup_relab_restic.sh. An empty database dumps
# happily, and once archived it becomes the newest snapshot that retention ages the
# good copies out behind — so the guard has to reject the dump BEFORE the write.
# `restic` and the dump file are stubbed; no repository and no docker are involved.
# ---------------------------------------------------------------------------
collapse_guard() {
    local new_bytes="$1" prev_bytes="$2" ratio="${3:-}" restic_exit="${4:-0}" tmp out status count=1
    tmp="$(mktemp -d)"
    # A stub restic on PATH, answering only the `stats --json` call the guard makes,
    # in restic's real shape: an empty repository is exit 0 with snapshots_count 0
    # plus a warning on stderr, not an error.
    [[ "$prev_bytes" == 0 ]] && count=0
    cat >"$tmp/restic" <<EOS
#!/usr/bin/env bash
[[ "$restic_exit" == 0 ]] || { echo "Fatal: unable to open repository: repository is already locked" >&2; exit $restic_exit; }
[[ "$count" == 0 ]] && echo 'Ignoring "latest": no snapshot matched given filter' >&2
printf %s '{"total_size":$prev_bytes,"snapshots_count":$count}'
EOS
    chmod +x "$tmp/restic"
    head -c "$new_bytes" /dev/zero >"$tmp/dump"
    out="$(
        PATH="$tmp:$PATH" RESTIC_MIN_DUMP_RATIO="$ratio" bash -c '
            set -euo pipefail
            # Define just enough of the script to call the guard in isolation.
            log() { printf "%s\n" "$*"; }
            eval "$(sed -n "/^assert_dump_not_collapsed()/,/^}/p" backend/scripts/backup/backup_relab_restic.sh)"
            assert_dump_not_collapsed "$1"
        ' _ "$tmp/dump" 2>&1
    )"
    status=$?
    rm -rf "$tmp"
    printf '%s|%s|%s' "$status" "$(printf '%s' "$out" | grep -c 'refusing to archive')" \
        "$(printf '%s' "$out" | grep -c 'restic exit')"
}

assert_eq "a dump collapsed to 23% of the previous snapshot is refused" "1|1|0" \
    "$(collapse_guard 59353 259672)"
assert_eq "a dump the same size as the previous snapshot is archived" "0|0|0" \
    "$(collapse_guard 259672 259672)"
assert_eq "an ordinary shrink above the ratio is archived" "0|0|0" \
    "$(collapse_guard 200000 259672)"
assert_eq "RESTIC_MIN_DUMP_RATIO=0 archives a collapsed dump deliberately" "0|0|0" \
    "$(collapse_guard 59353 259672 0)"
assert_eq "no previous snapshot means nothing to compare against" "0|0|0" \
    "$(collapse_guard 59353 0)"
# The guard must fail closed: a restic error (lock held by maintenance, repository
# unreadable) is not "no previous snapshot", and archiving anyway is exactly the
# unguarded write this check exists to prevent.
assert_eq "a restic failure refuses the dump instead of failing open" "1|0|1" \
    "$(collapse_guard 59353 259672 '' 1)"

# ---------------------------------------------------------------------------
# The hourly-vs-daily split in backup_relab_restic.sh: BACKUP_MAINTENANCE decides
# which steps a run performs. Every step is stubbed to record its name; the output is
# the ordered list of steps that ran.
# ---------------------------------------------------------------------------
cycle_steps() {
    bash -c '
        set -euo pipefail
        SKIP_DATABASE_BACKUP="${2:-false}" SKIP_UPLOAD_BACKUP="${3:-false}"
        # shellcheck source=/dev/null
        . backend/scripts/backup/backup_relab_restic.sh
        log() { :; }
        backup_database() { echo db; }
        backup_uploads() { echo uploads; }
        prune_repo() { echo prune; }
        restic() { echo "restic $1"; }
        copy_to_offsite() { echo "copy:$1"; }
        run_cycle "$1"
    ' _ "$@" 2>&1 | paste -sd,
}

assert_eq "auto: snapshot then full maintenance" "db,uploads,prune,restic check,copy:true" "$(cycle_steps auto)"
assert_eq "skip (hourly timer): snapshot only, no prune, no copy" "db,uploads" "$(cycle_steps skip)"
assert_eq "only (daily timer): maintenance without a new snapshot" "prune,restic check,copy:true" "$(cycle_steps only)"
# A copy-only run (both backups skipped) is what an operator uses when the local repo
# is already lost; pruning in that moment would expire the only surviving archive.
assert_eq "auto with both backups skipped is copy-only, never prune" "copy:false" "$(cycle_steps auto true true)"

# ---------------------------------------------------------------------------
# Check 5's reducer: the two telemetry credentials fail at different layers and the
# alert has to say which, because the remedies are in different systems (a Cloudflare
# apply vs. a token rotation). A challenged export is silently dropped, so this is the
# only thing that reports it.
# ---------------------------------------------------------------------------
telemetry_alert() {
    local out status
    out="$(telemetry_ingress_alerts staging "$1" "$2" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$(printf '%s' "$out" | head -n1)"
}

assert_eq "a 200 with no mitigation is silent" "0|" "$(telemetry_alert 200 '')"
assert_eq "a 202 with no mitigation is silent" "0|" "$(telemetry_alert 202 '')"
assert_eq "an edge challenge names the Cloudflare skip rule, not the token" \
    "1|ALERT[staging]: telemetry exports are challenged at the edge (HTTP 403, cf-mitigated=challenge); the Cloudflare skip rule is missing or TELEMETRY_EDGE_KEY does not match TF_VAR_telemetry_edge_key" \
    "$(telemetry_alert 403 challenge)"
assert_eq "a 401 without mitigation names the bearer token, not the edge" \
    "1|ALERT[staging]: the telemetry collector rejected the bearer token (HTTP 401); OTLP_AUTH_TOKEN is stale or wrong" \
    "$(telemetry_alert 401 '')"
assert_eq "an unreachable endpoint is reported" \
    "1|ALERT[staging]: telemetry endpoint unreachable" "$(telemetry_alert 000 '')"
assert_eq "an unexpected status is reported rather than swallowed" \
    "1|ALERT[staging]: telemetry endpoint returned HTTP 502" "$(telemetry_alert 502 '')"
# A challenge on a 200 still alerts: Cloudflare can mitigate with a non-error status,
# and treating that as success is exactly how this went unnoticed for weeks.
assert_eq "mitigation outranks a success status" "1|ALERT[staging]: telemetry exports are challenged at the edge (HTTP 200, cf-mitigated=challenge); the Cloudflare skip rule is missing or TELEMETRY_EDGE_KEY does not match TF_VAR_telemetry_edge_key" \
    "$(telemetry_alert 200 challenge)"

# ---------------------------------------------------------------------------
# Timer staleness: a unit can be enabled, active and last-exited-0 while not having
# run for months. systemd reports nothing wrong, because nothing is. Catching that is
# what lets one dead-man's switch per environment replace one per job.
# ---------------------------------------------------------------------------
NOW=1757160000 # fixed epoch so these never depend on the wall clock
staleness_alert() {
    local out status
    out="$(timer_staleness_alerts staging relab-restore-check@staging.timer "$1" "$NOW" "$2" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$(printf '%s' "$out" | head -n1)"
}

assert_eq "a timer that fired within its limit is silent" "0|" \
    "$(staleness_alert "$((NOW - 3600))" 3)"
assert_eq "a timer exactly at its limit is silent" "0|" \
    "$(staleness_alert "$((NOW - 3 * 3600))" 3)"
# The whole point: scheduled, active, last run succeeded — and stopped firing anyway.
assert_eq "a monthly timer that stopped firing is reported" \
    "1|ALERT[staging]: relab-restore-check@staging.timer last ran 1440h ago, over its 960h limit; it is scheduled but not firing" \
    "$(staleness_alert "$((NOW - 60 * 24 * 3600))" 960)"
assert_eq "an hourly timer stuck for a day is reported" \
    "1|ALERT[staging]: relab-restore-check@staging.timer last ran 24h ago, over its 3h limit; it is scheduled but not firing" \
    "$(staleness_alert "$((NOW - 24 * 3600))" 3)"
# A freshly installed Persistent=true timer has never fired and is not yet due; an
# alert there would fire on every new host and teach people to ignore it.
assert_eq "a timer that has never fired is not an alert" "0|" "$(staleness_alert 0 3)"
# A LastTriggerUSec that date(1) cannot read would otherwise switch this check off for
# every timer at once, with everything reading green.
assert_eq "an unparseable last trigger is reported, not treated as never fired" \
    "1|ALERT[staging]: cannot parse LastTriggerUSec for relab-restore-check@staging.timer; the staleness check is not running" \
    "$(staleness_alert unparseable 960)"

# ---------------------------------------------------------------------------
# Check 2b's reducer: free space on the filesystem holding the restic repository.
# ---------------------------------------------------------------------------
disk_alert() {
    local out status
    out="$(disk_usage_alerts staging /srv/backups "$1" 85 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "a filesystem under the limit is silent" "0|" "$(disk_alert 60)"
assert_eq "a filesystem at the limit is reported" \
    "1|ALERT[staging]: the filesystem holding /srv/backups is 85% full (limit 85%); hourly snapshots will fill it" \
    "$(disk_alert 85)"
assert_eq "an unreadable df is reported rather than assumed fine" \
    "1|ALERT[staging]: cannot read free space for the backup directory /srv/backups" "$(disk_alert '')"

printf '%s/%s checks passed\n' "$((checks - failures))" "$checks"
[[ "$failures" -eq 0 ]] || exit 1
