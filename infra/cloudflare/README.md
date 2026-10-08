# Relab Cloudflare Edge

This directory manages Relab's **per-environment** Cloudflare edge with OpenTofu:

- a Cloudflare Tunnel per environment
- DNS records for the hostnames the tunnel serves (api and app)
- tunnel ingress routes into the Compose `edge` network
- Workers Custom Domains binding the landing page and docs hostnames to the Workers that
  `.github/workflows/deploy-sites.yml` deploys
- the environment's GitHub Environment (`prod` or `staging`) and its four public URL variables,
  which `publish-images.yml` bakes into the www, app and docs images. They derive from the same
  hostname map as the DNS records, so a domain change reaches the images with the same apply.
  Prod accepts publishes from `main` only.
- the `release tags` repository ruleset (prod workspace only, since it is repository-wide): only
  repository admins and maintainers may create, move or delete a `v*` tag, the ref release images
  are built from and `images-verify` checks them against

Zone-global configuration (TLS settings and the three entrypoint rulesets) lives in
[`../cloudflare-zone`](../cloudflare-zone). See "Why two roots" below.

Neither root manages application runtime settings, Compose services, secrets,
databases, backups, or telemetry.

## Managed resources

`prod` and `staging` are separate OpenTofu workspaces with separate tunnels. The
hostname map they share lives in `hostnames.tf`, which is symlinked into the zone root
so both read one definition. Current hostnames:

- Production: `r9lab.io`, `app.r9lab.io`, `api.r9lab.io`, `docs.r9lab.io`
- Staging: `web-test.r9lab.io`, `app-test.r9lab.io`, `api-test.r9lab.io`,
  `docs-test.r9lab.io`

Tunnel origins use plain HTTP inside the private Compose `edge` network.

Change Cloudflare configuration in OpenTofu, not in the dashboard. Use the dashboard for
inspection, events, and emergency debugging. After an emergency dashboard edit, copy the change back
into OpenTofu and run a plan before the next apply.

## Why two roots

Cloudflare allows **one entrypoint ruleset per (zone, phase)**, and prod and staging share one zone
(`cml-relab.org`). If an environment workspace owned a zone-scoped resource, whichever environment
applied last would overwrite the other's rules. The roots are split by scope:

| Root               | Scope           | Workspaces        | Owns                                        |
| ------------------ | --------------- | ----------------- | ------------------------------------------- |
| `cloudflare/`      | per environment | `prod`, `staging` | tunnel, DNS records, tunnel ingress         |
| `cloudflare-zone/` | the whole zone  | `default` only    | TLS settings, the three entrypoint rulesets |

The zone rulesets match **both** environments' api hosts.

### One-time: completing the split

An edge workspace applied before the split can still hold the three zone settings and the three
rulesets that now belong to the zone root. A plan for such a workspace destroys the live rate-limit
and firewall rules.

**Check first.** In each edge workspace:

```bash
cd infra/cloudflare
tofu workspace select staging   # and any other workspace that was ever applied
tofu state list
```

A clean workspace lists only `cloudflare_dns_record.edge[...]` and the two tunnel resources;
nothing below applies to it. `state rm` on a clean workspace fails with "No matching objects found".

If the list shows `cloudflare_zone_setting.*` or `cloudflare_ruleset.*`, hand them over. `state rm`
forgets them **without** deleting anything from Cloudflare; the zone root then imports them:

```bash
tofu state rm cloudflare_zone_setting.minimum_tls_version \
              cloudflare_zone_setting.tls_1_3 \
              cloudflare_zone_setting.always_use_https
tofu state rm 'cloudflare_ruleset.rate_limiting[0]' \
              'cloudflare_ruleset.cache_settings[0]' \
              'cloudflare_ruleset.custom_firewall[0]' || true

./generate-imports.sh zone > ../cloudflare-zone/imports.tf
just cloudflare-zone-plan cml-relab.org            # 0 to add; the TLS floor may show 1.0 -> 1.2
just cloudflare-zone-apply cml-relab.org           # plans, prints the diff, saves it, stops
just cloudflare-zone-apply cml-relab.org YES       # applies that saved plan
rm ../cloudflare-zone/imports.tf
```

Run `state rm` before the zone import, or two states briefly claim the same resources. A plan that
proposes destroying a ruleset means the handover is unfinished. Do not apply it.

## Commands

