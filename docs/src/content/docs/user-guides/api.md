---
title: API Interaction Guide
description: Use the RELab API safely for scripts, notebooks, and external tooling.
owner: docs
status: canonical
lastReviewed: '2026-04-15'
---

For the authoritative schema, request models, and full endpoint list, use the [interactive API documentation](https://api.cml-relab.org/docs). For how the API is designed internally, see [API Structure](../../architecture/api/).

The public API is versioned under `/v1`. Client configuration should keep the API origin separate from the versioned path, then build requests such as `https://api.cml-relab.org/v1/products`.

## When to Use the API Directly

- scripted or batch access to structured research data
- connecting RELab records to notebooks or external tooling
- automating repetitive reference-data lookups
- building custom integrations on top of the platform

## Authentication

- **Browsers** use cookies (`POST /v1/auth/session/login`)
- **Apps and scripts** use bearer tokens (`POST /v1/auth/login`)
- Refresh-token handling depends on the Redis-backed auth path (see [Authentication](../../architecture/auth/))

!!! note "Public vs. authenticated routes"
Public reference data (taxonomies, materials, product types) is accessible without authentication. Product records, images, and user data require a valid token.

## Suggested First Steps

1. Open the [live OpenAPI docs](https://api.cml-relab.org/docs).
1. Identify whether the endpoint you need is public or requires authentication.
1. Start with a read-only request before attempting writes.
1. Inspect response models carefully, especially around linked entities and media.
1. Only automate writes once you understand how the product hierarchy is represented.

## Integration Advice

- Build against the live OpenAPI schema rather than copying examples from old documentation.
- Treat uploads and image handling as first-class API operations, not afterthoughts.
- If you need a stable exported dataset rather than live application access, check the [Dataset Documentation](../../project/dataset/) first.
