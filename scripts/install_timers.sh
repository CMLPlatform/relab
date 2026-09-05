#!/usr/bin/env bash
# Render and install the Relab scheduled-job systemd units for this host.
#
#   install_timers.sh render            # print the rendered units, install nothing
#   install_timers.sh install <env>     # install, enable, and start them (needs sudo)
#
# The committed units in deploy/systemd/ carry placeholders so no real host's paths or
# usernames live in the repository. Everything host-specific is substituted here:
# checkout path, deploy user, and the `just` location — the last because cron and
# systemd both run without the login PATH, which is a classic silent-failure source.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="$ROOT_DIR/deploy/systemd"
SYSTEM_DIR=/etc/systemd/system
HOST_ENV=/etc/relab/relab.env
JOBS=(relab-backup relab-watchdog relab-restore-check)

render_one() {
    local file="$1" just_bin root_dir_repl just_bin_repl
    just_bin="$(command -v just || echo /usr/bin/just)"
    # sed treats & (whole match) and the delimiter specially in the REPLACEMENT, so a
    # checkout path containing either would render silently wrong ExecStart lines that
    # only surface at the unit's first fire. Escape both substituted values.
    root_dir_repl="$(printf '%s' "$ROOT_DIR" | sed 's/[&|\\]/\\&/g')"
    just_bin_repl="$(printf '%s' "$just_bin" | sed 's/[&|\\]/\\&/g')"
    sed -e "s|/opt/relab|${root_dir_repl}|g" \
        -e "s|^User=relab$|User=$(id -un)|" \
        -e "s|^Environment=JUST_BIN=.*$|Environment=JUST_BIN=${just_bin_repl}|" \
        "$file"
}

cmd_render() {
    local job kind
    for job in "${JOBS[@]}"; do
        for kind in service timer; do
            echo "# ===== ${job}@.${kind} ====="
            render_one "$UNIT_DIR/${job}@.${kind}"
            echo
        done
    done
}

cmd_install() {
    local env="${1:-}" job kind tmp
    case "$env" in
        prod | staging) ;;
        *)
            echo "usage: install_timers.sh install <prod|staging>" >&2
            exit 2
            ;;
    esac

    tmp="$(mktemp -d)"
    # Expand tmp into the trap now (double quotes): a single-quoted trap defers expansion
    # to EXIT, when this `local` is out of scope — under `set -u` cleanup then aborts with
    # "unbound variable" and leaks the directory. Same trap as backup_restic_ops.sh.
    # shellcheck disable=SC2064  # eager expansion is intentional (see above)
    trap "rm -rf '$tmp'" EXIT
    for job in "${JOBS[@]}"; do
        for kind in service timer; do
            render_one "$UNIT_DIR/${job}@.${kind}" >"$tmp/${job}@.${kind}"
        done
    done

    echo "Installing units to ${SYSTEM_DIR} (sudo required)..."
    sudo install -m 0644 "$tmp"/*.service "$tmp"/*.timer "$SYSTEM_DIR/"

    # Seed the host-local ping file if absent. It holds capability URLs, so it is 0600 and
    # never committed; a missing file simply disables pinging rather than failing.
    if [[ ! -f "$HOST_ENV" ]]; then
        echo "Seeding ${HOST_ENV} (fill in the healthchecks.io URLs)..."
        sudo install -d -m 0755 "$(dirname "$HOST_ENV")"
        sudo install -m 0600 -o "$(id -un)" /dev/null "$HOST_ENV"
        sudo tee "$HOST_ENV" >/dev/null <<'EOF'
# Dead-man's-switch URLs for the Relab scheduled jobs (healthchecks.io or compatible).
# This is the one monitoring path that does not share fate with the Grafana stack: it is
# a push from this host to an outside endpoint, so it still reports when the collector,
# the tunnel or this host's telemetry is the thing that broke.
#
# One check per job on purpose: sharing a URL lets a frequent job's pings mask a rare
# job's silence, and the rare job is the one you cannot afford to lose.
# Leave a value empty to disable pinging for that job.
#
# Suggested check periods: backup 1 day, watchdog 1 hour, restore-check 35 days.
PING_BACKUP=
PING_WATCHDOG=
PING_RESTORE_CHECK=
EOF
    fi

    # The file must be readable by the deploy user, not only by root: the watchdog's
    # check 3b and the emptiness warning below both read it directly, and the watchdog
    # service runs as this user. Earlier installs seeded it root-owned, which made every
    # such read fail with EACCES — fix that on existing hosts too, keeping 0600.
    sudo chown "$(id -un)" "$HOST_ENV"

    sudo systemctl daemon-reload
    for job in "${JOBS[@]}"; do
        sudo systemctl enable --now "${job}@${env}.timer"
    done

    echo
    systemctl list-timers "relab-*@${env}.timer" --all --no-pager
    echo

    # Empty ping URLs are indistinguishable from deliberately-off, and the jobs run
    # fine without them — which is exactly how a host ends up failing silently
    # forever. Be loud about the unfinished state; the watchdog alerts on it too.
    # Missing and empty disable pinging identically, so check for both — a renamed or
    # mistyped variable leaves no empty line for a grep to find.
    for var in PING_BACKUP PING_WATCHDOG PING_RESTORE_CHECK; do
        if ! grep -qE "^${var}=[^[:space:]]" "$HOST_ENV"; then
            echo "WARNING: ${var} is missing or empty in ${HOST_ENV}. That job runs,"
            echo "WARNING: but its failures are INVISIBLE outside this host until you"
            echo "WARNING: create the healthchecks.io check and fill the URL in."
        fi
    done
    echo "Next: fill in ${HOST_ENV}, then verify with 'just watchdog ${env}'."
}

case "${1:-}" in
    render) cmd_render ;;
    install) cmd_install "${2:-}" ;;
    *)
        echo "usage: install_timers.sh {render|install <prod|staging>}" >&2
        exit 2
        ;;
esac