Run from the repository root:

```bash
just cloudflare-check              # both roots; no credentials, no network, no state

just cloudflare-plan staging       # per-environment root
just cloudflare-apply staging      # plans, prints the diff, saves it, stops
just cloudflare-apply staging YES  # applies that saved plan

just cloudflare-zone-plan cml-relab.org          # zone-global root — affects BOTH environments
just cloudflare-zone-apply cml-relab.org
just cloudflare-zone-apply cml-relab.org YES
```

`cloudflare-check` covers **both** roots: format, validate, and `tofu test` with the Cloudflare
provider mocked. The per-environment tests assert that staging serves only `-test` subdomains, that
prod serves the apex, that the two never share a hostname, and that the tunnel ingress ends in the
catch-all. The zone tests assert that every ruleset rule matches both environments' api hosts and
that the cache rules stay disjoint.

`cloudflare-check` is local apart from provider downloads. `plan` and `apply` require Cloudflare
credentials and IDs.

`apply` takes two runs. The first plans, prints the diff and saves the plan under `.tofu-plans/`;
the `YES` run applies that file, so what lands is the diff you read. A missing plan, one older than
twenty minutes, or one whose state has moved on is an error rather than a fresh plan applied
unseen. `FORCE=1` is the scripted path and does both in one run, with no diff for anyone to read.
The saved plan holds the tunnel secret: it is encrypted, gitignored, and deleted by the apply.

Required environment variables:

```bash
export CLOUDFLARE_API_TOKEN='...'
export TF_VAR_cloudflare_account_id='...'
export TF_VAR_cloudflare_zone_id='...'
export TF_VAR_state_passphrase='...'      # >= 16 chars, see State Encryption
export GITHUB_TOKEN="$(gh auth token)"     # the GitHub Environment, see below
```

The GitHub token needs admin rights on the repository, since it manages an Environment.
`gh auth token` has them when your account is a repository admin. The narrower option is a
fine-grained token for this repository alone, with **Administration** (the Environment, its
branch policy and the release-tag ruleset) and **Environments** (its variables) set to read and
write. `FEATURED_PRODUCT_ID` is left to the Environment's
settings page: it is a content choice, not an edge setting.

Keep them in one file outside the repository and source it. A half-set environment is the most
common way these commands fail:

```bash
chmod 600 ~/.config/relab-cloudflare.env && . ~/.config/relab-cloudflare.env
```

Optional:

```bash
export TF_VAR_cloudflare_zone_name='r9lab.io'  # the default
export TF_VAR_github_owner='CMLPlatform'  # a fork's owner, when it publishes its own images
```

Required for both environments:

```bash
export TF_VAR_github_reviewers='["<your-github-login>"]'
```

Every job in either GitHub Environment waits for one of these reviewers. In prod that is the
release gate: a release deploys staging's sites, and prod's follow once you have checked staging
and approved. Staging needs it because it accepts a run from any branch, and a
`CLOUDFLARE_API_TOKEN` granted on all Workers is not scoped to one environment.

Do not commit tokens, tunnel tokens, or state files.

## Moving the edge to another zone

Used once, to move from `cml-relab.org` to `r9lab.io`. While the old zone's redirect rules are
not live, its tunnel hostnames must keep reaching the tunnel. `legacy_zone_name` keeps them in the
ingress only: no record or custom domain is created for them.

1. On the new zone, delete the hand-made redirect rules and the placeholder `@` and `*` DNS
   records. They collide with the records this apply creates.
2. In each workspace (`prod`, `staging`), take the old zone's records out of state without
   deleting them in Cloudflare:

   ```bash
   tofu state rm 'cloudflare_dns_record.edge' 'cloudflare_workers_custom_domain.site'
   ```

   Check `tofu state list` first and name only addresses it shows: `state rm` fails on one that
   is absent. The old zone's CNAMEs and Worker custom domains stay in Cloudflare, unmanaged, on
   purpose: its redirect rules only fire on proxied hostnames. Do not delete them as orphans.
3. Plan with the new zone id and the old zone name:

   ```bash
   export TF_VAR_cloudflare_zone_id='<new zone id>'
   export TF_VAR_cloudflare_zone_name='r9lab.io'
   export TF_VAR_legacy_zone_name='cml-relab.org'
   ```

   Expect: the tunnel unchanged, the ingress updated in place, new records and custom domains,
   the `github_*` variables updated in place, and 0 to destroy. Stop if anything on the old zone
   or the tunnel is destroyed or replaced.
