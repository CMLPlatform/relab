---
title: API reference
description: Choose an interactive Relab API reference generated from the committed OpenAPI schemas.
---

Interactive views of the OpenAPI schemas committed with the docs site: endpoint details, request
and response models, authentication requirements, and schema downloads.

- [Public API](/api/public/): the application API for platform data, accounts, authentication,
  media, and public research records. Use this unless you are building a device integration.
- [Device API](/api/device/): the backend-facing API for pairing devices and Relab plugins with the
  platform.
- [RPi camera API](/api/rpi-cam/): the local camera service API for status checks, capture
  workflows, and camera-device integration.

## Licensing

The public and device schemas, and the client types generated from them, are Apache-2.0, not AGPL:
a generated client carries no copyleft obligation into your code. The RPi camera schema comes from a
separate repository and is not covered by that carve-out. See [Licensing](/project/licensing/).

For scripting guidance, see the [API interaction guide](../user-guides/api/). For the
implementation, see [API structure](../architecture/api/).
