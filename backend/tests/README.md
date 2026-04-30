# Backend Tests

This directory is split into a few tiers so we can keep fast unit tests separate from persistence, runtime, and end-to-end coverage.

## Tiers

### `tests/unit/`

Use this tier for isolated fast tests only.

- No Docker or database startup
- No real app lifespan unless the behavior is fully mocked and still isolated
- Prefer local stubs, parametrization, and function-based tests
- Prefer small behavior-focused files over domain-sized catch-all modules
- Patch the owning module seam directly
  - example: patch `product_commands` or `product_tree_queries`, not a broad legacy facade
- Keep helper modules private and local to one test area when possible; avoid recreating package-level test registries

### `tests/integration/api/`

Use this tier for request/response behavior against the ASGI app with real routing, dependency overrides, and database-backed state when needed.

- Preferred fixtures: `api_client`, `api_client_user`, `api_client_superuser`, `db_session`
- Keep each test focused on one endpoint behavior
- Avoid multi-step CRUD stories here; move those to `tests/integration/flows/`
- Prefer small behavior-focused files such as `*_public_*`, `*_membership_*`, `*_callbacks_*` over one large endpoint catch-all module
- Keep fixture/plugin modules separate from pure helper modules so pytest plugin loading stays explicit and warning-free

### `tests/integration/db/`

Use this tier for database-backed tests that exercise ORM models, CRUD, queries, and migrations without going through HTTP routing.

- Allowed fixtures: `db_session`, seed/data fixtures, factories
- Not required by default: `api_client`, app lifespan, routing stack
- Goal: verify persistence and query behavior with a real database
- This tier also includes the former `tests/integration/models/` coverage for model constraints and relationships

### `tests/integration/core/`

Use this tier for runtime-adjacent integration coverage that does not belong to HTTP request tests or direct persistence tests.

- Good fits include lifespan, logging, cache wiring, file cleanup, database operations, and migration behavior that touches the app runtime
- Keep these tests focused on one subsystem at a time
- Prefer explicit fixtures over broad startup behavior unless the runtime path itself is under test

### `tests/integration/flows/`

Flow tests cover a small number of multi-step scenarios that cross feature boundaries.

Use this tier only when a single test needs to prove an end-to-end journey such as authenticate -> mutate -> fetch, or camera setup -> record -> persist.

Keep these tests sparse and slower than the unit and API tiers on purpose.
