---
title: API interaction guide
description: Use the Relab API safely for scripts, notebooks, and external tooling.
---

For schemas, request models, and endpoint lists, see the [API reference overview](/api-reference/).
For the internal design, see [API structure](../../architecture/api/).

The public API is versioned under `/v1`. Keep the API origin separate from the versioned path in
your client configuration and build requests such as `https://api.cml-relab.org/v1/products`.

## When to use the API directly

- scripted or batch access to structured research data
- connecting Relab records to notebooks or external tooling
- automating repetitive reference-data lookups
- building custom integrations on top of the platform

## Authentication

- Browsers use cookies (`POST /v1/auth/session/login`)
- Apps and scripts use bearer tokens (`POST /v1/auth/bearer/login`)
- Refresh-token handling depends on the Redis-backed auth path (see
  [Authentication](../../architecture/auth/))

:::note[Public vs. authenticated routes]
Public reference data (taxonomies, materials, product types), product records, and uploaded media
are accessible without authentication. Creating or changing records, account management, private
user details, and owner-scoped workflows require a valid token.
:::

## Suggested first steps

1. Open the [API reference overview](/api-reference/) and choose the surface you need.
1. Check whether the endpoint is public or requires authentication.
1. Start with a read-only request.
1. Inspect response models, especially linked entities and media.
1. Automate writes only once you understand how the product hierarchy is represented.

## Interactive tooling and admin tasks

Point a client at the API and authenticate with a bearer token from `POST /v1/auth/bearer/login`.
The same path covers superuser tasks like `POST /v1/admin/cache/clear/{namespace}`.

- **Postman, Bruno, Insomnia**: import the OpenAPI schema (`app/src/types/openapi.json`) for the
  full endpoint collection, then set auth to *Bearer*.
- **VS Code REST Client / JetBrains HTTP Client**: use `scripts/admin.http` from a repo checkout.
  Send `login` once; the token flows into the calls below it.

## Exporting products

To analyse a set of products in a spreadsheet or in Python, export them instead of paging through
the list:

- `GET /v1/products/export?format=csv|json` takes the same filters, search, and sorting as
  `GET /v1/products`, and returns every base product that matches, not only one page.
- `GET /v1/products/{id}/export?format=csv|json` exports one base product.

Each base product comes with all its components, at every depth.

- **CSV** has one row per product or component. The `parent_id` column links a component to the
  record it was taken out of. Column names follow the records table of the
  [dataset release](../../project/dataset/), and `image_urls` lists the photo URLs separated by
  spaces.
- **JSON** is a list of products in the same shape as the product read API, with `components`
  nested at every level.

The app offers the same exports: **Export** on a product page, and **Export results** under the
product list filters.

An export shows the owner the way the product page does: the username when the owner's profile is
public, empty when it is hidden. Exports are public and have a stricter rate limit than ordinary
reads.

:::note[Limits]
One export holds at most 100 base products. Components do not count toward that limit. If more
products match, the request fails with a `422` response that asks you to narrow the filters. For
the whole dataset, use the [dataset release](../../project/dataset/).
:::

## Integration advice

- Build against the generated OpenAPI schema, not copied examples, which drift.
- For product circularity notes, use `circularity_properties` as either `null` or an object with
  optional `recyclability`, `disassemblability`, and `remanufacturability` strings. Empty objects
  and empty note strings are normalized to `null`.
- If you need a stable exported dataset rather than live application access, check the
  [dataset page](../../project/dataset/) first.
