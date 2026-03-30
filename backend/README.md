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
just perf-baseline # run the k6 baseline suite (requires k6)
just migrate       # apply migrations
just fix           # lint autofix + format
```

## More

For Docker setup, local development, migration workflow, and testing conventions, see [CONTRIBUTING.md](../CONTRIBUTING.md#backend-development).
