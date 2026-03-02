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

# Run pre-commit hooks on all files
pre-commit:
    pre-commit run --all-files

# Run pre-commit hooks with auto-update
pre-commit-update:
    pre-commit autoupdate

# Install pre-commit hooks
pre-commit-install:
    pre-commit install --hook-type pre-commit --hook-type commit-msg

# Format all markdown files
fmt-md:
    pre-commit run mdformat --all-files

# Check for secrets/leaks
check-secrets:
    pre-commit run gitleaks --all-files

# Run commitizen check
check-commit:
    pre-commit run commitizen --all-files

# ============================================================================
# Backend tasks (delegates to backend/justfile)
# ============================================================================

# Run backend tests
backend-test *ARGS:
    @just backend/test {{ ARGS }}

# Run backend with coverage
backend-test-cov:
    @just backend/test-cov

# Lint backend code
backend-lint:
    @just backend/lint

# Format backend code
backend-fmt:
    @just backend/fmt

# Type check backend code
backend-typecheck:
    @just backend/typecheck

# Run all backend checks (lint + typecheck)
backend-check:
    @just backend/check

# Run backend migrations
backend-migrate:
    @just backend/migrate

# Create backend superuser
backend-superuser:
    @just backend/superuser

# Seed backend database
backend-seed:
    @just backend/seed

# Start backend dev server
backend-dev:
    @just backend/dev

# ============================================================================
# Git shortcuts
# ============================================================================

# Stage all changes
add:
    git add -A

# Show git status
status:
    git status

# Show git diff
diff:
    git diff

# Clean build artifacts and caches
clean:
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
    find . -type f -name ".coverage" -delete 2>/dev/null || true
    find . -type f -name "*.pyc" -delete 2>/dev/null || true
    @echo "✓ Cleaned caches and build artifacts"

# ============================================================================
# Docker Integration Testing
# ============================================================================

# Run the backend API integration test suite against a fully built production docker container
docker-test:
    @echo "🚀 Starting Docker CI Test Emulation..."
    @echo "🧹 Tearing down existing containers..."
    docker compose -f compose.yml -f compose.ci.yml down -v
    
    @echo "🏗️ Building and starting Docker containers..."
    docker compose -f compose.yml -f compose.ci.yml up --build -d
    
    @echo "⏳ Waiting for the backend API to be healthy..."
    sleep 10
    docker compose -f compose.yml -f compose.ci.yml logs backend
    
    @echo "🔗 Grabbing dynamically allocated ephemeral ports and running tests..."
    @just _docker-test-runner
    
    @echo "🧹 Tearing down the Docker test environment..."
    docker compose -f compose.yml -f compose.ci.yml down -v

[no-exit-message]
_docker-test-runner:
    #!/usr/bin/env bash
    set -e
    
    BACKEND_PORT=$(docker compose -f compose.yml -f compose.ci.yml port backend 8000 | cut -d: -f2)
    DB_PORT=$(docker compose -f compose.yml -f compose.ci.yml port database 5432 | cut -d: -f2)
    
    echo "🔗 Evaluated Ports -> Backend: $BACKEND_PORT | Postgres: $DB_PORT"
    echo "🧪 Running API Tests against Docker container..."
    
    cd backend
    BASE_URL="http://localhost:${BACKEND_PORT}" DATABASE_HOST="localhost" DATABASE_PORT="${DB_PORT}" POSTGRES_USER="postgres" POSTGRES_PASSWORD="postgres" POSTGRES_DB="test_relab" POSTGRES_TEST_DB="test_relab" uv run pytest tests/integration/api -v --tb=short
    TEST_EXIT_CODE=$?
    
    if [ "$TEST_EXIT_CODE" -eq 0 ]; then
      echo "✅ Docker tests PASSED!"
    else
      echo "❌ Docker tests FAILED!"
    fi
    exit "$TEST_EXIT_CODE"
