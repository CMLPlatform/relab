# Contributing to RELab

Thanks for contributing. RELab is a research platform developed at CML, Leiden University. The goal of this document is simple: get you productive without making you dig through the repo first.

## Start Here

| I want to...                         | Start here                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| get a working environment quickly    | [Devcontainer Setup](#devcontainer-setup)                                   |
| run the full stack locally in Docker | [Docker Development](#docker-development)                                   |
| work on one subrepo directly         | [Local Development](#local-development)                                     |
| understand the system first          | [docs.cml-relab.org/architecture](https://docs.cml-relab.org/architecture/) |

## Code of Conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Devcontainer Setup

This is the quickest way into the repo if you use VS Code.

### Requirements

- [VS Code](https://code.visualstudio.com/)
- [Docker Desktop](https://docs.docker.com/get-docker/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### First-Time Setup

1. Clone the repository.

1. Install hooks.

   ```bash
   just pre-commit-install
   ```

1. Create the environment files.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   cp .env.example .env
   ```

1. Fill in the required values in `backend/.env.dev` and `.env`.

1. Reopen the repo in a dev container.

### Available Configurations

| Configuration     | Purpose                |
| ----------------- | ---------------------- |
| `relab-backend`   | backend development    |
| `relab-frontend`  | frontend development   |
| `relab-docs`      | docs development       |
| `relab-fullstack` | full stack development |

### Forwarded Ports

- Platform: <http://127.0.0.1:8010>
- Backend: <http://127.0.0.1:8011>
- Docs: <http://127.0.0.1:8012>
- App frontend: <http://127.0.0.1:8013>
- PostgreSQL: `5432`
- Redis: `6379`

## Docker Development

Use this when you want the full stack without configuring each subrepo manually.

1. Create the backend environment file.

   ```bash
   cp backend/.env.dev.example backend/.env.dev
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

### Useful Commands

```bash
just dev-up       # start without file watching
just dev-build    # rebuild images
just dev-logs     # tail logs
just dev-down     # stop containers
just dev-reset    # wipe dev volumes and containers
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
just pre-commit-install
```

## Task Runner

The repo uses [`just`](https://just.systems) as the common task runner.

From the repo root:

```bash
just setup
just check
just test
just test-ci
just ci
```

Use `just --list` in any directory to see what is available there.

## Backend Setup

The backend lives in `backend/`.

### Requirements

- `uv`
- PostgreSQL
- Redis recommended; required for production-like auth behavior

### Setup

```bash
cd backend
uv sync --all-groups
cp .env.dev.example .env.dev
./scripts/local_setup.sh
just dev
```

The API is available at <http://127.0.0.1:8000>.

- Public docs: <http://127.0.0.1:8000/docs>
- Full docs: <http://127.0.0.1:8000/docs/full> after authenticating as a superuser

## Frontend Setup

### `frontend-app`

```bash
cd frontend-app
npm ci
just dev
```

The Expo dev server runs on <http://localhost:8081>.

If you are using a physical device or a non-default backend URL, create `frontend-app/.env.local` and set `EXPO_PUBLIC_API_URL`.

To enable Google OAuth on web, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in your env file to the web client ID from Google Cloud Console. The authorized redirect URI for your environment must also be registered there (e.g. `http://localhost:8013/login` for local dev).

### `frontend-web`

```bash
cd frontend-web
npm ci
just dev
```

The Astro dev server runs on <http://localhost:8081>.

## Docs Setup

### Docs Development

```bash
cd docs
uv sync --all-groups
just dev
```

The docs site runs on <http://localhost:8000>.

## Development Workflow

If you are new to the repo, start with the architecture docs before making structural changes.

### Pull Requests

1. Create a branch.

   ```bash
   git checkout -b feature/your-change
   ```

1. Make the change.

1. Run the relevant checks.

1. Push your branch and open a PR.

1. Address review feedback.

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <short summary>
```

If you want help generating one:

```bash
just commit
```

## CI

The repo uses GitHub Actions for:

- normal CI
- security checks
- release automation

Locally, the important commands are:

- `just check`
- `just test`
- `just test-ci`
- `just ci`

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

- `frontend-app` uses Expo linting and TypeScript-based tooling
- `frontend-web` uses Biome and Astro validation
- follow the existing folder structure and naming patterns
- prefer consistency with the current UI and component patterns over novelty

### Frontend Testing

For `frontend-app`:

```bash
cd frontend-app
just test
just test-ci
just check
```

For `frontend-web`:

```bash
cd frontend-web
just test
just test-ci
just test-e2e
just check
```

When adding a new public-facing page to `frontend-web`, add at least one browser test. When adding app behavior in `frontend-app`, add Jest coverage for the new logic or screen behavior.

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
