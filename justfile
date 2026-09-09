# Relab monorepo task runner
# Run `just --list` to see the recipes in this file.
# Each subrepo has its own: `just backend/<recipe>`, `just app/<recipe>`, and so on.

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

# Deploy overlay operations live in scripts/deploy_ops.sh. This file keeps the stable
# public recipes. The script owns Compose env-file paths, profiles, and validation.

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

# Update all workspace dependencies
update:
    #!/usr/bin/env bash
    set -euo pipefail
    uv lock --upgrade
    pnpm update -D
    pnpm dedupe
    for d in {{ subrepos }}; do just "$d/update"; done
    echo "Run 'just install' to sync"

# Install git hooks (run once after clone)
_prek-install:
    uv run prek install

# Regenerate the pnpm workspace lockfile without installing dependencies
lockfile:
    pnpm install --lockfile-only --ignore-scripts

# Sync shared brand assets into consumer subrepos
assets-sync:
    uv run python scripts/sync_brand_assets.py

# Verify shared brand assets are in sync
assets-check:
    uv run python scripts/sync_brand_assets.py --check

# Install every dependency and the git hooks, ready for local development
setup: install _prek-install

# ============================================================================
# Quality Checks
# ============================================================================

# Run the repository-wide policy hooks that git runs on commit, over every file.
# no-commit-to-branch guards commits rather than files, so on main it would fail here.
pre-commit:
    SKIP=no-commit-to-branch uv run prek run --all-files --show-diff-on-failure

# Root-only quality gate: scripts/, tests/, brand assets, browser JS policy.
# CI runs this recipe directly. Each subrepo has its own `just <subrepo>/check`.
check-root:
    uv run ruff check --config pyproject.toml .
    uv run ruff format --check --config pyproject.toml .
    uv run ty check
    pnpm run lint
    uv run python scripts/browser_js_policy.py
    just assets-check

# Root and subrepo quality checks: lint, typecheck, and format verification.
# File-hygiene hooks (shellcheck, shfmt, markdown, YAML) live in `just pre-commit`.
check: check-root
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ subrepos }}; do just "$d/check"; done

# Auto-fix lint issues and format code across root and subrepos
fix:
    #!/usr/bin/env bash
    set -euo pipefail
    uv run ruff check --fix --config pyproject.toml .
    uv run ruff format --config pyproject.toml .
    uv run rumdl check --fix .
    uv run prek run shfmt --all-files
    pnpm run fix
    for d in {{ subrepos }}; do just "$d/fix"; done

# ============================================================================
# Testing
# ============================================================================

# Test the root scripts: env policy, browser JS policy, deploy and watchdog decisions.
# No Docker required.
test-scripts:
    uv run pytest tests -q
    @bash scripts/test_ops.sh

# Full local test suite across all subrepos (unit + integration, no e2e)
test:
    #!/usr/bin/env bash
    set -euo pipefail
    just test-scripts
    for d in {{ subrepos }}; do just "$d/test"; done

# Run unit tests across subrepos that implement them
test-unit:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ unit_subrepos }}; do just "$d/test-unit"; done

# Run integration tests across subrepos that implement them
test-integration:
    #!/usr/bin/env bash
    set -euo pipefail
    for d in {{ unit_subrepos }}; do just "$d/test-integration"; done

# CI-oriented test suite: root scripts plus every subrepo
test-ci:
    #!/usr/bin/env bash
    set -euo pipefail
    just test-scripts
    for d in {{ subrepos }}; do just "$d/test-ci"; done

# Run end-to-end tests across subrepos that implement them
test-e2e:
    @just www/test-e2e
    @just docs/test-e2e
    @just test-e2e-full-stack

# Repository policy checks beyond prek: env policy, Compose, deploy secrets.
# `cloudflare-check` needs OpenTofu provider downloads, so it runs in CI and on demand.
policy-check: env-policy-check compose-config deploy-secrets-check

