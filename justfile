# RELab Monorepo Task Runner
# Run `just --list` to see all available commands

# Show available recipes
default:
    @just --list

# ============================================================================
# Setup
# ============================================================================

# Install all workspace dependencies (root + all subrepos)
install:
    uv sync
    @just backend/install
    @just docs/install
    @just frontend-web/install
    @just frontend-app/install
    @echo "✓ All dependencies installed"

# Update all workspace dependencies
update:
    uv lock --upgrade
    @just backend/update
    @just docs/update
    @just frontend-web/update
    @just frontend-app/update
    @echo "✓ Dependencies updated (run 'just install' to sync)"

# Install pre-commit hooks (run once after clone)
pre-commit-install:
    uv run pre-commit install
    @echo "✓ Pre-commit hooks installed"

# Create a conventional commit message interactively
commit:
    uv run cz commit

# Bootstrap a full local development environment
setup: install pre-commit-install
    @echo "✓ Development environment ready"

# ============================================================================
# Quality Checks
# ============================================================================

# Run repository-wide policy checks
check-root:
    uv run pre-commit run --all-files
    @echo "✓ Repository policy checks passed"

# Run all quality checks across every subrepo
check:
    @just check-root
    @just backend/check
    @just docs/check
    @just frontend-web/check
    @just frontend-app/check
    @echo "✓ All quality checks passed"

# Auto-fix code issues where supported
fix:
    @just backend/fix
    @just docs/fix
    @just frontend-web/fix
    @just frontend-app/fix
    @echo "✓ Code fixed"

# Run all pre-commit hooks on all files (useful before big commits)
pre-commit:
    @just check-root

# Run shellcheck on all shell scripts in the repo
shellcheck:
    git ls-files '*.sh' | xargs shellcheck -x --source-path=SCRIPTDIR:.
    @echo "✓ Shell scripts linted"

# Run spell check on all files in the repo
spellcheck:
    npx cspell lint --dot --gitignore .


# ============================================================================
# Testing
# ============================================================================

# Full local test suite across all subrepos
test:
    @just backend/test
    @just docs/test
    @just frontend-web/test
    @just frontend-app/test
    @echo "✅ All tests passed"

# CI-oriented test suite across all subrepos
test-ci:
    @just backend/test-ci
    @just docs/test-ci
    @just frontend-web/test-ci
    @just frontend-app/test-ci
    @echo "✅ All CI test suites passed"

# Full local CI pipeline
ci: check test-ci
    @echo "✅ Local CI pipeline passed"

# Start E2E backend infrastructure (database, cache, backend) and wait for readiness
e2e-backend-up:
    docker compose -p relab_e2e -f compose.e2e.yml up --build -d --wait --wait-timeout 120

# Tear down E2E backend infrastructure and remove volumes
e2e-backend-down:
    docker compose -p relab_e2e -f compose.e2e.yml down -v --remove-orphans

# Full-stack E2E: spin up Docker backend, build Expo web, run Playwright, tear down
# Requires Docker to be running.
test-e2e-full-stack:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just e2e-backend-down || true' EXIT
    echo "→ Starting backend infrastructure..."
    just e2e-backend-up
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
    @just audit-root
    @just backend/audit
    @just docs/audit
    @just frontend-app/audit
    @just frontend-web/audit
    @echo "✅ All dependency audits complete"

# Run dependency vulnerability audit for root Python tooling
audit-root:
    uv audit --preview-features audit --frozen --no-dev
    @echo "✓ Root dependency audit complete"


# ============================================================================
# Docker — Targeted Development (subset of services with hot reload)
# ============================================================================

# Start backend + its infrastructure (database, cache) with hot reload
dev-backend:
    docker compose up --watch backend

# Start docs server with hot reload
dev-docs:
    docker compose up --watch docs

# Start frontend-app + backend with hot reload
dev-frontend-app:
    docker compose up --watch backend frontend-app

# Start frontend-web + backend with hot reload
dev-frontend-web:
    docker compose up --watch backend frontend-web

# ============================================================================
# Docker — Development
# ============================================================================

# Start full dev stack with hot reload (syncs source changes, auto-rebuilds on lockfile changes)
dev:
    docker compose up --watch

# Start full dev stack without hot reload (uses source snapshot baked into image)
dev-up:
    docker compose up

# Build (or rebuild) dev images
dev-build:
    docker compose build --profile migrations

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
dev-reset confirm='':
    @just _require-confirm "wipe the development Docker environment" "just dev-reset YES" "FORCE=1 just dev-reset" "{{ confirm }}"
    docker compose down -v

# ============================================================================
# Docker — Production
# ============================================================================

prod_compose := "docker compose -p relab_prod -f compose.yml -f compose.prod.yml"

# Start production stack in the background
prod-up confirm='':
    @just _require-confirm "start the production stack" "just prod-up YES" "FORCE=1 just prod-up" "{{ confirm }}"
    {{ prod_compose }} up -d

