---
title: Roadmap
description: Research and platform priorities for the next Relab phases.
---

Reviewed: 2026-09

## Research direction

The main question is how to make product data collection more scalable, collaborative, and reusable.
Relab focuses on open, FAIR product-level disassembly data. Automation stays
human-verified: software can suggest, people confirm.

The live work list is tracked in the public
[GitHub issues](https://github.com/CMLPlatform/relab/issues).

## Near term

- [ ] improve the data collection guides and keep the rest of the docs current
- [ ] strengthen tests, especially around component hierarchies
- [ ] simplify CSV and JSON export from live records toward dataset releases
- [ ] improve admin and reference-data maintenance workflows
- [ ] make camera-assisted capture easier to operate in repeated lab workflows
- [ ] re-apply account and upload erasures after a backup restore, so a restored snapshot
  stays in step with the deletions made since it was taken (added 2026-10-08)

## Later

- [ ] publish curated, versioned dataset releases separate from the live database, with stable
  identifiers and documented scope and licensing
- [ ] improve API guidance and exports for analysis scripts, reproducible research, and LCA work
- [ ] explore human-verified assistance for label reading, component suggestion, and quality
  control, with provenance records for assisted values
- [ ] make reference-data search multilingual and meaning-based: embedding search over categories
  and product types next to the current full-text and fuzzy matching (accent-insensitive since
  2026-09)
  - pin a self-hosted multilingual model (bge-m3 is the first candidate) rather than a hosted
    one whose output can change under us
  - store the model id with each vector, so a model change forces a full re-embed instead of
    mixing vectors from two models
- [ ] explore interoperability with semantic vocabularies and Digital Product Passport identifiers
  - first candidate: [CEON](https://arxiv.org/abs/2606.02253), the Circular Economy Ontology
    Network (CC BY 4.0), which separates a product model from a physical item and follows the
    ISO 59040 Product Circularity Data Sheet; map products and components onto its product and
    material modules for the JSON-LD export
