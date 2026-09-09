# Contributing to Relab

Relab is a research platform developed at CML, Leiden University. This page covers code and
documentation changes. To run or deploy the stack, see
[Install and self-host](https://docs.cml-relab.org/operations/install/).

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

The recommended path if you use VS Code.

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

   Create `backend/.env.dev` only when you need backend-only local overrides such as OAuth, email,
   or bootstrap settings. Runtime secrets live in gitignored files under `secrets/dev/`. Local
   PostgreSQL and Redis run through Docker Compose.

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

Runs the full stack without configuring each subrepo.

1. Create local backend secret files.

   ```bash
   just deploy-secrets-template dev
   ```

   `backend/.env.dev` is optional backend-app-only local configuration. Root `.env` is for deploy
   hosts, and runtime secrets live in `secrets/dev/`. A typical override file only contains
   integration-facing values:

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

1. Start the containerized database and cache.

   ```bash
   just dev-db
   ```

1. Run migrations.

   ```bash
   just dev-migrate
   ```

1. Start the stack with file watching.

   ```bash
   just dev
   ```

### Local Service URLs

The services run on the same URLs as the [forwarded ports](#forwarded-ports) above.

Docker development ports bind to localhost. To test the Expo app from another device over your
LAN, run `just dev` from `app/` instead of using the Docker app service.

### Useful Commands

```bash
just dev-up       # start without file watching
just dev-logs     # tail logs
just dev-down     # stop containers
```

## Local Development

Work on one subrepo without Docker.

### Root Setup

Install:

- [Git](https://git-scm.com/)
- [uv](https://docs.astral.sh/uv/getting-started/installation)
- [just](https://just.systems/man/en/) recommended
- Node.js (version from `.tool-versions`) for the frontend subrepos

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

Every tool version is pinned exactly once, in the file the tool itself reads. CI installs what these
files say, so a bad upstream release is a one-line rollback rather than a mystery. Renovate keeps
them current through the `repo-tooling` group.

| Tool             | Pinned in                    | Read by                            |
| ---------------- | ---------------------------- | ---------------------------------- |
| Node.js          | `.node-version`              | `fnm` locally, CI setup            |
| pnpm             | `package.json` packageManager | Corepack locally, CI setup        |
| Python, uv, just | `.tool-versions`             | CI setup (uv manages Python)       |

Node 25 dropped bundled Corepack, and `.node-version` pins a newer one, so a fresh install has
no `pnpm` on PATH: `corepack enable` under that Node fails too. Install pnpm standalone
(`curl -fsSL https://get.pnpm.io/install.sh | sh -`) and it reads the pinned `packageManager`
version from `package.json` as usual.

Do not duplicate exact versions in docs unless a manifest or generated file requires it.

Each configuration surface has one job:

- root `justfile`: repo-wide orchestration and cross-project workflows
- subrepo `justfile`: local commands for one project
- `pyproject.toml`: Python dependencies and Python tool configuration
- `pnpm-workspace.yaml`: JavaScript workspace membership, package-manager policy, and shared tooling
  catalogs
- `package.json`: JavaScript package dependencies and script wrappers
- env files: runtime and build-time configuration only
- GitHub workflow YAML: CI/CD wiring; move complex logic to versioned scripts
- `.pre-commit-config.yaml`: git hooks, run by [`prek`](https://github.com/j178/prek) (a drop-in
  replacement for `pre-commit`): secret guard, staged-file fixers (Ruff, rumdl, shfmt), file hygiene,
  lockfile sync, commit message. `just setup` installs them; `just pre-commit` runs them over every
  file
- `scripts/browser_js_policy.py`: the browser JavaScript policy (no raw HTML sinks, no third-party
  runtime scripts) for `app/`, `www/`, and `docs/`; runs in `just check-root`

Three layers, each check in one of them: hooks fix and guard staged files, `just check*` and
`just test*` verify, and CI calls those same recipes plus the GitHub-only scanners (CodeQL, Trivy,
Scorecard, dependency review). Do not add a verification to the hooks; add it to the recipe CI
already runs.

Keep new settings in the smallest surface that needs them. If a change adds or renames env vars,
update the examples, validation rules, and affected docs in the same PR.

## Quality Controls

Run the relevant subrepo checks before opening a pull request:

- backend: unit or integration tests, Ruff, and `ty`
- app: Jest, TypeScript, and lint checks
- www: Vitest, Astro checks, and Playwright where browser behavior changes
- docs: Biome, Astro checks, and `just test-ci` (build + browser + link checks) when content changes

For cross-repo or policy changes, also run `just ci` from the root. The root recipes form one
ladder, cheapest first, each rung including the ones above it:

| Recipe         | What it runs                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `just fix`     | auto-fix lint, formatting, and markdown across root and subrepos            |
| `just check`   | static analysis only: lint, types, format verification                      |
| `just test`    | every test suite except the browser and Docker ones                         |
| `just ci`      | the pull-request gate: `pre-commit` hooks, `check`, `test-ci`, `policy-check` |
| `just ci-full` | everything GitHub Actions runs: `ci` plus `audit`, `cloudflare-check`, `docker-smoke`, `test-e2e` |

`just ci-full` takes tens of minutes and needs Docker. Only CodeQL, Trivy, Scorecard, and dependency
review stay GitHub-only; they scan built images or the repository itself and run on every push.

### Accessibility

Every axe scan uses the same WCAG 2.0-2.2 A/AA rule tags and strips animations for deterministic
runs. `target-size` (2.5.8) is the only 2.2-only rule axe-core ships and it is enforced; 2.4.11 Focus
Not Obscured and 2.4.13 Focus Appearance have no axe rule and are checked by hand.

| Surface | Runtime axe scan                                                                                    | Static lint (every PR)                           |
| ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `www/`  | landing + privacy, contrast checked; ARIA landmark snapshots: `just www/test-e2e`                   | Biome `a11y`                                     |
| `docs/` | homepage + getting-started `<main>`, contrast checked; snapshots: `just docs/test-e2e`              | Biome `a11y`                                     |
| `app/`  | products list + detail on the Expo web build (`color-contrast` off): `just app/test-e2e-full-stack` | Biome `a11y` + `eslint-plugin-react-native-a11y` |

The `www/` and `docs/` axe scans gate every PR that touches `www/`, `docs/`, or shared files. The
`app/` scan needs the full Docker backend, so it runs post-merge or on demand; per PR, the app relies
on `eslint-plugin-react-native-a11y`, which validates RN accessibility props on each lint run. See
[ci.yml](workflows/ci.yml).

A passing run is a floor, not proof of WCAG conformance. The `app/` scan runs against the
react-native-web build, so it does not exercise native VoiceOver/TalkBack. Two `app/` lint rules are
deferred pending a labelling pass (`has-valid-accessibility-descriptors`,
`has-valid-accessibility-ignores-invert-colors`, see `../app/eslint.config.mjs`).

## Security

For changes that touch authentication, authorization, uploads, device flows, admin APIs, secrets, or
personal data, include security context in the pull request and update the relevant docs if behavior
changes. See [SECURITY.md](SECURITY.md) for the reviewer checklist.

Use `just security` for local diagnosis.

CI runs CodeQL once a pull request leaves draft and dependency review on every pull request. The
container image scans (Trivy, blocking) run after merge and on the weekly schedule, not per pull
request: Docker smoke already proves the images build, and base-image advisories move faster than
images rebuild. Run `just security` before marking a pull request ready to get that signal early.

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

`ENVIRONMENT` is required; the backend fails fast if it is unset. `just dev` does not export it, so
set `ENVIRONMENT=dev` in `backend/.env.dev` or export it in your shell before running `just dev`.

The API is available at <http://127.0.0.1:8010>. Use `SEED_DUMMY_DATA=true just dev-migrate` when
you want sample data. Create `backend/.env.dev` only when you need backend-only local overrides such
as OAuth, email, or bootstrap settings.

- Public API reference: <http://127.0.0.1:8012/api/public/>
- Device API reference: <http://127.0.0.1:8012/api/device/>
- Development/testing-only JSON contracts: <http://127.0.0.1:8010/openapi.json> and
  <http://127.0.0.1:8010/openapi.admin.json>

### OpenAPI Examples

Keep examples centralized and predictable:

- Domain-specific examples go in `examples.py` (e.g., `backend/app/api/data_collection/examples.py`)
- Cross-domain examples go in `backend/app/api/common/openapi_examples.py`
- Use `*_EXAMPLE` for single payloads, `*_EXAMPLES` for schema lists, `*_OPENAPI_EXAMPLES` for
  FastAPI named maps
- In routers, pass examples via `openapi_examples=...` parameter
- Update `backend/tests/integration/api/test_openapi_endpoints.py` when changing examples

### Backend Test Architecture

The backend suite is organized by execution cost:

| Tier            | Path                               | When to use                                                             |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| unit            | `backend/tests/unit/`              | pure logic with mocks/stubs only, no database or app lifespan           |
| integration/db  | `backend/tests/integration/db/`    | behavior that depends on SQLAlchemy queries, migrations, or constraints |
| integration/api | `backend/tests/integration/api/`   | HTTP behavior tested against the ASGI app; one behavior per test        |
| flows           | `backend/tests/integration/flows/` | full multi-step cross-boundary scenarios                                |

```bash
cd backend
just test-unit
just test-integration-db
just test-api
just test-flows
just test-ci
```

Standard fixture names: `db_session`, `db_user`, `db_superuser`, `api_client`, `api_client_user`,
`api_client_superuser`, `redis_client`.

## Frontend Setup

### `app`

```bash
cd app
pnpm install --frozen-lockfile
just dev
```

The Expo dev server runs on <http://127.0.0.1:8011>.

If you are using a physical device or a non-default backend URL, create `app/.env.local` and set
`EXPO_PUBLIC_API_URL`.

To enable Google OAuth on web, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in your env file to the web
client ID from Google Cloud Console. The authorized redirect URI for your environment must also be
registered there (e.g. `http://127.0.0.1:8011/login` for local dev).

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

The Astro dev server runs on <http://127.0.0.1:8013>. Use the numeric loopback host through VS Code
Remote port forwarding; Firefox can be unreliable with forwarded `localhost` URLs.

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

1. Push your branch.

1. Open a pull request.

1. Address review feedback.

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <short summary>
```

## Backend Development

For code style, test commands, migration workflow, and email templates, see
[backend/README.md](../backend/README.md).

The chain was flattened once, on 2026-09-08, into the single revision `a9c2e4f60b18`.
Write new revisions on top of it as usual. A future flatten repeats the recipe in
`docs/superpowers/specs/2026-09-08-alembic-flatten-design.md`: keep the head id, prove the
schema with a `pg_dump --schema-only` diff, drop data migrations.

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

When adding a new public-facing page to `www`, add at least one browser test. When adding app
behavior in `app`, add Jest coverage for the new logic or screen behavior.

## Docs Development

### Documentation Style

- write plainly
- avoid hype, filler, and brittle implementation detail
- prefer Markdown and Mermaid over custom HTML

Before opening a docs-focused PR:

```bash
cd docs
just check
```

To apply formatting:

```bash
cd docs
just fix
```

## License

By contributing, you agree that your contributions are licensed under the project
[LICENSE](../LICENSE).
