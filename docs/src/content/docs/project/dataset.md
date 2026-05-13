---
title: Dataset
description: How to browse current RELab records and how curated dataset releases will differ.
---

Current RELab records can be browsed in the production app: [app.cml-relab.org](https://app.cml-relab.org).

The app is the live operational system. A curated dataset release is a different thing: a reviewed, versioned snapshot with clear scope, metadata, and licensing.

## What a release should contain

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

Current records can be explored in the app or through the API. For technical access, see the [API reference overview](/api-reference/) or go directly to the [public API reference](/api/public/).

Curated releases will carry authoritative scope, versioning, and licensing metadata. The goal is to contribute to an open industrial ecology data commons, not just publish an isolated file.

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
| Date        | 2025-03                                                                                                                               |
| Types       | Dataset, Image, Software                                                                                                              |
| Formats     | text/csv, image/jpeg, application/x-python, text/markdown                                                                             |
| Identifier  | <https://github.com/CMLPlatform/relab>                                                                                                |
| Language    | en-US                                                                                                                                 |
| Coverage    | Products: Power tools; Time: 2025-; Geographic location: NL                                                                           |
| Rights      | <https://opendatacommons.org/licenses/odbl/>                                                                                          |

## License

The dataset is published under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).

## Contact

For questions about using the dataset or platform, contact [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl).
