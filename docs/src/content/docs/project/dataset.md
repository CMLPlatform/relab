---
title: Dataset
description: How to browse current R9lab records and how curated dataset releases will differ.
---

Browse current records at [app.r9lab.io](https://app.r9lab.io). The app shows live,
evolving records. A curated dataset release is a reviewed, versioned snapshot with defined scope,
metadata, and licensing, suitable for citation and reuse.

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

Explore current records in the app or through the API; see the
[API reference overview](/api-reference/) or the [public API reference](/api/public/).

The planned release license is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). No
release has been published yet. The [dataset codebook](/project/codebook/) documents every file and
column a release carries.

## Dublin Core metadata

Following the [Dublin Core specifications](https://www.dublincore.org/specifications/dublin-core/):

| Element     | Value                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | Disassembly dataset of durable goods for circular economy and computer vision applications                                                                                                                 |
| Creators    | van Lierde, Simon: <https://orcid.org/0009-0006-6953-909X>                                                                                                                                                 |
| Creators    | Donati, Franco: <https://orcid.org/0000-0002-8287-2413>                                                                                                                                                    |
| Publisher   | Leiden University. Institute of Environmental Sciences (CML)                                                                                                                                               |
| Subjects    | Computer vision, Circular economy, Remanufacturing, Life cycle assessment, Durable goods                                                                                                                   |
| Description | Teardown records, bills of materials and photographs of disassembled durable goods, supporting computer vision and life cycle assessment research. Each release's README lists the product types it holds. |
| Date        | 2025-03/.. (collection ongoing)                                                                                                                                                                            |
| Types       | Dataset, Image, Software                                                                                                                                                                                   |
| Formats     | application/vnd.apache.parquet, text/csv, application/ld+json, text/markdown; images keep their upload format (JPEG, PNG, WebP, GIF, TIFF or BMP)                                                          |
| Identifier  | <https://github.com/CMLPlatform/relab>                                                                                                                                                                     |
| Language    | en-US                                                                                                                                                                                                      |
| Coverage    | Products: durable goods, with the product types each release holds listed in its README; Time: 2025-03 onward; Geographic location: NL                                                                     |
| Rights      | <https://creativecommons.org/licenses/by/4.0/>                                                                                                                                                             |

## Building and depositing a release

(For maintainers.) The pipeline lives in `backend/scripts/` and runs from `backend/`:

1. `just release-build --inventory`: a dry run that writes nothing and reports what a release
   would contain. Only consenting accounts are included: owners who accepted the contributor terms
   at the version that grants the publication licence. Everyone else is excluded by the
   `no-terms-acceptance` rule and listed in `excluded-records.csv`. Accounts created before
   acceptance was tracked hold no grant until they answer the in-app prompt, and declining is a
   real outcome.
1. `just release-build --out dist/dataset-vX.Y --software-doi 10.5281/zenodo.NNNNNNN`: builds the
   release directory. The software DOI is the version DOI of the R9lab release the data was
   exported from, listed on the [concept record](https://doi.org/10.5281/zenodo.16637742); the
   provenance link must name one frozen release. The verification pass at the end fails the build
   rather than warning.
1. Review `dist/dataset-vX.Y/review/` by hand, including `excluded-records.csv` and the rule that
   excluded each record. This directory is not part of the published archive.
1. The pseudonymisation salt comes from `R9LAB_PSEUDONYM_SALT` (preferred), `--pseudonym-salt`, or
   `secrets/<env>/dataset_pseudonym_salt`. Keep the same salt for every release so owner pseudonyms
   stay stable across versions.
1. `uv run python -m scripts.zenodo_deposit --dir dist/dataset-vX.Y` creates or versions a Zenodo
   *draft*. Add `--deposition <id>` to resume uploading into an existing draft. The token is read
   from `secrets/<env>/zenodo_token` (or `ZENODO_TOKEN` for a one-off run).
1. Inspect the draft in the Zenodo web UI, then publish with `--deposition <id> --publish`. A
   published record can be tombstoned but never withdrawn or edited, so the command prompts before
   it sends anything.

Full flags: `just release-build --help` and `uv run python -m scripts.zenodo_deposit --help`.

## Contact

For questions about using the dataset or platform, contact
[info@r9lab.io](mailto:info@r9lab.io).
