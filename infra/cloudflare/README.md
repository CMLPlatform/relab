# RELab Cloudflare Edge

This directory manages RELab's Cloudflare edge with OpenTofu:

- Cloudflare Tunnel per environment
- DNS records for public RELab hostnames
- Tunnel ingress routes to the Compose `edge` network
- TLS zone settings
- zone rate limiting, cache, and custom firewall rules

It does not manage application runtime settings, Compose services, secrets,
databases, backups, or telemetry.

## Managed Resources

`prod` and `staging` use separate OpenTofu workspaces and separate tunnels. Both
environments share the same route map in `locals.tf`.

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
dashboard remains useful for inspection, events, and emergency debugging. If an
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
