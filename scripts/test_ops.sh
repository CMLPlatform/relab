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
# `stack ENV up`: the scanning profile follows MALWARE_SCAN_ENABLED in .env, read
# the way Compose reads it, and the recipe's environment must match the host's.
# Neither path runs docker: a passing guard stops at require_confirmation (exit 1).
# ---------------------------------------------------------------------------
in_dotenv_dir() {
    # Run "$@" inside a scratch dir whose .env holds the given lines ("" for no file).
    local env_body="$1"
    shift
    local dir
    dir="$(mktemp -d)"
    [[ -z "$env_body" ]] || printf '%s\n' "$env_body" >"$dir/.env"
    (cd "$dir" && "$@")
    local status=$?
    rm -rf "$dir"
    return $status
}

scan_setting() {
    in_dotenv_dir "$1" scanning_enabled && echo on || echo off
}

assert_eq "scanning: bare false" off "$(scan_setting 'MALWARE_SCAN_ENABLED=false')"
assert_eq 'scanning: double-quoted false' off "$(scan_setting 'MALWARE_SCAN_ENABLED="false"')"
assert_eq "scanning: single-quoted false" off "$(scan_setting "MALWARE_SCAN_ENABLED='false'")"
assert_eq "scanning: quoted false with inline comment" off "$(scan_setting 'MALWARE_SCAN_ENABLED="false"  # scanning off')"
assert_eq "scanning: true" on "$(scan_setting 'MALWARE_SCAN_ENABLED=true')"
assert_eq "scanning: unbalanced quote fails closed" on "$(scan_setting 'MALWARE_SCAN_ENABLED="false')"
assert_eq "scanning: empty value fails closed" on "$(scan_setting 'MALWARE_SCAN_ENABLED=')"
assert_eq "scanning: missing .env fails closed" on "$(scan_setting '')"
assert_eq "scanning: last assignment wins" on \
    "$(scan_setting 'MALWARE_SCAN_ENABLED=false
MALWARE_SCAN_ENABLED=true')"

derived_profiles() {
    DEPLOY_PROFILE_FLAGS=("${@:2}")
    add_scanning_profile_from_dotenv
    echo "${DEPLOY_PROFILE_FLAGS[*]}"
}
assert_eq "scanning profile added when enabled" "--profile migrations --profile scanning" \
    "$(in_dotenv_dir 'MALWARE_SCAN_ENABLED=true' derived_profiles _ --profile migrations)"
assert_eq "scanning profile not duplicated" "--profile scanning" \
    "$(in_dotenv_dir 'MALWARE_SCAN_ENABLED=true' derived_profiles _ --profile scanning)"
assert_eq "scanning profile omitted when disabled" "" \
    "$(in_dotenv_dir 'MALWARE_SCAN_ENABLED=false' derived_profiles _)"

env_guard() {
    local out status
    out="$(FORCE='' in_dotenv_dir "$1" stack_command "$2" up 2>&1)"
    status=$?
    case "$status" in
        2) [[ "$out" == *"ENVIRONMENT="* ]] && echo blocked || echo "unexpected: $out" ;;
        1) [[ "$out" == *"Refusing to start"* ]] && echo allowed || echo "unexpected: $out" ;;
        *) echo "unexpected status $status: $out" ;;
    esac
}
assert_eq "env guard: matching environment" allowed "$(env_guard 'ENVIRONMENT=prod' prod)"
assert_eq "env guard: other environment blocks" blocked "$(env_guard 'ENVIRONMENT=staging' prod)"
assert_eq "env guard: missing .env blocks" blocked "$(env_guard '' staging)"

