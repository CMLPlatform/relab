# RELab Monorepo Task Runner
# Run `just --list` to see all available commands
# spell-checker: ignore esac

# Show available recipes
default:
    @just --list

dev_compose := "docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml"
ci_compose := "docker compose -p relab_test -f compose.yaml -f compose.ci.yaml"

# Subrepos that mirror the root quality / test / audit / clean recipes.
subrepos := "backend docs frontend-web frontend-app"
# Subset of subrepos that implement test-unit / test-integration.
unit_subrepos := "backend frontend-app"

# Deploy overlay — same file for prod and staging. Per-env non-secret config
# lives in committed `.env.<env>.compose`; per-host secrets (TUNNEL_TOKEN, …)
# live in the auto-loaded root `.env` (gitignored). Both `--env-file` flags are
# required because specifying any `--env-file` disables Compose's auto-load.
# `COMPOSE_PROJECT_NAME` is set inside each `.env.<env>.compose`, so laptop-
# driven staging ops no longer need to override the host `.env`.
#
# `_loki_overlay` auto-includes compose.logging.loki.yaml when the host's `.env`
# has a non-empty LOKI_URL. Hosts without Loki get Docker's default log driver.
_loki_overlay := `if [ -f .env ] && grep -qE '^LOKI_URL=[^[:space:]]' .env; then printf -- ' -f compose.logging.loki.yaml'; fi`
prod_compose    := "docker compose --env-file .env --env-file .env.prod.compose    -f compose.yaml -f compose.deploy.yaml" + _loki_overlay
staging_compose := "docker compose --env-file .env --env-file .env.staging.compose -f compose.yaml -f compose.deploy.yaml" + _loki_overlay

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
    echo "✓ All dependencies installed"

# Update all workspace dependencies
update:
    #!/usr/bin/env bash
    set -euo pipefail
    uv lock --upgrade
    pnpm update -D
    pnpm dedupe
    for d in {{ subrepos }}; do just "$d/update"; done
    echo "✓ Dependencies updated (run 'just install' to sync)"

# Install pre-commit hooks (run once after clone)
_pre-commit-install:
    uv run pre-commit install
    @echo "✓ Pre-commit hooks installed"

# Create a conventional commit message interactively
_commit:
    uv run cz commit

# Bootstrap a full local development environment
setup: install _pre-commit-install
    @echo "✓ Development environment ready"

# ============================================================================
# Quality Checks
# ============================================================================

# Run repository-wide policy checks
pre-commit:
    uv run pre-commit run --all-files
    @echo "✓ Repository policy checks passed"

# Run cached full-repo spell checking
spellcheck:
    pnpm run spellcheck
    @echo "✓ Full-repo spell check passed"

# Lint all tracked shell scripts with the pre-commit-managed ShellCheck hook
shellcheck:
    uv run pre-commit run shellcheck --files $(git ls-files '*.sh')
    @echo "✓ Repository shell scripts passed ShellCheck"

# Run root and subrepo lint checks
lint:
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm run lint
    for d in {{ subrepos }}; do just "$d/lint"; done
    echo "✅ Root and subrepo lint passed"

# Run root and subrepo quality checks (lint + typecheck + format verification).
# Policy checks (spellcheck, shellcheck, file-format) live in `just pre-commit`, not here.
check:
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm run check
    for d in {{ subrepos }}; do just "$d/check"; done
    echo "✅ Root and subrepo checks passed"

# Format root and subrepo codebases
format:
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm run format
    for d in {{ subrepos }}; do just "$d/format"; done
    echo "✅ Root and subrepo formatting complete"

# Auto-fix lint issues and format code across root and subrepos
fix:
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm run fix
    for d in {{ subrepos }}; do just "$d/fix"; done
    echo "✓ Code fixed"

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
    @just frontend-web/build
    @just frontend-web/test-e2e
    @just docs/build
    @just docs/test-e2e
    @just test-e2e-full-stack
    @echo "✅ All E2E tests passed"

