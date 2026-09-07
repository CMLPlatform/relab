# Relab Cloudflare zone configuration

Zone-scoped configuration for `cml-relab.org`, managed with OpenTofu:

- TLS zone settings (minimum version, TLS 1.3, always-use-HTTPS)
- the three entrypoint rulesets: `http_ratelimit`,
  `http_request_cache_settings`, `http_request_firewall_custom`

## Why this is a separate root

Cloudflare allows one entrypoint ruleset per (zone, phase), and prod and staging share this zone.
Owning these from either environment's workspace would let the last apply overwrite the other's
rules, so they live here, in a single `default` workspace.

The rules match **both** environments' hostnames. The hostname map is `hostnames.tf`, a symlink to
the one in `../cloudflare`.

**Everything here affects prod and staging together.** A change to the TLS floor or a
firewall rule lands on every hostname in the zone at once.

## Rules adopted from the hand-configured zone

Two rules that existed in the live zone before adoption are reproduced here:

- **`relab_prod_html_bypass`**: the prod web and app entry points bypass the edge cache. Their URLs
  do not change between deploys, so a cached entry point keeps serving the previous build.
- **`relab_telemetry_ingress_skip_managed_security`**: `otel.` accepts telemetry from a non-browser
  client that Cloudflare's bot products challenge, and a challenged log push is a dropped log.

Two others are not reproduced, and are recorded in `locals.tf`: a bypass for `rpi-cam-*`
hostnames that nothing serves, and a restatement of Cloudflare's default extension
caching.

### The telemetry credential

The telemetry rule is gated on a shared secret, supplied as a variable so it never
enters the repository:

```bash
export TF_VAR_telemetry_edge_key='...'  # same value as TELEMETRY_EDGE_KEY in the deploy hosts' .env
```

It is matched against a dedicated `X-Telemetry-Key` header, **not** the OTLP bearer token:
Cloudflare returns ruleset expressions in cleartext from the rulesets API, so matching the
Authorization value would disclose the collector credential to any zone-read grant. The deploy hosts
send both headers. The token authenticates at the collector, the key only buys the managed-security
skip, and the two rotate independently.

> **The monitoring stack shares this zone.** `otel.cml-relab.org` belongs to
> CMLPlatform/monitoring, which runs its own Cloudflare Terraform against this zone.
> Checked on 2026-09-05: its `infra/main.tf` declares a tunnel, two DNS records
> (`grafana.`, `otel.`) and a Zero Trust Access application, and no `cloudflare_ruleset`.
>
> The one-entrypoint-ruleset-per-(zone, phase) limit crosses repository boundaries. If the
> monitoring stack adds a WAF, cache or rate-limit ruleset for this zone, whichever
> applies last erases the other's rules. Keep rules for its hostnames here, in the single
> owner, as the telemetry skip rule is.

Leaving the key unset **omits the rule** rather than relaxing it. A plan run without the
key therefore proposes **deleting** the live rule, so export it whenever you plan this
root. Rotate it together with the deploy hosts' `OTLP_AUTH_TOKEN`, the same token in the
header form `Bearer <token>`.

## What this zone's Cloudflare plan allows

Both limits below fail at *apply* time, partway through, after other resources have already
changed, so `tests/zone.tftest.hcl` asserts them:

- **The Free tier constrains the `http_ratelimit` phase:** one rule, a 10-second counting period, a
  10-second mitigation timeout, and only Path and Verified Bot usable as expression fields;
  `http.host` is not allowed. The single slot holds the auth endpoints. Path-only scoping works
  because only the api hostnames serve `/v1/auth/`.

- **No `matches` (regex) operator.** It needs a Business or WAF Advanced plan. The affected
  expressions use `starts_with`/`ends_with` instead.

Raising either limit needs a paid Cloudflare plan.

## Commands

From the repository root:

```bash
just cloudflare-check       # covers this root and ../cloudflare
just cloudflare-zone-plan
just cloudflare-zone-apply YES
```

Per-environment resources (tunnels, DNS records, tunnel ingress) live in
[`../cloudflare`](../cloudflare), whose README carries the shared setup: API token
scopes, where state lives, state encryption, and the import workflow used to adopt
existing resources.
