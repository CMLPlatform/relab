# RELab Monorepo Task Runner
# Run `just --list` to see all available commands

# Show available recipes
default:
    @just --list

dev_compose := "docker compose -p relab_dev -f compose.yml -f compose.dev.yml"
test_compose := "docker compose -p relab_test -f compose.yml -f compose.test.yml"
staging_compose := "docker compose -p relab_staging -f compose.yml -f compose.staging.yml"
prod_compose := "docker compose -p relab_prod -f compose.yml -f compose.prod.yml"

# ============================================================================
# Setup
# ============================================================================

# Install all workspace dependencies (root + all subrepos)
install:
    uv sync --frozen
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
_check-root:
    uv run pre-commit run --all-files
    @just env-audit
    @echo "✓ Repository policy checks passed"

# Canonical fast validation target used locally and in CI
validate: _check-root _test-ci compose-config release-check
    @echo "✅ Validation pipeline passed"

# Auto-fix code issues where supported
fix:
    @just backend/fix
    @just docs/fix
    @just frontend-web/fix
    @just frontend-app/fix
    @echo "✓ Code fixed"

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

# Shared integration-confidence target
test-integration:
    @just backend/test-integration
    @echo "✅ Integration tests passed"

# CI-oriented test suite across all subrepos
_test-ci:
    @just backend/test-ci
    @just docs/check
    @just frontend-web/test-ci
    @just frontend-app/test-ci
    @echo "✅ All CI test suites passed"

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
    @just _audit-root
    @just backend/audit
    @just docs/audit
    @just frontend-app/audit
    @just frontend-web/audit
    @echo "✅ All dependency audits complete"

# Canonical security target
security: audit
    @echo "✅ Security checks complete"

# Run dependency vulnerability audit for root Python tooling
_audit-root:
    uv audit --preview-features audit --frozen --no-dev
    @echo "✓ Root dependency audit complete"

# Validate committed environment templates and runtime version policy
env-audit:
    python3 scripts/check_env_contract.py
    @echo "✓ Environment contract audit passed"

# Check that release automation inputs are internally consistent
release-check:
    python3 scripts/check_release_contract.py

# Validate every supported Compose stack shape
compose-config:
    #!/usr/bin/env bash
    set -euo pipefail
    created_prod_env=false
    created_staging_env=false
    if [[ ! -f backend/.env.prod && -f backend/.env.prod.example ]]; then
        cp backend/.env.prod.example backend/.env.prod
        created_prod_env=true
    fi
    if [[ ! -f backend/.env.staging && -f backend/.env.staging.example ]]; then
        cp backend/.env.staging.example backend/.env.staging
        created_staging_env=true
    fi
    trap '[[ "$created_prod_env" == true ]] && rm -f backend/.env.prod; [[ "$created_staging_env" == true ]] && rm -f backend/.env.staging' EXIT
    {{ dev_compose }} config >/dev/null
    {{ test_compose }} config >/dev/null
    {{ staging_compose }} config >/dev/null
    {{ prod_compose }} config >/dev/null
    docker compose -p relab_e2e -f compose.e2e.yml config >/dev/null
    echo "✓ Compose configurations validated"


# ============================================================================
# Docker: Targeted Development (subset of services with hot reload)
# ============================================================================

# Start backend + its infrastructure (database, cache) with hot reload
dev-backend:
    {{ dev_compose }} up --watch api

# Start docs server with hot reload
dev-docs:
    {{ dev_compose }} up --watch docs-site

# Start frontend-app + backend with hot reload
dev-frontend-app:
    {{ dev_compose }} up --watch api app-site

# Start frontend-web + backend with hot reload
dev-frontend-web:
    {{ dev_compose }} up --watch api web-site

# ============================================================================
# Docker: Development
# ============================================================================

# Start full dev stack with hot reload (syncs source changes, auto-rebuilds on lockfile changes)
dev:
    {{ dev_compose }} up --watch

# Start full dev stack without hot reload (uses source snapshot baked into image)
dev-up:
    {{ dev_compose }} up

# Build (or rebuild) dev images
dev-build:
    {{ dev_compose }} --profile migrations build

# Stop and remove dev containers
dev-down:
    {{ dev_compose }} down

# Tail dev logs (all services)
dev-logs:
    {{ dev_compose }} logs -f

# Run database migrations (dev); required on first start and after schema changes
dev-migrate:
    {{ dev_compose }} --profile migrations up migrator

# Wipe all dev volumes and containers (full clean slate; re-run dev-migrate after this)
dev-reset confirm='':
    @just _require-confirm "wipe the development Docker environment" "just dev-reset YES" "FORCE=1 just dev-reset" "{{ confirm }}"
    {{ dev_compose }} --profile migrations down -v

# ============================================================================
# Docker: Production
# ============================================================================

