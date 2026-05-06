# Security Policy

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Instead, email [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl) with:

- a clear description of the issue and its potential impact
- steps to reproduce it, or a proof of concept
- any mitigations or patches you have already identified

## What to Expect

- We aim to acknowledge reports within 5 business days.
- We aim to validate and triage confirmed issues as quickly as possible.
- For confirmed vulnerabilities, we will coordinate a fix and responsible disclosure timeline with the reporter where practical.

Please include enough detail for us to reproduce the problem. That saves time for everyone.

## Security Baseline

RELab uses [OWASP ASVS](https://github.com/OWASP/ASVS) as the application-security baseline and the [OWASP Secure Product Design](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html) lens for product decisions. Keep controls simple, reviewable, and documented near the behavior they protect.

Review security-sensitive changes against this baseline:

- Context: self-hosted research and data-collection platform.
- Components: backend, app, web, docs, PostgreSQL, Redis, storage, backups, OAuth, email, YouTube, and RPi camera integrations.
- Connections: clients and devices enter through the API; PostgreSQL and Redis stay on the internal data network; external providers are explicit trust boundaries.
- Code: authorization, validation, upload checks, browser security headers, and tests live close to the behavior they protect.
- Configuration: secrets, Compose policy, HTTPS, least-privilege database roles, and secure runtime defaults are source-controlled where practical.

Security-sensitive buckets are authentication and OAuth, public read APIs, authenticated mutation APIs, uploads and media, admin APIs, RPi camera device APIs and WebSocket relay, backups, secrets, logs, telemetry, and release/security artifacts. Keep this list grouped by risk, not by endpoint.

Valuable assets include accounts, profile/privacy settings, research records, uploaded media/files, OAuth and YouTube tokens, RPi camera credentials, refresh-token state, database dumps, backup material, and runtime secrets. Update this baseline, the relevant behavior docs, or both when a change creates a new bucket or meaningfully changes a trust boundary.

## Automated Checks

Supply-chain and code-security checks have clear owners:

- Dependencies: GitHub Dependency Review / Dependency Graph and Renovate.
- Runtime images: Trivy scans and SPDX JSON SBOM artifacts.
- Infrastructure as code: Trivy misconfiguration scans for supported repo config files, OpenTofu validates Cloudflare edge config, plus RELab Compose render and deploy secret path checks.
- Source code: CodeQL.
- Secrets: Gitleaks.
- GitHub Actions workflows: actionlint and Zizmor.
- Repository hygiene: OpenSSF Scorecard.

Use `just security` for local maintainer diagnosis.

Release SBOM assets are attested as files and uploaded with GitHub releases.

## Maintainer Review

Automated checks do not replace reviewer judgment. For changes that touch authentication, authorization, uploads/media, RPi camera or device flows, admin APIs, deployment, secrets, dependencies, or personal data, confirm:

- authorization is enforced server-side, not only hidden in a client
- input is validated at API, upload, form, and device boundaries
- browser-rendered values stay on framework escaping paths; raw HTML sinks and dynamic URLs are isolated, validated, and tested
- logs do not include tokens, passwords, private URLs, OAuth material, or other sensitive values
- secure defaults fail closed in production and staging
- auth, permission, upload, and device-flow behavior has focused test coverage
- docs and examples change only when they clarify real behavior

Audience-filtered OpenAPI schemas and API reference pages are contract and inventory tools, not authorization controls. Keep endpoint authorization enforced in backend dependencies and services even when a route is absent from a public docs audience.
