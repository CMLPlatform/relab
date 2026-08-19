#!/usr/bin/env bash
# Emit OpenTofu `import` blocks for Cloudflare resources that already exist.
#
# Adoption is the risky half of managing live infrastructure with Terraform: a plan
# that says "create" against resources that are already there will duplicate DNS
# records, mint a second tunnel, or overwrite the single entrypoint ruleset a phase
# allows. Import blocks make that reviewable — you read the generated file, then the
# plan, and only then apply.
#
# The generated imports.tf is a throwaway, NOT something to commit: it names one
# account's resource ids and is meaningless after the apply that consumes it.
#
# Usage:
#   ./generate-imports.sh edge prod   > imports.tf                 # run in this directory
#   ./generate-imports.sh zone        > ../cloudflare-zone/imports.tf
#
# Needs CLOUDFLARE_API_TOKEN, TF_VAR_cloudflare_account_id and TF_VAR_cloudflare_zone_id.
# Delete the generated imports.tf once the apply has succeeded: import blocks are a
# one-time instruction, and leaving them in place re-runs them on every plan.
set -euo pipefail

api() {
    curl -fsS "https://api.cloudflare.com/client/v4/$1" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
}

die() {
    echo "error: $*" >&2
    exit 1
}

# `:?` rather than a helper: it names the missing variable and stops before any API
# call, and shellcheck can see the assignment.
: "${CLOUDFLARE_API_TOKEN:?is not set}"
zone="${TF_VAR_cloudflare_zone_id:?is not set}"
account="${TF_VAR_cloudflare_account_id:-}"
zone_name="${TF_VAR_cloudflare_zone_name:-cml-relab.org}"

mode="${1:-}"
env="${2:-}"
# Validate both arguments before emitting anything: a header printed above an error
# is a file someone can half-redirect into imports.tf.
case "$mode" in
    zone) [[ -z "$env" ]] || die "the zone root takes no environment argument" ;;
    edge)
        case "$env" in
            prod | staging) ;;
            *) die "usage: generate-imports.sh edge <prod|staging>" ;;
        esac
        ;;
    *) die "usage: generate-imports.sh <edge|zone> [prod|staging]" ;;
esac

# One lookup helper per resource kind. Each fails loudly when the resource is absent:
# a silently skipped import becomes a "create" in the plan, which is the exact outcome
# this script exists to prevent.
lookup_dns_record() {
    local hostname="$1" id
    id="$(api "zones/$zone/dns_records?name=$hostname" | jq -r '.result[0].id // empty')"
    [[ -n "$id" ]] || return 1
    printf '%s' "$id"
}

lookup_ruleset() {
    local phase="$1" id
    id="$(api "zones/$zone/rulesets" \
        | jq -r --arg phase "$phase" '.result[] | select(.phase == $phase and .kind == "zone") | .id' | head -1)"
    [[ -n "$id" ]] || return 1
    printf '%s' "$id"
}

out=""

if [[ "$mode" == edge ]]; then
    : "${TF_VAR_cloudflare_account_id:?is not set (needed for the tunnel import id)}"

    tunnel_name="relab-$env"
    # The live tunnels predate this module and carry their original names, so match on
    # the name the module WILL set as well as the one Cloudflare has today.
    # Set RELAB_TUNNEL_NAME to point at a tunnel called something else again.
    # Verified against the account's tunnel list on 2026-08-19: prod's tunnel is
    # cml-relab-prod. Staging's was cml-relab-test until its first apply renamed it.
    legacy_name="cml-relab-prod"
    [[ "$env" == staging ]] && legacy_name="cml-relab-test"
    override="${RELAB_TUNNEL_NAME:-}"

    tunnels="$(api "accounts/$account/cfd_tunnel?is_deleted=false")"
    tunnel_id="$(jq -r --arg new "$tunnel_name" --arg old "$legacy_name" --arg override "$override" \
        '.result[] | select(.name == $new or .name == $old or ($override != "" and .name == $override)) | .id' \
        <<<"$tunnels" | head -1)"
    if [[ -z "$tunnel_id" ]]; then
        # Listing what IS there turns a wrong guess about the name from a dead end into
        # a one-line fix: the tunnel is rarely absent, it is just called something else.
        echo "error: no tunnel named $tunnel_name${override:+, $override} or $legacy_name in account $account" >&2
        echo "tunnels that do exist in this account:" >&2
        jq -r '.result[]? | "  \(.name)\t\(.id)\tconnections=\(.connections | length)"' <<<"$tunnels" >&2
        echo "Re-run with RELAB_TUNNEL_NAME='<name>' once you know which one serves $env." >&2
        exit 1
    fi

    if [[ "$env" == prod ]]; then
        declare -A hosts=([www]="$zone_name" [app]="app.$zone_name" [api]="api.$zone_name" [docs]="docs.$zone_name")
    else
        declare -A hosts=([www]="web-test.$zone_name" [app]="app-test.$zone_name" [api]="api-test.$zone_name" [docs]="docs-test.$zone_name")
    fi

    # A missing DNS record is a hard error: the module manages all four, and letting
    # one through as a "create" would fight the record that is actually serving.
    declare -A record_ids=()
    for key in www app api docs; do
        record_ids[$key]="$(lookup_dns_record "${hosts[$key]}")" \
            || die "no DNS record found for ${hosts[$key]}"
    done

    out+="import {
  to = cloudflare_zero_trust_tunnel_cloudflared.relab
  id = \"$account/$tunnel_id\"
}

import {
  to = cloudflare_zero_trust_tunnel_cloudflared_config.relab
  id = \"$account/$tunnel_id\"
}
"
    for key in www app api docs; do
        out+="
import {
  to = cloudflare_dns_record.edge[\"$key\"]
  id = \"$zone/${record_ids[$key]}\"
}
"
    done
else
    for pair in "minimum_tls_version:min_tls_version" "tls_1_3:tls_1_3" "always_use_https:always_use_https"; do
        out+="import {
  to = cloudflare_zone_setting.${pair%%:*}
  id = \"$zone/${pair##*:}\"
}

"
    done

    # A phase with no ruleset is legitimate — Cloudflare creates the entrypoint on
    # first write — so skip it with a warning rather than failing. This is the one
    # place where "not found" really does mean "let the apply create it".
    for pair in "rate_limiting:http_ratelimit" "cache_settings:http_request_cache_settings" "custom_firewall:http_request_firewall_custom"; do
        resource="${pair%%:*}"
        phase="${pair##*:}"
        if ruleset_id="$(lookup_ruleset "$phase")"; then
            # Rulesets take a scope-prefixed id, unlike every other resource here.
            out+="import {
  to = cloudflare_ruleset.$resource
  id = \"zones/$zone/$ruleset_id\"
}

"
        else
            echo "note: no zone ruleset in phase $phase; omitting its import block so the apply creates it" >&2
        fi
    done
fi

echo "# Generated by generate-imports.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Delete after a successful apply."
echo
printf '%s' "$out"
