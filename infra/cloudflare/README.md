# RELab Cloudflare edge

This directory owns the public Cloudflare edge for RELab: DNS records,
Cloudflare Tunnels, and Tunnel ingress rules. It intentionally does not manage
Compose, Docker secrets, PostgreSQL, Redis, storage, backups, or app runtime
configuration.

## Shape

- `prod` and `staging` use separate OpenTofu workspaces/state.
- Public hostnames are generated from one environment-specific route map.
- DNS records point at the matching Cloudflare Tunnel endpoint.
- Tunnel ingress routes point at the current Compose origins.
- The final ingress rule returns `http_status:404` for unknown hostnames.

Current origins are Compose-oriented, such as `http://api:8000`. If RELab moves
to Kubernetes or managed cloud hosting later, keep the public hostname map and
replace only the origin targets in `locals.tf`.

## Commands

From the repository root:

```bash
just cloudflare-check
just cloudflare-plan staging
just cloudflare-plan prod
just cloudflare-apply staging YES
just cloudflare-apply prod YES
```

`cloudflare-check` is static with respect to the RELab Cloudflare account. It may
download the provider, but it does not read or change account resources.
`cloudflare-plan` and `cloudflare-apply` require Cloudflare credentials and IDs.
Apply is guarded: pass `YES` or set `FORCE=1`.

Set these values in the shell before planning:

```bash
export CLOUDFLARE_API_TOKEN='...'
export TF_VAR_cloudflare_account_id='...'
export TF_VAR_cloudflare_zone_id='...'
```

This keeps the local workflow and the future password-manager workflow identical:
Bitwarden/1Password can export the same environment variables before running the
same `just` command. Do not commit account tokens, tunnel tokens, or state files.

## Existing resources

The first adoption should import existing Cloudflare resources into state before
any apply. Use `just cloudflare-plan <env>` after each import and continue only
when the plan is empty or shows the exact intended drift. Use
`just cloudflare-apply <env> YES` only after reviewing the plan.

OpenTofu state can contain provider-managed sensitive data. Keep prod and
staging state separate, and prefer a remote encrypted backend with locking
before multiple people or CI can apply changes.
