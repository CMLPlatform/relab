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

## Research Motivation

Primary product data such as material makeup, component structure, and circularity-relevant properties is still hard to obtain for many durable goods. Existing industrial ecology databases help with curation and access, but there are still too few open, low-barrier workflows for generating new standardized product-level observations.

RELab is an attempt to address that gap with a bottom-up data collection model. Instead of depending only on producer-controlled information flows, the platform is designed so middle- and end-of-life actors such as repairers, refurbishers, dismantlers, recyclers, and citizen scientists can contribute structured observations directly.

The platform is also intended to support public sharing and reuse of those records. That includes open and collaborative data collection where it is practical, and eventual contribution to a broader industrial ecology data commons.

Another core goal is interoperability: RELab should be able to link with existing and upcoming databases in the industrial ecology and circular economy fields rather than remaining an isolated system.

The platform is also designed to be AI-ready in a practical sense. By linking structured metadata with images and other observations, it can support later benchmarking, model development, and assisted data entry without making AI the whole point of the system.

## Start Here

<div class="grid cards relab-card-grid" markdown>

- **[Getting Started](user-guides/getting-started/)**
  Create an account, document a first product, and learn the core workflow.

- **[Guides](user-guides/)**
  Task-first help for data collection, hardware setup, RPI camera use, and API workflows.

- **[Reference](architecture/)**
  API structure, auth, deployment, configuration ownership, and operational facts.

- **[Explanation](architecture/system-design/)**
  Architectural rationale, C4 diagrams, and deeper system context.

- **[Project Context](project/)**
  Use cases, roadmap, dataset goals, and research framing.

</div>

## Quick Links

- [Open the platform](https://app.cml-relab.org)
- [Open the API docs](https://api.cml-relab.org/docs)
- [View the repository](https://github.com/CMLPlatform/relab)

## Current System At A Glance

- `backend/`: FastAPI application with PostgreSQL, Redis, Alembic migrations, file handling, and plugin routes
- `frontend-app/`: Expo / React Native app for authenticated data collection
- `frontend-web/`: Astro site for the public-facing web presence
- `docs/`: Astro Starlight docs app for public, operator, and contributor-facing reference

Canonical repo entry points live in [README.md](https://github.com/CMLPlatform/relab/blob/main/README.md), [INSTALL.md](https://github.com/CMLPlatform/relab/blob/main/INSTALL.md), and [CONTRIBUTING.md](https://github.com/CMLPlatform/relab/blob/main/CONTRIBUTING.md).
