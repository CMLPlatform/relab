# RELab Monorepo Task Runner
# Run `just --list` to see all available commands
# spell-checker: ignore esac shellfmt shfmt

# Show available recipes
default:
    @just --list

dev_compose := "docker compose -p relab_dev --env-file deploy/env/dev.compose.env -f compose.yaml -f compose.dev.yaml"
ci_compose := "docker compose -p relab_test -f compose.yaml -f compose.ci.yaml"
cloudflare_dir := "infra/cloudflare"

# Subrepos that mirror the root quality / test / audit / clean recipes.
subrepos := "backend docs www app"
# Subset of subrepos that implement test-unit / test-integration.
unit_subrepos := "backend app"

# Deploy overlay operations live in scripts/deploy_ops.sh. The justfile keeps
# stable public recipes while the script owns Compose env-file paths, profiles,
# and validation details.

# ============================================================================
# Setup
# ============================================================================

# Install all workspace dependencies (root + all subrepos)
install:
    #!/usr/bin/env bash
    set -euo pipefail
    uv sync --frozen
    pnpm install
    for d in {{ subrepos }}; do just "$d/install"; done
    echo "✅ All dependencies installed"

# Update all workspace dependencies
update:
    #!/usr/bin/env bash
    set -euo pipefail
    uv lock --upgrade
    pnpm update -D
    pnpm dedupe
    for d in {{ subrepos }}; do just "$d/update"; done
    echo "✅ Dependencies updated (run 'just install' to sync)"

# Install pre-commit hooks (run once after clone)
_pre-commit-install:
    uv run pre-commit install
    @echo "✅ Pre-commit hooks installed"

# Create a conventional commit message interactively
_commit:
    uv run cz commit

# Bootstrap a full local development environment
setup: install _pre-commit-install
    @echo "✅ Development environment ready"

# ============================================================================
# Quality Checks
# ============================================================================

# Run repository-wide policy checks
pre-commit:
    uv run pre-commit run --all-files
    @echo "✅ Repository policy checks passed"

# Run cached full-repo spell checking
spellcheck:
    pnpm run spellcheck
    @echo "✅ Full-repo spell check passed"

# Lint all tracked shell scripts with the pre-commit-managed ShellCheck hook
shellcheck:
    uv run pre-commit run shellcheck --files $(git ls-files '*.sh')
    @echo "✅ Repository shell scripts passed ShellCheck"

# Format all tracked shell scripts with the pre-commit-managed shfmt hook
shellfmt:
    uv run pre-commit run shfmt --files $(git ls-files '*.sh')
    @echo "✅ Repository shell scripts formatted"

# Run root and subrepo lint checks
lint:
    #!/usr/bin/env bash
    set -euo pipefail
    uv run ruff check --config pyproject.toml .
    pnpm run lint
    for d in {{ subrepos }}; do just "$d/lint"; done
    echo "✅ Root and subrepo lint passed"

# Run root and subrepo quality checks (lint + typecheck + format verification).
# Policy checks (spellcheck, shellcheck, file-format) live in `just pre-commit`, not here.
check:
    #!/usr/bin/env bash
    set -euo pipefail
    uv run ruff check --config pyproject.toml .
    uv run ruff format --check --config pyproject.toml .
    uv run ty check
    pnpm run check
    for d in {{ subrepos }}; do just "$d/check"; done
    echo "✅ Root and subrepo checks passed"

# Format root and subrepo codebases
format:
    #!/usr/bin/env bash
    set -euo pipefail
    uv run ruff format --config pyproject.toml .
    just shellfmt
    pnpm run format
    for d in {{ subrepos }}; do just "$d/format"; done
    echo "✅ Root and subrepo formatting complete"

# Auto-fix lint issues and format code across root and subrepos
fix:
    #!/usr/bin/env bash
    set -euo pipefail
    uv run ruff check --fix --config pyproject.toml .
    uv run ruff format --config pyproject.toml .
    just shellfmt
    pnpm run fix
    for d in {{ subrepos }}; do just "$d/fix"; done
    echo "✅ Code fixed"

# ============================================================================
# Testing
# ============================================================================

# Full local test suite across all subrepos (unit + integration, no e2e)
test:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ subrepos }}; do just "$d/test"; done
    echo "✅ All tests passed"

# Run unit tests across subrepos that implement them
test-unit:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ unit_subrepos }}; do just "$d/test-unit"; done
    echo "✅ All unit tests passed"

# Run integration tests across subrepos that implement them
test-integration:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ unit_subrepos }}; do just "$d/test-integration"; done
    echo "✅ All integration tests passed"

