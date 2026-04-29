---
title: Roadmap
description: Research and platform priorities for the next RELab phases.
owner: docs
status: reviewed
lastReviewed: '2026-04-15'
---

This roadmap reflects research priorities, not a generic product backlog.

## Research Direction

The main question is how to make product data collection more scalable, collaborative, and reusable.

A second question is where AI methods can help with collection, validation, normalization, and linking.

Interoperability is part of the roadmap too: keep identifiers, APIs, and dataset exports simple enough to support later reuse and linking.

## Short Term

- [ ] improve the user-facing documentation of the data collection workflow
- [ ] keep the docs site aligned with the codebase as the platform changes
- [ ] continue strengthening unit and integration test coverage in areas that already exist
- [ ] make operational procedures such as backup, restore, and deployment more explicit
- [ ] make the path from live records to dataset release clearer

## Medium Term

- [ ] stabilize a dataset publication workflow separate from the live application database
- [ ] make that publication workflow suitable for stable public release
- [ ] support later reuse through stable identifiers, APIs, and dataset exports
- [ ] improve admin and reference-data maintenance workflows
- [ ] make camera-assisted capture easier to operate in repeated lab workflows
- [ ] improve API guidance for external analysis scripts and reproducible exports
- [ ] explore assistance features for AI-supported collection and validation workflows

## Longer Term

- [ ] support more formal dataset versioning and release documentation
- [ ] add better support for downstream computational analysis and model-building workflows
- [ ] evaluate whether more automation is useful for annotation, quality control, or media processing
- [ ] refine the public-facing presentation of the project as the research output matures

## Constraints That Shape The Roadmap

- the platform is developed in the context of a PhD project, so maintainability matters more than rapid feature expansion
- research needs may change as data collection progresses
- infrastructure and operations should stay proportional to the size of the project
- some roadmap items depend on decisions about publication, collaboration, and dataset governance that are partly non-technical
