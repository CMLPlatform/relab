#!/usr/bin/env bash
# Smoke check for the old-zone to new-zone redirects: every old host must answer with the
# expected status and a Location on the same host prefix of the new zone, path and query
# kept. The monitoring host must never redirect, because a 3xx drops exporter POSTs.
# Usage: smoke_redirects.sh <old_zone> <new_zone> <prod|staging>
# TELEMETRY_EDGE_KEY (as in the deploy host's root .env) enables the otel check.
# REDIRECT_PERMANENT=1 expects 301/308 instead of 302/307, mirroring var.redirect_permanent.
set -euo pipefail

SMOKE_PATH='/r9lab-smoke?q=1'

# redirect_verdict <host> <status> <location> <expect_status> <expect_location>
# Prints "ok", or one FAIL line; returns 0 or 1.
redirect_verdict() {
    local host="$1" status="$2" location="$3" expect_status="$4" expect_location="$5"
    if [[ -z "$status" || "$status" == 000 ]]; then
        printf 'FAIL[%s]: no response\n' "$host"
        return 1
    fi
    if [[ "$status" != "$expect_status" ]]; then
        printf 'FAIL[%s]: status %s, expected %s\n' "$host" "$status" "$expect_status"
        return 1
    fi
    if [[ "$location" != "$expect_location" ]]; then
        printf 'FAIL[%s]: Location %s, expected %s\n' "$host" "$location" "$expect_location"
        return 1
    fi
    printf 'ok\n'
}

# expected_status <temporary status> <permanent flag>: 302 becomes 301, 307 becomes 308.
expected_status() {
    if [[ "$2" != 1 ]]; then
        printf '%s\n' "$1"
    elif [[ "$1" == 307 ]]; then
        printf '308\n'
    else
        printf '301\n'
    fi
}

# otel_verdict <host> <status> <response headers>
# The collector may answer 4xx/5xx/405 to an empty POST; only silence, a redirect or an
# edge challenge break ingestion.
otel_verdict() {
    local host="$1" status="$2" headers="$3"
    if [[ -z "$status" || "$status" == 000 ]]; then
        printf 'FAIL[%s]: no response\n' "$host"
    elif [[ "$status" == 3* ]]; then
        printf 'FAIL[%s]: redirected with status %s\n' "$host" "$status"
    elif grep -qi '^cf-mitigated:' <<<"$headers"; then
        printf 'FAIL[%s]: challenged by the edge\n' "$host"
    else
        printf 'ok\n'
        return 0
    fi
    return 1
}

# NOTE: mirrors edge_routes_by_environment in infra/cloudflare/hostnames.tf; parsing HCL
# from bash is not worth it for eight names. An empty prefix is the zone apex.
route_prefixes() {
    case "$1" in
        prod) printf '%s\n' ':302' 'app.:302' 'api.:307' 'docs.:302' ;;
        staging) printf '%s\n' 'web-test.:302' 'app-test.:302' 'api-test.:307' 'docs-test.:302' ;;
        *) return 1 ;;
    esac
}

smoke_main() {
    local old_zone="${1:?old zone}" new_zone="${2:?new zone}" env="${3:?env}"
    local permanent="${REDIRECT_PERMANENT:-0}" failed=0 entry prefix status result code location
    local -a entries

    # An unknown env yields no routes; without this it would pass with nothing checked.
    mapfile -t entries < <(route_prefixes "$env")
    if [[ ${#entries[@]} -eq 0 ]]; then
        echo "env must be prod or staging" >&2
        return 2
    fi

    for entry in "${entries[@]}"; do
        prefix="${entry%:*}"
        status="${entry#*:}"
        status="$(expected_status "$status" "$permanent")"
        result="$(curl -sS -o /dev/null --max-redirs 0 --max-time 15 \
            -w '%{http_code} %{redirect_url}' "https://${prefix}${old_zone}${SMOKE_PATH}")" || result=''
        code="${result%% *}"
        location="${result#* }"
        redirect_verdict "${prefix}${old_zone}" "$code" "$location" "$status" \
            "https://${prefix}${new_zone}${SMOKE_PATH}" >&2 || failed=1
    done

    # Monitoring posts to this host; any redirect or edge challenge breaks ingestion.
    # The zone's bot-skip rule for telemetry only matches requests with this header. It goes
    # in through a process-substitution file so it never shows in the process list.
    if [[ -z "${TELEMETRY_EDGE_KEY:-}" ]]; then
        printf 'WARN: TELEMETRY_EDGE_KEY is not set; skipping the otel.%s check\n' "$old_zone" >&2
    else
        local headers
        headers="$(curl -sS -o /dev/null -D - --max-redirs 0 --max-time 15 -X POST \
            -H @<(printf 'X-Telemetry-Key: %s\n' "$TELEMETRY_EDGE_KEY") \
            "https://otel.${old_zone}/v1/logs")" || headers=''
        code="$(sed -n '1s/^HTTP[^ ]* \([0-9]*\).*/\1/p' <<<"$headers")"
        otel_verdict "otel.${old_zone}" "$code" "$headers" >&2 || failed=1
    fi

    [[ "$failed" -eq 0 ]] || return 1
    printf 'redirects ok\n'
}

[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0
smoke_main "$@"
