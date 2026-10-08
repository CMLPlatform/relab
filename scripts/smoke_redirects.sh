#!/usr/bin/env bash
# Smoke check for the old-zone to new-zone redirects: every old host must answer with the
# expected status and a Location on the same host prefix of the new zone, path and query
# kept. The monitoring host must never redirect, because a 3xx drops exporter POSTs.
# Usage: smoke_redirects.sh <old_zone> <new_zone> <prod|staging>
# REDIRECT_PERMANENT=1 expects 301/308 instead of 302/307, mirroring var.redirect_permanent.
set -euo pipefail

SMOKE_PATH='/r9lab-smoke?q=1'

# redirect_verdict <host> <status> <location> <expect_status> <expect_location>
# Prints "ok", or one FAIL line; returns 0 or 1.
redirect_verdict() {
    local host="$1" status="$2" location="$3" expect_status="$4" expect_location="$5"
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

    for entry in $(route_prefixes "$env"); do
        prefix="${entry%:*}"
        status="${entry#*:}"
        if [[ "$permanent" == 1 ]]; then
            [[ "$status" == 307 ]] && status=308 || status=301
        fi
        result="$(curl -sS -o /dev/null --max-redirs 0 --max-time 15 \
            -w '%{http_code} %{redirect_url}' "https://${prefix}${old_zone}${SMOKE_PATH}")" || result=''
        code="${result%% *}"
        location="${result#* }"
        redirect_verdict "${prefix}${old_zone}" "$code" "$location" "$status" \
            "https://${prefix}${new_zone}${SMOKE_PATH}" >&2 || failed=1
    done

    # Monitoring posts to this host; any redirect or edge challenge breaks ingestion.
    local headers
    headers="$(curl -sS -o /dev/null -D - --max-redirs 0 --max-time 15 -X POST \
        -w 'status=%{http_code}\n' "https://otel.${old_zone}/v1/logs")" || headers='status=000'
    if [[ "$headers" =~ status=3[0-9][0-9] ]] || grep -qi '^cf-mitigated:' <<<"$headers"; then
        printf 'FAIL[otel.%s]: redirected or challenged\n' "$old_zone" >&2
        failed=1
    fi

    [[ "$failed" -eq 0 ]] || return 1
    printf 'redirects ok\n'
}

[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0
smoke_main "$@"
