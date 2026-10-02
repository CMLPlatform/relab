# Backend Tests

Fast unit tests are kept separate from persistence, runtime, and end-to-end coverage. The shared
fixtures are `db_session`, `db_user`, `db_superuser`, `api_client`, `api_client_user`,
`api_client_superuser`, and `redis_client`.

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
  response (`images.py` answers 400 for a missing, non-integer, and non-positive `product_id`), so a
  test checking only the status keeps passing once the guard it was written for is gone. Assert the
  `detail`, the close `reason`, or an effect: a collaborator not reached, a queue left empty.
- Sentinels converge the same way: `read_token` returns `None` from five paths.
- Break what a new test covers and watch it fail before trusting it.
- To find gaps, replace a guard with `if False:` and run `tests/unit tests/integration`. One that
  breaks nothing is untested, or covered only by an assertion another path also satisfies.

## Mutation testing

`just mutation` runs mutmut over `app/` against one throwaway Postgres; the Ops workflow runs it
monthly in shards by package and uploads each shard's survivor list. It never fails on survivors. It lists the functions with more
survivors than `tests/mutation-baseline.txt`: add the missing assertion, or rebaseline with
`just mutation-baseline` when the survivor is deliberate (a guard for a state that cannot occur).
A full run is heavy, so leave it to the Ops job; locally it runs at low priority on half the cores
(set `MUTMUT_JOBS` to change that). Pass mutant globs to narrow a local run:
`just mutation 'app.core.images*'`. Results are cached in
`mutants/`: after adding an assertion, rerun with that function's glob or delete `mutants/`, or the
old verdict stands. Rebaseline only from a full run, since it replaces the file. From an Ops run:

```sh
gh run download <run-id> -p 'ops-backend-mutation-*' -D reports/mutation/ops
cat reports/mutation/ops/*/survivors.txt | sort > reports/mutation/survivors.txt
just mutation-baseline
```

Log calls are not mutated, but only on the call's first line: the argument lines of a multi-line
call still are, and their survivors belong in the baseline.
