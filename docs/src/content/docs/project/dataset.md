---
title: Dataset
description: How to browse current Relab records and how curated dataset releases will differ.
---

Current Relab records can be browsed in the production app:
[app.cml-relab.org](https://app.cml-relab.org).

The app shows the live, evolving records. A curated dataset release is different: a reviewed,
versioned snapshot with clear scope, metadata, and licensing, suitable for citation and reuse.

## What a release will contain

Expected data elements:

- product metadata
- component hierarchies
- images and possibly video-linked records
- material and category annotations
- measurements and observational notes

Expected uses:

- computer vision and image-based classification tasks
- circular economy and design-for-disassembly studies
- material composition analysis
- comparative studies across product families or brands
- industrial ecology and LCA-oriented work that depends on primary product data
- linking with other open industrial-ecology data infrastructures

## Access

Current records can be explored in the app or through the API. For technical access, see the
[API reference overview](/api-reference/) or go directly to the
[public API reference](/api/public/).

Curated releases will have a defined scope, version, and license, so they can be cited and linked
with other open industrial-ecology datasets. The planned license is
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). No release has been published yet.

The [dataset codebook](/project/codebook/) documents every file and column a release carries, so
the shape of one can be read before the first release exists.

## Dublin Core metadata

Following the [Dublin Core specifications](https://www.dublincore.org/specifications/dublin-core/):

| Element     | Value                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | Disassembly dataset of durable goods for circular economy and computer vision applications                                            |
| Creators    | van Lierde, Simon: <https://orcid.org/0009-0006-6953-909X>                                                                            |
| Creators    | Donati, Franco: <https://orcid.org/0000-0002-8287-2413>                                                                               |
| Publisher   | Leiden University. Institute of Environmental Sciences (CML)                                                                          |
| Subjects    | Computer vision, Circular economy, Remanufacturing, Life cycle assessment, Durable goods                                              |
| Description | Data collection platform for disassembled power tool images and metadata supporting computer vision tasks for life cycle assessments. |
| Date        | 2025-03/2026-08 (collection ongoing)                                                                                                  |
| Types       | Dataset, Image, Software                                                                                                              |
| Formats     | text/csv, image/jpeg, application/x-python, text/markdown                                                                             |
| Identifier  | <https://github.com/CMLPlatform/relab>                                                                                                |
| Language    | en-US                                                                                                                                 |
| Coverage    | Products: Power tools; Time: 2025-03–2026-08, ongoing; Geographic location: NL                                                        |
| Rights      | <https://creativecommons.org/licenses/by/4.0/>                                                                                        |

## Building and depositing a release

(For maintainers.) The build and deposit pipeline lives in `backend/scripts/` and runs from
`backend/`:

1. `just release-build --inventory` — a dry run across every consenting account: writes nothing,
   just reports what a release would contain. "Consenting" means the owner accepted the
   contributor terms at the version that grants the publication licence; everyone else is
   excluded by the `no-terms-acceptance` rule and appears in `excluded-records.csv`.
   Accounts created before acceptance was tracked hold no grant until they answer the in-app
   prompt, so the consenting set grows as contributors sign in. Declining is free and costs a
   contributor nothing except inclusion, so expect it to be a real outcome rather than a
   formality.
1. `just release-build --out dist/dataset-vX.Y` — builds the release directory. The verification
   pass at the end is not optional; it fails the build rather than warning.
1. Review `dist/dataset-vX.Y/review/` by hand, including `excluded-records.csv` and the rule that
   excluded each record. This directory is not part of the published archive.
1. The pseudonymisation salt comes from `RELAB_PSEUDONYM_SALT` (preferred), `--pseudonym-salt`, or
   `secrets/<env>/dataset_pseudonym_salt`; keep the same salt for every future release so owner
   pseudonyms stay stable across versions.
1. `uv run python -m scripts.zenodo_deposit --dir dist/dataset-vX.Y` creates or versions a Zenodo
   *draft*. Add `--deposition <id>` to resume uploading into an existing draft rather than starting
   a new one. The token is read from `secrets/<env>/zenodo_token` (or `ZENODO_TOKEN` for a one-off
   run).
1. Inspect the draft in the Zenodo web UI, then publish explicitly with
   `--deposition <id> --publish`. Publication is irreversible — a published record can be
   tombstoned but never withdrawn or edited — so this prompts before it sends anything.

Full flags: `just release-build --help` and `uv run python -m scripts.zenodo_deposit --help`.

## Contact

For questions about using the dataset or platform, contact
[relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl).
