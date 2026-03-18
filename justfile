# ReLab Monorepo Task Runner
# Run `just --list` to see all available commands

# Default recipe shows help
default:
    @just --list

# Install all workspace dependencies
install:
    uv sync

# Update all workspace dependencies
update:
    uv lock --upgrade

# Install pre-commit hooks (run once after clone)
pre-commit-install:
    uv run pre-commit install
    @echo "✓ Pre-commit hooks installed"

# Run all pre-commit hooks on all files (useful before big commits)
pre-commit:
    uv run pre-commit run --all-files
    @echo "✓ Pre-commit hooks passed"

# Update pre-commit hook versions (monthly maintenance)
pre-commit-update:
    uv run pre-commit autoupdate
    @echo "✓ Pre-commit hooks updated"

# ============================================================================
# Quality Checks
# ============================================================================

# Run all quality checks (pre-commit + backend + frontend specific checks)
# Pre-commit validates: markdown, YAML, ruff format/lint, gitleaks, secrets, etc
# Then run backend-specific checks: alembic, type checking
check:
    uv run pre-commit run --all-files
    @just backend/check
    @just frontend-web/check
    @echo "✓ All quality checks passed"

# Auto-fix code issues
fix:
    @just backend/fix
    @echo "✓ Code fixed"

# ============================================================================
# Frontend Web tasks (delegates to frontend-web/justfile)
# ============================================================================

# Run frontend-web quality checks
frontend-web-check:
    @just frontend-web/check

# Build frontend-web for production
frontend-web-build:
    @just frontend-web/build

# Build frontend-web for staging
frontend-web-build-staging:
    @just frontend-web/build-staging

# Run frontend-web tests
frontend-web-test:
    @just frontend-web/test

# Start frontend-web dev server
frontend-web-dev:
    @just frontend-web/dev

# ============================================================================
# Backend tasks (delegates to backend/justfile)
# ============================================================================

# Run backend tests
backend-test *ARGS:
    @just backend/test {{ ARGS }}

# Run backend with coverage
backend-test-cov:
    @just backend/test-cov

# Run backend migrations
backend-migrate:
    @just backend/migrate

# Start backend dev server
backend-dev:
    @just backend/dev

# ============================================================================
# Testing & CI
# ============================================================================

# Full local testing before PR submission
test: check backend-test-cov frontend-web-test
    @echo "✅ All code + tests passed"

# Quick tests - Run on every commit
test-quick:
    @just backend/test

# ============================================================================
# Clean & Maintenance
# ============================================================================

# Clean build artifacts and caches
clean:
    @just backend/clean
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name ".coverage" -delete 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    @echo "✓ Cleaned caches and build artifacts"

# ============================================================================
# Docker
# ============================================================================

docker_compose := "docker compose -p relab_ci -f compose.yml"

# Docker smoke tests: spin up full stack and verify all services are healthy
docker-smoke-services:
    #!/usr/bin/env bash
    set -euo pipefail
    trap '{{ docker_compose }} --profile migrations down -v --remove-orphans || true' EXIT

    echo "🚀 Starting Docker smoke tests..."
    {{ docker_compose }} up --build -d --wait --wait-timeout 120 database cache backend docs

    echo "✅ All services healthy — Docker smoke tests passed"

# ============================================================================
# Clean & Maintenance
# ============================================================================
