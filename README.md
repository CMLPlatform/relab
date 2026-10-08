<p align="center">
  <img src="assets/r9lab-wordmark.png" alt="Relab" width="340">
</p>

# Relab

[![Version](https://img.shields.io/github/v/release/CMLPlatform/relab?include_prereleases&filter=v*)](CHANGELOG.md)
[![License: AGPL-v3+](https://img.shields.io/badge/License-AGPL--v3+-rebeccapurple.svg)](LICENSE)
[![Data License: CC BY 4.0](https://img.shields.io/badge/Data_License-CC_BY_4.0-rebeccapurple.svg)](https://creativecommons.org/licenses/by/4.0/)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.16637742-blue.svg)](https://doi.org/10.5281/zenodo.16637742)
[![Coverage](https://img.shields.io/codecov/c/github/CMLPlatform/relab)](https://codecov.io/gh/CMLPlatform/relab)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CMLPlatform/relab/badge)](https://scorecard.dev/viewer/?uri=github.com/CMLPlatform/relab)
[![FAIR checklist badge](https://fairsoftwarechecklist.net/badge.svg)](https://fairsoftwarechecklist.net/v0.2?f=31&a=32113&i=22322&r=123)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](.github/CODE_OF_CONDUCT.md)
[![Deployed](https://img.shields.io/website?url=https%3A%2F%2Fr9lab.io&label=website)](https://r9lab.io)

Relab is an open-source research platform for collecting and publicly viewing data on the
disassembly of durable goods. It is built at
[CML, Leiden University](https://www.universiteitleiden.nl/en/science/environmental-sciences) to
support industrial ecology and circular economy research with better primary product data.

Repairers, refurbishers, dismantlers, and recyclers meet products at the point of failure. Relab
turns their routine work into structured, openly shared records of what products are made of and
how they come apart. [Why Relab exists](https://docs.r9lab.io/project/) sets out the argument.

It combines:

- a FastAPI backend for structured product, media, and user data
- an Expo / React Native app for authenticated data collection
- an Astro site for publicly viewing project and dataset information
- a docs site for users, architecture, and self-hosting

## Start Here

Use the hosted platform at [app.r9lab.io](https://app.r9lab.io).

To go deeper:

- [Install and self-host](https://docs.r9lab.io/operations/install/) for running or
  self-hosting the stack
- [CONTRIBUTING.md](.github/CONTRIBUTING.md) for making code or docs changes
- [docs.r9lab.io](https://docs.r9lab.io) for architecture and user-facing docs

## Monorepo

| Path       | Purpose                                               |
| ---------- | ----------------------------------------------------- |
| `backend/` | FastAPI API, auth, data model, file handling, plugins |
| `app/`     | Expo / React Native research app                      |
| `www/`     | Astro public website                                  |
| `docs/`    | Documentation site                                    |

Docker Compose orchestrates the stack from the repo root.

Shared brand assets live in `assets/`; `just assets-sync` copies them into the consumer subrepos.

Configuration has five homes: the committed secret inventory in `deploy/env/variables.toml`,
deploy-host inputs in the gitignored root `.env`, runtime secrets in gitignored `secrets/<env>/`
files, optional backend-only local overrides in `backend/.env.dev`, and framework/test fixtures such
as `app/.env.development` and `backend/.env.test`.

## Common Commands

```bash
just setup     # install workspace dependencies and git hooks
just ci        # run the canonical local CI pipeline
just test      # run local test suites
just security  # run dependency and security checks
just dev       # start the full Docker dev stack with file watching
just deploy-secrets-template dev  # create local backend secret files
```

## Accessibility

CI runs axe scans and per-PR a11y lint across `www/`, `docs/`, and `app/`. See
[Quality Controls](.github/CONTRIBUTING.md#quality-controls) for what runs where.

## Project Links

- [Live Platform](https://app.r9lab.io)
- [Documentation](https://docs.r9lab.io)
- [API Docs](https://docs.r9lab.io/api/public/)
- [Roadmap](https://docs.r9lab.io/project/roadmap)

## Community and Policy

- [Security](.github/SECURITY.md)
- [Code of Conduct](.github/CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Citation](CITATION.cff)
- [License](LICENSE)

## Licensing

| What                                                                                          | Licence                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Platform software: backend, app, www, docs site                                               | [AGPL-3.0-or-later](LICENSE)                                       |
| API specification: `openapi.public.json`, `openapi.device.json`, and client types built from them | [Apache-2.0](LICENSE-APACHE-2.0)                                   |
| Site content: the writing on the docs site and on r9lab.io (code samples are Apache-2.0) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)          |
| Curated dataset releases                                                                      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), planned |

**Relab, the logo, and the wordmark are not licensed by any of the above.** The
[licensing page](https://docs.r9lab.io/project/licensing/) explains each choice, the RPi camera
schema's separate licence, and the limits no licence changes.

## Contact

Questions about the platform, code, or dataset:
[info@r9lab.io](mailto:info@r9lab.io)
