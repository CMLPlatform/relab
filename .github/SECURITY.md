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

RELab uses [OWASP ASVS](https://github.com/OWASP/ASVS) as the application-security baseline. Keep security controls simple, reviewable, and documented near the behavior they protect.

## Automated Checks

Supply-chain and code-security checks have clear owners:

- Dependencies: GitHub Dependency Review / Dependency Graph and Renovate.
- Runtime images: Trivy scans and SPDX JSON SBOM artifacts.
- Source code: CodeQL.
- Secrets: Gitleaks.
- GitHub Actions workflows: actionlint and Zizmor.
- Repository hygiene: OpenSSF Scorecard.

Use `just security` for local maintainer diagnosis.

Release SBOM assets are attested as files and uploaded with GitHub releases.

## Maintainer Review

Automated checks do not replace reviewer judgment. For changes that touch authentication, authorization, uploads/media, RPi camera or device flows, admin APIs, deployment, secrets, dependencies, or personal data, check:

- authorization is enforced server-side, not only hidden in a client
- input is validated at API, upload, form, and device boundaries
- browser-rendered values stay on framework escaping paths; raw HTML sinks and dynamic URLs are isolated, validated, and tested
- logs do not include tokens, passwords, private URLs, OAuth material, or other sensitive values
- auth, permission, upload, and device-flow behavior has relevant test coverage
- docs and examples are updated when security-sensitive behavior changes