# Start production stack (optional profiles: telemetry, backups, migrations)
prod-up *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    confirmed=false; flags=""
    for p in {{ PROFILES }}; do
        if [[ "$p" == "YES" ]]; then confirmed=true; else flags+=" --profile $p"; fi
    done
    if [[ "$confirmed" != "true" && "${FORCE:-}" != "1" && "${FORCE:-}" != "true" ]]; then
        echo "Refusing to start the production stack without explicit confirmation."
        echo "Use 'just prod-up YES [profiles...]' or 'FORCE=1 just prod-up [profiles...]'."
        exit 1
    fi
    {{ prod_compose }} $flags up -d

# Build (or rebuild) prod images (optional profiles: telemetry, backups, migrations)
prod-build *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    flags="--profile migrations --profile backups"
    for p in {{ PROFILES }}; do flags+=" --profile $p"; done
    {{ prod_compose }} $flags build

# Stop production stack (optional profiles: telemetry, backups)
prod-down *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    confirmed=false; flags=""
    for p in {{ PROFILES }}; do
        if [[ "$p" == "YES" ]]; then confirmed=true; else flags+=" --profile $p"; fi
    done
    if [[ "$confirmed" != "true" && "${FORCE:-}" != "1" && "${FORCE:-}" != "true" ]]; then
        echo "Refusing to stop the production stack without explicit confirmation."
        echo "Use 'just prod-down YES [profiles...]' or 'FORCE=1 just prod-down [profiles...]'."
        exit 1
    fi
    {{ prod_compose }} $flags down

# Tail production logs
prod-logs:
    {{ prod_compose }} logs -f

# Run database migrations (prod); required on first deploy and after schema changes
prod-migrate confirm='':
    @just _require-confirm "run production database migrations" "just prod-migrate YES" "FORCE=1 just prod-migrate" "{{ confirm }}"
    {{ prod_compose }} --profile migrations up migrator

# Enable automated database + upload backups (prod)
prod-backups-up confirm='':
    @just _require-confirm "start the production backup services" "just prod-backups-up YES" "FORCE=1 just prod-backups-up" "{{ confirm }}"
    {{ prod_compose }} --profile backups up -d

# ============================================================================
# Docker: Staging
# ============================================================================

# Start staging stack (optional profiles: telemetry, migrations)
staging-up *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    confirmed=false; flags=""
    for p in {{ PROFILES }}; do
        if [[ "$p" == "YES" ]]; then confirmed=true; else flags+=" --profile $p"; fi
    done
    if [[ "$confirmed" != "true" && "${FORCE:-}" != "1" && "${FORCE:-}" != "true" ]]; then
        echo "Refusing to start the staging stack without explicit confirmation."
        echo "Use 'just staging-up YES [profiles...]' or 'FORCE=1 just staging-up [profiles...]'."
        exit 1
    fi
    {{ staging_compose }} $flags up -d

# Build (or rebuild) staging images (optional profiles: telemetry, migrations)
staging-build *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    flags="--profile migrations"
    for p in {{ PROFILES }}; do flags+=" --profile $p"; done
    {{ staging_compose }} $flags build

# Stop staging stack (optional profiles: telemetry)
staging-down *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    confirmed=false; flags=""
    for p in {{ PROFILES }}; do
        if [[ "$p" == "YES" ]]; then confirmed=true; else flags+=" --profile $p"; fi
    done
    if [[ "$confirmed" != "true" && "${FORCE:-}" != "1" && "${FORCE:-}" != "true" ]]; then
        echo "Refusing to stop the staging stack without explicit confirmation."
        echo "Use 'just staging-down YES [profiles...]' or 'FORCE=1 just staging-down [profiles...]'."
        exit 1
    fi
    {{ staging_compose }} $flags down

# Tail staging logs
staging-logs:
    {{ staging_compose }} logs -f

# Run database migrations and seed dummy data (staging)
staging-migrate confirm='':
    @just _require-confirm "run staging database migrations" "just staging-migrate YES" "FORCE=1 just staging-migrate" "{{ confirm }}"
    {{ staging_compose }} --profile migrations up migrator

# ============================================================================
# Docker: Test / CI
# ============================================================================

### Smoke tests for test Docker images and orchestration ---

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
    {{ test_compose }} up --build -d --wait --wait-timeout {{ timeout }} {{ services }}

# Internal helper: tear down a CI compose subset and its anonymous resources.
_docker-smoke-down services:
    {{ test_compose }} down -v --remove-orphans {{ services }} || true

# Smoke test: backend + its infrastructure (database, cache)
docker-smoke-backend:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down api' EXIT
    just _docker-smoke-up api 120
    echo "✅ Backend smoke test passed"

# Smoke test: docs static server
docker-smoke-docs:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down docs-site' EXIT
    just _docker-smoke-up docs-site 60
    echo "✅ Docs smoke test passed"

