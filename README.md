# Reverse Engineering Lab

<!-- Core Project Info -->

[![Version](https://img.shields.io/github/v/release/CMLPlatform/relab?include_prereleases&filter=v*)](CHANGELOG.md)
[![License: AGPL-v3+](https://img.shields.io/badge/License-AGPL--v3+-rebeccapurple.svg)](LICENSE.md)
[![Data License: ODbL](https://img.shields.io/badge/Data_License-ODbL-rebeccapurple.svg)](https://opendatacommons.org/licenses/odbl/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.16637742.svg)](https://doi.org/10.5281/zenodo.16637742)

<!-- Quality & Standards -->
[![Coverage](https://img.shields.io/codecov/c/github/CMLPlatform/relab)](https://codecov.io/gh/CMLPlatform/relab)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![FAIR checklist badge](https://fairsoftwarechecklist.net/badge.svg)](https://fairsoftwarechecklist.net/v0.2?f=31&a=32113&i=22322&r=123)

<!-- Status & Deployment -->

[![Deployed](https://img.shields.io/website?url=https%3A%2F%2Fcml-relab.org&label=website)](https://cml-relab.org)

**Reverse Engineering Lab (REL)** is an open-source, digital research infrastructure platform designed to systematically collect data on disassembled durable goods. Developed by the Institute of Environmental Sciences (CML) at Leiden University, the platform addresses a product data gap in industrial ecology and supports circular economy research, lifecycle assessment, and computer vision applications.

## System Overview

RELab features a modular architecture designed for high availability and reproducible research:

- **Backend:** High-performance REST API built with FastAPI.
- **Database:** PostgreSQL for reliable, relational data storage.
- **Frontend:** Cross-platform mobile and web application built with Expo/React Native.

## Project Status and Use

The platform is actively used as research infrastructure:

- **In-House Research:** Primarily used by the physical lab at CML, where a lab technician has systematically disassembled and recorded over 50 products, capturing more than 1,250 components and 3,000 photos.
- **User Base:** Currently supporting 30 registered users, including 5 regular researchers.
- **Future Pilots:** Scheduled for pilot deployments with Repair Cafés across the Netherlands in 2026 to crowdsource consumer electronics disassembly data.

## Quick Links

- 🚀 **[Live Platform](https://app.cml-relab.org)** - Access the production deployment
- 📖 **[Full Documentation](https://docs.cml-relab.org)** - Complete guides, architecture details, and technical references
- 🔍 **[API Documentation](https://api.cml-relab.org/docs)** - Interactive API reference for the backend
- ⚙️ **[Installation & Setup](INSTALL.md)** - Guide for self-hosting and local evaluation

## Development Workflow

The project aims to implement modern software engineering practices, including automated testing, linting (`ruff`/`eslint`), and CI via GitHub Actions. Dependency management is automated via `renovate`, and CodeQL provides automated security analysis for merges.

For a complete guide on the development setup, testing, and contribution processes, please see the [**Contributing Guidelines**](CONTRIBUTING.md).

## Policies & Community

- 🤝 **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute
- 📋 **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community standards
- 📝 **[Changelog](CHANGELOG.md)** - Version history
- 📑 **[Citation Guidelines](CITATION.cff)** - How to attribute this work
- ⚖️ **[License Information](LICENSE)** - Software licensed under [AGPL-v3+](https://spdx.org/licenses/AGPL-3.0-or-later.html), data under [ODbL](https://opendatacommons.org/licenses/odbl/).

## Contact

For questions about the platform, code, or dataset, please contact [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl).
