# Relab Cloudflare zone configuration

Zone-scoped configuration for each Relab zone (`r9lab.io`, `cml-relab.org`), managed with OpenTofu:

- TLS zone settings (minimum version, TLS 1.3, always-use-HTTPS)
- the three entrypoint rulesets: `http_ratelimit`,
  `http_request_cache_settings`, `http_request_firewall_custom`

## Why this is a separate root

Cloudflare allows one entrypoint ruleset per (zone, phase), and prod and staging share this zone, so
these resources live here, one workspace per zone, named after the zone. See
[Why two roots](../cloudflare/README.md#why-two-roots). The rules match **both** environments'
hostnames; `hostnames.tf` is a symlink to the map in `../cloudflare`.

**Everything here affects prod and staging together.** A change to the TLS floor or a
firewall rule lands on every hostname in the zone at once.

## Workspaces

Each zone has its own workspace and state. The recipes select it (creating it on first use) and
pass `-var=cloudflare_zone_name=<zone>`; `TF_VAR_cloudflare_zone_id` must be that zone's id. A
`cloudflare_zone` data source checks the id against the name, so a mismatched pair fails the
plan. An optional `infra/cloudflare-zone/<zone>.tfvars` is loaded when present.

### First run: move the existing state

State created before workspaces existed sits in the `default` workspace, in `terraform.tfstate`,
and belongs to `cml-relab.org`. Copy it into that zone's workspace once, before the first
plan, so the resources are not planned for recreation. The file is encrypted on disk
(encryption is enforced), so the copy writes no plaintext:

```bash
cd infra/cloudflare-zone
tofu workspace new cml-relab.org
cp terraform.tfstate terraform.tfstate.d/cml-relab.org/terraform.tfstate
cd ../.. && just cloudflare-zone-plan cml-relab.org   # expect: No changes
```

`tofu workspace new -state=<file>` does not copy state in OpenTofu 1.13, so the file is copied
by hand.

After a clean plan, move the old `terraform.tfstate` and `terraform.tfstate.backup` aside and
keep them as a backup. The `default` workspace stays, unused: OpenTofu cannot delete it. Other
zones start from an empty workspace.

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
> CMLPlatform/monitoring, which runs its own Cloudflare Terraform against this zone and must
> own no ruleset in it.
>
> The one-entrypoint-ruleset-per-(zone, phase) limit crosses repository boundaries. If the
> monitoring stack adds a WAF, cache or rate-limit ruleset for this zone, whichever
> applies last erases the other's rules. Keep rules for its hostnames here, in the single
> owner, as the telemetry skip rule is.

Leaving the key unset **omits the rule** rather than relaxing it. A plan run without the
key therefore proposes **deleting** the live rule, so export it whenever you plan this
root. Rotate it together with `TELEMETRY_EDGE_KEY` in the deploy hosts' `.env`, which must hold
the same value.

### The end-to-end credential

Cloudflare's Super Bot Fight Mode challenges every headless-browser XHR, so Playwright
cannot run against the staging hosts at all. A second shared secret, supplied the same way,
buys those runs a skip:

```bash
export TF_VAR_e2e_edge_key='...'  # same value as E2E_EDGE_KEY in the CI/e2e environment
```

It is matched against a dedicated `X-E2E-Key` header, sent by the Playwright configs in
`www/`, `app/` and `docs/`. As with the telemetry key, Cloudflare returns expressions in
cleartext, so the value must be dedicated: it buys nothing but the skip. It is scoped to the
**staging hosts only**, and leaving the key unset drops the branch, so export it whenever you
plan this root.

Because the phase is capped at five rules, this is a **branch of the public-reads rule**, not a
rule of its own. It therefore inherits that rule's single phase and skips **Super Bot Fight Mode
only**: a keyed staging run still meets the same managed WAF prod does. That matters because the
key is just a header: anyone who reads it from the rulesets API could otherwise turn the WAF off
for every staging path, `/v1/admin/` included. Prod is unaffected either way.

The www build's fetch of `/v1/products/{id}` and its component tree is a non-browser client
that gets challenged the same way, which makes the landing page ship its fixture. That is
covered by `relab_public_reads_skip_bot_fight_mode` instead, which is the former stats rule
widened to GETs under `/v1/products/` as well, public read-only data, the same reasoning. No
build argument carries a key, which would leak into image history.

## What this zone's Cloudflare plan allows

Both limits below fail at *apply* time, partway through, after other resources have already
changed, so `tests/zone.tftest.hcl` asserts them:

- **The Free tier constrains the `http_ratelimit` phase:** one rule, a 10-second counting period, a
  10-second mitigation timeout, and only Path and Verified Bot usable as expression fields;
  `http.host` is not allowed. The single slot holds the auth endpoints. Path-only scoping works
  because only the api hostnames serve `/v1/auth/`.

- **Five rules in the `http_request_firewall_custom` phase.** All five slots are taken, so a new
  condition folds into an existing rule rather than adding one: both the keyed staging E2E skip and
  the product reads are branches of the public-read rule, alongside stats.
  `tests/zone.tftest.hcl` asserts the count with every optional rule enabled.

- **No `matches` (regex) operator.** It needs a Business or WAF Advanced plan. The affected
  expressions use `starts_with`/`ends_with` instead.

Raising any of these limits needs a paid Cloudflare plan.

## Commands

From the repository root:

```bash
just cloudflare-check       # covers this root and ../cloudflare
just cloudflare-zone-plan r9lab.io
just cloudflare-zone-apply r9lab.io       # plans, prints the diff, saves it, stops
just cloudflare-zone-apply r9lab.io YES
```

Per-environment resources (tunnels, DNS records, tunnel ingress) live in
[`../cloudflare`](../cloudflare), whose README carries the shared setup: API token
scopes, where state lives, state encryption, and the import workflow used to adopt
existing resources.