# Canonical CI pipeline: policy, quality checks, CI tests, compose validation
ci: pre-commit check test-ci compose-config
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
    case "{{ MODE }}" in
      default)       e2e_recipe="test-e2e" ;;
      cross-browser) e2e_recipe="test-e2e-cross-browser" ;;
      *) echo "MODE must be 'default' or 'cross-browser'"; exit 1 ;;
    esac
    trap 'just _e2e-backend-down || true' EXIT
    echo "→ Starting backend infrastructure..."
    just _e2e-backend-up
    echo "→ Building Expo web app..."
    just frontend-app/build-web
    echo "→ Running Playwright E2E tests ({{ MODE }})..."
    just "frontend-app/$e2e_recipe"
    echo "✅ Full-stack E2E tests passed ({{ MODE }})"

# ============================================================================
# Security
# ============================================================================

# Run dependency vulnerability audit for root Python tooling
audit-root:
    uv audit --preview-features audit --frozen
    @echo "✓ Root dependency audit complete"

# Run dependency vulnerability audit across root and all subrepos
audit: audit-root
    #!/usr/bin/env bash
    set -euo pipefail
    just backend/audit all
    for d in docs frontend-web frontend-app; do just "$d/audit"; done
    echo "✅ Root and subrepo dependency audits complete"

# Canonical security target
security: audit
    @echo "✅ Security checks complete"

# Validate every supported Compose stack shape
compose-config:
    #!/usr/bin/env bash
    set -euo pipefail
    created_prod_env=false
    created_staging_env=false
    created_dev_env=false
    created_root_env=false
    if [[ ! -f backend/.env.prod && -f backend/.env.prod.example ]]; then
        cp backend/.env.prod.example backend/.env.prod
        created_prod_env=true
    fi
    if [[ ! -f backend/.env.staging && -f backend/.env.staging.example ]]; then
        cp backend/.env.staging.example backend/.env.staging
        created_staging_env=true
    fi
    if [[ ! -f backend/.env.dev && -f backend/.env.dev.example ]]; then
        cp backend/.env.dev.example backend/.env.dev
        created_dev_env=true
    fi
    # Root .env holds deploy-host secrets (TUNNEL_TOKEN, …). Stub it for
    # validation-only runs (e.g. CI) so `--env-file .env` doesn't error on
    # a missing file. Values are placeholders; real secrets stay on the VM.
    # Stub root .env if absent (e.g. CI) so `--env-file .env` doesn't fail.
    if [[ ! -f .env ]]; then
        : > .env
        created_root_env=true
    fi
    trap '
        [[ "$created_prod_env" == true ]] && rm -f backend/.env.prod
        [[ "$created_staging_env" == true ]] && rm -f backend/.env.staging
        [[ "$created_dev_env" == true ]] && rm -f backend/.env.dev
        [[ "$created_root_env" == true ]] && rm -f .env
    ' EXIT
    # Placeholder secrets for validation-only runs. Real values come from the
    # deploy host's root .env. Shell env fills gaps left by --env-file inputs.
    # LOKI_URL is only consumed when the Loki overlay is included; export
    # a placeholder so the "with-Loki" validation path renders too.
    export TUNNEL_TOKEN="${TUNNEL_TOKEN:-placeholder}"
    export LOKI_URL="${LOKI_URL:-http://placeholder/loki/api/v1/push}"
    {{ dev_compose }} config >/dev/null
    {{ ci_compose }} config >/dev/null
    {{ staging_compose }} config >/dev/null
    {{ prod_compose }} config >/dev/null
    # Exercise the Loki-on path explicitly so CI catches regressions regardless
    # of whether the local .env happens to have LOKI_URL set.
    docker compose --env-file .env --env-file .env.prod.compose    -f compose.yaml -f compose.deploy.yaml -f compose.logging.loki.yaml config >/dev/null
    docker compose --env-file .env --env-file .env.staging.compose -f compose.yaml -f compose.deploy.yaml -f compose.logging.loki.yaml config >/dev/null
    docker compose -p relab_e2e -f compose.e2e.yaml config >/dev/null
    echo "✓ Compose configurations validated"