# CI-oriented test suite across all subrepos
test-ci:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ subrepos }}; do just "$d/test-ci"; done
    echo "✅ All CI test suites passed"

# Run end-to-end tests across subrepos that implement them
test-e2e:
    @just www/build
    @just www/test-e2e
    @just docs/build
    @just docs/test-e2e
    @just test-e2e-full-stack
    @echo "✅ All E2E tests passed"

# Canonical CI pipeline: policy, IaC, quality checks, CI tests, compose validation
ci: pre-commit cloudflare-check check test-ci env-policy-check compose-config deploy-secrets-check
    @echo "✅ CI pipeline passed"

# Start E2E backend infrastructure (database, cache, backend) and wait for readiness
_e2e-backend-up:
    docker compose -p relab_e2e -f compose.e2e.yaml up --build -d --wait --wait-timeout 120

# Tear down E2E backend infrastructure and remove volumes
_e2e-backend-down:
    docker compose -p relab_e2e -f compose.e2e.yaml down -v --remove-orphans

# Full-stack E2E: spin up Docker backend, build Expo web, run Playwright, tear down (requires Docker)
# MODE=cross-browser runs the full browser matrix instead of the default chromium project
test-e2e-full-stack MODE="default":
    #!/usr/bin/env bash
    set -euo pipefail
    mode={{ quote(MODE) }}
    case "$mode" in
      default)       e2e_recipe="test-e2e" ;;
      cross-browser) e2e_recipe="test-e2e-cross-browser" ;;
      *) echo "MODE must be 'default' or 'cross-browser'"; exit 1 ;;
    esac
    trap 'just _e2e-backend-down || true' EXIT
    echo "→ Starting backend infrastructure..."
    just _e2e-backend-up
    echo "→ Building Expo web app..."
    just app/build-web
    echo "→ Running Playwright E2E tests ($mode)..."
    just "app/$e2e_recipe"
    echo "✅ Full-stack E2E tests passed ($mode)"

# ============================================================================
# Security
# ============================================================================

# Run dependency vulnerability audit for root Python tooling
audit-root:
    uv audit --preview-features audit --frozen
    @echo "✅ Root dependency audit complete"

# Run dependency vulnerability audit across root and all subrepos
audit: audit-root
    #!/usr/bin/env bash
    set -euo pipefail
    just backend/audit all
    for d in docs www app; do just "$d/audit"; done
    echo "✅ Root and subrepo dependency audits complete"

# Canonical security target
security: audit
    @echo "✅ Security checks complete"

# Format Cloudflare OpenTofu files
cloudflare-fmt:
    tofu -chdir={{ cloudflare_dir }} fmt

# Validate Cloudflare OpenTofu configuration without configuring a state backend
cloudflare-check:
    tofu -chdir={{ cloudflare_dir }} fmt -check
    tofu -chdir={{ cloudflare_dir }} init -backend=false
    tofu -chdir={{ cloudflare_dir }} validate

# Plan Cloudflare edge changes for one environment (prod or staging)
cloudflare-plan env:
    @just _require-cloudflare-env {{ quote(env) }}
    @just _require-cloudflare-vars
    tofu -chdir={{ cloudflare_dir }} init
    tofu -chdir={{ cloudflare_dir }} workspace select {{ quote(env) }} || tofu -chdir={{ cloudflare_dir }} workspace new {{ quote(env) }}
    tofu -chdir={{ cloudflare_dir }} plan -input=false -var="environment={{ env }}"

# Apply Cloudflare edge changes for one environment (prod or staging)
cloudflare-apply env confirm='':
    @just _require-cloudflare-env {{ quote(env) }}
    @just _require-cloudflare-vars
    @just _require-confirm "apply Cloudflare edge changes for {{ env }}" "just cloudflare-apply {{ env }} YES" "FORCE=1 just cloudflare-apply {{ env }}" {{ quote(confirm) }}
    tofu -chdir={{ cloudflare_dir }} init
    tofu -chdir={{ cloudflare_dir }} workspace select {{ quote(env) }} || tofu -chdir={{ cloudflare_dir }} workspace new {{ quote(env) }}
    tofu -chdir={{ cloudflare_dir }} apply -auto-approve -input=false -var="environment={{ env }}"

_require-cloudflare-env env:
    #!/usr/bin/env bash
    set -euo pipefail
    env={{ quote(env) }}
    case "$env" in
      prod|staging) exit 0 ;;
      *) echo "env must be 'prod' or 'staging'"; exit 1 ;;
    esac

