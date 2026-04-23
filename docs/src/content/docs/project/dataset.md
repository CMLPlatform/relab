---
title: Dataset Documentation
description: The intended path from live RELab records to curated dataset releases.
owner: docs
status: reviewed
lastReviewed: '2026-04-15'
---

<div class="relab-section-intro">
RELab is intended to support a public dataset of disassembled durable goods. The platform is the operational system; the dataset is the curated research output derived from it.
</div>

<div class="grid cards relab-card-grid" markdown>

- **Source**: Live platform records and media
- **Output**: Curated public dataset releases
- **Use**: Industrial ecology, circular economy, and AI-related research

</div>

## Why It Matters

The dataset layer is where live RELab records become a citable research output: a curated, versioned snapshot with explicit provenance, scope, and licensing, decoupled from the operational database. Keeping that boundary sharp is what makes the data reusable beyond the project — for benchmarking, comparative studies, and integration with other industrial-ecology infrastructures.

Likely data elements include:

- product metadata
- component hierarchies
- images and possibly video-linked records
- material and category annotations
- measurements and observational notes

Likely uses include:

- computer vision and image-based classification tasks
- circular economy and design-for-disassembly studies
- material composition analysis
- comparative studies across product families or brands
- industrial ecology and LCA-oriented work that depends on better primary product data
- linking with other open IE and CE data infrastructures

## Access and Publication Status

The intention is to publish the dataset openly. The publication workflow is still maturing, so the most reliable technical interface right now is the live API rather than a formal release portal.

[API Access](https://api.cml-relab.org/docs)

A browsable dataset portal and curated downloadable releases are planned.

In the broader project vision, dataset publication is not only an output step. It is also part of building an open industrial ecology data commons that others can inspect, reuse, compare, and extend.

## Dublin Core Metadata

Following the [Dublin Core specifications](https://www.dublincore.org/specifications/dublin-core/):

| Element     | Value                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | Disassembly dataset of durable goods for circular economy and computer vision applications                                            |
| Creators    | van Lierde, Simon: <https://orcid.org/0009-0006-6953-909X>                                                                            |
| Creators    | Donati, Franco: <https://orcid.org/0000-0002-8287-2413>                                                                               |
| Publisher   | Leiden University. Institute of Environmental Sciences (CML)                                                                          |
| Subjects    | Computer vision, Circular economy, Remanufacturing, Life cycle assessment, Durable goods                                              |
| Description | Data collection platform for disassembled power tool images and metadata supporting computer vision tasks for life cycle assessments. |
| Date        | 2025-03                                                                                                                               |
| Types       | Dataset, Image, Software                                                                                                              |
| Formats     | text/csv, image/jpeg, application/x-python, text/markdown                                                                             |
| Identifier  | <https://github.com/CMLPlatform/relab>                                                                                                |
| Language    | en-US                                                                                                                                 |
| Coverage    | Products: Power tools; Time: 2025-; Geographic location: NL                                                                           |
| Rights      | <https://opendatacommons.org/licenses/odbl/>                                                                                          |

## License

The intended dataset license is the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). Published dataset releases will be the authoritative source for exact licensing, scope, and versioning.

## Contact

For questions about using the dataset or platform, contact [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl).
