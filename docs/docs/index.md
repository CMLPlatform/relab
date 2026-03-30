# Reverse Engineering Lab

[![Version](https://img.shields.io/github/v/release/CMLPlatform/relab?include_prereleases&filter=v*)](https://github.com/CMLPlatform/relab/blob/main/CHANGELOG.md)
[![License: AGPL-v3+](https://img.shields.io/badge/License-AGPL--v3+-rebeccapurple.svg)](https://github.com/CMLPlatform/relab/blob/main/LICENSE.md)
[![Data License: ODbL](https://img.shields.io/badge/Data_License-ODbL-rebeccapurple.svg)](https://opendatacommons.org/licenses/odbl/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.16637742.svg)](https://doi.org/10.5281/zenodo.16637742)
[![Coverage](https://img.shields.io/codecov/c/github/CMLPlatform/relab)](https://codecov.io/gh/CMLPlatform/relab)
[![FAIR checklist badge](https://fairsoftwarechecklist.net/badge.svg)](https://fairsoftwarechecklist.net/v0.2?f=31&a=32113&i=22322&r=123)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://github.com/CMLPlatform/relab/blob/main/CODE_OF_CONDUCT.md)
[![Deployed](https://img.shields.io/website?url=https%3A%2F%2Fcml-relab.org&label=website)](https://cml-relab.org)

<div class="relab-hero">
  <h1>Reverse Engineering Lab</h1>
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

- :material-compass-outline:{ .lg .middle } **[Project](project/index.md)**
  Why the platform exists, what it is for, and where it is heading.

- :material-sitemap:{ .lg .middle } **[Architecture](architecture/index.md)**
  System design, data model, API layout, auth, and deployment.

- :material-book-open-page-variant:{ .lg .middle } **[User Guides](user-guides/index.md)**
  Getting started, data collection, API use, and camera workflows.

</div>

## Current System At A Glance

- `backend/`: FastAPI application with PostgreSQL, Redis, Alembic migrations, file handling, and plugin routes
- `frontend-app/`: Expo / React Native app for authenticated data collection
- `frontend-web/`: Astro site for the public-facing web presence
- `docs/`: documentation site built with Zensical

## Links

[Live Platform :octicons-link-external-16:](https://app.cml-relab.org){ .md-button .md-button--primary }
[API Docs :octicons-link-external-16:](https://api.cml-relab.org/docs){ .md-button }
[Source Code :octicons-link-external-16:](https://github.com/CMLPlatform/relab){ .md-button }

[Installation](https://github.com/CMLPlatform/relab/blob/main/INSTALL.md) · [Contributing](https://github.com/CMLPlatform/relab/blob/main/CONTRIBUTING.md)
