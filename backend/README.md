# RELab Backend

The backend provides the API, authentication flows, product and component data model, media handling, shared email infrastructure, and plugin integrations. It is built with [FastAPI](https://fastapi.tiangolo.com/), PostgreSQL, Redis, and `uv`.

## Quick Start

```bash
just install
cd .. && just deploy-secrets-template dev && just dev-db && just dev-migrate
cd backend
just dev
```

The API is then available at <http://127.0.0.1:8010>.
Use Docker Compose for local PostgreSQL and Redis. Development uses Redis-backed caching when Redis is available, and falls back to in-memory
caching only when Redis is not running. Create `.env.dev` only when you need backend-only non-secret overrides;
local backend secrets live in `../secrets/dev/`.

- Filtered public contracts: <http://127.0.0.1:8010/openapi.public.json> and <http://127.0.0.1:8010/openapi.device.json>
- Public API reference UI: <http://127.0.0.1:8012/api/public/>
- Public device/plugin API reference UI: <http://127.0.0.1:8012/api/device/>
- Development/testing-only internal contracts: <http://127.0.0.1:8010/openapi.json> and <http://127.0.0.1:8010/openapi.admin.json>

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

The disposable-email validator seeds itself from the committed runtime fallback file in [app/api/auth/resources/disposable_email_domains.txt](app/api/auth/resources/disposable_email_domains.txt), so startup works offline. Remote updates are still optional and happen via the background refresh path or the maintenance command above.

Committed migration/bootstrap payloads live under [data/seed/](data/seed/). The migrations image includes that directory, while generated uploads stay excluded from Docker build contexts.

Taxonomy imports are intentionally opt-in for the migrations image. If you want `SEED_CPV_*` or `SEED_HS_CATEGORIES`, rebuild `backend/Dockerfile.migrations` with `BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true` so the optional `seed-taxonomies` dependency group is available.

The main [`backend/Dockerfile`](Dockerfile) is multi-target: the default `runtime` stage builds the slim production image, and `--target dev` produces the hot-reload dev image used by `compose.dev.yaml`.

## Backend Architecture

The backend uses explicit, domain-owned seams rather than broad internal registries.

- Routers are thin orchestration layers.
- Domain read paths use small local `select(...).where(...)` helpers rather than generic query-builder indirection.
- The shared CRUD/query kernel is intentionally small: `require_model`, `require_models`, `page_models`, `exists`, and persistence helpers.
- Recursive endpoints such as `/v1/categories/tree` and `/v1/products/{product_id}/components/tree` use bounded tree loaders plus pure serialization, not lazy ORM traversal during response assembly.
- Query parameters stay in SQLAlchemy expressions so user values become bind parameters. Dynamic identifiers such as sort or facet fields go through explicit allowlists before SQL is built. Raw SQL stays static; runtime values are bound separately.

Key reference points for the domain shape:

- `app/api/data_collection/crud/products.py` is the product-domain entrypoint, with tree reads in `product_tree_queries.py` and mutations in `product_commands.py`.
- `app/api/file_storage/crud/` is split by concern.

## RPi Camera Contract Boundary

The Raspberry Pi camera integration has two intentional contract layers:

- **Public/frontend contract**: backend routes and OpenAPI remain the only app-facing API surface
- **Public device/plugin contract**: `/openapi.device.json` documents the supported device integration surface, with the human reference hosted by the docs site
- **Private device seam**: `relab-rpi-cam-models` owns the backend\<->plugin transport DTOs for pairing, relay envelopes, local-access bootstrap, and direct upload acknowledgements

Frontend code should keep consuming backend-generated OpenAPI types rather than importing private device-seam DTOs directly.

## Email Delivery

Transactional email templates are authored as MJML in [app/templates/emails/src/](app/templates/emails/src/) and compiled to committed HTML templates in [app/templates/emails/build/](app/templates/emails/build/):

```bash
just compile-email
```

Runtime code should send mail through `app/api/auth/services/email/`. Templates are rendered once before provider dispatch, so SMTP and Microsoft Graph receive the same internal message shape.

### Google SMTP / Workspace SMTP Relay

Use the default provider:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_USERNAME=sender@example.com
EMAIL_FROM=Reverse Engineering Lab <sender@example.com>
EMAIL_REPLY_TO=relab@example.com
```

Store the SMTP password in `../secrets/<env>/smtp_password`. For a personal/free Google account, use an app password when available. For Workspace, prefer the Workspace SMTP relay when the domain policy allows it. Keep SPF, DKIM, and DMARC aligned for the sending domain. Google references: [send email with SMTP](https://support.google.com/a/answer/176600) and [email authentication](https://support.google.com/a/answer/10583557).

### Microsoft Entra + Graph

Use Graph when sending from a Microsoft 365 mailbox:

```env
EMAIL_PROVIDER=microsoft_graph
EMAIL_FROM=Reverse Engineering Lab <relab@example.edu>
EMAIL_REPLY_TO=relab@example.edu
MICROSOFT_GRAPH_TENANT_ID=00000000-0000-0000-0000-000000000000
MICROSOFT_GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000
MICROSOFT_GRAPH_SENDER_USER=relab@example.edu
```

Store the Graph client secret in `../secrets/<env>/microsoft_graph_client_secret`. Create a dedicated mailbox, register an Entra app, grant Microsoft Graph application permission `Mail.Send`, and restrict the app to that mailbox with an application access policy before production use. Microsoft references: [send mail with Graph](https://learn.microsoft.com/en-us/graph/api/user-sendmail), [client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow), and [application access policies](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access).

Recurring newsletter delivery is not part of the runtime API. Any future implementation requires a real sender workflow, unsubscribe handling, and preference-center support before it should be wired into the API.

## More

For Docker setup, local development, migration workflow, and testing conventions, see [CONTRIBUTING.md](../.github/CONTRIBUTING.md#backend-development).
