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

- **Assert what distinguishes the path, not only the outcome.** Several paths often converge on one
  response: `message_relay` answers 503 both for a camera that is not connected and for one that ran
  out of time, and `images.py` answers 400 for a missing, non-integer, and non-positive
  `product_id`. A test asserting only the status passes whichever guard fired, so it keeps passing
  once the guard it was written for is gone. Assert the `detail`, the close `reason`, or an
  observable effect (a collaborator that must not be reached, a queue that must stay empty).
- **Watch for the same trap on sentinels.** `read_token` returns `None` from five paths and
  `_authenticate` returns `False` from five; `is None` alone does not say which one ran.
- **Prove a new test fails without the behavior.** Break the thing it covers, watch it go red, put it
  back. Three tests written in one sitting looked correct and proved nothing until this was done.
- **Sweep for the class when touching error paths**: replace a guard with `if False:` and run the
  suite. A guard whose removal breaks nothing is either untested or covered only by an assertion
  another path satisfies. Run it against `tests/unit tests/integration` — many guards in routers and
  dependencies are only reachable from the integration tier.
