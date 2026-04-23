---
title: Reverse Engineering Lab
description: Start here for RELab guides, architecture reference, and project context.
owner: docs
status: canonical
lastReviewed: '2026-04-15'
---

<div class="relab-hero">
  <p class="relab-hero-title">RELab documentation</p>
  <p>
    RELab is a research platform for collecting and publicly viewing data on the disassembly of durable goods, developed by the
    <a href="https://www.universiteitleiden.nl/en/science/environmental-sciences" target="_blank" rel="noopener">Institute of Environmental Sciences (CML)</a>
    at Leiden University. It supports structured data collection, media capture, and later analysis of product composition, materials, and circularity.
  </p>
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
