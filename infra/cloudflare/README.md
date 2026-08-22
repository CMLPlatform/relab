# Relab Cloudflare Edge

This directory manages Relab's **per-environment** Cloudflare edge with OpenTofu:

- a Cloudflare Tunnel per environment
- DNS records for that environment's public hostnames
- tunnel ingress routes into the Compose `edge` network

Zone-global configuration — TLS settings and the three entrypoint rulesets — lives in
[`../cloudflare-zone`](../cloudflare-zone), because those resources belong to the zone
rather than to either environment. See "Why two roots" below.

Neither root manages application runtime settings, Compose services, secrets,
databases, backups, or telemetry.

## Managed resources

`prod` and `staging` are separate OpenTofu workspaces with separate tunnels. The
hostname map they share lives in `hostnames.tf`, which is symlinked into the zone root
so both read one definition.

## Why two roots

Cloudflare allows exactly **one entrypoint ruleset per (zone, phase)**, and prod and
staging share one zone (`cml-relab.org`). A workspace-per-environment layout cannot own
a zone-scoped resource: whichever environment applied last would overwrite the other's
rules, and the TLS zone settings had the same problem more quietly, being written
identically by both.

Splitting by scope removes the question rather than managing it:

| Root               | Scope           | Workspaces        | Owns                                        |
| ------------------ | --------------- | ----------------- | ------------------------------------------- |
| `cloudflare/`      | per environment | `prod`, `staging` | tunnel, DNS records, tunnel ingress         |
| `cloudflare-zone/` | the whole zone  | `default` only    | TLS settings, the three entrypoint rulesets |

The zone rulesets deliberately match **both** environments' api hosts, so the single
owner protects both. There is no `manage_shared_zone_rulesets` variable any more; the
split replaced it.

### One-time: completing the split (done on the staging host, 2026-08-20)

Any edge workspace applied before the split can still hold the three zone settings
and — because the pre-split root declared the zone entrypoint rulesets behind a
default-TRUE variable — the three rulesets that now belong to the zone root. A plan
for such a workspace would DESTROY the live rate-limit and firewall rules.

**Check first.** In each edge workspace:

```bash
cd infra/cloudflare
tofu workspace select staging   # and any other workspace that was ever applied
tofu state list
```

A clean workspace lists only `cloudflare_dns_record.edge[...]` and the two tunnel
resources — that is the verified state of the staging host's workspace, and nothing
below applies to it. `state rm` on a clean workspace fails with "No matching objects
found", which is confirmation, not an error.

If the list DOES show `cloudflare_zone_setting.*` or `cloudflare_ruleset.*`, hand
them over — `state rm` forgets them **without** deleting anything from Cloudflare,
then the zone root imports them:

```bash
tofu state rm cloudflare_zone_setting.minimum_tls_version \
              cloudflare_zone_setting.tls_1_3 \
              cloudflare_zone_setting.always_use_https
tofu state rm 'cloudflare_ruleset.rate_limiting[0]' \
              'cloudflare_ruleset.cache_settings[0]' \
              'cloudflare_ruleset.custom_firewall[0]' || true

./generate-imports.sh zone > ../cloudflare-zone/imports.tf
just cloudflare-zone-plan            # 0 to add; the TLS floor may show 1.0 -> 1.2
just cloudflare-zone-apply YES
rm ../cloudflare-zone/imports.tf
```

Order matters: `state rm` before the zone import, or two states briefly claim the same
resources. Either way: a plan that proposes destroying a ruleset is this handover left
unfinished, not something to approve.

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
just cloudflare-check              # both roots; no credentials, no network, no state

just cloudflare-plan staging       # per-environment root
just cloudflare-apply staging YES

