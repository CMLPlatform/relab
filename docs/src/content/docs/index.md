---
title: Reverse Engineering Lab
description: Start here for RELab guides, architecture reference, and project context.
---

RELab is a research platform for collecting and publicly viewing data on the disassembly of durable goods, developed by the [Institute of Environmental Sciences (CML)](https://www.universiteitleiden.nl/en/science/environmental-sciences) at Leiden University. It supports structured data collection, media capture, and later analysis of product composition, materials, and circularity.

<div class="relab-badge-row" markdown>

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.16637742.svg)](https://doi.org/10.5281/zenodo.16637742)
[![Coverage](https://img.shields.io/codecov/c/github/CMLPlatform/relab)](https://codecov.io/gh/CMLPlatform/relab)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CMLPlatform/relab/badge)](https://scorecard.dev/viewer/?uri=github.com/CMLPlatform/relab)
[![Deployed](https://img.shields.io/website?url=https%3A%2F%2Fcml-relab.org&label=website)](https://cml-relab.org)

</div>

## Start Here

<div class="grid cards relab-card-grid" markdown>

- **[Getting Started](user-guides/getting-started/)**
  Create an account, document a first product, and learn the core workflow.

- **[Guides](user-guides/)**
  Task-first help for data collection, hardware setup, RPI camera use, and API workflows.

- **[Architecture](architecture/)**
  System design, data model, API, auth, and deployment.

- **[Project Context](project/)**
  Use cases, roadmap, dataset goals, and research framing.

</div>

## Quick Links

- [Open the platform](https://app.cml-relab.org)
- [Open the API docs](https://api.cml-relab.org/docs)
- [View the repository](https://github.com/CMLPlatform/relab)

## Research Motivation

Primary product data — material makeup, component structure, circularity-relevant properties — is still hard to obtain for many durable goods. RELab takes a bottom-up approach: instead of relying on producer-controlled information flows, the platform lets repairers, refurbishers, dismantlers, recyclers, and citizen scientists contribute structured observations directly, and is designed to interoperate with existing industrial-ecology databases rather than stand alone.

## Current System At A Glance

- `backend/`: FastAPI application with PostgreSQL, Redis, Alembic migrations, file handling, and plugin routes
- `frontend-app/`: Expo / React Native app for authenticated data collection
- `frontend-web/`: Astro site for the public-facing web presence
- `docs/`: Astro Starlight docs app for public, operator, and contributor-facing reference

Canonical repo entry points live in [README.md](https://github.com/CMLPlatform/relab/blob/main/README.md) and [CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/.github/CONTRIBUTING.md). Install and self-hosting steps live on this site at [Install & Self-Host](/architecture/install/).
