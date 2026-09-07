# Relab Backend

The API, authentication, product and component data model, media handling, email, and plugin
integrations. Built with [FastAPI](https://fastapi.tiangolo.com/), PostgreSQL, Redis, and `uv`.

## Quick Start

```bash
just install
cd .. && just deploy-secrets-template dev && just dev-db && just dev-migrate
cd backend
just dev
```

The API is then available at <http://127.0.0.1:8010>. Docker Compose runs PostgreSQL and Redis.
Redis is required at startup. Put backend-only non-secret overrides in `.env.dev`; local secrets live
in `../secrets/dev/`.

- Filtered public contracts: <http://127.0.0.1:8010/openapi.public.json> and
  <http://127.0.0.1:8010/openapi.device.json>
- Public API reference UI: <http://127.0.0.1:8012/api/public/>
- Public device/plugin API reference UI: <http://127.0.0.1:8012/api/device/>
- Development/testing-only internal contracts: <http://127.0.0.1:8010/openapi.json> and
  <http://127.0.0.1:8010/openapi.admin.json>

## Common Commands

```bash
just check         # lint + typecheck
just test          # run all tests
just test-unit     # fast unit tests
just test-cov      # tests with coverage
just refresh-disposable-email-domains # update the committed disposable-email fallback list
just perf-baseline # run the k6 baseline suite and export a JSON summary (output under reports/performance/ is gitignored)
just migrate       # apply migrations
just fix           # lint autofix + format
```

The disposable-email validator starts from the committed list in
[app/api/auth/resources/disposable_email_domains.txt](app/api/auth/resources/disposable_email_domains.txt),
so startup works offline. The background refresh or the command above updates it.

Seed payloads live under [data/seed/](data/seed/) and ship in the migrations image. `dummy_data.json`
seeds one full teardown (a Dell XPS 13 with a component tree and a photograph per part). Seed
photographs must stay wider than 800px: `generate_thumbnails` skips widths at or above the original's,
and a narrower file loses its `srcset`.
[tests/integration/db/test_dummy_seed.py](tests/integration/db/test_dummy_seed.py) checks this.

To use `SEED_CPV_*` or `SEED_HS_CATEGORIES`, rebuild `backend/Dockerfile.migrations` with
`BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true` to include the `seed-taxonomies` dependency
group.

[`backend/Dockerfile`](Dockerfile) is multi-target: the default `runtime` stage builds the production
image; `--target dev` builds the hot-reload image used by `compose.dev.yaml`.

## Backend Architecture

- Routers are thin; domain read paths are local `select(...).where(...)` helpers.
- The shared CRUD kernel is `require_model`, `require_models`, `page_models`, `exists`, and
  persistence helpers.
- Tree endpoints (`/v1/categories/tree`, `/v1/products/{product_id}/components/tree`) use bounded
  loaders plus pure serialization, never lazy ORM traversal during serialization.
- User values become bind parameters. Dynamic identifiers such as sort or facet fields pass an
  allowlist before SQL is built. Raw SQL stays static.
- Product reads: `app/api/data_collection/routers/product_read_routers.py`; tree queries:
  `crud/product_tree_queries.py`; mutations: `crud/product_commands.py`.

## RPi Camera Contract Boundary

- **App contract**: backend routes and OpenAPI are the only app-facing surface.
- **Device contract**: `/openapi.device.json` documents the device integration surface; the docs
  site hosts the reference.
- **Private device seam**: `relab-rpi-cam-models` owns the backend\<->plugin transport DTOs
  (pairing, relay envelopes, relay allowlist, local-access bootstrap, upload acknowledgements).

Frontend code consumes the generated OpenAPI types, never the private device-seam DTOs.

## Email Delivery

Transactional email templates are authored as MJML in
[app/templates/emails/src/](app/templates/emails/src/) and compiled to committed HTML templates in
[app/templates/emails/build/](app/templates/emails/build/):

```bash
just compile-email
```

Send mail through `app/api/auth/services/email/`. Templates render once before provider dispatch.

### Google SMTP / Workspace SMTP Relay

Use the default provider:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_USERNAME=sender@example.com
EMAIL_FROM=Relab <sender@example.com>
EMAIL_REPLY_TO=relab@example.com
```

Store the SMTP password in `../secrets/<env>/smtp_password`. Use an app password for a personal
Google account, or the Workspace SMTP relay when domain policy allows it. Keep SPF, DKIM, and DMARC
aligned for the sending domain. Google references:
[send email with SMTP](https://support.google.com/a/answer/176600) and
[email authentication](https://support.google.com/a/answer/10583557).

### Microsoft Entra + Graph

Use Graph when sending from a Microsoft 365 mailbox:

```env
EMAIL_PROVIDER=microsoft_graph
EMAIL_FROM=Relab <relab@example.edu>
EMAIL_REPLY_TO=relab@example.edu
MICROSOFT_GRAPH_TENANT_ID=00000000-0000-0000-0000-000000000000
MICROSOFT_GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000
MICROSOFT_GRAPH_SENDER_USER=relab@example.edu
```

Store the Graph client secret in `../secrets/<env>/microsoft_graph_client_secret`. Before
production: create a dedicated mailbox, register an Entra app, grant it the application permission
`Mail.Send`, and restrict it to that mailbox with an application access policy. Microsoft references:
[send mail with Graph](https://learn.microsoft.com/en-us/graph/api/user-sendmail),
[client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow),
and
[application access policies](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access).

Newsletter delivery is not part of the runtime API.

## More

For Docker setup, local development, migration workflow, and testing conventions, see
[CONTRIBUTING.md](../.github/CONTRIBUTING.md#backend-development).
