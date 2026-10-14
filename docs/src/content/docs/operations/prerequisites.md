---
title: Prerequisites
description: What you need to run R9lab locally or self-host it in production or staging.
---

## Hosted use

To use R9lab without any local setup, open [app.r9lab.io](https://app.r9lab.io).

## Self-hosting

These pages cover running the stack yourself: for evaluation, institutional deployment, offline
use, or local development. For contributor workflow and tooling, see
[CONTRIBUTING.md](https://github.com/CMLPlatform/r9lab/blob/main/.github/CONTRIBUTING.md).

The guide runs in order. [Install](/operations/install/) sets up a local stack.
[Configure](/operations/configure/), [Deploy](/operations/deploy/), and
[Upgrade and backup](/operations/upgrade-backup/) take a production or staging host from an empty
server to scheduled backups.

## What you need

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [`just`](https://just.systems/man/en/), optional but recommended
- To change code: [`uv`](https://docs.astral.sh/uv/), and Node and pnpm at the versions pinned in
  `.node-version` and `package.json`
- PostgreSQL 18, only for an external database; the bundled Compose stack includes it

## Need help?

- Source code: [github.com/CMLPlatform/r9lab](https://github.com/CMLPlatform/r9lab)
- Contact: [info@r9lab.io](mailto:info@r9lab.io)
