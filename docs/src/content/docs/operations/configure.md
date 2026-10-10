---
title: Configure
description: Prepare a production or staging host with a Cloudflare Tunnel, the root .env, and the runtime secrets.
---

## Production and staging deployment

The stack runs on one host behind a Cloudflare Tunnel, so the host needs no public ports. A deploy
is three commands on the server: pull the repository, pick a published image tag, start the stack.
You can also send them from another machine over an ssh key whose forced command is
`scripts/remote_deploy.sh`, which allows those steps and nothing else (see `deploy/DEPLOY-PROD.md`
Part 1.6). Every command runs as `just stack <prod|staging> <command>`. A command that changes state
takes `YES` to confirm which host it acts on. [Deployment and operations](/operations/deployment/)
describes the topology these steps produce.

1. Create a Cloudflare Tunnel, one of two ways.

   - **By hand:** in the Cloudflare dashboard, create a remotely managed tunnel and add a public
     hostname per service, forwarding to `app:8081` and `api:8000`. The landing page and docs
     hostnames are Workers Custom Domains instead (step 1 of
     [Deploy](/operations/deploy/)).

   - **With OpenTofu:** `infra/cloudflare/` manages the DNS records, the tunnels, and the ingress
     rules. Its
     [README](https://github.com/CMLPlatform/relab/blob/main/infra/cloudflare/README.md) lists the
     credentials, the API token scopes, and the state encryption passphrase. With those exported,
     plan and apply per environment:

     ```bash
     just cloudflare-check
     just cloudflare-plan prod
     just cloudflare-apply prod       # plans and saves it; review the diff
     just cloudflare-apply prod YES   # applies the plan you just reviewed
     ```

     :::danger
     Apply only against a new zone, or after you import the existing DNS records, tunnels, and
     rulesets into OpenTofu state (see the README's import workflow). Otherwise the apply
     duplicates DNS records and creates a second tunnel whose token does not match
     `secrets/<env>/cloudflare_tunnel_token`. It can also overwrite existing rulesets, because each Cloudflare
     phase allows one ruleset per zone.
     :::

   Either way, copy the tunnel token: step 3 puts it in a secret file.

1. Copy `.env.example` to `.env` and fill it in.

   ```bash
   cp .env.example .env
   ```

   The root `.env` is gitignored and holds every host-local value Compose interpolates. One host
   serves one environment. Every key is described in `.env.example`. The required ones:

   - `ENVIRONMENT`: `prod` or `staging`. `just stack` refuses to run against a host whose `.env`
     says otherwise.
   - `API_PUBLIC_URL`, `APP_PUBLIC_URL`, `SITE_PUBLIC_URL`, `DOCS_PUBLIC_URL`: the four public
     origins on your domain.
   - `IMAGE_TAG`: the published image tag to run, see step 1 of [Deploy](/operations/deploy/).
     Set `IMAGE_REGISTRY` too when the images come from your own fork.
   - `GOOGLE_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_ID`: OAuth client IDs for social login.
   - `EMAIL_PROVIDER` and the sender fields. With `smtp`, also fill `SMTP_HOST`, `SMTP_USERNAME`,
     and `secrets/<env>/smtp_password`. With `microsoft_graph`, fill the tenant, client, and sender
     values and `secrets/<env>/microsoft_graph_client_secret`. Backend startup validates whichever
     provider you chose.
   - `BOOTSTRAP_SUPERUSER_EMAIL`: the first admin account. The migrator creates it with the password
     in `secrets/<env>/bootstrap_superuser_password`.
   - `MALWARE_SCAN_ENABLED`: `true` starts ClamAV with the stack, see step 2 of
     [Deploy](/operations/deploy/).

   Upload quotas: `MAX_UPLOAD_FILES_PER_USER` and `MAX_UPLOAD_BYTES_PER_USER_MB` cap `contributor`
   accounts. The `*_LAB_USER*` pair caps `lab` accounts and must not be lower. The quota counts
   existing rows, so on a host with existing data, raise the limits before the first start: an
   owner already above the limit cannot upload at all. Every account starts as `contributor`. A
   superuser promotes lab members with `PUT /v1/admin/users/{user_id}/role` and the body
   `{"role": "lab"}`.

   Per-image caps: `MAX_IMAGE_UPLOAD_SIZE_MB` and `MAX_IMAGE_UPLOAD_PIXELS` cap `contributor`
   images (10 MB, 12.6 MP); `MAX_IMAGE_UPLOAD_SIZE_LAB_MB` and `MAX_IMAGE_UPLOAD_PIXELS_LAB` cap
   `lab` images (20 MB, 24 MP). No pixel cap may exceed 50 MP. An image takes about 6 bytes per
   pixel of memory while it is processed (about 145 MB at 24 MP), so size `IMAGE_RESIZE_WORKERS`
   x `WEB_CONCURRENCY` against the backend's memory limit before raising a pixel cap.

1. Create the runtime secret files.

   ```bash
   just deploy-secrets-template prod
   ```

   Replace every placeholder under `secrets/prod/`, and paste the tunnel token from step 1 into
   `secrets/prod/cloudflare_tunnel_token`. Runtime secrets (database passwords, the auth token
   secret, the restic password, the tunnel token, provider secrets) live only there, never in
   `.env`.
   `deploy/env/variables.toml` is the inventory; `just env-inventory` prints it.

1. Validate the configuration.

   ```bash
   just compose-config         # the Compose overlays render for every environment
   just deploy-secrets-check   # every secret file exists, has mode 0644 in a 0700 dir, and is not a placeholder
   ```

With the configuration valid, [deploy the stack](/operations/deploy/).

## Optional: central telemetry

Prod and staging can ship to a central monitoring stack (Grafana, Loki, Tempo, and Prometheus).
Set `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLP_AUTH_TOKEN`, and `TELEMETRY_EDGE_KEY` in the host's root
`.env`; your monitoring operator supplies them. `just stack <env> up` then includes
`compose.telemetry.yml`. Hosts without the endpoint ship nothing, and `docker logs` stays the only
log path.

[Deployment and operations](/operations/deployment/#telemetry) describes each variable and how the
Alloy agent is sandboxed.
