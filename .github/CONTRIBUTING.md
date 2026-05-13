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

1. Create local backend secret files.

   ```bash
   just deploy-secrets-template dev
   ```

   Create `backend/.env.dev` only when you need backend-only local overrides such as OAuth, email, or bootstrap settings. Runtime secrets live in gitignored files under `secrets/dev/`. Local PostgreSQL and Redis run through Docker Compose.

1. Reopen the repo in the `relab-fullstack` devcontainer.

1. Run the standard bootstrap path.

   ```bash
   just setup
   just dev-db
   just dev-migrate
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

- API: <http://127.0.0.1:8010>
- App frontend: <http://127.0.0.1:8011>
- Docs: <http://127.0.0.1:8012>
- Landing site: <http://127.0.0.1:8013>
- PostgreSQL: `5432`
- Redis: `6379`

## Docker Development

Use this when you want the full stack without configuring each subrepo manually.

1. Create local backend secret files.

   ```bash
   just deploy-secrets-template dev
   ```

   `backend/.env.dev` is optional backend-app-only local configuration. Root `.env` is for deploy hosts, and runtime secrets live in `secrets/dev/`.
   A typical override file only contains integration-facing values:

   ```text
   GOOGLE_OAUTH_CLIENT_ID=google-oauth-client-id
   GITHUB_OAUTH_CLIENT_ID=github-oauth-client-id
   EMAIL_PROVIDER=smtp
   SMTP_HOST=smtp.example.com
   SMTP_USERNAME=you@example.com
   EMAIL_FROM=Your Name <you@example.com>
   EMAIL_REPLY_TO=you@example.com
   BOOTSTRAP_SUPERUSER_EMAIL=you@example.com
   ```

1. Install local tooling.

   ```bash
   just setup
   ```

1. Start the containerized database/cache and run migrations.

   ```bash
   just dev-db
   just dev-migrate
   ```

1. Start the stack with file watching.

   ```bash
   just dev
   ```

### Local Service URLs

- API: <http://127.0.0.1:8010>
- App frontend: <http://127.0.0.1:8011>
- Docs: <http://127.0.0.1:8012>
- Landing site: <http://127.0.0.1:8013>

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
- `pnpm-workspace.yaml`: JavaScript workspace membership, package-manager policy, and shared tooling catalogs
- `package.json`: JavaScript package dependencies and script wrappers
- env files: runtime and build-time configuration only
- GitHub workflow YAML: CI/CD wiring; move complex logic to versioned scripts

Keep new settings in the smallest surface that actually needs them. If a change adds or renames env vars, update the examples, validation rules, and affected docs in the same PR.

## Quality Controls

Run the relevant subrepo checks before opening a pull request:

- backend: unit or integration tests, Ruff, and `ty`
- app: Jest, TypeScript, and lint checks
- www: Vitest, Astro checks, and Playwright where browser behavior changes
- docs: formatting, spelling, and build smoke check

For cross-repo or policy changes, also run `just ci` from the root. GitHub Actions covers dependency review, container scanning, repository hygiene, and release artifact checks on every push.

## Security

For changes that touch authentication, authorization, uploads, device flows, admin APIs, secrets, or personal data, include security context in the pull request and update the relevant docs if behavior changes. See [SECURITY.md](SECURITY.md) for the reviewer checklist.

Use `just security` for local diagnosis.

## Backend Setup

The backend lives in `backend/`.

### Requirements

- `uv`
- Docker Compose for local PostgreSQL and Redis

### Setup

```bash
cd backend
uv sync --all-groups --frozen
cd ..
just deploy-secrets-template dev
just dev-db
just dev-migrate
cd backend
just dev
```

The API is available at <http://127.0.0.1:8010>.
Use `SEED_DUMMY_DATA=true just dev-migrate` when you want sample data.
Create `backend/.env.dev` only when you need backend-only local overrides such as OAuth, email, or bootstrap settings.

- Public API reference: <http://127.0.0.1:8012/api/public/>
- Device API reference: <http://127.0.0.1:8012/api/device/>
- Development/testing-only JSON contracts: <http://127.0.0.1:8010/openapi.json> and <http://127.0.0.1:8010/openapi.admin.json>

### OpenAPI Examples

Keep examples centralized and predictable:

- Domain-specific examples go in `examples.py` (e.g., `backend/app/api/data_collection/examples.py`)
- Cross-domain examples go in `backend/app/api/common/openapi_examples.py`
- Use `*_EXAMPLE` for single payloads, `*_EXAMPLES` for schema lists, `*_OPENAPI_EXAMPLES` for FastAPI named maps
- In routers, pass examples via `openapi_examples=...` parameter
- Update `backend/tests/integration/api/test_openapi_endpoints.py` when changing examples

### Backend Test Architecture

The backend suite is organized by execution cost:

| Tier | Path | When to use |
| ---- | ---- | ----------- |
| unit | `backend/tests/unit/` | pure logic with mocks/stubs only, no database or app lifespan |
| integration/db | `backend/tests/integration/db/` | behavior that depends on SQLAlchemy queries, migrations, or constraints |
| integration/api | `backend/tests/integration/api/` | HTTP behavior tested against the ASGI app; one behavior per test |
| flows | `backend/tests/integration/flows/` | full multi-step cross-boundary scenarios |

```bash
cd backend
just test-unit
just test-integration-db
just test-api
just test-flows
just test-ci
```

Standard fixture names: `db_session`, `db_user`, `db_superuser`, `api_client`, `api_client_user`, `api_client_superuser`, `redis_client`.

## Frontend Setup

### `app`

```bash
cd app
pnpm install --frozen-lockfile
just dev
```

The Expo dev server runs on <http://127.0.0.1:8011>.

If you are using a physical device or a non-default backend URL, create `app/.env.local` and set `EXPO_PUBLIC_API_URL`.

To enable Google OAuth on web, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in your env file to the web client ID from Google Cloud Console. The authorized redirect URI for your environment must also be registered there (e.g. `http://127.0.0.1:8011/login` for local dev).

### Regenerating API types

After backend API changes, regenerate the TypeScript types from the OpenAPI schema:

```bash
cd app
just codegen   # regenerate and redact embedded JWT examples
```

See [app/README.md](../app/README.md) for more options.

### `www`

```bash
cd www
pnpm install --frozen-lockfile
just dev
```

The Astro dev server runs on <http://127.0.0.1:8013>. Use the numeric loopback
host when developing through VS Code Remote port forwarding; Firefox can be
unreliable with forwarded `localhost` URLs.

## Docs Setup

### Docs Development

```bash
cd docs
pnpm install --frozen-lockfile
just dev
```

The docs site runs on <http://127.0.0.1:8012>.

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

## Backend Development

For code style, test commands, migration workflow, and email templates, see [backend/README.md](../backend/README.md).

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
