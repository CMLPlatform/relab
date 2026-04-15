# RELab: Reverse Engineering Lab

[![Version](https://img.shields.io/github/v/release/CMLPlatform/relab?include_prereleases&filter=v*)](CHANGELOG.md)
[![License: AGPL-v3+](https://img.shields.io/badge/License-AGPL--v3+-rebeccapurple.svg)](LICENSE.md)
[![Data License: ODbL](https://img.shields.io/badge/Data_License-ODbL-rebeccapurple.svg)](https://opendatacommons.org/licenses/odbl/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.16637742.svg)](https://doi.org/10.5281/zenodo.16637742)
[![Coverage](https://img.shields.io/codecov/c/github/CMLPlatform/relab)](https://codecov.io/gh/CMLPlatform/relab)
[![FAIR checklist badge](https://fairsoftwarechecklist.net/badge.svg)](https://fairsoftwarechecklist.net/v0.2?f=31&a=32113&i=22322&r=123)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![Deployed](https://img.shields.io/website?url=https%3A%2F%2Fcml-relab.org&label=website)](https://cml-relab.org)

RELab is an open-source research platform for collecting and publicly viewing data on the disassembly of durable goods. It is built at [CML, Leiden University](https://www.universiteitleiden.nl/en/science/environmental-sciences) to support industrial ecology and circular economy research through better primary product data generation.

It combines:

- a FastAPI backend for structured product, media, and user data
- an Expo / React Native app for authenticated data collection
- an Astro site for publicly viewing project and dataset information
- a separate docs site for architecture, workflows, and deployment notes

The platform is meant to do two things at once:

- support structured data collection during disassembly work
- make that data easier to publish, browse, and reuse later

The broader research vision comes from a simple problem: industrial ecology has many data platforms, but far fewer open, low-barrier workflows for generating new standardized product-level observations.

RELab addresses that gap with a bottom-up model:

- middle- and end-of-life actors such as repairers, refurbishers, dismantlers, and recyclers can contribute data directly
- collaborative and citizen-science style workflows can turn routine repair and disassembly into structured observations
- the resulting records can be shared openly, linked to related databases, and reused in later research

The long-term goal is to contribute to an open industrial ecology data commons by combining collaborative data collection, public data access, interoperability with existing and upcoming databases, and AI-ready structured observations.

## Start Here

The fastest path is the hosted platform:

[app.cml-relab.org](https://app.cml-relab.org)

If you want to go deeper:

- [INSTALL.md](INSTALL.md) for running or self-hosting the stack
- [CONTRIBUTING.md](CONTRIBUTING.md) for making code or docs changes
- [docs.cml-relab.org](https://docs.cml-relab.org) for architecture and user-facing docs

## Monorepo

| Path            | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `backend/`      | FastAPI API, auth, data model, file handling, plugins |
| `frontend-app/` | Expo / React Native research app                      |
| `frontend-web/` | Astro public website                                  |
| `docs/`         | Documentation site                                    |

Infrastructure is orchestrated with Docker Compose from the repo root.

## Common Commands

```bash
just setup     # install workspace dependencies and pre-commit hooks
just validate  # run the canonical local validation pipeline
just test      # run local test suites
just security  # run dependency and security checks
just dev       # start the full Docker dev stack with file watching
```

## Project Links

- [Live Platform](https://app.cml-relab.org)
- [Documentation](https://docs.cml-relab.org)
- [API Docs](https://api.cml-relab.org/docs)
- [Roadmap](https://docs.cml-relab.org/project/roadmap)

## Community and Policy

- [Contributing](CONTRIBUTING.md)
- [Installation](INSTALL.md)
- [Security](SECURITY.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Citation](CITATION.cff)
- [License](LICENSE)

## Contact

Questions about the platform, code, or dataset: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