# ---------------------------------------------------------------------------
# `stack ENV up` volume preflight: a mount the container cannot write must stop the
# deploy and name the chown, because reads and stat still succeed on a wrongly-owned
# volume and nothing later in the deploy reports the failed writes.
# ---------------------------------------------------------------------------
mount_alert() {
    local out status
    out="$(mount_writability_alert prod "$1" "$2" "$3" "$4" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}

assert_eq "a writable mount is silent" "0|" \
    "$(mount_alert api /opt/relab/backend/data/uploads volume:user_uploads yes)"
assert_eq "an unwritable named volume names the volume and the chown" \
    "1|error: the prod stack's api service cannot write /opt/relab/backend/data/uploads as uid 65532.
Docker sets a named volume's ownership only when it first creates the volume, so
relab_prod_user_uploads still belongs to whichever uid created it.
Fix with: docker run --rm --user 0 -v relab_prod_user_uploads:/mnt relab-backend:prod-local chown -R 65532:65532 /mnt" \
    "$(mount_alert api /opt/relab/backend/data/uploads volume:user_uploads no)"
assert_eq "an unwritable bind mount asks for a host chown, not a docker one" \
    "1|error: the prod stack's backup service cannot write /restic as uid 65532.
Docker creates a missing bind-mount directory root-owned.
Fix with: sudo chown -R 65532:65532 /srv/backups/restic" \
    "$(mount_alert backup /restic host:/srv/backups/restic no)"

# An unreadable .env reads back as an empty ENVIRONMENT, so without its own branch the
# guard blames the config for what is a permissions problem. env_guard above cannot see
# the difference: both paths exit 2. This asserts the message names readability.
unreadable_env_guard() {
    local dir out status
    dir="$(mktemp -d)"
    printf 'ENVIRONMENT=prod\n' >"$dir/.env"
    chmod 000 "$dir/.env"
    out="$(cd "$dir" && FORCE='' stack_command prod up 2>&1)"
    status=$?
    chmod 600 "$dir/.env"
    rm -rf "$dir"
    [[ $status -eq 2 && "$out" == *"not readable"* ]] && echo blocked || echo "unexpected status $status: $out"
}
# NOTE: root reads a mode-000 file, so there is nothing to assert as root.
if [[ $EUID -ne 0 ]]; then
    assert_eq "env guard: unreadable .env names the permissions" blocked "$(unreadable_env_guard)"
fi

sha_guard() {
    (require_short_sha "$1" 2>/dev/null) && echo ok || echo rejected
}
assert_eq "rollback sha: short sha accepted" ok "$(sha_guard 5b099f3c)"
assert_eq "rollback sha: full sha accepted" ok "$(sha_guard 5b099f3c5b099f3c5b099f3c5b099f3c5b099f3c)"
assert_eq "rollback sha: tag name rejected" rejected "$(sha_guard v1.2.0)"
assert_eq "rollback sha: empty rejected" rejected "$(sha_guard '')"

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
assert_eq "compose args select the recipe's environment" "ENVIRONMENT=staging" \
    "$(compose_args staging /dev/null | grep -x 'ENVIRONMENT=.*')"
assert_eq "compose args read one env file" "1" "$(compose_args prod /dev/null | grep -c -- '--env-file')"
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
# Watchdog deployment drift: a deploy host behind origin, and "no upstream", which must
# not read as "no drift".
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
# A dirty tree and a stale checkout are independent problems; both are reported.
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
# The reducer derives the service from the timer name, so the same code covers all three
# scheduled jobs. restore-check's silent loss goes unnoticed longest (35+ day period).
restore_timer() {
    local out status
    out="$(backup_timer_alerts prod relab-restore-check@prod.timer "$1" "$2" "$3" "$4" 2>&1)"
    status=$?
    printf '%s|%s' "$status" "$out"
}
assert_eq "restore-check timer uses its own service name" \
    "1|ALERT[prod]: last relab-restore-check@prod.service run failed (Result=timeout); see: journalctl -u relab-restore-check@prod.service" \
    "$(restore_timer enabled active yes timeout)"
# `enable` without `--now`, or a timer stopped by hand, leaves is-enabled saying
# "enabled" while it never fires again.
assert_eq "enabled but stopped is reported" \
    "1|ALERT[prod]: relab-backup@prod.timer is enabled but 'inactive'; it will not fire" \
    "$(timer enabled inactive no success)"
assert_eq "failed last run is reported" \
    "1|ALERT[prod]: last relab-backup@prod.service run failed (Result=exit-code); see: journalctl -u relab-backup@prod.service" \
    "$(timer enabled active yes exit-code)"
# Scheduling and last-run health are independent; both are reported.
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
# deploy_watchdog.sh check 3b: dead-man's-switch wiring. A root-owned 0600 host env file
# with the URL filled in must not read as "empty": systemd already delivered the value
# into the unit's environment.
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
# run_scheduled.sh resolves <job> to a `just` recipe of the same name. Renaming a recipe
# makes the scheduled unit fail with "Justfile does not contain recipe", which nothing
# else here would catch.
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
# Offsite repository derivation in backup_relab_restic.sh: the one remote in
# RCLONE_CONFIG, empty path; nothing when the config is absent, empty, or ambiguous.
# ---------------------------------------------------------------------------
derived_offsite() {
    local conf
    conf="$(mktemp)"
    printf '%s' "$1" >"$conf"
    (
        eval "$(sed -n "/^derive_offsite_repository()/,/^}/p" backend/scripts/backup/backup_relab_restic.sh)"
        RCLONE_CONFIG="$conf" derive_offsite_repository
    )
    rm -f "$conf"
}
assert_eq "offsite: one remote, empty path" "rclone:surfdrive_prod:" \
    "$(derived_offsite $'[surfdrive_prod]\ntype = webdav\nurl = https://x\n')"
