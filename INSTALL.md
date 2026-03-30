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
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true docker compose --profile migrations up --build backend-migrations
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
   just check
   just test
   ```

## Production Deployment

Production deployments are Docker Compose based. In the current setup, Cloudflare Tunnel is used to expose services without directly opening inbound ports.

1. Configure a Cloudflare tunnel.

   - Set up a domain and a remotely managed tunnel in Cloudflare.
   - Forward traffic to `frontend-app:8081`, `frontend-web:8081`, `backend:8000`, and `docs:8000`.
   - Set `TUNNEL_TOKEN_PROD` in the root `.env`.

1. Configure the backend production environment.

   ```bash
   cp backend/.env.prod.example backend/.env.prod
   ```

1. Start the production stack.

   ```bash
   just prod-up YES
   ```

   To enable backend tracing with the bundled OpenTelemetry collector:

   - set `OTEL_ENABLED='true'` in `backend/.env.prod`
   - start the collector with:

   ```bash
   just prod-telemetry-up YES
   ```

1. Run migrations.

   ```bash
   just prod-migrate YES
   ```

   If you also need taxonomy seeding in the migration container:

   ```bash
   BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true docker compose -p relab_prod -f compose.yml -f compose.prod.yml --profile migrations up --build backend-migrations
   ```

1. Optionally enable backups.

   ```bash
   just prod-backups-up YES
   ```

1. Manage the running stack.

   ```bash
   just prod-logs
   just prod-down YES
   ```

## Raspberry Pi Camera Plugin

If you want camera-assisted capture, see the external plugin repository:

[Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin)

## Need Help?

- Docs: [docs.cml-relab.org](https://docs.cml-relab.org)
- Contact: [relab@cml.leidenuniv.nl](mailto:relab@cml.leidenuniv.nl)
