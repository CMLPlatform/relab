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

## Maintainer Review Checklist

Security review is part of normal development. For changes that touch authentication, authorization, uploads/media, RPi camera or device flows, admin APIs, deployment, secrets, dependencies, or personal data, reviewers should check:

- authorization is enforced server-side, not only hidden in a client
- input is validated at API, upload, form, and device boundaries
- browser-rendered values stay on framework escaping paths; raw HTML sinks and dynamic URLs are isolated, validated, and tested
- logs do not include tokens, passwords, private URLs, OAuth material, or other sensitive values
- auth, permission, upload, and device-flow behavior has relevant test coverage
- new runtime dependencies and GitHub Actions have a clear reason to exist
- docs and examples are updated when security-sensitive behavior changes

RELab uses [OWASP ASVS](https://github.com/OWASP/ASVS) as the application-security baseline and [OpenSSF Scorecard](https://scorecard.dev/) as an advisory supply-chain signal.