just cloudflare-zone-plan          # zone-global root — affects BOTH environments
just cloudflare-zone-apply YES
```

`cloudflare-check` covers **both** roots: format, validate, and `tofu test` with the
Cloudflare provider mocked. The per-environment tests assert that staging serves only
`-test` subdomains, that prod serves the apex, that the two never share a hostname, and
that the tunnel ingress ends in the catch-all. The zone tests assert that every ruleset
rule matches both environments' api hosts and that the cache rules stay disjoint.

`cloudflare-check` is local/static apart from provider downloads. `plan` and
`apply` require Cloudflare credentials and IDs. `apply` is guarded by `YES` or
`FORCE=1`.

Required environment variables:

```bash
export CLOUDFLARE_API_TOKEN='...'
export TF_VAR_cloudflare_account_id='...'
export TF_VAR_cloudflare_zone_id='...'
export TF_VAR_state_passphrase='...'      # >= 16 chars, see State Encryption
```

Keep them in one file outside the repo and source it, rather than re-exporting per
shell — a half-set environment is the most common way these commands fail:

```bash
chmod 600 ~/.config/relab-cloudflare.env && . ~/.config/relab-cloudflare.env
```

Optional:

```bash
export TF_VAR_cloudflare_zone_name='cml-relab.org'
```

Do not commit tokens, tunnel tokens, or state files.

## API Token Scopes

Create the token under **My Profile -> API Tokens -> Create Custom Token**. It needs
two policy rows, because the tunnel is an account resource while everything else is
scoped to the zone:

| Scope                   | Permission                            | Access | Required by                                      |
| ----------------------- | ------------------------------------- | ------ | ------------------------------------------------ |
| Account (Relab account) | Cloudflare Tunnel                     | Edit   | `cloudflare_zero_trust_tunnel_cloudflared`       |
| Account (Relab account) | Cloudflare One Connector: cloudflared | Edit   | `..._tunnel_cloudflared_config` ingress rules    |
| Zone (`cml-relab.org`)  | DNS                                   | Edit   | `cloudflare_dns_record`                          |
| Zone (`cml-relab.org`)  | Zone Settings                         | Edit   | `cloudflare_zone_setting`                        |
| Zone (`cml-relab.org`)  | Zone WAF                              | Edit   | `http_ratelimit`, `http_request_firewall_custom` |
| Zone (`cml-relab.org`)  | Cache Rules                           | Edit   | `http_request_cache_settings`                    |
| Zone (`cml-relab.org`)  | Zone                                  | Read   | zone lookup                                      |

Some accounts still label the tunnel permission **Argo Tunnel (Legacy)**; it is the same
grant ("create and delete Cloudflare Tunnels"). Do not substitute Cloudflare One
Networks, which covers WARP routes and virtual networks that this config does not use.

Grant nothing else. Bot Management, Access, Page Rules, Cache Purge, Zone DNS Settings,
and a blanket Zone Write are not used here and widen the blast radius of a leaked token.
Scope the zone row to `cml-relab.org` alone rather than all zones, and set an expiry.

Verify before the first plan:

```bash
curl -s https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq .
```

A missing scope surfaces during `plan`/`apply` as a 403 naming the resource or ruleset
phase; add that one permission rather than broadening the token.

## Import Workflow

Anything that already exists in Cloudflare must be imported before the first apply,
or the plan will try to *create* it: duplicate DNS records, a second tunnel whose id
does not match the live `CLOUDFLARE_TUNNEL_TOKEN`, and — worst — a replacement for the
one entrypoint ruleset a phase allows.

`generate-imports.sh` writes the `import` blocks for you, looking up every id through
the API so none is transcribed by hand. Review the file, plan, apply, then delete it:
import blocks re-run on every plan until removed.

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
just cloudflare-zone-plan
```

The script resolves every id before it writes anything, so a failure leaves no
half-written file. A missing tunnel or DNS record is a hard error — those exist and
importing them is the whole point. A ruleset phase with no ruleset is different: that is
a legitimate state, so the script warns on stderr, omits that block, and lets the apply
create the entrypoint.

Note that rulesets take a scope-prefixed import id (`zones/<zone_id>/<ruleset_id>`),
unlike every other resource here, which take a bare `<zone_id>/<id>`.

A correct adoption ends with a plan of **0 to add, 0 to destroy**. Anything else means
an import is missing or wrong — stop rather than applying.

Keep rule `ref` values stable. Cloudflare uses them to track rules across
reordering.

## Where state lives

State is local, under `terraform.tfstate.d/<workspace>/`, gitignored and encrypted. For
one operator applying a handful of times a year, that is the proportionate answer: a
remote backend's main product is locking between concurrent applies, and there are no
concurrent applies.

The usual objection to local state — "lose the machine, lose everything" — does not hold
here, because every resource is adopted by script. Losing the state costs a re-import
(see Import Workflow), not a reconstruction. It is still worth keeping a copy somewhere
private if the passphrase is ever the only thing standing between a stolen laptop and
your tunnel secret.

**Never commit the state**, encrypted or not: this repository is public, and an encrypted
blob published permanently is a passphrase brute-force target with no expiry.

Revisit this if a second person ever applies, or if CI does — that is the point where a
remote backend with locking stops being ceremony.

## State Encryption

State and plan files hold the Cloudflare tunnel secret, so `versions.tf` configures
OpenTofu state encryption (PBKDF2 + AES-GCM), enforced with no plaintext fallback. Export
a passphrase of **at least 16 characters** before any command that reads or writes state:

```bash
export TF_VAR_state_passphrase='...'   # >= 16 chars
```

- `just cloudflare-check` never needs the passphrase: it copies each root to a
  throwaway directory and verifies that, so `init` never opens an initialized
  workspace's state. That also keeps an adoption-time `imports.tf` from crashing the
  mocked-provider test run.
- `just cloudflare-plan`, `just cloudflare-apply`, and `tofu state`/`workspace` commands
  fail closed without one, reporting `no passphrase provided`. That is deliberate — it
  beats silently writing the tunnel secret in plaintext.
- Encryption is `enforced = true` with no plaintext fallback, so a missing passphrase
  fails closed rather than silently writing the tunnel secret in the clear.
- Use the same passphrase every time. A lost passphrase means a lost state file — which
  costs a re-import (`generate-imports.sh`, a few minutes), not a rebuild. That is why
  encryption can be enforced here without it being a hazard.
- Keep the passphrase in the operator's password manager, not in the repo or shell
  history.

Keep prod and staging state separate. A remote encrypted backend with locking is still
required before a second operator or CI applies changes — encryption at rest does not
give concurrent applies a lock.