# Smoke test: frontend-web static server
docker-smoke-frontend-web:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down web-site' EXIT
    just _docker-smoke-up web-site 60
    echo "✅ Frontend-web smoke test passed"

# Smoke test: frontend-app static server (slow: expo export runs during build)
docker-smoke-frontend-app:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down app-site' EXIT
    just _docker-smoke-up app-site 300
    echo "✅ Frontend-app smoke test passed"

# Smoke test: user-upload backups image can create a backup archive from a sample uploads tree
docker-smoke-user-upload-backups:
    #!/usr/bin/env bash
    set -euo pipefail
    tmp_root="$(mktemp -d)"
    trap 'rm -rf "$tmp_root"' EXIT
    mkdir -p "$tmp_root/uploads/images" "$tmp_root/uploads/files" "$tmp_root/backups"
    printf 'smoke test image bytes\n' > "$tmp_root/uploads/images/example.txt"
    printf 'smoke test file bytes\n' > "$tmp_root/uploads/files/example.txt"
    docker build -f backend/Dockerfile.user-upload-backups -t relab-user-upload-backups-smoke backend
    docker run --rm \
        -v "$tmp_root/uploads:/data/uploads:ro" \
        -v "$tmp_root/backups:/backups" \
        -e UPLOADS_DIR=/data/uploads \
        -e UPLOADS_BACKUP_DIR=/backups \
        -e BACKUP_KEEP_DAYS=1 \
        -e BACKUP_KEEP_WEEKS=1 \
        -e BACKUP_KEEP_MONTHS=1 \
        -e MAX_TOTAL_GB=1 \
        --entrypoint ./backup_user_uploads.sh \
        relab-user-upload-backups-smoke
    find "$tmp_root/backups" -type f -name 'user_uploads-*.tar.*' | grep -q .
    echo "✅ User-upload backups smoke test passed"

# Smoke test: compose-level backend orchestration (service wiring + migrations)
docker-orchestration-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down "postgres redis api migrator"' EXIT
    just _docker-smoke-up "postgres redis api migrator" 120
    {{ test_compose }} exec -T api python -c 'import json; from urllib.request import urlopen; resp = urlopen("http://localhost:8000/health", timeout=5); data = json.load(resp); assert resp.status == 200, resp.status; assert data["status"] == "healthy", data; assert data["checks"]["database"]["status"] == "healthy", data; assert data["checks"]["redis"]["status"] == "healthy", data' >/dev/null
    echo "✅ Docker orchestration smoke test passed"

# Run all smoke tests sequentially (CI runs them in parallel per-service)
docker-smoke-all:
    @just docker-smoke-backend
    @just docker-smoke-docs
    @just docker-smoke-frontend-web
    @just docker-smoke-frontend-app
    @just docker-smoke-user-upload-backups
    @just docker-orchestration-smoke

# Canonical Docker smoke target
docker-smoke: docker-smoke-all

### CI test helpers for backend performance regression testing ---

# Build (or rebuild) CI images without cache
docker-ci-build:
    {{ test_compose }} --profile migrations build --no-cache

# Start CI services and wait for readiness
docker-ci-up services="postgres redis api":
    {{ test_compose }} up --build -d --wait --wait-timeout 120 {{ services }}

# Start the CI backend subset (database, cache, backend) and wait for readiness
docker-ci-backend-up:
    @just docker-ci-up "postgres redis api"

# Run CI migrations and seed dummy data for repeatable backend perf tests
docker-ci-migrate-dummy:
    {{ test_compose }} run --rm -e SEED_DUMMY_DATA=true migrator

# Stop the CI stack and remove volumes
docker-ci-down confirm='':
    @just _require-confirm "stop and wipe the CI Docker environment" "just docker-ci-down YES" "FORCE=1 just docker-ci-down" "{{ confirm }}"
    {{ test_compose }}  --profile migrations down -v --remove-orphans

# Tail CI stack logs
docker-ci-logs:
    {{ test_compose }} logs -f

# Run the backend k6 baseline against the CI Docker stack.
# Keeps the CI stack running; use `just docker-ci-down YES` when done.
docker-ci-perf-baseline:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "→ Starting CI backend stack..."
    just docker-ci-backend-up
    echo "→ Running CI database migrations and seeding dummy data..."
    just docker-ci-migrate-dummy
    echo "→ Running backend k6 baseline against the CI stack..."
    just backend/perf-ci

# Write a dated CI baseline report from the latest backend k6 summary export
docker-ci-perf-report DATE="":
    just backend/perf-report-ci "{{ DATE }}"

# Recalibrate backend perf thresholds from the latest CI baseline summary export
docker-ci-perf-thresholds HEADROOM="1.15":
    just backend/perf-thresholds-apply "{{ HEADROOM }}"

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
