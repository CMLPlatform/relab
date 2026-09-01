# Relab Monorepo Task Runner
# Run `just --list` to see all available commands

# Show available recipes
default:
    @just --list

dev_compose := "COMPOSE_DISABLE_ENV_FILE=1 docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml"
ci_compose := "docker compose -p relab_test -f compose.yaml -f compose.ci.yaml"
cloudflare_dir := "infra/cloudflare"
cloudflare_zone_dir := "infra/cloudflare-zone"

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

# Install all workspace dependencies (root Python + JS workspace + backend)
install:
    #!/usr/bin/env bash
    set -euo pipefail
    uv sync --frozen
    pnpm install --frozen-lockfile
    just backend/install
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

# Install git hooks (run once after clone)
_prek-install:
    uv run prek install
    @echo "✅ Git hooks installed"

# Sync shared brand assets into consumer subrepos
assets-sync:
    uv run python scripts/sync_brand_assets.py

# Verify shared brand assets are in sync
assets-check:
    uv run python scripts/sync_brand_assets.py --check

# Bootstrap a full local development environment
setup: install _prek-install
    @echo "✅ Development environment ready"

# ============================================================================
# Quality Checks
# ============================================================================

# Run repository-wide policy checks
pre-commit:
    uv run prek run --all-files --show-diff-on-failure
    @echo "✅ Repository policy checks passed"

# Lint all tracked shell scripts with the pre-commit-managed ShellCheck hook
shellcheck:
    uv run prek run shellcheck --files $(git ls-files '*.sh')
    @echo "✅ Repository shell scripts passed ShellCheck"

# Format all tracked shell scripts with the pre-commit-managed shfmt hook
shellfmt:
    uv run prek run shfmt --files $(git ls-files '*.sh')
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
# Policy checks (shellcheck, file-format) live in `just pre-commit`, not here.
check:
    #!/usr/bin/env bash
    set -euo pipefail
    uv run ruff check --config pyproject.toml .
    uv run ruff format --check --config pyproject.toml .
    uv run ty check
    just assets-check
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

# Unit-test the root ops scripts (env policy + deploy/watchdog decisions; no Docker)
test-scripts:
    uv run pytest tests -q
    @bash scripts/test_ops.sh

# Full local test suite across all subrepos (unit + integration, no e2e)
test:
    #!/usr/bin/env bash
    set -euo pipefail
    just test-scripts
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

# Repository policy checks beyond prek: IaC, env policy, compose, deploy secrets
policy-check: cloudflare-check env-policy-check compose-config deploy-secrets-check
    @echo "✅ Policy checks passed"

# Canonical CI pipeline: policy, IaC, quality checks, CI tests, compose validation
ci: pre-commit check test-ci policy-check
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
    # www first: it only needs the seeded API, and its build is seconds. The
    # fixture lane in `just www/test-e2e` cannot cover a live record's srcset.
    echo "→ Running www live-data E2E tests..."
    just www/test-e2e-live
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
    for d in www app; do just "$d/audit"; done
    # NOTE: docs advisories are known low-severity findings with no upstream fix;
    # they warn instead of failing so they never block the blocking audits above.
    just docs/audit || echo "⚠️ docs audit found advisories (non-blocking)"
    echo "✅ Root and subrepo dependency audits complete"

# Canonical security target: secret scanning plus dependency audits
security:
    #!/usr/bin/env bash
    # NOTE: gitleaks runs first and unconditionally — a red audit (a known upstream
    # advisory with no fix yet) must not hide a leaked secret. The recipe still exits
    # non-zero if either step fails.
    set -uo pipefail
    status=0
    uv run prek run gitleaks --all-files || status=1
    just audit || status=1
    [[ $status -eq 0 ]] && echo "✅ Security checks complete"
    exit $status

# Format Cloudflare OpenTofu files
cloudflare-fmt:
    tofu -chdir={{ cloudflare_dir }} fmt -recursive
    tofu -chdir={{ cloudflare_zone_dir }} fmt -recursive

# Validate both Cloudflare OpenTofu roots: format, types, and the mocked-provider tests.
# No credentials, no network beyond provider downloads, and no state access at all.
cloudflare-check:
    tofu -chdir={{ cloudflare_dir }} fmt -check -recursive
    tofu -chdir={{ cloudflare_zone_dir }} fmt -check -recursive
    @just _cloudflare-verify {{ cloudflare_dir }}
    @just _cloudflare-verify {{ cloudflare_zone_dir }}

