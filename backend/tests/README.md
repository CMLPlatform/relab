# Backend Tests

Fast unit tests are kept separate from persistence, runtime, and end-to-end coverage.

## Tiers

### `tests/unit/`

Isolated fast tests only.

- No Docker, database, or real app lifespan
- Prefer local stubs, parametrization, function-based tests, and small behavior-focused files
- Patch the owning module (`product_commands`, `product_tree_queries`), not a facade
- Keep helper modules local to one test area

### `tests/integration/api/`

Request/response behavior against the ASGI app with real routing and dependency overrides.

- Fixtures: `api_client`, `api_client_user`, `api_client_superuser`, `db_session`
- One endpoint behavior per test; multi-step stories go in `tests/integration/flows/`
- Prefer small files such as `*_public_*`, `*_membership_*`, `*_callbacks_*`
- Keep fixture/plugin modules separate from helper modules so pytest plugin loading stays explicit

### `tests/integration/db/`

ORM models, CRUD, queries, and migrations against a real database, without HTTP routing.

- Fixtures: `db_session`, seed/data fixtures, factories

### `tests/integration/core/`

Runtime integration that is neither an HTTP request test nor a persistence test: lifespan, logging,
cache wiring, file cleanup, migration behavior. One subsystem per test.

### `tests/integration/flows/`

A few multi-step journeys that cross feature boundaries, such as authenticate -> mutate -> fetch or
camera setup -> record -> persist. Keep them sparse; they are slower than the other tiers.
