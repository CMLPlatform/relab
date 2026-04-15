# Installation Guide

## Hosted Use

If you just want to use RELab, start here:

[app.cml-relab.org](https://app.cml-relab.org)

No local setup is required.

## Self-Hosting

Self-hosting makes sense for evaluation, institutional deployment, offline use, or local development. If your main goal is contributing code, [CONTRIBUTING.md](CONTRIBUTING.md) is the better starting point.

### Prerequisites

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [`just`](https://just.systems/man/en/) is optional but recommended

## Local Docker Setup

1. Clone the repository.

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. Install local tooling if you plan to modify code.

   ```bash
   just setup
   ```

1. Configure the backend environment.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   ```

1. Run the first migration pass.

   ```bash
   just dev-migrate
   ```

   If you also need CPV or HS taxonomy seeding in the migration container:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true docker compose --profile migrations up --build migrator
   ```

1. Start the stack.

   ```bash
   just dev
   ```

   If you do not want file watching, use `just dev-up` instead.

1. Open the local services.

   - Platform: <http://127.0.0.1:8010>
   - API: <http://127.0.0.1:8011>
   - Docs: <http://127.0.0.1:8012>
   - App frontend: <http://127.0.0.1:8013>

1. Verify the backend is healthy.

   ```bash
   curl http://127.0.0.1:8011/health
   ```

1. Run checks if needed.

   ```bash
   just env-audit
   just validate
   just test
   ```

## Production Deployment

Production deployments are Docker Compose based. Cloudflare Tunnel remains the supported ingress path. The current operational path is manual on the server: pull the repo, run the production stack, run migrations, and verify health.

1. Configure a Cloudflare tunnel.

   - Set up a domain and a remotely managed tunnel in Cloudflare.
   - Forward traffic to `app-site:8081`, `web-site:8081`, `api:8000`, and `docs-site:8000`.
   - Set `TUNNEL_TOKEN_PROD` in the root `.env`.

1. Configure the backend production environment.

   ```bash
   cp backend/.env.prod.example backend/.env.prod
   ```

1. Start the production stack.

   ```bash
   just prod-up YES
   ```

   In the current setup, deployment is done directly on the server.

1. Run migrations.

   ```bash
   just prod-migrate YES
   ```

   If you also need taxonomy seeding in the migration container:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true docker compose -p relab_prod -f compose.yml -f compose.prod.yml --profile migrations up --build migrator
   ```

1. Manage the running stack.

   ```bash
   just prod-logs
   just prod-down YES
   ```

## Raspberry Pi Camera Plugin

If you want camera-assisted capture, see the external plugin repository:

[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin)

The plugin uses **WebSocket relay** — the RPi connects outbound to the backend, so no public IP or port forwarding is needed. The quickest setup is **automatic pairing**: set `PAIRING_BACKEND_URL` on the RPi, boot it, and enter the displayed pairing code in the app. See the [plugin install guide](https://github.com/CMLPlatform/relab-rpi-cam-plugin/blob/main/INSTALL.md) and the [platform camera guide](https://docs.cml-relab.org/user-guides/rpi-cam/) for details.
If the Pi is headless, you can read the pairing code either from its local `/setup` page or from the `PAIRING READY` log line over SSH, `docker compose logs`, or `journalctl`.

## Need Help?

- Docs: [docs.cml-relab.org](https://docs.cml-relab.org)
- Contact: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