# Local CI pipeline: hooks, quality checks, CI tests, policy (IaC is CI-only)
ci: pre-commit check test-ci policy-check

# Start the E2E backend stack (database, cache, API) and wait for readiness
_e2e-backend-up:
    docker compose -p relab_e2e -f compose.e2e.yaml up --build -d --wait --wait-timeout 120

# Stop the E2E backend stack and remove its volumes
_e2e-backend-down:
    docker compose -p relab_e2e -f compose.e2e.yaml down -v --remove-orphans

# Full-stack E2E: start the Docker backend, build Expo web, run Playwright, tear down.
# Requires Docker. Pass mode=cross-browser to run the full browser matrix, not just chromium.
test-e2e-full-stack mode="default":
    #!/usr/bin/env bash
    set -euo pipefail
    mode={{ quote(mode) }}
    case "$mode" in
      default)       e2e_recipe="test-e2e" ;;
      cross-browser) e2e_recipe="test-e2e-cross-browser" ;;
      *) echo "mode must be 'default' or 'cross-browser'"; exit 1 ;;
    esac
    trap 'just _e2e-backend-down || true' EXIT
    echo "→ Starting backend infrastructure..."
    just _e2e-backend-up
    # www runs first: it needs only the seeded API and builds in seconds. The fixture
    # lane in `just www/test-e2e` cannot cover a live record's srcset.
    echo "→ Running www live-data E2E tests..."
    just www/test-e2e-live
    echo "→ Building Expo web app..."
    just app/build-web
    echo "→ Running Playwright E2E tests ($mode)..."
    just "app/$e2e_recipe"

# ============================================================================
# Security
# ============================================================================

# Dependency vulnerability audit: root + backend Python, and the pnpm workspace
# (one lockfile covers app, www, and docs; allow-list in pnpm-workspace.yaml).
audit:
    uv audit --preview-features audit --frozen
    just backend/audit all
    pnpm audit --prod --audit-level moderate

# Canonical security target: secret scanning plus dependency audits
security:
    #!/usr/bin/env bash
    # NOTE: gitleaks runs first and unconditionally, so a red audit cannot hide a
    # leaked secret. The recipe exits non-zero if either step fails.
    set -uo pipefail
    status=0
    uv run prek run gitleaks --all-files || status=1
    just audit || status=1
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

# Verify one root against a throwaway copy rather than the working directory.
# `init` reads the selected workspace's encrypted state, so it would demand
# TF_VAR_state_passphrase from a credential-free gate. `tofu test` also mocks the
# provider, and a mocked provider cannot service an import block, so a generated
# imports.tf crashes the run.
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
# rulesets). One root owns the whole zone, shared by prod and staging.
cloudflare-zone-plan:
    @just _require-cloudflare-vars
    @just _require-telemetry-edge-key
    tofu -chdir={{ cloudflare_zone_dir }} init
    tofu -chdir={{ cloudflare_zone_dir }} plan -input=false

# Apply the zone-global Cloudflare configuration. This affects BOTH environments.
cloudflare-zone-apply confirm='':
    @just _require-cloudflare-vars
    @just _require-telemetry-edge-key
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

# The telemetry skip rule is `var.telemetry_edge_key == "" ? [] : [...]`. An unset key
# does not fail the apply: it drops the rule. The next plan then reports "No changes",
# because config and state agree that there is no rule. OTLP exports are bot-challenged
# at the edge while the token looks correct on both sides. Only the zone root reads
# this variable.
_require-telemetry-edge-key:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "${TF_VAR_telemetry_edge_key:-}" ]; then
        echo "Missing TF_VAR_telemetry_edge_key." >&2
        echo "Without it the telemetry ingress skip rule is omitted and every OTLP" >&2
        echo "export is bot-challenged at the edge. Export the same value as" >&2
        echo "TELEMETRY_EDGE_KEY in the deploy hosts' root .env." >&2
        exit 1
    fi

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

