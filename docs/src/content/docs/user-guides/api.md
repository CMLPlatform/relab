---
title: API interaction guide
description: Use the RELab API safely for scripts, notebooks, and external tooling.
---

For the authoritative schema, request models, and endpoint list, start from the [API reference overview](/api-reference/). Use the [public API reference](/api/public/) for application and data endpoints, the [device API reference](/api/device/) for backend-facing device integration, and the [RPi camera API reference](/api/rpi-cam/) for the local camera service. For how the API is designed internally, see [API structure](../../architecture/api/).

The public API is versioned under `/v1`. Client configuration should keep the API origin separate from the versioned path, then build requests such as `https://api.cml-relab.org/v1/products`.

## When to use the API directly

- scripted or batch access to structured research data
- connecting RELab records to notebooks or external tooling
- automating repetitive reference-data lookups
- building custom integrations on top of the platform

## Authentication

- **Browsers** use cookies (`POST /v1/auth/session/login`)
- **Apps and scripts** use bearer tokens (`POST /v1/auth/bearer/login`)
- Refresh-token handling depends on the Redis-backed auth path (see [Authentication](../../architecture/auth/))

!!! note "Public vs. authenticated routes"
Public reference data (taxonomies, materials, product types), product records, and uploaded media are accessible without authentication. Creating or changing records, account management, private user details, and owner-scoped workflows require a valid token.

## Suggested first steps

1. Open the [API reference overview](/api-reference/) and choose the surface you need.
1. Identify whether the endpoint you need is public or requires authentication.
1. Start with a read-only request before attempting writes.
1. Inspect response models carefully, especially around linked entities and media.
1. Only automate writes once you understand how the product hierarchy is represented.

## Integration advice

- Build against the generated OpenAPI schema rather than copying examples from old documentation.
- For product circularity notes, use `circularity_properties` as either `null` or an object with optional `recyclability`, `disassemblability`, and `remanufacturability` strings. Empty objects and empty note strings are normalized to `null`.
- Treat uploads and image handling as first-class API operations, not afterthoughts.
- If you need a stable exported dataset rather than live application access, check the [dataset page](../../project/dataset/) first.