4. Apply. Once the old zone redirects and traffic has moved, unset `TF_VAR_legacy_zone_name` and
   apply again to drop the legacy ingress rules.

`generate-imports.sh` defaults to the new zone. To adopt resources on the old one, export
`TF_VAR_cloudflare_zone_name=cml-relab.org` and its zone id first.

## Moving a hostname onto a Worker

`hostnames.tf` gives each route either an `origin` (served through the tunnel) or a `worker`. A
Workers Custom Domain cannot be created on a hostname that still has a CNAME, so the apply deletes
the tunnel record first (`depends_on` orders it) and the hostname is unserved for the seconds in
between. The Worker must exist before that apply, and Deploy Sites reads the Worker names this
root writes, so the Environment goes first:

1. Write the GitHub Environment and its variables alone:

   ```bash
   tofu -chdir=infra/cloudflare workspace select <env>
   tofu -chdir=infra/cloudflare apply -var=environment=<env> \
     -target=github_repository_environment.publish \
     -target=github_actions_environment_variable.publish \
     -target=github_repository_environment_deployment_policy.release_tag
   ```

   Name the Environment as a target too: reached only as a dependency of the others, an
   in-place change to it (its reviewers) shows in the plan but is skipped by the apply.

   An Environment, variable or branch policy made by hand before this root managed it makes the
   apply fail with "already exists". Import each one first, for example:

   ```bash
   tofu -chdir=infra/cloudflare import -var=environment=<env> github_repository_environment.publish relab:<env>
   tofu -chdir=infra/cloudflare import -var=environment=<env> \
     'github_actions_environment_variable.publish["API_PUBLIC_URL"]' relab:<env>:API_PUBLIC_URL
   ```

   A branch policy imports as `relab:<env>:<policy id>`; `gh api
   repos/<owner>/relab/environments/<env>/deployment-branch-policies` lists the ids.
1. Run the Deploy Sites workflow for the environment (Actions -> Deploy Sites -> Run workflow)
   and approve it. It needs the `CLOUDFLARE_API_TOKEN` Environment secret: an account token with
   **Workers Scripts: Edit** on all Workers.
1. Apply the tunnel records that stay (`api`, `app`) on their own first:

   ```bash
   tofu -chdir=infra/cloudflare apply -var=environment=<env> \
     -target='cloudflare_dns_record.edge["api"]' -target='cloudflare_dns_record.edge["app"]'
   ```

   The provider can report "inconsistent result after apply" on `modified_on` for this update.
   The records are updated, and a second run reports no changes.
1. `just cloudflare-apply <env>`: expect the two tunnel records destroyed, the tunnel config
   updated, two custom domains created, and nothing else. Then `just cloudflare-apply <env> YES`.
1. Open both hostnames in a browser: a plain `curl` gets a bot challenge. The page loads, and
   its response carries the site's `content-security-policy` and no `server: Caddy`.
1. On the host, remove the containers nothing routes to any more:
   `docker rm -f relab_<env>-www-1 relab_<env>-docs-1`.

Staging first; prod once staging serves.

## API Token Scopes

Create the token under **My Profile -> API Tokens -> Create Custom Token**. It needs account and
zone policy rows: the tunnel is an account resource, everything else is scoped to the zone:

| Scope                   | Permission                            | Access | Required by                                      |
| ----------------------- | ------------------------------------- | ------ | ------------------------------------------------ |
| Account (Relab account) | Cloudflare Tunnel                     | Edit   | `cloudflare_zero_trust_tunnel_cloudflared`       |
| Account (Relab account) | Cloudflare One Connector: cloudflared | Edit   | `..._tunnel_cloudflared_config` ingress rules    |
| Account (Relab account) | Workers (all Workers)                 | Editor | `cloudflare_workers_custom_domain`               |
| Zone (`cml-relab.org`)  | DNS                                   | Edit   | `cloudflare_dns_record`                          |
| Zone (`cml-relab.org`)  | Workers Routes                        | Edit   | `cloudflare_workers_custom_domain`               |
| Zone (`cml-relab.org`)  | Zone Settings                         | Edit   | `cloudflare_zone_setting`                        |
| Zone (`cml-relab.org`)  | Zone WAF                              | Edit   | `http_ratelimit`, `http_request_firewall_custom` |
| Zone (`cml-relab.org`)  | Cache Rules                           | Edit   | `http_request_cache_settings`                    |
| Zone (`cml-relab.org`)  | Zone                                  | Read   | zone lookup                                      |

