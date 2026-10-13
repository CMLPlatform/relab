---
title: Install
description: Run the R9lab stack locally with Docker.
---

## Local Docker setup

1. Clone the repository.

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. Install local tooling if you plan to modify code.

   ```bash
   just setup
   ```

1. Create local backend secrets.

   ```bash
   just deploy-secrets-template dev
   ```

   Runtime secrets live in the gitignored `secrets/dev/`; replace a value there only when you need
   a real credential for an integration. For backend-only overrides such as OAuth, email, or the
   bootstrap superuser, create `backend/.env.dev`:

   ```text title="backend/.env.dev"
   GOOGLE_OAUTH_CLIENT_ID=google-oauth-client-id
   GITHUB_OAUTH_CLIENT_ID=github-oauth-client-id
   EMAIL_PROVIDER=smtp
   SMTP_HOST=smtp.example.com
   SMTP_USERNAME=you@example.com
   EMAIL_FROM=Your Name <you@example.com>
   EMAIL_REPLY_TO=you@example.com
   BOOTSTRAP_SUPERUSER_EMAIL=you@example.com
   ```

1. Start the database and cache, then run the migrations.

   ```bash
   just dev-db
   just dev-migrate
   ```

   To seed sample data, run `SEED_DUMMY_DATA=true just dev-migrate`. To seed the CPV or HS
   taxonomies too:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true just dev-migrate
   ```

1. Start the stack.

   ```bash
   just dev
   ```

   `just dev-up` starts the stack without file watching.

1. Open the local services.

   - API: <http://127.0.0.1:8010>
   - App frontend: <http://127.0.0.1:8011>
   - Docs: <http://127.0.0.1:8012>
   - Landing site: <http://127.0.0.1:8013>

1. Verify the backend is healthy.

   ```bash
   curl http://127.0.0.1:8010/health
   ```

1. To run the checks:

   ```bash
   just ci
   ```

To run the stack for other people on a production or staging host, continue with
[Configure](/operations/configure/).

## Raspberry Pi camera plugin

For camera-assisted capture, install the
[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin) with its
[install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md). The
Pi connects outbound to the backend over a WebSocket relay, so it needs no public IP or port
forwarding. Set `PAIRING_BACKEND_URL` on the Pi, then pair it as the
[platform camera guide](/user-guides/r9cam/) describes.
