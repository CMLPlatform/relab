---
title: API reference
description: Choose an interactive Relab API reference generated from the committed OpenAPI schemas.
---

The Relab API references are interactive views of the generated OpenAPI schemas committed with the
docs site. Use them for endpoint details, request and response models, authentication requirements,
and schema downloads.

Three references are published, one per audience:

- [Public API](/api/public/) is the application API, covering platform data, accounts,
  authentication, media, and public research records. This is the one to use unless you are building
  a device integration.
- [Device API](/api/device/) is the backend-facing integration API for pairing devices and Relab
  plugins with the platform.
- [RPi camera API](/api/rpi-cam/) is the local camera service API, for status checks, capture
  workflows, and camera-device integration.

For practical scripting guidance, start with the [API interaction guide](../user-guides/api/). For
implementation architecture, see [API structure](../architecture/api/).
