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

Include enough detail for us to reproduce the problem.

## Security Baseline

Relab uses [OWASP ASVS](https://github.com/OWASP/ASVS) as the application-security baseline and the
[OWASP Secure Product Design](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html)
lens for product decisions. Keep controls simple, reviewable, and documented near the behavior they
protect.

For the deployed security posture, trust-boundary model, egress policy, browser runtime policy, and
supply-chain artifact posture, see
[Security and hardening](https://docs.cml-relab.org/operations/security/).

Review security-sensitive changes against this baseline:

- Context: self-hosted research and data-collection platform.
- Components: backend, app, web, docs, PostgreSQL, Redis, storage, backups, OAuth, email, YouTube,
  and RPi camera integrations.
- Connections: clients and devices enter through the API; PostgreSQL and Redis stay on the internal
  data network; external providers are explicit trust boundaries.
- Code: authorization, validation, upload checks, browser security headers, and tests live close to
  the behavior they protect.
- Configuration: secrets, Compose policy, HTTPS, least-privilege database roles, and secure runtime
  defaults are source-controlled where practical.

Security-sensitive areas:

- authentication and OAuth
- rate limits: anonymous requests are keyed per client IP. Read, write, and upload limits key a
  request that carries a live access token per user instead, with a budget sized for a room
  sharing one account and one IP.
  - The token only selects the bucket. An unknown or expired token falls back to the IP bucket, so
    rotating forged tokens never buys a fresh budget.
  - Password login is limited per IP and by failed attempts per account, so a shared account is
    not locked by use while guessing stays capped per account.
  - The MFA login challenge and every signed-in re-authentication (account deletion, email and
    password changes, social login link and unlink, MFA setup, disable and recovery-code
    rotation) share one per-account budget of wrong passwords, TOTP and recovery codes
    (`account_guess_budget`). Rotating IPs, routes or fresh login challenges buys no extra
    guesses, so the MFA routes themselves sit on the looser login IP budget.
- public read APIs
  - Product export (`/products/export`, `/products/{id}/export`) assembles whole product trees, so
    it has its own, stricter rate limit. One request is bounded by three limits, and past any of
    them it fails with a `400` instead of a partial file: at most 100 base products, at most 10
    component levels below a base product, and at most 5,000 components in total. The tree walk
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
- release and security artifacts

Valuable assets include accounts, profile/privacy settings, research records, uploaded media/files,
OAuth and YouTube tokens, RPi camera credentials, refresh-token state, database dumps, backup
material, and runtime secrets.

The product/component catalog and its research content are world-readable; the platform exists to
publish that data. `profile_visibility` hides owner identity attribution only. It is not a control
over the research content and must never be treated as one.

Account privileges are three independent things; conflating any two of them is a privilege
escalation:

- `is_verified` gates whether an account may create records at all.
- `is_superuser` grants the `/admin` routes and moderation of other contributors' products
  (correcting and deleting, never adding content). Every superuser power needs TOTP MFA enrolled
  on the account (`User.has_admin_access`): the admin routes refuse a superuser without it, and
  off them such an account is treated as an ordinary user. Every superuser also holds the `lab`
  tier, so an administrator can exercise every upload path on their own products: the
  `ck_user_superuser_is_lab` constraint enforces it, and the role route refuses to demote a
  superuser.
- `role` (`contributor` by default, `lab`) is the contributor tier. It gates non-image
  research-file upload and selects the upload quota tier, charged to the product owner, and the
  per-image size and pixel caps, which follow the uploader so the app can fit photos to them.

Only a superuser assigns roles, through `PUT /v1/admin/users/{user_id}/role`, which records an
audit event. Keep `role` off `UserUpdate`: fastapi-users' safe update path strips a fixed set of
privileged fields, so any new field on that schema flows through self-service `PATCH /users/me`.
New and backfilled accounts start at `contributor`, so the tier fails closed.

## Automated Checks

Supply-chain and code-security checks:

- Dependencies: GitHub Dependency Review / Dependency Graph and Renovate. Renovate runs from
  `.github/workflows/renovate.yml` as a GitHub App installed on this repository only. The
  workflow scopes each run's token to the permissions it lists, and the app's private key is an
  Actions secret: rotate it whenever the key, or a workflow that can read it, may have leaked.
  Changes to `main` go through a pull request and must pass the required `CI Result` check;
  no approving review is required, so the app can land what `.github/renovate.json` marks
  automerge. It cannot skip that check, so a leaked key can merge only a pull request that
  passes CI.
- Runtime images: Trivy scans and SPDX JSON SBOM artifacts.
- Infrastructure as code: Trivy misconfiguration scans for supported repo config files, OpenTofu
  validates Cloudflare edge config, plus Relab Compose render and deploy secret path checks.
- Source code: CodeQL.
- Secrets: Gitleaks.
- GitHub Actions workflows: actionlint and Zizmor.
- Repository hygiene: OpenSSF Scorecard. It is advisory; accepted Token-Permissions findings:
  - `release.yml` grants `contents: write` to the release-please job, which tags releases and
    opens release PRs, and to the release SBOM job, which uploads assets to the release. The
    workflow default is `permissions: {}`.
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