# ============================================================================
# Docker: Targeted Development (subset of services with hot reload)
# ============================================================================

# Start backend + its infrastructure (database, cache) with hot reload
_dev-backend:
    {{ dev_compose }} up --watch api

# Start docs server with hot reload
_dev-docs:
    {{ dev_compose }} up --watch docs-site

# Start frontend-app + backend with hot reload
_dev-frontend-app:
    {{ dev_compose }} up --watch api app-site

# Start frontend-web + backend with hot reload
_dev-frontend-web:
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
    @just _require-confirm "wipe the development Docker environment" "just _dev-reset YES" "FORCE=1 just _dev-reset" "{{ confirm }}"
    {{ dev_compose }} --profile migrations down -v

# ============================================================================
# Docker: Deploy stacks (prod + staging)
#
# `_stack-up` / `_stack-down` parse YES/profile args and delegate to the
# matching compose command. `_stack-build` takes a default-profiles string and
# respects `NO_CACHE=1` for no-cache builds.
# ============================================================================

# Internal: confirmed start of a deploy stack with optional profiles.
_stack-up STACK COMPOSE *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    confirmed=false; flags=""
    for p in {{ PROFILES }}; do
        if [[ "$p" == "YES" ]]; then confirmed=true; else flags+=" --profile $p"; fi
    done
    if [[ "$confirmed" != "true" && "${FORCE:-}" != "1" && "${FORCE:-}" != "true" ]]; then
        echo "Refusing to start the {{ STACK }} stack without explicit confirmation."
        echo "Use 'just {{ STACK }}-up YES [profiles...]' or 'FORCE=1 just {{ STACK }}-up [profiles...]'."
        exit 1
    fi
    {{ COMPOSE }} $flags up -d

# Internal: confirmed stop of a deploy stack with optional profiles.
_stack-down STACK COMPOSE *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    confirmed=false; flags=""
    for p in {{ PROFILES }}; do
        if [[ "$p" == "YES" ]]; then confirmed=true; else flags+=" --profile $p"; fi
    done
    if [[ "$confirmed" != "true" && "${FORCE:-}" != "1" && "${FORCE:-}" != "true" ]]; then
        echo "Refusing to stop the {{ STACK }} stack without explicit confirmation."
        echo "Use 'just {{ STACK }}-down YES [profiles...]' or 'FORCE=1 just {{ STACK }}-down [profiles...]'."
        exit 1
    fi
    {{ COMPOSE }} $flags down

# Internal: build deploy-stack images. NO_CACHE=1 forces a no-cache build.
_stack-build COMPOSE DEFAULT_PROFILES *PROFILES:
    #!/usr/bin/env bash
    set -euo pipefail
    flags="{{ DEFAULT_PROFILES }}"
    for p in {{ PROFILES }}; do flags+=" --profile $p"; done
    nc=""; [[ "${NO_CACHE:-}" == "1" || "${NO_CACHE:-}" == "true" ]] && nc="--no-cache"
    {{ COMPOSE }} $flags build $nc

# ============================================================================
# Docker: Production
# ============================================================================

# Start production stack (optional profiles: backups, migrations)
prod-up *PROFILES: (_stack-up "prod" prod_compose PROFILES)

# Stop production stack (optional profiles: backups)
prod-down *PROFILES: (_stack-down "prod" prod_compose PROFILES)

# Build (or rebuild) prod images (set NO_CACHE=1 for no-cache build; optional profiles: backups, migrations)
prod-build *PROFILES: (_stack-build prod_compose "--profile migrations --profile backups" PROFILES)

# Tail production logs
prod-logs:
    {{ prod_compose }} logs -f