# Validate root-owned environment variable policy
env-policy-check:
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
# Docker: Development
# ============================================================================
# To watch one service only, call docker compose directly with the same overlays:
# `docker compose -p relab_dev -f compose.yaml -f compose.dev.yaml up --watch api www`.

# Start the development database and cache, then wait for readiness
dev-db:
    {{ dev_compose }} up -d --wait postgres redis

# Start the full dev stack with hot reload (syncs source, rebuilds on lockfile changes)
dev:
    {{ dev_compose }} up --watch

# The snapshot never updates: a container left running here serves the code as it was
# when the image was built. Check with `just dev-stale` before trusting a measurement.
#
# Start full dev stack WITHOUT hot reload (serves the snapshot baked into the image)
dev-up:
    @printf '\n\033[33m%s\033[0m\n' "dev-up: source is NOT synced. Containers serve the snapshot baked into the image."
    @printf '\033[33m%s\033[0m\n\n' "Run 'just dev' for hot reload, or 'just dev-stale' to check whether this snapshot is behind."
    {{ dev_compose }} up

# A 200 from a dev port proves something answered, not that it is current. This compares
# each dev image's build time against the newest source mtime.
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
    {{ dev_compose }} up -d --wait postgres
    {{ dev_compose }} exec -T postgres bash /docker-entrypoint-initdb.d/provision.sh >/dev/null
    {{ dev_compose }} --profile migrations up migrator

# Wipe all dev containers and volumes for a clean slate. Re-run dev-migrate afterwards.
_dev-reset confirm='':
    @just _require-confirm "wipe the development Docker environment" "just _dev-reset YES" "FORCE=1 just _dev-reset" {{ quote(confirm) }}
    {{ dev_compose }} --profile migrations down -v

# ============================================================================
# Docker: Production
# ============================================================================
# Both deploy stacks share compose.deploy.yaml and scripts/deploy_ops.sh. Malware
# scanning follows MALWARE_SCAN_ENABLED in the host's root .env. Scheduled backups run
# from the host systemd timers; see deploy/systemd/.

# Start production stack (optional profiles: backups, migrations)
prod-up *profiles:
    @bash scripts/deploy_ops.sh stack prod up {{ profiles }}

# Stop production stack (optional profiles: backups, migrations)
prod-down *profiles:
    @bash scripts/deploy_ops.sh stack prod down {{ profiles }}

# Build (or rebuild) prod images; set NO_CACHE=1 to build without the layer cache
prod-build *profiles:
    @bash scripts/deploy_ops.sh stack prod build {{ profiles }}

# Roll prod back to the images `build` tagged with SHA; pass an alembic REV to downgrade the schema first
prod-rollback confirm sha rev='':
    @bash scripts/deploy_ops.sh stack prod rollback {{ quote(confirm) }} {{ quote(sha) }} {{ quote(rev) }}

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
staging-up *profiles:
    @bash scripts/deploy_ops.sh stack staging up {{ profiles }}

# Stop staging stack (optional profiles: backups, migrations)
staging-down *profiles:
    @bash scripts/deploy_ops.sh stack staging down {{ profiles }}

# Build (or rebuild) staging images; set NO_CACHE=1 to build without the layer cache
staging-build *profiles:
    @bash scripts/deploy_ops.sh stack staging build {{ profiles }}

# Roll staging back to the images `build` tagged with SHA; pass an alembic REV to downgrade the schema first
staging-rollback confirm sha rev='':
    @bash scripts/deploy_ops.sh stack staging rollback {{ quote(confirm) }} {{ quote(sha) }} {{ quote(rev) }}

# Tail staging logs
staging-logs:
    @bash scripts/deploy_ops.sh stack staging logs

# Run database migrations and seed dummy data (staging)
staging-migrate confirm='':
    @bash scripts/deploy_ops.sh stack staging migrate {{ quote(confirm) }}

