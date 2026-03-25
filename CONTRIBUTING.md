# Contributing to Reverse Engineering Lab

Thank you for your interest in contributing to the Reverse Engineering Lab project! This guide will help you get started with the development process and outline our expectations for contributions.

## Overview

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Recommended: Devcontainer Setup](#recommended-devcontainer-setup)
    - [Initial Setup](#initial-setup)
    - [Using Devcontainers](#using-devcontainers)
  - [Alternative: Docker Compose Watch](#alternative-docker-compose-watch)
  - [Alternative: Local Development Setup](#alternative-local-development-setup)
    - [Root Setup](#root-setup)
    - [Backend Setup](#backend-setup)
    - [Documentation Setup](#documentation-setup)
    - [Frontend Setup](#frontend-setup)
- [Task Runner](#task-runner)
  - [Installation](#installation)
  - [Basic Usage](#basic-usage)
- [Development Workflow](#development-workflow)
  - [Pull Request Process](#pull-request-process)
  - [CI Architecture](#ci-architecture)
  - [Backend Development](#backend-development)
    - [Backend Code Style](#backend-code-style)
    - [Backend Testing](#backend-testing)
    - [Database Migrations](#database-migrations)
    - [Email templates](#email-templates)
  - [Frontend Development](#frontend-development)
    - [Frontend Code Style](#frontend-code-style)
    - [Frontend Testing](#frontend-testing)
  - [Docs Development](#docs-development)
  - [Documentation Style](#documentation-style)
- [License](#license)

## Code of Conduct

By participating in this project, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Getting Started

If you’re new, start with the [Architecture Documentation](https://docs.cml-relab.org/architecture/) for an overview of the project structure.

We recommend using [VS Code Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers) for development, as this provides a consistent, ready-to-code environment for backend, frontend, and docs.

If you prefer, you can also set up your [environment manually](#alternative-local-development-setup).

### Recommended: Devcontainer Setup

#### Initial Setup

1. **Install Prerequisites**

   - [VS Code](https://code.visualstudio.com/)
   - [Docker Desktop](https://docs.docker.com/get-docker/)
   - [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

1. **Clone the Repository Using VS Code**

   - Open VS Code.
   - Press <kbd>F1</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>) to open the Command Palette.
   - Type and select `Git: Clone`.
   - Enter `https://github.com/CMLPlatform/relab` as the repository URL.
   - Choose a local folder for the clone.
   - When prompted, open the cloned repository.

1. **Install linting and formatting tools**

   ```bash
   just pre-commit-install
   ```

1. **Configure Environment Variables**

   - Copy the example environment file for the backend and the root-level `.env` if needed:

     ```bash
     cp backend/.env.dev.example backend/.env.dev
     ```

     ```bash
       cp .env.example .env

     ```

   - Configure the necessary values in `backend/.env.dev` and `.env` (marked with 🔀).

#### Using Devcontainers

1. **Open Dev Container**

   - Open the repository in VS Code.
   - When prompted, click **"Reopen in Container"** in VS Code.
   - Alternatively, open the Command Palette again and select `Dev Containers: Reopen in Container`.

1. **Choose a Configuration**

   - Select a container for your task:

     | Configuration     | Purpose               | Main Service(s) Start Command |
     | ----------------- | --------------------- | ----------------------------- |
     | `relab-backend`   | Backend development   | `fastapi dev`                 |
     | `relab-frontend`  | Frontend development  | `npx expo start --web`        |
     | `relab-docs`      | Documentation         | Zensical server auto-starts   |
     | `relab-fullstack` | Fullstack development | Both servers auto-start       |

1. **Service Ports**
   The following ports are forwarded to your local machine:

   - **Frontend:** [http://127.0.0.1:8010](http://127.0.0.1:8010)
   - **Backend:** [http://127.0.0.1:8011](http://127.0.0.1:8011)
   - **Docs:** [http://127.0.0.1:8012](http://127.0.0.1:8012)
   - **PostgreSQL:** `5432`
   - **Redis:** `6379`

### Alternative: Docker Compose Watch

If you want to run the full stack in Docker with hot reload but without opening VS Code devcontainers, use `docker compose watch`. This is the recommended approach for Docker-based development outside of devcontainers.

**Prerequisites**: [Docker Desktop](https://docs.docker.com/get-docker/)

1. **Configure Environment**

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   ```

   Set up the necessary values in `backend/.env.dev` (marked with 🔀).

1. **Start All Services with Hot Reload**

   ```bash
   just dev                  # or: docker compose watch
   ```

   This starts all services and automatically:

   - **Syncs** source file changes from your host into the running containers (hot reload)
   - **Rebuilds** the affected service image when a lockfile (`package-lock.json`, `uv.lock`) changes and restarts the container with fresh dependencies

1. **Seed the Database** (first run only)

   In a separate terminal:

   ```bash
   just dev-migrate          # or: docker compose --profile migrations up backend-migrations
   ```

1. **Access Your Local Instance**

   - Platform: <http://127.0.0.1:8010>
   - Backend: <http://127.0.0.1:8011>
   - Docs: <http://127.0.0.1:8012>
   - App: <http://127.0.0.1:8013>

**Other useful dev Docker commands:**

```bash
just dev-up                 # Start without hot reload (uses baked-in source snapshot)
just dev-build              # Rebuild images (e.g. after a Dockerfile change)
just dev-logs               # Tail logs from all services
just dev-down               # Stop and remove containers
just dev-reset              # Wipe all volumes for a clean slate (re-run dev-migrate after)
```

### Alternative: Local Development Setup

If you prefer not to use devcontainers, you can set up your environment manually.

You will need to install all dependencies (Python, Node, PostgreSQL, etc.) and run the services yourself.

It is still recommended to use VS Code as your IDE, as we have provided some recommended extensions and settings in the `.vscode` folders.

#### Root Setup

1. **Install Prerequisites**

   - [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
   - [uv](https://docs.astral.sh/uv/getting-started/installation)
   - [just](https://just.systems/man/en/) (optional, but recommended - task runner for common commands)

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. **Install linting and formatting tools**

   ```bash
   just pre-commit-install
   ```

#### Backend Setup

1. **Install Dependencies**

   - [uv](https://docs.astral.sh/uv/getting-started/installation) (should have been installed in the root setup)
   - [PostgreSQL](https://pipenv.pypa.io/en/latest/install/). Make sure PostgreSQL is installed and running.
   - [Redis](https://redis.io/docs/getting-started/installation/) (optional, only needed for caching features)

1. **Install Python Dependencies**

   ```bash
   cd backend  
   uv sync  
   ```

1. **Configure Environment**

   Copy the example environment file:

   ```bash
   cp .env.dev.example .env.dev
   ```

   Configure the necessary values in `.env.dev` (marked with 🔀).

   > 💡 Note: OAuth frontend redirect origin checks reuse the same frontend URL and `CORS_ORIGIN_REGEX` policy as backend CORS. In local dev, the regex can stay permissive for LAN testing; in staging and production it is disabled automatically, so OAuth falls back to the explicit `FRONTEND_WEB_URL` and `FRONTEND_APP_URL` origins.
   >
   > 💡 Note: Make sure to create the PostgreSQL database and user as specified in your `.env.dev` file.

1. **Run Setup Script**
   The [`local_setup.sh`](backend/scripts/local_setup.sh) script creates the database tables, runs the migrations, and sets up initial test data.

   **For Linux/macOS**: `./scripts/local_setup.sh`

   **For Windows**: It is recommended to use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or a Linux VM for development.

1. **Start the Application**

   Run the FastAPI server:

   ```bash
   cd backend
   just dev
   ```

   The API is now available at <http://127.0.0.1:8000>.

   You can log in with the superuser details specified in the `.env.dev` file. This gives you access to the interactive API documentation at <http://127.0.0.1:8000/swagger/full>

#### Documentation Setup

You can use `uv` to manage the documentation dependencies and run the Zensical server.

```bash
cd docs
just dev
```

The documentation is now available at <http://127.0.0.1:8000> with live reload.

#### Frontend Setup

1. **Install Dependencies**

   - [Node.js](https://nodejs.org/en/download/) (LTS version recommended)
   - [Expo](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local) for your target platform (Android/iOS, device/simulator).
     - Select **Development build**, disable **Build with EAS**, and follow the setup steps for your platform.

1. **Install `frontend-app` Packages**

   ```bash
   cd frontend-app
   npm ci
   ```

1. **Start the app**

   ```bash
   just dev
   ```

   This will launch the Expo development server for the web frontend. By default, it opens [http://localhost:8081](http://localhost:8081) in your browser.

   > 💡 Note: You can also use the Expo UI to run the app on a mobile device or emulator, see the [official Expo documentation](https://docs.expo.dev/get-started/set-up-your-environment/?mode=development-build&buildEnv=local) for details.
   >
   > 💡 **Testing on a physical device (Expo Go):** Your phone needs to reach the backend over the network. Create `frontend-app/.env.local` (gitignored) and point the URLs at your machine's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.x.x:8011`. On the backend side, set `CORS_ORIGIN_REGEX` in `backend/.env.dev` to cover your LAN subnet if the default does not already match it. OAuth redirect validation reuses that same dev-only regex, so there is no separate OAuth redirect regex to maintain.

## Task Runner

We use [`just`](https://just.systems) as a task runner for common development tasks (similar to npm scripts or Make). This provides convenient shortcuts for testing, linting, migrations, and more.

### Installation

```bash
cargo install just
```

### Basic Usage

```bash
# List all available commands
just --list

# From root directory
just setup                # Install dependencies + pre-commit hooks
just check                # Run repo policy + all subrepo quality checks
just test                 # Run the local test suite
just test-ci              # Run the CI-oriented test suite locally
just ci                   # Run the same quality + test gates as CI
just commit               # Open Commitizen's interactive commit flow

# From backend directory
cd backend
just test                 # Run all tests
just test-cov             # Run tests with coverage
just lint                 # Ruff lint
just format               # Ruff format
just typecheck            # Ty type checks
just check                # lint + typecheck + migration check
just migrate              # Apply database migrations
just dev                  # Start dev server
```

> 💡 **Tip:** Run `just --list` in any directory to see all available commands with descriptions.

If you prefer not to install `just`, you can always use the underlying commands directly (e.g., `uv run pytest` instead of `just test`).

## Development Workflow

This section explains how to contribute to Reverse Engineering Lab, including proposing changes, submitting pull requests, and following our development guidelines for backend, frontend, and documentation.

If you’re new, start with the [Architecture Documentation](https://docs.cml-relab.org/architecture/) for an overview of the project structure.

### Pull Request Process

1. **Fork and Create a Feature Branch**
   If not already done, [fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) the repository and create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

1. **Make and Commit Changes**

   - Implement your feature or fix, following the code style guidelines in the [Backend](#backend-code-style) and [Frontend](#frontend-code-style) sections below.

   - [Pre-commit](https://pre-commit.com/) hooks enforce fast repository-wide policy checks before each commit, including automatic refreshes of Python and Node lockfiles when dependency manifests change.\
     You can also run the same checks manually:

     ```bash
     just check-root
     ```

     > 💡 Tip: Install the hooks once with `just pre-commit-install` in the project root.

   - Use the [conventional commit](https://www.conventionalcommits.org/en/v1.0.0/) format when committing changes:

     ```bash
     <type>(<scope>): <short summary>
     ```

     > 💡 Tip: You can use `just commit` or `uv run cz commit` to create conventional commits in the correct format. Release PRs, version bumps, tags, and changelog updates are handled by `release-please`, so contributors should not run `cz bump`.

1. **Submit Pull Request**

   - Push to your fork:

     ```bash
     git push origin feature/your-feature-name
     ```

   - Create a pull request against the main repository

   - Provide a clear description and reference related issues

   - Address review feedback

All contributions must pass automated checks and receive approval before merging.

### CI Architecture

The repository uses three GitHub Actions workflows:

1. `CI` for normal quality checks, tests, smoke tests, and E2E coverage.
1. `Security` for CodeQL, secret scanning, and dependency audits.
1. `Release Please` for release PRs, tagging, and version updates.

The workflows are intentionally thin wrappers around the shared `just` command contract:

- `just check` for quality gates
- `just test` for local test runs
- `just test-ci` for CI-style coverage runs
- `just ci` for the full local CI pipeline

Shared setup logic for Python, Node, and Codecov uploads lives in `.github/actions/` so the workflow files stay readable without hiding the actual job behavior.

### Backend Development

Set up your environment as described in the [Getting Started](#getting-started) section.

You can run the development server with:

```bash
cd backend
just dev
```

The API will be available at <http://localhost:8000>, or <http://localhost:8011> when using a devcontainer.

> 💡 **Tip:** See the [Task Runner](#task-runner) section for the shared `install` / `check` / `test` / `ci` command pattern used across the monorepo.

#### Backend Code Style

We follow RESTful API design and the [Google Style Guide](https://google.github.io/styleguide/pyguide.html) for Python code, but use a line length of 120 characters.

We use several tools to ensure code quality:

1. [Ruff](https://docs.astral.sh/ruff/) for linting and code style enforcement (see [`pyproject.toml`](backend/pyproject.toml) for rules):

   ```bash
   uv run ruff check              # or: just lint
   uv run ruff check --fix        # or: just fix
   uv run ruff format             # or: just format
   ```

1. [Ty](https://docs.astral.sh/ty/) for static type checking:

   ```bash
   uv run ty check                # or: just typecheck
   ```

1. [ShellCheck](https://www.shellcheck.net/) for shell script linting:

   ```bash
   just backend/shellcheck        # from the repo root
   just shellcheck                # or from the backend directory
   ```

#### Backend Testing

The project uses pytest for testing:

1. **Running Tests**

   ```bash
   uv run pytest                  # or: just test
   uv run pytest --cov            # or: just test-cov
   uv run pytest -m unit          # or: just test-unit
   ```

1. **Writing Tests**

   - Write unit tests for new functionality
   - Use fixtures for test setup
   - Mock external dependencies

#### Database Migrations

When making changes to the database schema:

1. **Create a Migration**

   ```bash
   uv run alembic revision --autogenerate -m "Description of changes"
   # or: just migrate-create "Description of changes"
   ```

1. **Review the Generated Migration**
   Review the migration file in `alembic/versions/` to ensure it correctly captures your changes.

1. **Apply the Migration**

   - For docker setups, run the migration service:

   ```bash
   docker compose up backend-migrations
   ```

   - For local setups, run:

   ```bash
   uv run alembic upgrade head    # or: just migrate
   ```

#### Email templates

This project uses [MJML](https://mjml.io/) to write email templates and [Jinja2](https://jinja.palletsprojects.com/en/latest/) for variable substitution at runtime.

- **Location**

  - Source MJML templates: `backend/app/templates/emails/src/`
  - Reusable components: `backend/app/templates/emails/src/components/`
  - Compiled HTML output: `backend/app/templates/emails/build/` (This directory is **auto-generated**—do not edit files here.)

- **Editing Guidelines**

  - Use **MJML** for structure and the `{{include:component_name}}` directive to reuse components.
  - Use **Jinja2-style variables** in templates, e.g., `{{ username }}`, `{{ verification_link }}`.
  - Keep components small and shared styles in `src/components/styles.mjml`.
  - **Do not modify** files in `build/`.

- **Compiling Templates**
  Run the compilation script from the repository root:

```bash
cd backend
uv run python -m scripts.compile_email_templates
```

- **Interactive Preview**
  For visual development, use MJML online tools or the [MJML VS Code extension](https://marketplace.visualstudio.com/items?itemName=mjmlio.vscode-mjml).

### Frontend Development

Set up your environment as described in the [Getting Started](#getting-started) section.

You can run the development server with:

```bash
cd frontend-app
just dev
```

The app will be available at <http://localhost:8081>, or <http://localhost:8010> when using a devcontainer.

#### Frontend Code Style

- `frontend-app` uses TypeScript + Expo linting. Run `just check` for the full quality gate and `just format` for safe autofixes.
- `frontend-web` uses Biome for formatting/linting and Astro for project validation. Run `just check` for the full quality gate and `just format` for formatting.
- Use [React Native Paper](https://callstack.github.io/react-native-paper/) components where possible for UI consistency.
- Follow the existing folder structure and naming conventions.

#### Frontend Testing

The two frontend sub-projects use different frameworks for good reasons. Here is a quick reference so you know what to run and where to add tests.

##### frontend-app (React Native / Expo)

| Layer                  | Tool                                   | Location                   |
| ---------------------- | -------------------------------------- | -------------------------- |
| Unit & component tests | Jest + `@testing-library/react-native` | `src/**/__tests__/`        |
| Network mocking        | MSW (`msw/node`)                       | `src/test-utils/server.ts` |
| Shared helpers         | Custom render + API mocks              | `src/test-utils/`          |

**Running tests:**

```bash
cd frontend-app
just test               # run all tests once
npm run test:watch      # watch mode for local development
just test-ci            # CI-oriented run with coverage
just check              # Expo lint + TypeScript checks
```

**Writing tests:**

- Import `renderWithProviders` from `@/test-utils` instead of wrapping manually in `PaperProvider`/`DialogProvider`. Pass `{ withDialog: true }` for screens that use `DialogProvider`.
- Import `mockResponse` and `setupFetchMock` from `@/test-utils` for service-layer unit tests that need to control HTTP responses directly.
- For integration tests that exercise the full component → service → HTTP chain, add handlers to `src/test-utils/server.ts` and use `server.use(...)` to override per test.
- Coverage must stay at or above 80 % (enforced by `jest.config.ts`).

##### frontend-web (Astro)

| Layer         | Tool                              | Location                    |
| ------------- | --------------------------------- | --------------------------- |
| Unit tests    | Vitest                            | `src/**/*.test.ts`          |
| E2E tests     | Playwright (Chromium + Firefox)   | `e2e/`                      |
| Accessibility | axe-core / `@axe-core/playwright` | `e2e/accessibility.spec.ts` |

**Running tests:**

```bash
cd frontend-web
just test               # Vitest unit tests
just test-ci            # unit tests with coverage
just check              # Biome lint + Astro validation
just test-e2e           # Playwright E2E
just test-e2e-ui        # Playwright interactive UI
```

**Writing tests:**

- Unit tests belong in `src/utils/` alongside the code they test (e.g. `url.test.ts` next to `url.ts`). Only TypeScript utility functions need unit tests; `.astro` templates are covered by E2E.
- E2E tests use `page.route()` for API mocking — define route intercepts at the top of each test, not in a global setup, so tests remain self-contained.
- When adding a new public page, add at minimum: one E2E smoke test in a `*.spec.ts` file and one accessibility check in `e2e/accessibility.spec.ts`.
- Unit test coverage threshold is 80 % (enforced by `vitest.config.ts`).

### Docs Development

Set up your environment as described in the [Getting Started](#getting-started) section.

You can run the Zensical server with:

```bash
cd docs
just dev
```

The docs will be available at <http://localhost:8000>, or <http://localhost:8012> when using a devcontainer.

### Documentation Style

- Write docs in clear, concise English and follow the existing tone.
- Prefer [GitHub-flavored Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) and [Mermaid](https://mermaid-js.github.io/) for diagrams.
- Avoid raw HTML unless absolutely necessary.
- Run `cd docs && just check` before opening a docs PR. Use `cd docs && just format` to apply markdown formatting fixes.
- Refer to the [Zensical](https://stefanbschneider.github.io/zensical/) documentation to see available features and best practices.

## License

By contributing to this project, you agree that your contributions will be licensed under the project's [LICENSE](LICENSE).
