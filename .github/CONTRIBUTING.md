# Contributing to RELab

Thanks for contributing. RELab is a research platform developed at CML, Leiden University. The goal of this document is simple: get you productive without making you dig through the repo first.

This page is for code and documentation changes. If you mainly want to run or deploy the stack, see [Install and self-host](https://docs.cml-relab.org/operations/install/).

## Start Here

| I want to...                            | Start here                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------- |
| get the recommended working environment | [Devcontainer Setup](#devcontainer-setup)                                   |
| run the full stack locally in Docker    | [Docker Development](#docker-development)                                   |
| work on one subrepo directly            | [Local Development](#local-development)                                     |
| understand the system first             | [docs.cml-relab.org/architecture](https://docs.cml-relab.org/architecture/) |
| understand config ownership             | [Tooling and configuration](#tooling-and-configuration)                     |

## Code of Conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Devcontainer Setup

This is the recommended path into the repo if you use VS Code.

### Requirements

- [VS Code](https://code.visualstudio.com/)
- [Docker Desktop](https://docs.docker.com/get-docker/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### First-Time Setup

1. Clone the repository.

1. Create the environment files.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   cp .env.example .env
   just deploy-secrets-template dev
   ```

1. Fill in backend-only local values in `backend/.env.dev` and host-local Compose inputs in the root `.env`. Runtime secrets live in gitignored files under `secrets/dev/`.

1. Reopen the repo in the `relab-fullstack` devcontainer.

1. Run the standard bootstrap path.

   ```bash
   just setup
   just dev
   ```

1. Run the standard checks when you want to verify the repo state.

   ```bash
   just ci
   ```

### Available Configurations

| Configuration     | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `relab-fullstack` | primary onboarding path for full stack development |
| `relab-backend`   | focused backend work                               |
| `relab-app`       | focused Expo app work                              |
| `relab-www`       | focused public site work                           |
| `relab-docs`      | focused docs work                                  |

### Forwarded Ports

- Platform: <http://127.0.0.1:8010>
- Backend: <http://127.0.0.1:8011>
- Docs: <http://127.0.0.1:8012>
- App frontend: <http://127.0.0.1:8013>
- PostgreSQL: `5432`
- Redis: `6379`

## Docker Development

Use this when you want the full stack without configuring each subrepo manually.

1. Create the local environment files.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   cp .env.example .env
   just deploy-secrets-template dev
   ```

   `backend/.env.dev` is a backend-only local fixture. Root `.env` contains host-local Compose inputs, and runtime secrets live in `secrets/dev/`.

1. Install local tooling.

   ```bash
   just setup
   ```

1. Start the stack with file watching.

   ```bash
   just dev
   ```

1. Run migrations on first start.

   ```bash
   just dev-migrate
   ```

### Local Service URLs

- Platform: <http://127.0.0.1:8010>
- Backend: <http://127.0.0.1:8011>
- Docs: <http://127.0.0.1:8012>
- App frontend: <http://127.0.0.1:8013>

Docker development ports bind to localhost. If you want to test the Expo app from another phone, tablet, or computer over your LAN, run the Expo server directly from `app/` with `just dev` instead of using the Docker app service.

### Useful Commands

```bash
just dev-up       # start without file watching
just dev-logs     # tail logs
just dev-down     # stop containers
```

## Local Development

Use this when you want to work on a specific subrepo without Docker.

### Root Setup

Install:

- [Git](https://git-scm.com/)
- [uv](https://docs.astral.sh/uv/getting-started/installation)
- [just](https://just.systems/man/en/) recommended
- Node.js LTS for the frontend subrepos

Then run:

```bash
git clone https://github.com/CMLPlatform/relab
cd relab
just setup
```

## Task Runner

The repo uses [`just`](https://just.systems) as the common task runner.

From the repo root:

```bash
just setup
just ci
just test
just test-integration
just security
```

Use `just --list` in any directory to see what is available there.

## Tooling and Configuration

Use `.tool-versions` as the source of truth for local tool versions. Do not duplicate exact versions in docs unless a manifest or generated file requires it.

Configuration ownership should stay predictable:

- root `justfile`: repo-wide orchestration and cross-project workflows
- subrepo `justfile`: local commands for one project
- `pyproject.toml`: Python dependencies and Python tool configuration
- `package.json`: frontend dependencies, engine policy, and script wrappers
- env files: runtime and build-time configuration only
- GitHub workflow YAML: CI/CD wiring; move complex logic to versioned scripts

Keep new settings in the smallest surface that actually needs them. If a change adds or renames env vars, update the examples, validation rules, and affected docs in the same PR.

## Security Review Expectations

RELab uses [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS) as the application-security baseline and keeps supply-chain checks consolidated around GitHub-native controls, Renovate, Trivy, CodeQL, Gitleaks, and OpenSSF Scorecard.

For changes that touch authentication, authorization, uploads/media, RPi camera or device flows, admin APIs, deployment, secrets, dependencies, or personal data, include security considerations in the pull request and update the relevant docs when behavior changes.

Use the security section in the pull request template for sensitive changes. If a change creates a new attack-surface bucket or meaningfully changes a trust boundary, update the maintainer baseline in [SECURITY.md](SECURITY.md). The maintainer checklist and supply-chain tool ownership model live there too.

Use `just security` for local maintainer diagnosis.

## Backend Setup

The backend lives in `backend/`.

### Requirements

- `uv`
- PostgreSQL
- Redis recommended; required for production-like auth behavior

### Setup

```bash
cd backend
uv sync --all-groups --frozen
cp .env.dev.example .env.dev
cd ..
just deploy-secrets-template dev
cd backend
./scripts/local_setup.sh
just dev
```

The API is available at <http://127.0.0.1:8000>.

- Public API reference: <http://127.0.0.1:4300/api/public/>
- Device API reference: <http://127.0.0.1:4300/api/device/>
- Development/testing-only JSON contracts: <http://127.0.0.1:8000/openapi.json> and <http://127.0.0.1:8000/openapi.admin.json>

### OpenAPI Examples

Keep examples centralized and predictable:

- Domain-specific examples go in `examples.py` (e.g., `backend/app/api/data_collection/examples.py`)
- Cross-domain examples go in `backend/app/api/common/openapi_examples.py`
- Use `*_EXAMPLE` for single payloads, `*_EXAMPLES` for schema lists, `*_OPENAPI_EXAMPLES` for FastAPI named maps
- In routers, pass examples via `openapi_examples=...` parameter
- Update `backend/tests/integration/api/test_openapi_endpoints.py` when changing examples

### Backend Module Structure

Keep modules small, explicit, and domain-shaped:

- One top-level package per domain: `auth`, `background_data`, `data_collection`, `file_storage`, `newsletter`, `plugins/rpi_cam`
- Prefer flat modules first: `crud.py`, `dependencies.py`, `examples.py`, `exceptions.py`, `filters.py`, `models.py`, `schemas.py`
- Use `routers/` only when multiple route files exist; entrypoint goes in `routers/__init__.py`
- Use `models/` only when both ORM models and storage primitives exist; expose public surface at `models/__init__.py`
- Use `services/` and `utils/` only when they reflect a real boundary; delete pass-through layers when simple enough to call directly
- Keep shared behavior in `backend/app/api/common/`
- Use SQLAlchemy expressions and bind parameters for database input; allowlist dynamic identifiers or sort tokens; never pass request-controlled data to shell commands.

### Backend Test Architecture

Keep the backend suite organized by execution cost first, then by feature:

- `backend/tests/unit/`: pure unit tests only, with no database session, testcontainers startup, or real app lifespan
- `backend/tests/integration/db/`: CRUD, ORM, and persistence behavior against the real schema
- `backend/tests/integration/api/`: HTTP endpoint behavior against the ASGI app
- `backend/tests/integration/flows/`: a small set of cross-boundary, multi-step scenarios

Use the backend test commands that match those tiers:

```bash
cd backend
just test-unit
just test-integration-db
just test-api
just test-flows
just test-ci
```

Fixture conventions should stay explicit and descriptive:

- `db_session` for database access
- `db_user` and `db_superuser` for persisted auth principals
- `api_client`, `api_client_user`, and `api_client_superuser` for HTTP tests
- `redis_client` or feature-local Redis fixtures where applicable

Do not add or reintroduce `session` or `superuser` as in-repo fixture aliases. Use the canonical `db_session` and `db_superuser` names directly.

Do not add compatibility-only test coverage for fixture aliases, re-export modules, or pass-through wrappers unless they protect a deliberate stable external contract. Prefer testing behavior at the canonical fixture or module surface.

Keep fixtures close to the tests that use them when the reuse is local. Reserve `backend/tests/conftest.py` for bootstrap concerns such as testcontainers, test database setup, and global logging behavior. Avoid broad `autouse` fixtures unless they are true cross-suite safety rails.

Keep API tests focused on one behavior per test. Avoid multi-step CRUD journeys in `tests/integration/api/`; move those broader stories to `tests/integration/flows/`.

Path is the primary source of truth for where a test belongs:

- Choose `unit` when the test can run with mocks/stubs only.
- Choose `integration/db` when the behavior depends on SQLAlchemy queries, migrations, or constraints.
- Choose `integration/api` when the behavior is expressed as HTTP requests against the app.
- Choose `flows` only when the value comes from verifying a full multi-step journey.

If a test file starts growing into a mixed “god file”, split it by behavior before adding more cases.

## Frontend Setup

### `app`

```bash
cd app
pnpm install --frozen-lockfile
just dev
```

The Expo dev server runs on <http://localhost:8081>.

If you are using a physical device or a non-default backend URL, create `app/.env.local` and set `EXPO_PUBLIC_API_URL`.

To enable Google OAuth on web, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in your env file to the web client ID from Google Cloud Console. The authorized redirect URI for your environment must also be registered there (e.g. `http://localhost:8013/login` for local dev).

### Regenerating API types

The frontend TypeScript API types are autogenerated from the backend OpenAPI schema and written to `app/src/types/api.generated.ts`.

When working on backend API changes, regenerate the types:

```bash
# from repo root
cd app
pnpm run codegen:api

# regenerate and redact embedded JWT examples (recommended)
pnpm run codegen
```

You can also run `just codegen` inside `app` (after `just install`) which runs the regeneration and redaction steps.

### `www`

```bash
cd www
pnpm install --frozen-lockfile
just dev
```

The Astro dev server runs on <http://127.0.0.1:8081>. Use the numeric loopback
host when developing through VS Code Remote port forwarding; Firefox can be
unreliable with forwarded `localhost` URLs.

## Docs Setup

### Docs Development

```bash
cd docs
pnpm install --frozen-lockfile
just dev
```

The docs site runs on <http://localhost:8000>.

The docs app is the canonical home for public guides, architecture reference, and project context. Keep repo-level setup text in this file short and link back to the docs site when deeper explanation belongs there.

## Development Workflow

If you are new to the repo, start with the architecture docs before making structural changes.

### Pull Requests

1. Create a branch.

   ```bash
   git checkout -b feature/your-change
   ```

1. Make the change.

1. Run the relevant checks.

   ```bash
   just ci
   ```

1. Push your branch and open a PR.

1. Address review feedback.

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <short summary>
```

## CI

The repo uses GitHub Actions for:

- normal CI
- security checks
- release automation

Locally, the important commands are:

- `just ci`
- `just test`
- `just test-integration`
- `just security`

## Backend Development

### Backend Code Style

The backend uses:

- Ruff for linting and formatting
- Ty for static type checking
- ShellCheck for shell scripts

Useful commands from `backend/`:

```bash
just lint
just format
just fix
just typecheck
just shellcheck
just check
```

### Backend Testing

Useful commands from `backend/`:

```bash
just test
just test-unit
just test-integration
just test-cov
```

When adding backend behavior, add tests close to the change. Prefer small unit tests unless the behavior really depends on routing, persistence, or integration boundaries.

### Database Migrations

When changing schema:

1. Create a migration.

   ```bash
   cd backend
   just migrate-create "describe the change"
   ```

1. Review the generated file in `alembic/versions/`.

1. Apply it.

   ```bash
   just migrate
   ```

For Docker-based runs, you can also use `just dev-migrate` from the repo root.

### Email Templates

MJML source templates live in `backend/app/templates/emails/src/`. Compiled HTML lives in `backend/app/templates/emails/build/`.

Do not edit compiled output directly.

To rebuild email templates:

```bash
cd backend
just compile-email
```

## Frontend Development

### Frontend Code Style

- `app` uses Expo linting and TypeScript-based tooling
- `www` uses Biome and Astro validation
- follow the existing folder structure and naming patterns
- prefer consistency with the current UI and component patterns over novelty

### Frontend Testing

For `app`:

```bash
cd app
just test
just test-ci
just check
```

For `www`:

```bash
cd www
just test
just test-ci
just test-e2e
just check
```

When adding a new public-facing page to `www`, add at least one browser test. When adding app behavior in `app`, add Jest coverage for the new logic or screen behavior.

## Docs Development

### Documentation Style

- write plainly
- keep docs informative but simple
- avoid hype, filler, and brittle implementation detail unless it is genuinely needed
- prefer Markdown and Mermaid over custom HTML where possible

Before opening a docs-focused PR:

```bash
cd docs
just check
```

To apply formatting:

```bash
cd docs
just format
```

## License

By contributing, you agree that your contributions are licensed under the project [LICENSE](LICENSE).
