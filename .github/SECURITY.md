# Security Policy

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Instead, email [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl) with:

- a clear description of the issue and its potential impact
- steps to reproduce it, or a proof of concept
- any mitigations or patches you have already identified

## What to Expect

- We aim to acknowledge reports within 5 business days.
- For confirmed vulnerabilities, we coordinate a fix and a disclosure timeline with the reporter
  where practical.

## Security Baseline

Relab uses [OWASP ASVS](https://github.com/OWASP/ASVS) as the application-security baseline and the
[OWASP Secure Product Design](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html)
lens for product decisions. Keep controls simple, reviewable, and documented near the behavior they
protect.

[Security and hardening](https://docs.cml-relab.org/operations/security/) is the reference for the
deployed security posture: assets and data classes, account privileges, the edge and application
rate limits, the trust boundaries, the egress policy, the browser runtime policy, and the supply
chain. This page holds what a reviewer of a change needs on top of it.

Review security-sensitive changes against this baseline:

- Context: self-hosted research and data-collection platform.
- Components: backend, app, web, docs, PostgreSQL, Redis, storage, backups, OAuth, email, YouTube,
  and RPi camera integrations.
- Connections: clients and devices enter through the API; PostgreSQL and Redis stay on the internal
  data network; external providers are explicit trust boundaries.
- Code: authorization, validation, upload checks, browser security headers, and tests live close to
  the behavior they protect.
- Configuration: secrets, Compose policy, HTTPS, least-privilege database roles, and secure runtime
  defaults are source-controlled where practical. Each Compose service mounts only the secret
  files its process reads.

Security-sensitive areas:

- authentication and OAuth
  - Stored OAuth access and refresh tokens use `EncryptedString` (AES-256-GCM under
    `DATA_ENCRYPTION_KEY`), like the TOTP secret and the camera broadcast key; the column refuses
    a value without the encrypted-value prefix.
  - Unlinking Google or erasing the account revokes the Google grant (YouTube scope included)
    once the link's deletion is committed. Revocation is best effort: a failure is logged without the token and
    never blocks the unlink or the erasure. GitHub grants are not revoked by the backend; the user
    removes them in their GitHub settings.
- rate limits (the buckets and numbers are in the security reference)
  - Password login is limited per IP and by failed attempts per account, so a shared account is
    not locked by use while guessing stays capped per account.
  - The MFA login challenge and every signed-in re-authentication (account deletion, email and
    password changes, social login link and unlink, MFA setup, disable and recovery-code
    rotation) share one per-account budget of password, TOTP and recovery-code checks
    (`account_guess_budget`). Every check is charged before it runs, right or wrong, so parallel
    guesses cannot race past the cap. Rotating IPs, routes or fresh login challenges buys no
    extra guesses, so the MFA routes themselves sit on the looser login IP budget.
  - Every mutating `/v1` route carries a rate limit; the exemptions (admin routes, device-signed
    camera routes, routes on the guess budget) are listed and justified in
    `backend/tests/unit/api/test_dos_rate_limit_routes.py`.
- public read APIs
  - Product export (`/products/export`, `/products/{id}/export`) assembles whole product trees, so
    it has its own, stricter rate limit. Signed-in exports also share a looser per-IP ceiling, so
    throwaway accounts on one IP cannot multiply the per-user budget. One request is bounded by
    three limits, and past any of them it fails with a `400` instead of a partial file: at most
    100 base products, at most 10 component levels below a base product, and at most 5,000
    components in total. The tree walk
    checks the depth and component limits as it loads each level. Creating a component deeper
    than 10 levels is refused as well.
    Owner attribution follows the same profile-visibility redaction as the product page. CSV cells
    that a spreadsheet would read as a formula are prefixed with `'`.
- authenticated mutation APIs: create endpoints accept an `Idempotency-Key` header and cache the
  response in Redis for one hour.
  - The cache entry is scoped by authenticated user id, endpoint (parent id included), and key, so
    a cached response is never replayed across accounts or targets.
  - The entry stores a hash of the request body: reusing a key with a different payload is rejected
    with `422`.
  - If Redis is unreachable the request fails closed with `503`.
- uploads and media: the `/uploads` mount serves stored bytes with a content-hashed, immutable
  cache policy and `Cross-Origin-Resource-Policy: same-site`. In the `dev` and `testing`
  environments, where the API and the frontends sit on different ports of `127.0.0.1` and Chromium
  blocks the loads, the policy is `cross-origin` for `/uploads` alone. The relaxation is derived
  from the environment, not configured, so staging and production cannot opt into it.
- admin APIs
- RPi camera device APIs and WebSocket relay
- backups, secrets, logs, and telemetry
- release and security artifacts: the GHCR images the hosts pull, and the landing page and docs
  deploy, whose Cloudflare API token is a GitHub Environment secret holding only Workers
  Scripts: Edit. A token granted on all Workers is not scoped to one environment, so every
  Environment that holds one requires a reviewer; in prod that reviewer is also the release
  gate. Hosts check image provenance with `just images-verify` before pulling a tag.

The product/component catalog and its research content are world-readable; the platform exists to
publish that data. `profile_visibility` hides owner identity attribution only. It is not a control
over the research content and must never be treated as one.

`is_verified`, `is_superuser`, and `role` are three independent account privileges; the security
reference defines each. Conflating any two of them is a privilege escalation. Keep `role` off
`UserUpdate`: fastapi-users' safe update path strips a fixed set of privileged fields, so any new
field on that schema flows through self-service `PATCH /users/me`.

## Automated Checks

Supply-chain and code-security checks:

- Dependencies: GitHub Dependency Review / Dependency Graph and Renovate. Renovate runs from
  `.github/workflows/renovate.yml` as a GitHub App installed on this repository only. The
  workflow scopes each run's token to the permissions it lists, and the app's private key is an
  Actions secret: rotate it whenever the key, or a workflow that can read it, may have leaked.
  Changes to `main` go through a pull request and must pass the required `CI Result` check;
  no approving review is required, so the app can land what `.github/renovate.json` marks
  automerge. It cannot skip that check, so a leaked key cannot reach `main` without a pull
  request that passes CI. That is not all it can do: its `contents` and `workflows` write
  access reaches every other branch, and the workflows a push there starts run its changes.
  Release tags are held by the `release tags` ruleset (`infra/cloudflare/github.tf`), which only
  repository admins and maintainers bypass, so the key cannot mint or move the tag hosts deploy
  from, and every job in the `staging` and `prod` Environments waits for a required reviewer.
- Runtime images: Trivy scans and SPDX JSON SBOM artifacts.
- Infrastructure as code: Trivy misconfiguration scans for supported repo config files, OpenTofu
  validates Cloudflare edge config, plus Relab Compose render and deploy secret path checks.
- Source code: CodeQL.
- Secrets: Gitleaks.
- GitHub Actions workflows: actionlint and Zizmor.
- Repository hygiene: OpenSSF Scorecard. It is advisory; accepted Token-Permissions findings:
  - `release.yml` grants `contents: write` to the release SBOM job, which uploads assets to the
    release. The workflow default is `permissions: {}`.
  - `container-images.yml` has no top-level `permissions`: it is a reusable workflow and runs
    with the job-level permissions each caller grants, which differ between scan and release
    mode. A fixed block in the called workflow would fail the caller that grants less.

Use `just security` for local maintainer diagnosis: it runs the dependency audits and the Gitleaks
secret scan. Trivy, CodeQL, actionlint, Zizmor, and Scorecard run in CI.

Release SBOM assets are attested as files and uploaded with GitHub releases.

## Maintainer Review

Automated checks do not replace reviewer judgment. For changes that touch authentication,
authorization, uploads/media, RPi camera or device flows, admin APIs, deployment, secrets,
dependencies, or personal data, confirm:

- authorization is enforced server-side; hiding an upload affordance from a client that lacks the
  role is a UX choice, never the control
- input is validated at API, upload, form, and device boundaries
- browser-rendered values stay on framework escaping paths; raw HTML sinks and dynamic URLs are
  isolated, validated, and tested
- logs do not include tokens, passwords, private URLs, OAuth material, or other sensitive values
- secure defaults fail closed in production and staging
- auth, permission, upload, and device-flow behavior has focused test coverage

Filtering a route out of a public OpenAPI schema hides it from the docs, not from attackers.
Authorization must be enforced in backend dependencies and services regardless of which schemas list
the route.