_require-cloudflare-vars:
    #!/usr/bin/env bash
    set -euo pipefail
    missing=()
    [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || missing+=("CLOUDFLARE_API_TOKEN")
    [ -n "${TF_VAR_cloudflare_account_id:-}" ] || missing+=("TF_VAR_cloudflare_account_id")
    [ -n "${TF_VAR_cloudflare_zone_id:-}" ] || missing+=("TF_VAR_cloudflare_zone_id")
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Missing Cloudflare/OpenTofu environment variables:" >&2
        printf '  - %s\n' "${missing[@]}" >&2
        exit 1
    fi

# Validate every supported Compose stack shape
compose-config:
    @bash scripts/deploy_ops.sh compose-config

# Validate root-owned environment variable policy
env-policy-check:
    @uv run python scripts/env_policy.py check

# Validate rendered deploy secret file paths
deploy-secrets-check:
    @bash scripts/deploy_ops.sh deploy-secrets-check

# Create missing secret files for an environment (dev, prod, or staging)
deploy-secrets-template env:
    @bash scripts/deploy_ops.sh deploy-secrets-template {{ quote(env) }}

# ============================================================================
# Docker: Targeted Development (subset of services with hot reload)
# ============================================================================


# Start only the development database and cache infrastructure and wait for readiness
_dev-db:
    {{ dev_compose }} up -d --wait postgres redis

# Start backend + its infrastructure (database, cache) with hot reload
_dev-backend:
    {{ dev_compose }} up --watch api

# Start docs server with hot reload
_dev-docs:
    {{ dev_compose }} up --watch docs

# Start app + backend with hot reload
_dev-app:
    {{ dev_compose }} up --watch api app

# Start www + backend with hot reload
_dev-www:
    {{ dev_compose }} up --watch api www

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
_dev-build:
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
_dev-reset confirm='':
    @just _require-confirm "wipe the development Docker environment" "just _dev-reset YES" "FORCE=1 just _dev-reset" {{ quote(confirm) }}
    {{ dev_compose }} --profile migrations down -v

# ============================================================================
# Docker: Deploy stacks (prod + staging)
# ============================================================================

# ============================================================================
# Docker: Production
# ============================================================================

# Start production stack (optional profiles: backups, migrations)
prod-up *PROFILES:
    @bash scripts/deploy_ops.sh stack prod up {{ PROFILES }}

# Stop production stack (optional profiles: backups, migrations)
prod-down *PROFILES:
    @bash scripts/deploy_ops.sh stack prod down {{ PROFILES }}

# Build (or rebuild) prod images (set NO_CACHE=1 for no-cache build; optional profiles: backups, migrations)
prod-build *PROFILES:
    @bash scripts/deploy_ops.sh stack prod build {{ PROFILES }}

# Tail production logs
prod-logs:
    @bash scripts/deploy_ops.sh stack prod logs

# Run database migrations (prod); required on first deploy and after schema changes
prod-migrate confirm='':
    @bash scripts/deploy_ops.sh stack prod migrate {{ quote(confirm) }}

# ============================================================================
# Docker: Staging
# ============================================================================

# Start staging stack (optional profiles: backups, migrations)
staging-up *PROFILES:
    @bash scripts/deploy_ops.sh stack staging up {{ PROFILES }}

# Stop staging stack (optional profiles: backups, migrations)
staging-down *PROFILES:
    @bash scripts/deploy_ops.sh stack staging down {{ PROFILES }}

# Build (or rebuild) staging images (set NO_CACHE=1 for no-cache build; optional profiles: backups, migrations)
staging-build *PROFILES:
    @bash scripts/deploy_ops.sh stack staging build {{ PROFILES }}

# Tail staging logs
staging-logs:
    @bash scripts/deploy_ops.sh stack staging logs

# Run database migrations and seed dummy data (staging)
staging-migrate confirm='':
    @bash scripts/deploy_ops.sh stack staging migrate {{ quote(confirm) }}

# ============================================================================
# Docker: Test / CI
# ============================================================================

### Smoke tests for test Docker images and orchestration ---

# Internal helper: require explicit confirmation for state-changing commands.
_require-confirm action example force_example confirm='':
    #!/usr/bin/env bash
    set -euo pipefail
    action={{ quote(action) }}
    example={{ quote(example) }}
    force_example={{ quote(force_example) }}
    confirm={{ quote(confirm) }}
    if [ "$confirm" = "YES" ] || [ "${FORCE:-}" = "1" ] || [ "${FORCE:-}" = "true" ] || [ "${FORCE:-}" = "YES" ]; then
        exit 0
    fi
    echo "Refusing to $action without explicit confirmation."
    echo "Use '$example' or '$force_example'."
    exit 1

# Internal helper: bring up a CI compose subset and wait for readiness.
_docker-smoke-up services timeout:
    {{ ci_compose }} up --build -d --wait --wait-timeout {{ quote(timeout) }} {{ services }}

# Internal helper: tear down a CI compose subset and its anonymous resources.
_docker-smoke-down services:
    {{ ci_compose }} down -v --remove-orphans {{ services }} || true

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
    trap 'just _docker-smoke-down docs' EXIT
    just _docker-smoke-up docs 60
    echo "✅ Docs smoke test passed"

# Smoke test: www static server
docker-smoke-www:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down www' EXIT
    just _docker-smoke-up www 60
    echo "✅ www smoke test passed"

# Smoke test: app static server (slow: expo export runs during build)
docker-smoke-app:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down app' EXIT
    just _docker-smoke-up app 300
    echo "✅ App smoke test passed"

# Smoke test: restic backup image can create encrypted DB, uploads, and offsite-copy snapshots
docker-smoke-backups:
    @bash scripts/backup_restic_ops.sh docker-smoke-backups

# Copy the local restic repository to an optional offsite repository, such as rclone:<remote>:relab/staging/restic
backup-offsite-copy env='staging':
    @bash scripts/backup_restic_ops.sh backup-offsite-copy {{ quote(env) }}

# Restore the latest restic PostgreSQL dump into a disposable Postgres container
backup-restore-smoke env='prod':
    @bash scripts/backup_restic_ops.sh backup-restore-smoke {{ quote(env) }}

# Smoke test: compose-level backend orchestration (service wiring + migrations)
docker-orchestration-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down "postgres redis api migrator"' EXIT
    just _docker-smoke-up "postgres redis api migrator" 120
    {{ ci_compose }} exec -T api python -c 'import json; from urllib.request import urlopen; resp = urlopen("http://localhost:8000/health", timeout=5); data = json.load(resp); assert resp.status == 200, resp.status; assert data["status"] == "healthy", data; assert data["checks"]["database"]["status"] == "healthy", data; assert data["checks"]["redis"]["status"] == "healthy", data' >/dev/null
    echo "✅ Docker orchestration smoke test passed"

# Run all Docker smoke tests sequentially (CI runs them in parallel per-service)
docker-smoke:
    @just docker-smoke-backend
    @just docker-smoke-docs
    @just docker-smoke-www
    @just docker-smoke-app
    @just docker-smoke-backups
    @just docker-orchestration-smoke

### CI test helpers for backend performance regression testing ---

# Build (or rebuild) CI images without cache
_docker-ci-build:
    {{ ci_compose }} --profile migrations build --no-cache

# Start CI services and wait for readiness
_docker-ci-up services="postgres redis api":
    {{ ci_compose }} up --build -d --wait --wait-timeout 120 {{ services }}

# Start the CI backend subset (database, cache, backend) and wait for readiness
_docker-ci-backend-up:
    @just _docker-ci-up "postgres redis api"

# Run CI migrations and seed dummy data for repeatable backend perf tests
_docker-ci-migrate-dummy:
    {{ ci_compose }} run --rm -e SEED_DUMMY_DATA=true migrator

# Stop the CI stack and remove volumes
docker-ci-down confirm='':
    @just _require-confirm "stop and wipe the CI Docker environment" "just docker-ci-down YES" "FORCE=1 just docker-ci-down" {{ quote(confirm) }}
    {{ ci_compose }} --profile migrations down -v --remove-orphans

# Run the backend k6 baseline against the CI Docker stack.
# Keeps the CI stack running for maintainer follow-up if needed.
docker-ci-perf-baseline:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "→ Starting CI backend stack..."
    just _docker-ci-backend-up
    echo "→ Running CI database migrations and seeding dummy data..."
    just _docker-ci-migrate-dummy
    echo "→ Running backend k6 baseline against the CI stack..."
    just backend/_perf-ci

# Write a dated CI baseline report from the latest backend k6 summary export
_docker-ci-perf-report DATE="":
    just backend/_perf-report-ci {{ quote(DATE) }}

# Recalibrate backend perf thresholds from the latest CI baseline summary export
_docker-ci-perf-thresholds HEADROOM="1.15":
    just backend/_perf-thresholds-apply {{ quote(HEADROOM) }}

# ============================================================================
# Maintenance
# ============================================================================

# Clean build artifacts and caches across all subrepos
clean:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ subrepos }}; do just "$d/clean"; done
    rm -rf .ruff_cache
    echo "✅ Cleaned caches and build artifacts"

# Print a static-output size budget for a built directory (e.g. docs/dist, www/dist)
size DIR:
    du -sh {{ quote(DIR) }}
    find {{ quote(DIR) }} -type f | sort | xargs du -h