# Build (or rebuild) prod images
prod-build:
    {{ prod_compose }} build --profile migrations --profile backups build

# Stop production stack
prod-down confirm='':
    @just _require-confirm "stop the production stack" "just prod-down YES" "FORCE=1 just prod-down" "{{ confirm }}"
    {{ prod_compose }} down

# Tail production logs
prod-logs:
    {{ prod_compose }} logs -f

# Run database migrations (prod) — required on first deploy and after schema changes
prod-migrate confirm='':
    @just _require-confirm "run production database migrations" "just prod-migrate YES" "FORCE=1 just prod-migrate" "{{ confirm }}"
    {{ prod_compose }} --profile migrations up backend-migrations

# Enable automated database + upload backups (prod)
prod-backups-up confirm='':
    @just _require-confirm "start the production backup services" "just prod-backups-up YES" "FORCE=1 just prod-backups-up" "{{ confirm }}"
    {{ prod_compose }} --profile backups up -d

# ============================================================================
# Docker — Staging
# ============================================================================

staging_compose := "docker compose -p relab_staging -f compose.yml -f compose.staging.yml"

# Start staging stack in the background
staging-up confirm='':
    @just _require-confirm "start the staging stack" "just staging-up YES" "FORCE=1 just staging-up" "{{ confirm }}"
    {{ staging_compose }} up -d

# Build (or rebuild) staging images
staging-build:
    {{ staging_compose }} --profile migrations build

# Stop staging stack
staging-down confirm='':
    @just _require-confirm "stop the staging stack" "just staging-down YES" "FORCE=1 just staging-down" "{{ confirm }}"
    {{ staging_compose }} down

# Tail staging logs
staging-logs:
    {{ staging_compose }} logs -f

# Run database migrations and seed dummy data (staging)
staging-migrate confirm='':
    @just _require-confirm "run staging database migrations" "just staging-migrate YES" "FORCE=1 just staging-migrate" "{{ confirm }}"
    {{ staging_compose }} --profile migrations up backend-migrations

# ============================================================================
# Docker — CI
# ============================================================================

ci_compose := "docker compose -p relab_ci -f compose.yml -f compose.ci.yml"

# Internal helper: require explicit confirmation for state-changing commands.
_require-confirm action example force_example confirm='':
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{ confirm }}" = "YES" ] || [ "${FORCE:-}" = "1" ] || [ "${FORCE:-}" = "true" ] || [ "${FORCE:-}" = "YES" ]; then
        exit 0
    fi
    echo "Refusing to {{ action }} without explicit confirmation."
    echo "Use '{{ example }}' or '{{ force_example }}'."
    exit 1

# Internal helper: bring up a CI compose subset and wait for readiness.
_docker-smoke-up services timeout:
    {{ ci_compose }} up --build -d --wait --wait-timeout {{ timeout }} {{ services }}

# Internal helper: tear down a CI compose subset and its anonymous resources.
_docker-smoke-down services:
    {{ ci_compose }} down -v --remove-orphans {{ services }} || true

# Smoke test: backend + its infrastructure (database, cache)
docker-smoke-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down backend' EXIT
    just _docker-smoke-up backend 120
    echo "✅ Backend smoke test passed"

# Smoke test: docs static server
docker-smoke-docs:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down docs' EXIT
    just _docker-smoke-up docs 60
    echo "✅ Docs smoke test passed"

# Smoke test: frontend-web static server
docker-smoke-frontend-web:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down frontend-web' EXIT
    just _docker-smoke-up frontend-web 60
    echo "✅ Frontend-web smoke test passed"

# Smoke test: frontend-app static server (slow: expo export runs during build)
docker-smoke-frontend-app:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down frontend-app' EXIT
    just _docker-smoke-up frontend-app 300
    echo "✅ Frontend-app smoke test passed"

# Smoke test: compose-level backend orchestration (service wiring + migrations)
docker-orchestration-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down "database cache backend backend-migrations"' EXIT
    just _docker-smoke-up "database cache backend backend-migrations" 120
    {{ ci_compose }} exec -T backend python -c 'import json; from urllib.request import urlopen; resp = urlopen("http://localhost:8000/health", timeout=5); data = json.load(resp); assert resp.status == 200, resp.status; assert data["status"] == "healthy", data; assert data["checks"]["database"]["status"] == "healthy", data; assert data["checks"]["redis"]["status"] == "healthy", data' >/dev/null
    echo "✅ Docker orchestration smoke test passed"

# Run all smoke tests sequentially (CI runs them in parallel per-service)
docker-smoke-all:
    @just docker-smoke-backend
    @just docker-smoke-docs
    @just docker-smoke-frontend-web
    @just docker-smoke-frontend-app
    @just docker-orchestration-smoke

# ============================================================================
# Maintenance
# ============================================================================

# Clean build artifacts and caches across all subrepos
clean:
    @just backend/clean
    @just docs/clean
    @just frontend-web/clean
    @just frontend-app/clean
    rm -rf .ruff_cache
    @echo "✓ Cleaned caches and build artifacts"