# Run database migrations (prod); required on first deploy and after schema changes
prod-migrate confirm='':
    @just _require-confirm "run production database migrations" "just prod-migrate YES" "FORCE=1 just prod-migrate" "{{ confirm }}"
    {{ prod_compose }} --profile migrations up migrator

# Enable automated database + upload backups (prod)
_prod-backups-up confirm='':
    @just _require-confirm "start the production backup services" "just _prod-backups-up YES" "FORCE=1 just _prod-backups-up" "{{ confirm }}"
    {{ prod_compose }} --profile backups up -d

# ============================================================================
# Docker: Staging
# ============================================================================

# Start staging stack (optional profiles: migrations)
staging-up *PROFILES: (_stack-up "staging" staging_compose PROFILES)

# Stop staging stack (optional profiles: migrations)
staging-down *PROFILES: (_stack-down "staging" staging_compose PROFILES)

# Build (or rebuild) staging images (set NO_CACHE=1 for no-cache build; optional profiles: migrations)
staging-build *PROFILES: (_stack-build staging_compose "--profile migrations" PROFILES)

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
    {{ ci_compose }} up --build -d --wait --wait-timeout {{ timeout }} {{ services }}

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
    host_uid="$(id -u)"
    host_gid="$(id -g)"
    # Cleanup runs as host user; chown the backup tree back before rm since the
    # container wrote it as uid 1001 (backupuser).
    trap 'docker run --rm -v "$tmp_root:/work" --entrypoint chown alpine:3.22 -R "$host_uid:$host_gid" /work >/dev/null 2>&1 || true; rm -rf "$tmp_root"' EXIT
    mkdir -p "$tmp_root/uploads/images" "$tmp_root/uploads/files" "$tmp_root/backups"
    printf 'smoke test image bytes\n' > "$tmp_root/uploads/images/example.txt"
    printf 'smoke test file bytes\n' > "$tmp_root/uploads/files/example.txt"
    docker build -f backend/Dockerfile.user-upload-backups -t relab-user-upload-backups-smoke backend
    # Exercise the production perms pattern: enter as root, chown the bind mount,
    # then drop privileges to backupuser via su-exec (matches the real entrypoint).
    docker run --rm \
        -v "$tmp_root/uploads:/data/uploads:ro" \
        -v "$tmp_root/backups:/backups" \
        -e UPLOADS_DIR=/data/uploads \
        -e UPLOADS_BACKUP_DIR=/backups \
        -e BACKUP_KEEP_DAYS=1 \
        -e BACKUP_KEEP_WEEKS=1 \
        -e BACKUP_KEEP_MONTHS=1 \
        -e MAX_TOTAL_GB=1 \
        --entrypoint sh \
        relab-user-upload-backups-smoke \
        -c 'chown -R backupuser:backupuser "$UPLOADS_BACKUP_DIR" && exec su-exec backupuser ./backup_user_uploads.sh'
    find "$tmp_root/backups" -type f -name 'user_uploads-*.tar.*' | grep -q .
    echo "✅ User-upload backups smoke test passed"

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
    @just docker-smoke-frontend-web
    @just docker-smoke-frontend-app
    @just docker-smoke-user-upload-backups
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
    @just _require-confirm "stop and wipe the CI Docker environment" "just docker-ci-down YES" "FORCE=1 just docker-ci-down" "{{ confirm }}"
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
    just backend/_perf-report-ci "{{ DATE }}"

# Recalibrate backend perf thresholds from the latest CI baseline summary export
_docker-ci-perf-thresholds HEADROOM="1.15":
    just backend/_perf-thresholds-apply "{{ HEADROOM }}"

# ============================================================================
# Maintenance
# ============================================================================

# Clean build artifacts and caches across all subrepos
clean:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ subrepos }}; do just "$d/clean"; done
    rm -rf .ruff_cache
    echo "✓ Cleaned caches and build artifacts"

# Print a static-output size budget for a built directory (e.g. docs/dist, frontend-web/dist)
size DIR:
    du -sh {{ DIR }}
    find {{ DIR }} -type f | sort | xargs du -h
