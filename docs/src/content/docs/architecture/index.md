---
title: Architecture
description: System design, data model, API, and auth.
---

How Relab is built. These pages are for maintainers and contributors who need to understand the main
system boundaries before changing code.

Start with [System design](system-design/): it explains why the platform is split across app, web,
backend, and docs, and the rest of this section assumes that split. [Data model](datamodel/) and
[API structure](api/) then cover the two boundaries most changes touch, the entities and their
relationships, and how routes are organized around them.

[Authentication](auth/) and [RPi camera plugin](rpi-cam/) are self-contained. Read them when you are
changing login, sessions, and OAuth, or the camera pairing and streaming path, respectively. Both
describe security-relevant behavior, so treat them as the reference rather than reading it off the
code.

These pages describe the design. To actually run the stack, see
[Install and self-host](/operations/install/) for a local or single-server deployment, and
[Deployment](/operations/deployment/) for the Compose topology and its operational trade-offs.
