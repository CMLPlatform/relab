# RELab roadmap

Reverse Engineering Lab (RELab) is an open platform for collecting product-level disassembly data on
durable goods. The best evidence of what a product contains, and in what condition, appears when it
is opened at middle or end of life, in the repair, reuse, and recycling networks that physically
take things apart. Almost none of it is recorded in a reusable form. RELab lets those actors log
standardized observations from routine disassembly, giving industrial ecology the primary,
product-level data that life-cycle inventory, material-flow analysis, and circularity assessment
normally lack. This document sets out where the platform is and where it is headed.

It is a living document. RELab is built by a single developer alongside a PhD and its papers, so the
timeframes reflect one pair of hands, not a funded team, so they are deliberately generous, and the
ordering matters more than the dates. Horizons are indicative, not commitments, and items shift as
pilots and research results come in. Day-to-day work is tracked in the
[issue tracker](https://github.com/CMLPlatform/relab/issues); this roadmap is the layer above it:
sequence and dependencies rather than individual tickets.

## Guiding principles

- **Open and FAIR by default.** Software under AGPL, data under ODbL, with findable identifiers,
  documented schemas, and standard export formats.
- **Human-in-the-loop.** Automation proposes; a contributor verifies. Machine predictions become
  data only through explicit verification and recorded provenance.
- **Modular and pluggable.** Product- and capability-specific modules attach as plugins, so the
  platform grows without touching the core.
- **Reproducibility and provenance.** Every derived value carries its evidence, the method that
  produced it, and its verification status.
- **Contributor-centric.** Contributors work on mixed hardware in field conditions. Low-friction
  capture is a design constraint, not an afterthought.

## Workstreams

Threads that run across the horizons below:

- **REL** reliability & operations
- **DATA** data model & governance
- **INTEROP** interoperability & export
- **CV** computer vision
- **SEM** taxonomy & semantics
- **CONTRIB** contributor experience & pilots.

## Current state

RELab runs as research infrastructure at CML: a FastAPI backend, a PostgreSQL data model built for
LCA, an Expo/React Native frontend, and a Raspberry Pi camera plugin, deployed via Docker Compose
behind a Cloudflare tunnel with daily backups. CI runs tests, CodeQL, and Renovate; releases go
through release-please. The in-house lab has catalogued 50+ products, 1,250+ components, and 3,000+
photos across ~30 users.

The limitations this roadmap tackles first: deployment is still manual, the frontend test suite is a
skeleton, the parent-child component model has shown integrity issues under pilot data, the API is
closed to non-superusers, and there is no public dataset browsing or download yet.

## Now (0–6 months): foundations and hardening

- **Component-tree integrity.** (DATA, REL) Fix the parent-child relationship issues seen in pilots:
  guard against cycles and orphaned components at the schema and API level, with regression tests to
  keep them out. Reliable structure is a precondition for every downstream analysis and for the CV
  component work below.
- **Continuous deployment.** (REL) Replace manual deployment with a staged pipeline (merge to main →
  staging → promote), building on the existing release-please and Docker setup.
- **Observability.** (REL) Emit OTLP telemetry (logs, traces, metrics) to the CML monitoring stack,
  so reliability is measured rather than assumed.
- **Frontend test coverage.** (REL) Grow the `frontend-app` skeleton into a real suite, so the mobile
  capture path is safe to change before the pilots scale.
- **Export v1.** (INTEROP) CSV and JSON export of products, components, materials, and physical
  properties: the minimum researchers need to pull data out today.
- **Secrets management.** (REL) Harden production secret handling ahead of wider deployment.

## Core (6–18 months)

- **Provenance and verification model.** (DATA) The record structure that makes automated predictions
  trustworthy: media assets, prediction records (with model and compute metadata), verification
  records (the human decision), and a canonical field link that maps verified outputs into the record
  while keeping the chain back to both. This is what the CV work sits on, and it earns its keep on its
  own as a data-quality and audit mechanism.
- **Semantic backbone and assisted navigation.** (SEM, INTEROP) Adopt a shared vocabulary layer
  (Sentier.vocab / py-semantic-taxonomy) for materials and product types, so RELab categories
  interoperate with the wider open-LCA ecosystem instead of staying platform-local. On top of that
  vocabulary, offer semantic search and LLM-assisted category suggestion, so a non-expert
  contributor (a Repair Café participant, say) can place a product or material without knowing the
  taxonomy. This directly widens who can contribute.
- **LCA-native export.** (INTEROP) Serialize records to established inventory schemas (EcoSpold2 and
  ILCD) with Global LCA Data Access (GLAD) metadata descriptors, so verified records flow into
  existing LCA workflows instead of stopping at RELab's edge.
- **CV Tier 1: label identity.** (CV) OCR-based metadata extraction and retrieval as modular,
  human-verified services: read a model number off a label, match it to a reference, contributor
  confirms. This is the most mature capability and the first target of the companion study (Paper 3);
  it validates the assistive pipeline end to end on a real task.
- **CV Tier 2: component suggestion.** (CV) Detection and segmentation propose a component list for
  the contributor to confirm, feeding the bill of components. Depends on the provenance model and the
  component-tree fixes above.
- **Public dataset access.** (CONTRIB) Browse and download for the open dataset, plus API access for
  authenticated non-superusers under documented terms.
- **Capture protocols for quality.** (CONTRIB, DATA) Mandatory views and in-frame scale cues, so that
  once a unit is disassembled by a single contributor, later verification still has enough to work
  from.

## Horizon (18 months and beyond)

- **CV Tiers 3–4.** (CV) Material triage with 3D and video reconstruction, then multi-modal sensing
  (hyperspectral, X-ray, LIBS) for material identity that RGB cannot resolve. Research-grade and
  exploratory, sequenced behind the mature tiers.
- **Digital Product Passport interoperability.** (INTEROP) Consume DPP identifiers to seed and
  cross-check visual workflows as that infrastructure matures, and offer RELab's use-phase and
  end-of-life observations back to it, the continuity DPPs currently lack.
- **Federated and multi-site contribution.** (CONTRIB, REL) Support NL → EU → global expansion with
  multi-site deployment and, where required, locally hosted or federated instances.
- **Data-quality signals for inventory use.** (DATA) Pedigree-matrix / data-quality indicators and
  k-of-n contributor redundancy for the fields with no external ground truth (condition, quantified
  composition), so downstream users can weight records appropriately.

## Link to the research

RELab is both infrastructure and study object. Paper 2 sets out the CV taxonomy and the
human-verified reference architecture; Paper 3 implements the Tier 1–2 services above in RELab and
measures the verification step (inter-rater agreement, verification accuracy, contributor error)
that the conceptual work leaves open. Platform and research milestones are coupled on purpose:
shipping the provenance model and Tier 1 CV is also the experiment.

## Non-goals

- Not a general-purpose asset-management or inventory product.
- Not fully automated extraction: human verification is a design choice, not a temporary limitation.
- Not a commercial service; sustainability comes through open, grant-funded research infrastructure.

## Maintaining this roadmap

Proposals and changes go through issues and pull requests. Items move between horizons as pilots,
research results, and contributor feedback accumulate; the horizons express sequence and dependency,
not fixed dates.