assert_eq "offsite: placeholder config derives nothing" "" "$(derived_offsite $'# placeholder\n')"
assert_eq "offsite: two remotes derive nothing" "" "$(derived_offsite $'[a]\ntype = local\n[b]\ntype = local\n')"
assert_eq "offsite: no config derives nothing" "" \
    "$(
        eval "$(sed -n "/^derive_offsite_repository()/,/^}/p" backend/scripts/backup/backup_relab_restic.sh)"
        RCLONE_CONFIG=/nonexistent derive_offsite_repository
    )"

# ---------------------------------------------------------------------------
# The collapsed-dump guard in backup_relab_restic.sh. An empty database dumps without
# error, and once archived it becomes the newest snapshot that retention ages the good
# copies out behind, so the guard rejects the dump before the write.
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
# The guard fails closed: a restic error (lock held by maintenance, repository
# unreadable) is not "no previous snapshot".
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
# A copy-only run (both backups skipped) is what an operator uses when the local repo is
# already lost, so it must not prune the only surviving archive.
assert_eq "auto with both backups skipped is copy-only, never prune" "copy:false" "$(cycle_steps auto true true)"

# ---------------------------------------------------------------------------
# Check 5's reducer: the two telemetry credentials fail at different layers and the
# alert has to say which, because the remedies are in different systems (a Cloudflare
# apply vs. a token rotation). A challenged export is dropped silently.
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
# Timer staleness: a unit can be enabled, active and last-exited-0 while not having run
# for months, and systemd reports nothing wrong.
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
# Scheduled, active, last run succeeded — and stopped firing anyway.
assert_eq "a monthly timer that stopped firing is reported" \
    "1|ALERT[staging]: relab-restore-check@staging.timer last ran 1440h ago, over its 960h limit; it is scheduled but not firing" \
    "$(staleness_alert "$((NOW - 60 * 24 * 3600))" 960)"
assert_eq "an hourly timer stuck for a day is reported" \
    "1|ALERT[staging]: relab-restore-check@staging.timer last ran 24h ago, over its 3h limit; it is scheduled but not firing" \
    "$(staleness_alert "$((NOW - 24 * 3600))" 3)"
# A freshly installed Persistent=true timer has never fired and is not yet due, so it
# must not alert on every new host.
assert_eq "a timer that has never fired is not an alert" "0|" "$(staleness_alert 0 3)"
# A LastTriggerUSec that date(1) cannot read switches this check off for every timer at
# once, so it is reported.
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

# remote_deploy.sh: the forced ssh command maps an allow-list onto recipes and refuses
# the rest. A stub `just` in the fake deploy user's ~/.local/bin echoes what it was asked.
remote_deploy() {
    local tmp
    tmp="$(mktemp -d)"
    mkdir -p "$tmp/scripts" "$tmp/.local/bin"
    cp "$(dirname "${BASH_SOURCE[0]}")/remote_deploy.sh" "$tmp/scripts/"
    printf 'ENVIRONMENT=prod\n' >"$tmp/.env"
    printf '#!/bin/sh\necho "just $*"\n' >"$tmp/.local/bin/just"
    chmod +x "$tmp/.local/bin/just"
    SSH_ORIGINAL_COMMAND="$1" HOME="$tmp" bash "$tmp/scripts/remote_deploy.sh" 2>&1 | head -1
    rm -rf "$tmp"
}

assert_eq "remote deploy: up forwards the migrations profile with YES" "just stack prod up YES migrations" "$(remote_deploy 'up migrations')"
assert_eq "remote deploy: build nocache sets NO_CACHE" "just stack prod build" "$(remote_deploy 'build nocache')"
assert_eq "remote deploy: migrate needs no argument" "just stack prod migrate YES" "$(remote_deploy migrate)"
assert_eq "remote deploy: rollback takes a sha" "just stack prod rollback YES 2f91e3b5 " "$(remote_deploy 'rollback 2f91e3b5')"
assert_eq "remote deploy: a shell command is refused" "remote_deploy: 'rm' is not allowed" "$(remote_deploy 'rm -rf /')"
assert_eq "remote deploy: an unknown profile is refused" "remote_deploy: unknown profile 'scanning'" "$(remote_deploy 'up scanning')"
assert_eq "remote deploy: rollback without a sha is refused" "remote_deploy: rollback needs an image sha" "$(remote_deploy 'rollback abc')"
assert_eq "remote deploy: rollback to base is refused" "remote_deploy: rollback revision must be a revision id or a -N step" "$(remote_deploy 'rollback 2f91e3b5 base')"
assert_eq "remote deploy: rollback to a revision id is allowed" "just stack prod rollback YES 2f91e3b5 4a672549f270" "$(remote_deploy 'rollback 2f91e3b5 4a672549f270')"
assert_eq "remote deploy: rollback one step is allowed" "just stack prod rollback YES 2f91e3b5 -1" "$(remote_deploy 'rollback 2f91e3b5 -1')"

printf '%s/%s checks passed\n' "$((checks - failures))" "$checks"
[[ "$failures" -eq 0 ]] || exit 1
