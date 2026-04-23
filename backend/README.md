# RELab Backend

The backend provides the API, authentication flows, product and component data model, media handling, newsletter endpoints, and plugin integrations. It is built with [FastAPI](https://fastapi.tiangolo.com/), PostgreSQL, Redis, and `uv`.

## Quick Start

```bash
just install
cp .env.dev.example .env.dev
./scripts/local_setup.sh
just dev
```

The API is then available at <http://localhost:8000>.

- Public API docs: <http://localhost:8000/docs>
- Full API docs: <http://localhost:8000/docs/full> after authenticating as a superuser

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

The disposable-email validator now seeds itself from the committed runtime fallback file in [app/api/auth/resources/disposable_email_domains.txt](app/api/auth/resources/disposable_email_domains.txt), so startup works offline. Remote updates are still optional and happen via the background refresh path or the maintenance command above.

Committed migration/bootstrap payloads live under [data/seed/](data/seed/). The migrations image includes that directory, while generated uploads stay excluded from Docker build contexts.

Taxonomy imports are intentionally opt-in for the migrations image. If you want `SEED_CPV_*` or `SEED_HS_CATEGORIES`, rebuild `backend/Dockerfile.migrations` with `BACKEND_MIGRATIONS_INCLUDE_TAXONOMY_SEED_DEPS=true` so the optional `seed-taxonomies` dependency group is available.

The main [`backend/Dockerfile`](Dockerfile) is multi-target: the default `runtime` stage builds the slim production image, and `--target dev` produces the hot-reload dev image used by `compose.dev.yml`.

## Current Backend Shape

The backend is intentionally moving toward explicit, domain-owned seams instead of broad internal registries.

- Routers should stay thin orchestration layers.
- Domain read paths should prefer small local `select(...).where(...)` helpers over generic query-builder indirection.
- The shared CRUD/query kernel is intentionally small: keep `require_model`, `require_models`, `page_models`, `exists`, and persistence helpers. Older convenience helpers such as `QueryOptions`, `build_query`, and `list_models` are retired.
- Recursive endpoints such as `/products/tree` and `/categories/tree` remain supported public APIs, but they should use bounded tree loaders plus pure serialization, never lazy ORM traversal during response assembly.

Two examples of the preferred shape:

- `app/api/data_collection/crud/products.py` is now the stable product-domain entrypoint, with tree reads in `product_tree_queries.py` and mutations in `product_commands.py`.
- `app/api/file_storage/crud/` is split by concern; avoid reintroducing a broad `file_storage.crud` compatibility surface.

## RPi Camera Contract Boundary

The Raspberry Pi camera integration has two intentional contract layers:

- **Public/frontend contract**: backend routes and OpenAPI remain the only app-facing API surface
- **Private device seam**: `relab-rpi-cam-models` owns the backend\<->plugin transport DTOs for pairing, relay envelopes, local-access bootstrap, and direct upload acknowledgements

Frontend code should keep consuming backend-generated OpenAPI types rather than importing private device-seam DTOs directly.

## More

For Docker setup, local development, migration workflow, and testing conventions, see [CONTRIBUTING.md](../CONTRIBUTING.md#backend-development).