# Verify one root against a throwaway copy rather than the working directory. Two
# reasons, both learned the hard way: `init` reads the selected workspace's state, which
# is encrypted and would demand TF_VAR_state_passphrase for what is meant to be the
# credential-free gate; and `tofu test` mocks the provider, which cannot service an
# import block, so a generated imports.tf makes the run CRASH rather than fail.
_cloudflare-verify dir:
    #!/usr/bin/env bash
    set -euo pipefail
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    cp {{ dir }}/*.tf "$work"/                              # follows the hostnames.tf symlink
    rm -f "$work"/imports.tf                                # adoption-only, breaks mocked tests
    cp -r {{ dir }}/tests "$work"/ 2>/dev/null || true
    cp {{ dir }}/.terraform.lock.hcl "$work"/ 2>/dev/null || true
    cp -r {{ dir }}/.terraform "$work"/ 2>/dev/null || true # reuse downloaded providers
    tofu -chdir="$work" init -backend=false >/dev/null
    tofu -chdir="$work" validate
    tofu -chdir="$work" test

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

# Plan the zone-global Cloudflare configuration (TLS settings + the three entrypoint
# rulesets). One root for the whole zone, so prod and staging cannot clobber each other.
cloudflare-zone-plan:
    @just _require-cloudflare-vars
    tofu -chdir={{ cloudflare_zone_dir }} init
    tofu -chdir={{ cloudflare_zone_dir }} plan -input=false

# Apply the zone-global Cloudflare configuration. This affects BOTH environments.
cloudflare-zone-apply confirm='':
    @just _require-cloudflare-vars
    @just _require-confirm "apply zone-global Cloudflare changes (affects prod AND staging)" "just cloudflare-zone-apply YES" "FORCE=1 just cloudflare-zone-apply" {{ quote(confirm) }}
    tofu -chdir={{ cloudflare_zone_dir }} init
    tofu -chdir={{ cloudflare_zone_dir }} apply -auto-approve -input=false

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
    # State encryption is fail-closed, so name the missing passphrase here rather than
    # letting tofu report it as an opaque decrypt error further in.
    [ -n "${TF_VAR_state_passphrase:-}" ] || missing+=("TF_VAR_state_passphrase")
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Missing Cloudflare/OpenTofu environment variables:" >&2
        printf '  - %s\n' "${missing[@]}" >&2
        exit 1
    fi

# Validate every supported Compose stack shape
compose-config:
    @bash scripts/deploy_ops.sh compose-config

# Depends on test-scripts because CI's automation job runs this recipe, not `just check`.
# Validate root-owned environment variable policy
env-policy-check: test-scripts
    @uv run python scripts/env_policy.py check

# Print the root-owned runtime secret inventory
env-inventory:
    @uv run python scripts/env_policy.py inventory

# Validate rendered deploy secret file paths
deploy-secrets-check:
    @bash scripts/deploy_ops.sh deploy-secrets-check

# Create missing secret files for an environment (dev, prod, or staging)
deploy-secrets-template env:
    @bash scripts/deploy_ops.sh deploy-secrets-template {{ quote(env) }}

# Print a paste-ready secrets/<env> export for a password-manager note (pipe to your clipboard)
secrets-export env:
    @bash scripts/deploy_ops.sh secrets-export {{ quote(env) }}

# Rebuild secrets/<env> from a saved secrets-export block
secrets-restore env file:
    @bash scripts/deploy_ops.sh secrets-restore {{ quote(env) }} {{ quote(file) }}

# ============================================================================
# Docker: Targeted Development (subset of services with hot reload)
# ============================================================================


# Start the development database and cache infrastructure and wait for readiness
dev-db:
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

# The snapshot never updates. A container left running here serves the code as
# it was when the image was built, indefinitely and silently — a stale one cost
# a full day of measurements against five-day-old code. The banner below and
# `just dev-stale` exist so that is discoverable rather than assumed.
#
# Start full dev stack WITHOUT hot reload (serves the snapshot baked into the image)
dev-up:
    @printf '\n\033[33m%s\033[0m\n' "dev-up: source is NOT synced. Containers serve the snapshot baked into the image."
    @printf '\033[33m%s\033[0m\n\n' "Run 'just dev' for hot reload, or 'just dev-stale' to check whether this snapshot is behind."
    {{ dev_compose }} up

# A 200 from a dev port proves something answered, not that it is current.
# This compares each dev image's build time against the newest source mtime,
# which is what proves the latter. Cheap enough for humans and agents to run
# before trusting any measurement taken against a dev server.
#
# Check whether running dev containers serve code older than the working tree
dev-stale:
    #!/usr/bin/env bash
    set -euo pipefail
    stale=0
    found=0
    for svc in app www docs api; do
      cid=$({{ dev_compose }} ps -q "$svc" 2>/dev/null || true)
      [ -n "$cid" ] || continue
      found=1
      img=$(docker inspect "$cid" | jq -r '.[0].Image')
      built=$(docker inspect "$img" | jq -r '.[0].Created')
      built_ts=$(date -d "$built" +%s)
      case "$svc" in
        app) src=app/src ;; www) src=www/src ;; docs) src=docs/src ;; api) src=backend/app ;;
      esac
      newest=$(find "$src" -type f -not -path '*/.*' -newermt "@$built_ts" -print -quit 2>/dev/null || true)
      if [ -n "$newest" ]; then
        printf '\033[31mSTALE\033[0m  %-4s image built %s — %s has newer files (e.g. %s)\n' \
          "$svc" "$(date -d "$built" '+%Y-%m-%d %H:%M')" "$src" "$newest"
        stale=1
      else
        printf '\033[32mfresh\033[0m  %-4s image built %s\n' "$svc" "$(date -d "$built" '+%Y-%m-%d %H:%M')"
      fi
    done
    [ "$found" -eq 1 ] || { echo "No dev containers running."; exit 0; }
    if [ "$stale" -eq 1 ]; then
      printf '\nThose containers serve code older than your working tree.\n'
      printf 'Restart with %s (hot reload) or rebuild with %s.\n' "'just dev'" "'just _dev-build'"
      exit 1
    fi

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

