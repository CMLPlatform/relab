<p align="center">
  <img src="assets/r9lab-wordmark.png" alt="Relab" width="340">
</p>

# Relab

[![Version](https://img.shields.io/github/v/release/CMLPlatform/relab?include_prereleases&filter=v*)](CHANGELOG.md)
[![License: AGPL-v3+](https://img.shields.io/badge/License-AGPL--v3+-rebeccapurple.svg)](LICENSE.md)
[![Data License: ODbL](https://img.shields.io/badge/Data_License-ODbL-rebeccapurple.svg)](https://opendatacommons.org/licenses/odbl/)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.16637742-blue.svg)](https://doi.org/10.5281/zenodo.16637742)
[![Coverage](https://img.shields.io/codecov/c/github/CMLPlatform/relab)](https://codecov.io/gh/CMLPlatform/relab)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CMLPlatform/relab/badge)](https://scorecard.dev/viewer/?uri=github.com/CMLPlatform/relab)
[![FAIR checklist badge](https://fairsoftwarechecklist.net/badge.svg)](https://fairsoftwarechecklist.net/v0.2?f=31&a=32113&i=22322&r=123)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](.github/CODE_OF_CONDUCT.md)
[![Deployed](https://img.shields.io/website?url=https%3A%2F%2Fcml-relab.org&label=website)](https://cml-relab.org)

Relab is an open-source research platform for collecting and publicly viewing data on the
disassembly of durable goods. It is built at
[CML, Leiden University](https://www.universiteitleiden.nl/en/science/environmental-sciences) to
support industrial ecology and circular economy research by generating better primary product data.

It combines:

- a FastAPI backend for structured product, media, and user data
- an Expo / React Native app for authenticated data collection
- an Astro site for publicly viewing project and dataset information
- a separate docs site for architecture, workflows, and deployment notes

The platform is meant to do two things at once: support structured data collection during
disassembly work, and make that data easier to publish, browse, and reuse later.

The broader research vision comes from a simple problem: circular-economy and industrial-ecology
research depends on detailed product data — what things are made of, how they come apart, which
parts matter — yet that data is scarce, mostly closed, and slow to produce. Producers tend to treat
it as proprietary, and the alternative of small expert teams sampling by hand cannot keep pace with
the products entering the market.

Relab addresses that gap with a bottom-up model:

- middle- and end-of-life actors such as repairers, refurbishers, dismantlers, and recyclers can
  contribute data directly
- these downstream actors meet products at the point of failure, capturing as-failed composition,
  wear, and recoverability that as-designed producer specifications never show
- collaborative and citizen-science style workflows can turn routine repair and disassembly into
  structured observations
- the resulting records can be shared openly, linked to related databases, and reused in later
  research

Contributors get value back too — composition insight, sustainability metrics, and repair or
R-strategy guidance — so routine disassembly becomes a two-way exchange rather than one-way data
entry. We call this a circular data economy: middle- and end-of-life observations feed back into the
upstream data infrastructure that research and design rely on, complementing the top-down flow of
producer specifications.

The long-term goal is to contribute to an open industrial ecology data commons: data that is
collected collaboratively, publicly accessible, linkable to existing and upcoming databases, and
structured enough for machine-learning use.

## Start Here

The fastest path is the hosted platform:

[app.cml-relab.org](https://app.cml-relab.org)

If you want to go deeper:

- [Install and self-host](https://docs.cml-relab.org/operations/install/) for running or
  self-hosting the stack
- [CONTRIBUTING.md](.github/CONTRIBUTING.md) for making code or docs changes
- [docs.cml-relab.org](https://docs.cml-relab.org) for architecture and user-facing docs

## Monorepo

| Path       | Purpose                                               |
| ---------- | ----------------------------------------------------- |
| `backend/` | FastAPI API, auth, data model, file handling, plugins |
| `app/`     | Expo / React Native research app                      |
| `www/`     | Astro public website                                  |
| `docs/`    | Documentation site                                    |

Infrastructure is orchestrated with Docker Compose from the repo root.

Shared brand assets live in `assets/` and are synced into the consumer
subrepos with `just assets-sync`.

Configuration has five homes: committed public prod/staging identity in
`deploy/env/*.compose.env`, deploy-host inputs in the gitignored root `.env`,
runtime secrets in gitignored `secrets/<env>/` files, optional backend-only
local overrides in `backend/.env.dev`, and framework/test fixtures such as
`app/.env.development` and `backend/.env.test`.

## Common Commands

```bash
just setup     # install workspace dependencies and pre-commit hooks
just ci        # run the canonical local CI pipeline
just test      # run local test suites
just security  # run dependency and security checks
just dev       # start the full Docker dev stack with file watching
just deploy-secrets-template dev  # create local backend secret files
```

## Accessibility

Accessibility is checked in CI: axe scans plus per-PR a11y lint across `www/`,
`docs/`, and `app/`. See [Quality Controls](.github/CONTRIBUTING.md#quality-controls)
for what runs where.

## Project Links

- [Live Platform](https://app.cml-relab.org)
- [Documentation](https://docs.cml-relab.org)
- [API Docs](https://docs.cml-relab.org/api/public/)
- [Roadmap](https://docs.cml-relab.org/project/roadmap)

## Community and Policy

- [Contributing](.github/CONTRIBUTING.md)
- [Install and self-host](https://docs.cml-relab.org/operations/install/)
- [Security](.github/SECURITY.md)
- [Code of Conduct](.github/CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Citation](CITATION.cff)
- [License](LICENSE)

## Contact

Questions about the platform, code, or dataset:
[relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