# Run one backup cycle now. This is what the systemd timer calls; see deploy/systemd/.
# Pass `manual` before a risky operation. Retention keeps `manual` snapshots
# unconditionally, so the next scheduled run cannot expire your safety copy.
backup env manual='':
    @BACKUP_MANUAL={{ if manual == "manual" { "true" } else if manual == "" { "false" } else { error("second argument must be `manual` or omitted, got `" + manual + "`") } }} bash scripts/deploy_ops.sh stack {{ quote(env) }} backup

# Backup upkeep only: retention, integrity check, offsite copy — no new snapshot.
# Run daily by relab-backup-maintenance@<env>.timer; the hourly backup skips this work.
backup-maintenance env:
    @bash scripts/deploy_ops.sh stack {{ quote(env) }} backup-maintenance

# List the restic snapshots for one environment (read-only)
snapshots env count='20':
    @bash scripts/backup_restic_ops.sh snapshots {{ quote(env) }} {{ quote(count) }}

# Print the scheduled-job systemd units rendered for this host (review before installing)
timers-render:
    @bash scripts/install_timers.sh render

# Install and enable the backup, watchdog, and restore-check timers for one environment.
# Prompts for sudo. Run it as the deploy user, not as `sudo just`.
timers-install env:
    @bash scripts/install_timers.sh install {{ quote(env) }}

# Watchdog: alert when the API is unhealthy or the newest backup snapshot is stale (cron this on the host)
watchdog env max_age_hours='3':
    @bash scripts/deploy_watchdog.sh {{ quote(env) }} {{ quote(max_age_hours) }}

# ============================================================================
# Docker: Test / CI
# ============================================================================

# --- Dockerfile linting ---

# Lint every Dockerfile with BuildKit's built-in checks, and hold the line on the
# allowlist convention. This recipe parses only; it builds nothing.
#
# Each entry is `<dockerfile>:<build context>`. The path does not imply the context,
# because the node images build from the repo root and the backend ones from backend/,
# so name both here.
docker-lint:
    #!/usr/bin/env bash
    set -uo pipefail
    specs=(
      "app/Dockerfile:."
      "www/Dockerfile:."
      "docs/Dockerfile:."
      "backend/Dockerfile:backend"
      "backend/Dockerfile.migrations:backend"
      "backend/Dockerfile.backups:backend"
    )
    status=0

    # A Dockerfile absent from `specs` never gets linted. One without a sibling
    # allowlist falls back to the directory-level .dockerignore, which is the drift
    # these allowlists exist to prevent. Neither failure is visible on its own, so
    # check both. `git ls-files` covers the index, so this catches a newly staged
    # Dockerfile on the commit that adds it.
    for file in $(git ls-files | grep -E '(^|/)Dockerfile(\.[^/]*)?$' | grep -v '\.dockerignore$'); do
      printf '%s\n' "${specs[@]}" | grep -q "^${file}:" \
        || { printf 'error: %s is not linted by this recipe; add it with its build context\n' "$file" >&2; status=1; }
      [ -f "${file}.dockerignore" ] \
        || { printf 'error: %s has no sibling %s.dockerignore allowlist\n' "$file" "$file" >&2; status=1; }
    done

    for spec in "${specs[@]}"; do
      file="${spec%%:*}"
      context="${spec##*:}"
      printf '\n\033[1m== %s ==\033[0m\n' "$file"
      docker buildx build --check -f "$file" "$context" || status=1
    done
    exit "$status"

# --- Shared helpers ---

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