# Start production stack (backups are NOT started here — they run from the host systemd timer; see deploy/systemd/)
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

# Start staging stack (backups are NOT started here — they run from the host systemd timer; see deploy/systemd/)
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

# Run one backup cycle now (what the systemd timer calls; see deploy/systemd/)
backup env:
    @bash scripts/deploy_ops.sh stack {{ quote(env) }} backup

# Print the scheduled-job systemd units rendered for this host (review before installing)
timers-render:
    @bash scripts/install_timers.sh render

# Install + enable the backup/watchdog/restore-check timers for one environment (needs sudo)
timers-install env:
    @bash scripts/install_timers.sh install {{ quote(env) }}

# Watchdog: alert when the API is unhealthy or the newest backup snapshot is stale (cron this on the host)
watchdog env max_age_hours='26':
    @bash scripts/deploy_watchdog.sh {{ quote(env) }} {{ quote(max_age_hours) }}

# ============================================================================
# Docker: Test / CI
# ============================================================================

### Smoke tests for test Docker images and orchestration ---

# Internal helper: require explicit confirmation for state-changing commands.
# Delegates to deploy_ops.sh, which owns the one copy of the YES/FORCE rule.
_require-confirm action example force_example confirm='':
    @bash scripts/deploy_ops.sh require-confirm {{ quote(action) }} {{ quote(example) }} {{ quote(force_example) }} {{ quote(confirm) }}

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
    # Assert security headers on a live response, not just the Caddyfile text.
    # The runtime image has no curl (kept out on purpose to stay minimal); wget -S
    # is the same tool the image's own HEALTHCHECK already relies on.
    headers=$({{ ci_compose }} exec -T www wget -qS -O /dev/null http://localhost:8081/ 2>&1)
    echo "$headers" | grep -qi 'Content-Security-Policy:'
    echo "$headers" | grep -qi 'Strict-Transport-Security:'
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
restore-check env='prod':
    @bash scripts/backup_restic_ops.sh restore-check {{ quote(env) }}

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
    find {{ quote(DIR) }} -type f -print0 | sort -z | xargs -0 du -h
