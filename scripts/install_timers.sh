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

# Run as the deploy user; the script calls sudo itself for the steps that need it.
# Under `sudo just ...` the units would render with User=root and JUST_BIN resolved
# from root's PATH, which hides a per-user install such as ~/.local/bin/just.
if [[ "$EUID" -eq 0 ]]; then
    echo "error: run install_timers.sh as the deploy user, not as root; it prompts for sudo where needed" >&2
    exit 2
fi

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="$ROOT_DIR/deploy/systemd"
SYSTEM_DIR=/etc/systemd/system
HOST_ENV=/etc/relab/relab.env
JOBS=(relab-backup relab-backup-maintenance relab-watchdog relab-restore-check)
# The account the units run as. Defaults to whoever runs this script; a host with a
# dedicated sudo-less deploy user sets it, so an operator with sudo can install units
# that run as that user (`RELAB_UNIT_USER=relab just timers-install prod`).
UNIT_USER="${RELAB_UNIT_USER:-$(id -un)}"
UNIT_HOME="$(getent passwd "$UNIT_USER" | cut -d: -f6)"
[[ -n "$UNIT_HOME" ]] || {
    echo "error: RELAB_UNIT_USER '$UNIT_USER' is not a local account" >&2
    exit 2
}

render_one() {
    local file="$1" just_bin root_dir_repl just_bin_repl
    just_bin="$(command -v just)" || {
        echo "error: just is not on PATH; the rendered units would point at a missing binary" >&2
        return 1
    }
    # sed treats & (whole match) and the delimiter specially in the REPLACEMENT, so a
    # checkout path containing either would render silently wrong ExecStart lines that
    # only surface at the unit's first fire. Escape both substituted values.
    root_dir_repl="$(printf '%s' "$ROOT_DIR" | sed 's/[&|\\]/\\&/g')"
    just_bin_repl="$(printf '%s' "$just_bin" | sed 's/[&|\\]/\\&/g')"
    # systemd gives the unit no login shell, so a per-user `uv` (the official installer
    # puts it in ~/.local/bin) is only found through this PATH.
    sed -e "s|/opt/relab|${root_dir_repl}|g" \
        -e "s|^User=relab$|User=${UNIT_USER}|" \
        -e "s|^Environment=JUST_BIN=.*$|Environment=JUST_BIN=${just_bin_repl}|" \
        -e "s|^Environment=PATH=.*$|Environment=PATH=${UNIT_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin:/snap/bin|" \
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
        sudo install -m 0600 -o "$UNIT_USER" /dev/null "$HOST_ENV"
        sudo tee "$HOST_ENV" >/dev/null <<'EOF'
# Dead-man's-switch URLs for the Relab scheduled jobs (healthchecks.io or compatible).
# This monitoring path does not share fate with the Grafana stack: it is a push from this
# host to an outside endpoint, so it still reports when the collector, the tunnel or this
# host's telemetry is what broke.
#
# Only PING_WATCHDOG has to be set. The hourly watchdog reports every other job's timer
# state, last result and staleness, and a failing job's own output is sent as the alert
# body.
#
# The rest are optional and unset by default. Set one to give that job its own check;
# leave it empty to disable pinging for it.
#
# Suggested check period: watchdog 1 hour (grace 30m).
PING_WATCHDOG=
PING_BACKUP=
PING_BACKUP_MAINTENANCE=
PING_RESTORE_CHECK=
EOF
    fi

    # The file must be readable by the deploy user, not only by root: the watchdog's
    # check 3b and the emptiness warning below both read it directly, and the watchdog
    # service runs as this user. Earlier installs seeded it root-owned, so every such
    # read failed with EACCES; fix that on existing hosts too, keeping 0600.
    sudo chown "$UNIT_USER" "$HOST_ENV"

    sudo systemctl daemon-reload
    for job in "${JOBS[@]}"; do
        sudo systemctl enable --now "${job}@${env}.timer"
    done

    echo
    systemctl list-timers "relab-*@${env}.timer" --all --no-pager
    echo

    # An empty ping URL means pinging is off, and the jobs run fine without one, so
    # warn about the unfinished state. Missing and empty disable pinging identically,
    # so check for both: a renamed or mistyped variable leaves no empty line to grep.
    # Only PING_WATCHDOG is required; the other jobs report through it.
    if ! grep -qE "^PING_WATCHDOG=[^[:space:]]" "$HOST_ENV"; then
        echo "WARNING: PING_WATCHDOG is missing or empty in ${HOST_ENV}. Every scheduled"
        echo "WARNING: job still runs, but their failures are INVISIBLE outside this host"
        echo "WARNING: until you create the healthchecks.io check and fill the URL in."
    fi
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
