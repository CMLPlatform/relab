#!/usr/bin/env bash
# Serve a built static site (www or docs) under `wrangler dev` and check what the Worker
# actually sends: the `_headers` file is applied, including to the 404 page, and only
# GET/HEAD are served. The unit tests check the generated file; this checks that workerd
# reads it. Run from the site directory after `pnpm run build`.
set -euo pipefail

port="${PORT:-8787}"
url="http://127.0.0.1:$port"
log="$(mktemp)"

WRANGLER_SEND_METRICS=false pnpm exec wrangler dev --ip 127.0.0.1 --port "$port" >"$log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -f "$log"' EXIT

fail() {
    echo "check_site_headers: $1" >&2
    cat "$log" >&2
    exit 1
}

curl -sf --retry 60 --retry-delay 1 --retry-connrefused -o /dev/null "$url/" \
    || fail "wrangler dev did not answer on $url within a minute"

require_headers() {
    local path="$1" status="$2" headers
    headers="$(curl -sS -D - -o /dev/null "$url$path")"
    grep -q "^HTTP/[0-9.]* $status" <<<"$headers" || fail "$path: expected $status, got $(head -1 <<<"$headers")"
    for name in content-security-policy strict-transport-security x-content-type-options referrer-policy; do
        grep -qi "^$name:" <<<"$headers" || fail "$path: missing $name"
    done
}

require_headers / 200
require_headers /no-such-page-check-site-headers 404

for method in TRACE POST PUT DELETE; do
    status="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url/")"
    [[ "$status" == 405 ]] || fail "$method /: expected 405, got $status"
done

echo "check_site_headers: $(basename "$PWD") serves its _headers and rejects other methods"