# Internal helper: assert the security headers on a live response, not on the Caddyfile
# text. The runtime image has no curl, so use the wget its HEALTHCHECK already runs.
_docker-smoke-headers svc:
    #!/usr/bin/env bash
    set -euo pipefail
    headers=$({{ ci_compose }} exec -T {{ svc }} wget -qS -O /dev/null http://localhost:8081/ 2>&1)
    echo "$headers" | grep -qi 'Content-Security-Policy:'
    echo "$headers" | grep -qi 'Strict-Transport-Security:'

# --- Smoke tests: Docker images and orchestration ---

# Smoke test: docs static server
docker-smoke-docs:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down docs' EXIT
    just _docker-smoke-up docs 60

# Smoke test: www static server
docker-smoke-www:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down www' EXIT
    just _docker-smoke-up www 60
    just _docker-smoke-headers www

# Smoke test: app static server (slow: expo export runs during build)
docker-smoke-app:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down app' EXIT
    just _docker-smoke-up app 300
    just _docker-smoke-headers app

# Smoke test: restic backup image can create encrypted DB, uploads, and offsite-copy snapshots
docker-smoke-backups:
    @bash scripts/backup_restic_ops.sh docker-smoke-backups

# Copy the local restic repository offsite, for example to rclone:<remote>:relab/staging/restic
backup-offsite-copy env='staging':
    @bash scripts/backup_restic_ops.sh backup-offsite-copy {{ quote(env) }}

# Restore the latest restic PostgreSQL dump into a disposable Postgres container
restore-check env='prod':
    @bash scripts/backup_restic_ops.sh restore-check {{ quote(env) }}

# Restore a backup snapshot into the LIVE database (destructive; pass YES to confirm)
restore env confirm='' snapshot='latest':
    @bash scripts/backup_restic_ops.sh restore {{ quote(env) }} {{ quote(confirm) }} {{ quote(snapshot) }}

# Smoke test: backend orchestration (database, cache, API, migrator) plus a live health check
docker-orchestration-smoke:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'just _docker-smoke-down "postgres redis api migrator"' EXIT
    just _docker-smoke-up "postgres redis api migrator" 120
    {{ ci_compose }} exec -T api python -c 'import json; from urllib.request import urlopen; resp = urlopen("http://localhost:8000/health", timeout=5); data = json.load(resp); assert resp.status == 200, resp.status; assert data["status"] == "healthy", data; assert data["checks"]["database"]["status"] == "healthy", data; assert data["checks"]["redis"]["status"] == "healthy", data' >/dev/null

# Run all Docker smoke tests sequentially (CI runs them in parallel per-service)
docker-smoke:
    @just docker-smoke-docs
    @just docker-smoke-www
    @just docker-smoke-app
    @just docker-smoke-backups
    @just docker-orchestration-smoke

# --- CI helpers: backend performance regression tests ---

# Internal helper: start CI services and wait for readiness
_docker-ci-up services="postgres redis api":
    {{ ci_compose }} up --build -d --wait --wait-timeout 120 {{ services }}

# Run CI migrations and seed dummy data for repeatable backend perf tests.
# perf_products scales the fixtures so the baseline measures pagination, index
# behaviour and media serialisation rather than a table with a few rows in it.
_docker-ci-migrate-dummy perf_products="0":
    # --build: `compose run` reuses a stale image otherwise, which silently runs
    # last build's entrypoint and seed scripts against a freshly wiped database.
    {{ ci_compose }} run --rm --build -e SEED_DUMMY_DATA=true -e BULK_SEED_PRODUCTS={{ quote(perf_products) }} migrator

# Stop the CI stack and remove volumes
docker-ci-down confirm='':
    @just _require-confirm "stop and wipe the CI Docker environment" "just docker-ci-down YES" "FORCE=1 just docker-ci-down" {{ quote(confirm) }}
    {{ ci_compose }} --profile migrations down -v --remove-orphans

# Run the backend k6 baseline against the CI Docker stack.
# The stack stays up afterwards, so a maintainer can follow up on a regression.
docker-ci-perf-baseline perf_products="5000":
    #!/usr/bin/env bash
    set -euo pipefail
    echo "→ Starting CI backend stack..."
    just _docker-ci-up
    echo "→ Running CI database migrations and seeding dummy data..."
    just _docker-ci-migrate-dummy "{{ perf_products }}"
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
    rm -rf .ruff_cache .rumdl_cache
