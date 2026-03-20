# ReLab Monorepo Task Runner
# Run `just --list` to see all available commands

# Default recipe shows help
default:
    @just --list

# ============================================================================
# Setup
# ============================================================================

# Install all workspace dependencies (root + all subrepos)
install:
    uv sync
    just backend/install
    just frontend-web/install
    just frontend-app/install
    just docs/install
    @echo "✓ All dependencies installed"

# Update all workspace dependencies
update:
    uv lock --upgrade
    @echo "✓ Dependencies updated (run 'just install' to sync)"

# Install pre-commit hooks (run once after clone)
pre-commit-install:
    uv run pre-commit install
    @echo "✓ Pre-commit hooks installed"

# ============================================================================
# Quality Checks
# ============================================================================

# Run all quality checks across every subrepo
# - pre-commit: global (gitleaks, markdown, yaml, secrets, shell scripts...)
# - backend: ruff lint/format, ty type check, alembic migration check, shellcheck
# - frontends: biome lint/format + type checks
check:
    uv run pre-commit run --all-files
    @just backend/check
    @just frontend-web/check
    @just frontend-app/check
    @echo "✓ All quality checks passed"

# Auto-fix code issues (backend only — frontends use Biome via their own justfile)
fix:
    @just backend/fix
    @echo "✓ Code fixed"

# Run all pre-commit hooks on all files (useful before big commits)
pre-commit:
    uv run pre-commit run --all-files
    @echo "✓ Pre-commit hooks passed"

# Run shellcheck on all shell scripts in the repo
shellcheck:
    git ls-files '*.sh' | xargs shellcheck -x --source-path=SCRIPTDIR:.
    @echo "✓ Shell scripts linted"

# Update pre-commit hook versions (monthly maintenance)
pre-commit-update:
    uv run pre-commit autoupdate
    @echo "✓ Pre-commit hooks updated"

# ============================================================================
# Testing
# ============================================================================

# Full local test suite across all subrepos (runs check first)
test: check
    @just backend/test-cov
    @just frontend-web/test-cov
    @just frontend-app/test-cov
    @echo "✅ All code + tests passed"

# Full-stack E2E: spin up Docker backend, build Expo web, run Playwright, tear down
# Requires Docker to be running.
test-e2e-full-stack:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'docker compose -p relab_e2e -f compose.e2e.yml down -v --remove-orphans || true' EXIT
    echo "→ Starting backend infrastructure..."
    docker compose -p relab_e2e -f compose.e2e.yml up --build -d --wait --wait-timeout 120
    echo "→ Running database migrations..."
    docker compose -p relab_e2e -f compose.e2e.yml run --rm --profile migrations backend-migrations
    echo "→ Creating E2E superuser..."
    docker compose -p relab_e2e -f compose.e2e.yml exec -T backend python scripts/create_superuser.py
    echo "→ Building Expo web app..."
    just frontend-app/build-web
    echo "→ Running Playwright E2E tests..."
    just frontend-app/test-e2e
    echo "✅ Full-stack E2E tests passed"

# ============================================================================
# Security
# ============================================================================

# Run dependency vulnerability audit across all subrepos
audit:
    @just backend/audit
    @just frontend-app/audit
    @just frontend-web/audit
    @echo "✅ All dependency audits complete"

# ============================================================================
# Docker — Development
# ============================================================================

# Start full dev stack with hot reload (syncs source changes, auto-rebuilds on lockfile changes)
dev:
    docker compose watch

# Start full dev stack without hot reload (uses source snapshot baked into image)
dev-up:
    docker compose up

# Build (or rebuild) dev images
dev-build:
    docker compose build

# Stop and remove dev containers
dev-down:
    docker compose down

# Tail dev logs (all services)
dev-logs:
    docker compose logs -f

# Run database migrations (dev) — required on first start and after schema changes
dev-migrate:
    docker compose --profile migrations up backend-migrations

# Wipe all dev volumes and containers (full clean slate — re-run dev-migrate after this)
dev-reset:
    docker compose down -v

# ============================================================================
# Docker — Production
# ============================================================================

prod_compose := "docker compose -p relab_prod -f compose.yml -f compose.prod.yml"

# Start production stack in the background
prod-up:
    {{ prod_compose }} up -d

# Stop production stack
prod-down:
    {{ prod_compose }} down

# Tail production logs
prod-logs:
    {{ prod_compose }} logs -f

# Run database migrations (prod) — required on first deploy and after schema changes
prod-migrate:
    {{ prod_compose }} --profile migrations up backend-migrations

# Enable automated database + upload backups (prod)
prod-backups-up:
    {{ prod_compose }} --profile backups up -d

# ============================================================================
# Docker — Staging
# ============================================================================

staging_compose := "docker compose -p relab_staging -f compose.yml -f compose.staging.yml"

# Start staging stack in the background
staging-up:
    {{ staging_compose }} up -d

# Stop staging stack
staging-down:
    {{ staging_compose }} down

# Tail staging logs
staging-logs:
    {{ staging_compose }} logs -f

# Run database migrations and seed dummy data (staging)
staging-migrate:
    {{ staging_compose }} --profile migrations up backend-migrations

# ============================================================================
# Docker — CI
# ============================================================================

docker_compose := "docker compose -p relab_ci -f compose.yml -f compose.ci.yml"

# Smoke test: backend + its infrastructure (database, cache)
docker-smoke-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    trap '{{ docker_compose }} down -v --remove-orphans || true' EXIT
    {{ docker_compose }} up --build -d --wait --wait-timeout 120 database cache backend
    echo "✅ Backend smoke test passed"

# Smoke test: frontend-web static server
docker-smoke-frontend-web:
    #!/usr/bin/env bash
    set -euo pipefail
    trap '{{ docker_compose }} down -v --remove-orphans || true' EXIT
    {{ docker_compose }} up --build -d --wait --wait-timeout 60 frontend-web
    echo "✅ Frontend-web smoke test passed"

# Smoke test: frontend-app static server (slow: expo export runs during build)
docker-smoke-frontend-app:
    #!/usr/bin/env bash
    set -euo pipefail
    trap '{{ docker_compose }} down -v --remove-orphans || true' EXIT
    {{ docker_compose }} up --build -d --wait --wait-timeout 300 frontend-app
    echo "✅ Frontend-app smoke test passed"

# Smoke test: docs static server
docker-smoke-docs:
    #!/usr/bin/env bash
    set -euo pipefail
    trap '{{ docker_compose }} down -v --remove-orphans || true' EXIT
    {{ docker_compose }} up --build -d --wait --wait-timeout 60 docs
    echo "✅ Docs smoke test passed"

# Run all smoke tests sequentially (CI runs them in parallel per-service)
docker-smoke-all:
    @just docker-smoke-backend
    @just docker-smoke-frontend-web
    @just docker-smoke-frontend-app
    @just docker-smoke-docs

# ============================================================================
# Maintenance
# ============================================================================

# Clean build artifacts and caches across all subrepos
clean:
    @just backend/clean
    @just frontend-web/clean
    @just frontend-app/clean
    @just docs/clean
    rm -rf .ruff_cache
    @echo "✓ Cleaned caches and build artifacts"
