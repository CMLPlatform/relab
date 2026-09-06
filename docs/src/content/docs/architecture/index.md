---
title: Architecture
description: System design, data model, API, and auth.
---

For maintainers and contributors who need the main system boundaries before changing code.

Start with [System design](system-design/): the split across app, web, backend, and docs that the
rest of this section assumes. [Data model](datamodel/) and [API structure](api/) cover the entities
and their relationships, and how routes are organized around them. [App navigation
flow](app-flow/) covers the mobile app's screens and redirects.

[Authentication](auth/) and [RPi camera plugin](rpi-cam/) are self-contained. Read them before
changing login, sessions, and OAuth, or the camera pairing and streaming path. Both describe
security-relevant behavior; treat them as the reference.

To run the stack, see [Install and self-host](/operations/install/) and
[Deployment](/operations/deployment/).
