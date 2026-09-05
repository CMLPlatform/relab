# Relab Cloudflare zone configuration

Zone-scoped configuration for `cml-relab.org`, managed with OpenTofu:

- TLS zone settings (minimum version, TLS 1.3, always-use-HTTPS)
- the three entrypoint rulesets: `http_ratelimit`,
  `http_request_cache_settings`, `http_request_firewall_custom`

## Why this is a separate root

Cloudflare allows exactly one entrypoint ruleset per (zone, phase), and prod and
staging share this zone. Owning these from either environment's workspace meant the
last apply won — so they live here instead, with a single `default` workspace and no
environment variable at all.

The rules deliberately match **both** environments' hostnames. That is not an
oversight: one ruleset protects the whole zone, so it has to cover every environment
in it. The hostname map is `hostnames.tf`, a symlink to the one in `../cloudflare`.

**Everything here affects prod and staging together.** A change to the TLS floor or a
firewall rule lands on every hostname in the zone at once.

## Rules adopted from the hand-configured zone

Two rules that existed in the live zone before adoption are reproduced here, because
dropping them would have been a silent regression:

- **`relab_prod_html_bypass`** — the prod web and app entry points bypass the edge
  cache. Their URLs do not change between deploys, so a cached entry point keeps
  serving the previous build.
- **`relab_telemetry_ingress_skip_managed_security`** — `otel.` accepts
  shipped telemetry from a non-browser client that Cloudflare's bot products would
  otherwise challenge, and a challenged log push is a silently dropped log.

Two others were dropped **deliberately**, and are recorded in `locals.tf` next to the
rules that replaced them: a bypass for `rpi-cam-*` hostnames that nothing serves any
more, and a restatement of Cloudflare's own default extension caching.

### The telemetry credential

The telemetry rule is gated on a shared secret, supplied as a variable so it never
enters the repository:

```bash
export TF_VAR_telemetry_edge_key='...'  # same value as TELEMETRY_EDGE_KEY in the deploy hosts' .env
```

It is matched against a dedicated `X-Telemetry-Key` header, **not** the OTLP
bearer token: Cloudflare stores ruleset expressions in cleartext and returns them from
the rulesets API, so matching the Authorization value (as the adopted rule originally
did) would disclose the collector credential to any zone-read grant. The deploy hosts
send both headers — the token authenticates at the collector, the key only buys the
managed-security skip — and the two rotate independently.

> **Sharing the zone with the monitoring stack is fine today — keep it that way.**
> `otel.cml-relab.org` belongs to CMLPlatform/monitoring, which runs its own Cloudflare
> Terraform against this same zone. Checked on 2026-09-05: its `infra/main.tf` declares a
> tunnel, two DNS records (`grafana.`, `otel.`) and a Zero Trust Access application —
> and **no `cloudflare_ruleset`**, so nothing there contends with this root.
>
> That is a property to preserve, not a guarantee. Cloudflare allows one entrypoint
> ruleset per (zone, phase), and that constraint does not stop at a repository boundary:
> if the monitoring stack ever adds a WAF, cache or rate-limit ruleset for this zone,
> whichever applied last would silently erase the other's rules. Rules for its hostnames
> belong here, in the single owner, the way the telemetry skip rule does.

Leaving it unset **omits the rule** rather than relaxing it — a rule that skipped
managed security for any request to the telemetry host would be worse than no rule.
That also means a plan run without it will propose **deleting** the live rule, so export
it whenever you plan this root, and rotate it together with the deploy hosts'
`OTLP_AUTH_TOKEN` — the same token, in the header form `Bearer <token>`.

## What this zone's Cloudflare plan allows

Two limits were found by an apply failing halfway, so they are now asserted in
`tests/zone.tftest.hcl` rather than rediscovered:

- **The `http_ratelimit` phase is heavily constrained on the Free tier:** one rule, a
  10-second counting period, a 10-second mitigation timeout, and only Path and Verified
  Bot usable as expression fields — `http.host` is not allowed. The single slot goes to
  the auth endpoints: unauthenticated, the usual credential-stuffing target, and edge
  blocking keeps the flood off the origin. Scoping by path alone is safe because
  `/v1/auth/` is served by nothing but the api hostnames.

  The rule sits at 10 requests / 10s, deliberately far above the application limits
  behind it (login 3/min, register and reset 3–5/hour, in
  `backend/app/api/auth/config.py`). The backend does the precise per-endpoint
  enforcement; this only stops volume, and staying loose keeps it from ever being what
  blocks a real person. Endpoints that lost their edge rule keep their own limiter
  dependencies, so none is left with no limit at all.

- **No `matches` (regex) operator.** It needs a Business or WAF Advanced plan. The
  affected expressions use `starts_with`/`ends_with` instead. This one is worth catching
  in tests specifically because it fails at *apply* time, partway through, after other
  resources have already changed.

Raising either would mean a paid Cloudflare plan. Both are recorded in `locals.tf` next
to the rules they shaped.

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
