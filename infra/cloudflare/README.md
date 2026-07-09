# ReLab Cloudflare Edge

This directory manages ReLab's Cloudflare edge with OpenTofu:

- Cloudflare Tunnel per environment
- DNS records for public ReLab hostnames
- Tunnel ingress routes to the Compose `edge` network
- TLS zone settings
- zone rate limiting, cache, and custom firewall rules

It does not manage application runtime settings, Compose services, secrets,
databases, backups, or telemetry.

## Managed Resources

`prod` and `staging` use separate OpenTofu workspaces and separate tunnels. Both
environments share the same route map in `locals.tf`.

### Shared zone rulesets (important)

prod and staging share **one** Cloudflare zone (`cml-relab.org`). Cloudflare allows
exactly **one entrypoint ruleset per (zone, phase)**, so the three zone-global rulesets
(`http_ratelimit`, `http_request_cache_settings`, `http_request_firewall_custom`) can be
owned by only one workspace — otherwise `apply`-ing one environment overwrites the
other's rules (e.g. staging wiping prod's auth rate limits). The `prod` workspace owns
them (`manage_shared_zone_rulesets = true`, the default) and their rules already match
**both** environments' api hosts; the `staging` workspace must set
`manage_shared_zone_rulesets = false`:

```bash
# in the staging workspace, once:
export TF_VAR_manage_shared_zone_rulesets=false
```

Per-environment resources (tunnel, DNS records, tunnel ingress) stay per-workspace. The
idempotent TLS zone settings are written identically by both and are left ungated.

**One-time migration** (staging currently owns copies of these rulesets — dropping them
naively would delete the live zone entrypoint prod now manages). In the **staging**
workspace, detach without destroying, then let prod take ownership:

```bash
# staging workspace: forget the shared rulesets WITHOUT deleting them from Cloudflare
tofu state rm cloudflare_ruleset.rate_limiting cloudflare_ruleset.cache_settings cloudflare_ruleset.custom_firewall
# then apply prod (recreates them under prod ownership, covering both envs):
just cloudflare-apply prod YES
# finally apply staging with the flag off (no-op for the shared rulesets now):
TF_VAR_manage_shared_zone_rulesets=false just cloudflare-apply staging YES
```

Rule `ref` values changed from `relab_<env>_<name>` to `relab_<name>` (they are shared
now), so Cloudflare recreates the rate-limit rules once on the first prod apply.

Current hostnames:

- Production: `cml-relab.org`, `app.cml-relab.org`, `api.cml-relab.org`,
  `docs.cml-relab.org`
- Staging: `web-test.cml-relab.org`, `app-test.cml-relab.org`,
  `api-test.cml-relab.org`, `docs-test.cml-relab.org`

Zone settings enforce TLS 1.2+, enable TLS 1.3, and redirect HTTP to HTTPS.
Tunnel origins use plain HTTP inside the private Compose `edge` network.

Rulesets:

- `http_ratelimit`: repo-managed API rate limits.
- `http_request_cache_settings`: repo-managed cache rules.
- `http_request_firewall_custom`: repo-managed custom firewall rules.

Cloudflare rules should be changed in this directory, not in the dashboard. The
dashboard is useful for inspection, events, and emergency debugging. If an
emergency dashboard edit is ever made, copy the change back into OpenTofu and
run a plan before the next apply.

## Commands

Run from the repository root:

```bash
just cloudflare-check
just cloudflare-plan staging
just cloudflare-plan prod
just cloudflare-apply staging YES
just cloudflare-apply prod YES
```

`cloudflare-check` is local/static apart from provider downloads. `plan` and
`apply` require Cloudflare credentials and IDs. `apply` is guarded by `YES` or
`FORCE=1`.

Required environment variables:

```bash
export CLOUDFLARE_API_TOKEN='...'
export TF_VAR_cloudflare_account_id='...'
export TF_VAR_cloudflare_zone_id='...'
```

Optional:

```bash
export TF_VAR_cloudflare_zone_name='cml-relab.org'
```

Do not commit tokens, tunnel tokens, or state files.

## Import Workflow

Import existing Cloudflare resources before applying from a fresh state:

1. Select the matching workspace: `prod` or `staging`.
1. Import the tunnel, DNS records, and ruleset phases managed in this directory.
1. Run `just cloudflare-plan <env>`.
1. Apply only after the plan shows the exact intended drift.

Keep rule `ref` values stable. Cloudflare uses them to track rules across
reordering.

OpenTofu state can contain sensitive provider data. Keep prod and staging state
separate, and use a remote encrypted backend with locking before multiple people
or CI apply changes.