Some accounts still label the tunnel permission **Argo Tunnel (Legacy)**; it is the same grant
("create and delete Cloudflare Tunnels"). Do not substitute Cloudflare One Networks, which covers
WARP routes and virtual networks that this config does not use.

The Workers row is the **Editor** role on the Workers product, which replaces the legacy
**Workers Scripts: Edit**. Grant it on all Workers: Custom Domains do not accept a role limited to
selected Workers, and creating one also needs **Workers Routes: Edit** on the zone.

Grant nothing else. Bot Management, Access, Page Rules, Cache Purge, Zone DNS Settings, and a
blanket Zone Write are not used here. Scope the zone row to `cml-relab.org` alone, and set an
expiry.

Verify before the first plan:

```bash
curl -s https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .
```

That endpoint knows only user tokens (**My Profile -> API Tokens**). An account-owned token
(**Manage Account -> Account API Tokens**) answers `Invalid API Token` there; verify it at the
account instead:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$TF_VAR_cloudflare_account_id/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .
```

A missing scope surfaces during `plan`/`apply` as a 403 naming the resource or ruleset phase; add
that one permission.

## Import Workflow

Import anything that already exists in Cloudflare before the first apply, or the plan will try to
*create* it: duplicate DNS records, a second tunnel whose id does not match the live tunnel
token in `secrets/<env>/cloudflare_tunnel_token`, and a replacement for the one entrypoint ruleset a phase allows.

`generate-imports.sh` writes the `import` blocks, looking up every id through the API. Review the
file, plan, apply, then delete it: import blocks re-run on every plan until removed.

```bash
cd infra/cloudflare
./generate-imports.sh edge prod > imports.tf     # or: edge staging
cat imports.tf                                   # read it before running anything
just cloudflare-plan prod                        # expect 0 to add
rm imports.tf                                    # only after the apply succeeds
```

The zone root is adopted the same way:

```bash
./generate-imports.sh zone > ../cloudflare-zone/imports.tf
just cloudflare-zone-plan cml-relab.org
```

The script resolves every id before it writes anything, so a failure leaves no half-written file.
A missing tunnel or DNS record is a hard error. A ruleset phase with no ruleset is a legitimate
state: the script warns on stderr, omits that block, and lets the apply create the entrypoint.

Rulesets take a scope-prefixed import id (`zones/<zone_id>/<ruleset_id>`); every other resource here
takes a bare `<zone_id>/<id>`.

A correct adoption ends with a plan of **0 to add, 0 to destroy**. Anything else means an import is
missing or wrong: stop rather than applying.

Keep rule `ref` values stable. Cloudflare uses them to track rules across reordering.

## Where state lives

State is local, under `terraform.tfstate.d/<workspace>/`, gitignored and encrypted. Losing it costs
a re-import (see Import Workflow), because `generate-imports.sh` adopts every resource.

**Never commit the state**, encrypted or not: this repository is public, and a published encrypted
blob is a permanent brute-force target.

## State Encryption

State and plan files hold the Cloudflare tunnel secret, so `versions.tf` configures OpenTofu state
encryption (PBKDF2 + AES-GCM), enforced with no plaintext fallback. Export a passphrase of **at least
16 characters** before any command that reads or writes state:

```bash
export TF_VAR_state_passphrase='...'   # >= 16 chars
```

- `just cloudflare-check` never needs the passphrase: it copies each root to a throwaway directory
  and verifies that, so `init` never opens an initialized workspace's state. That also keeps an
  adoption-time `imports.tf` from crashing the mocked-provider test run.
- `just cloudflare-plan`, `just cloudflare-apply`, and `tofu state`/`workspace` commands fail closed
  without a passphrase, reporting `no passphrase provided`.
- Use the same passphrase every time. A lost passphrase means a lost state file, which costs a
  re-import (`generate-imports.sh`, a few minutes).
- Keep the passphrase in the operator's password manager, not in the repo or shell history.

Keep prod and staging state separate. A second operator or CI applying changes needs a remote
backend with locking; encryption at rest does not lock concurrent applies.
