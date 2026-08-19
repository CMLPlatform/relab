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
    "1|ALERT[prod]: relab-backup@prod.timer is 'disabled', not 'enabled'; backups are not scheduled" \
    "$(timer disabled inactive no success)"
# The unit files were never installed at all.
assert_eq "absent timer reads as not installed" \
    "1|ALERT[prod]: relab-backup@prod.timer is 'not installed', not 'enabled'; backups are not scheduled" \
    "$(timer '' '' no '')"
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
    [[ -e "$dir/../../x" ]] && escaped_root=yes || escaped_root=no
    rm -f "$dir/../../x" 2>/dev/null
    rm -rf "$dir"
    printf '%s|%s|%s' "$status" "$escaped_root" "$out"
}

assert_eq "traversal key is rejected" "1|no|error: refusing to restore invalid secret key '../../x'" \
    "$(restore_key '../../x=y')"
assert_eq "valid key still restores" 0 "$(
    cd "$(mktemp -d)" && printf 'foo=bar\n' >input && deploy_secrets_restore dev input >/dev/null 2>&1
    echo $?
)"

printf '%s/%s checks passed\n' "$((checks - failures))" "$checks"
[[ "$failures" -eq 0 ]] || exit 1
