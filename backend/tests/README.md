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

## Assertions

- Assert what tells the paths apart, not just the outcome. Several paths often converge on one
  response — `images.py` answers 400 for a missing, non-integer, and non-positive `product_id` — so a
  test checking only the status keeps passing once the guard it was written for is gone. Assert the
  `detail`, the close `reason`, or an effect: a collaborator not reached, a queue left empty.
- Sentinels converge the same way: `read_token` returns `None` from five paths.
- Break what a new test covers and watch it fail before trusting it.
- To find gaps, replace a guard with `if False:` and run `tests/unit tests/integration`. One that
  breaks nothing is untested, or covered only by an assertion another path also satisfies.
