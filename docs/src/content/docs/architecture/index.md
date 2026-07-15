---
title: Architecture
description: System design, data model, API, and auth.
---

How Relab is built. These pages are for maintainers and contributors who need to understand the main system boundaries before changing code.

## Architecture

<div class="grid cards relab-card-grid" markdown>

- **[System design](system-design/)**
  The main moving parts and why the platform is split across app, web, backend, and docs.

- **[Data model overview](datamodel/)**
  Main entities and relationships.

- **[API structure](api/)**
  Route organization and integration flow.

- **[Authentication](auth/)**
  Login, refresh, OAuth, and session handling.

- **[RPi camera plugin architecture](rpi-cam/)**
  How the camera plugin talks to the backend and app clients.

</div>

## Running Relab

<div class="grid cards relab-card-grid" markdown>

- **[Install and self-host](/operations/install/)**
  Run the stack locally or on your own server.

- **[Deployment](/operations/deployment/)**
  Compose topology and operational trade-offs.

</div>
